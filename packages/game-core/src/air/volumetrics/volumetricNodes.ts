/**
 * The two volumetric TSL helpers every material author uses (decision 0112
 * §2–§3):
 * - `applyVolumetrics`: the froxel medium applied to a lit colour, used
 *   inside `scene.fogNode` before the aerial term;
 * - `sceneRadiance`: a display colour (what it should look like on screen,
 *   0..1) turned into scene-referred radiance through the current exposure.
 *   Every unlit or emissive colour under physical exposure goes through it
 *   (docs/standards/tsl-shaders.md "Unlit colours under physical exposure").
 */
import * as tsl from "three/tsl";
import type { TslNode } from "../../render/nodes/materialNodes";

const T = tsl as unknown as Record<string, (...a: TslNode[]) => TslNode> & Record<string, TslNode>;
const { Loop, If, atan, clamp, dot, exp, float, length, log, max, min, mix, vec3, vec4 } = T;

/** ACES filmic maps scene 0.6 to about mid display; the display→scene anchor the fire and motes share. */
export const SCENE_WHITE = 0.6;

/** Display colour → scene-referred radiance at the renderer's current exposure. */
export function sceneRadiance(display: TslNode, exposure: TslNode = T.toneMappingExposure): TslNode {
  return display.mul(SCENE_WHITE).div(max(exposure, float(1e-9)));
}

/** What the fog stage needs from a live `Volumetrics`: its integrated grid and slice mapping. */
export interface VolumetricsSampler {
  /** Samples the integrated grid (rgb in-scatter, a transmittance) at uvw; the node it
   * returns follows the grid when the band changes. */
  sampleIntegrated(uvw: TslNode): TslNode;
  near: TslNode;
  far: TslNode;
  /** Grid dimensions (x, y, slices); when given, the lookup is jittered per pixel by half a froxel. */
  gridSize?: TslNode;
  /** Point lights for the analytic airlight (vec4 pos+reach, vec4 radiance, int count, loop bound). */
  lights?: { pos: TslNode; col: TslNode; count: TslNode; max: number };
  /** 1 when a band is on, else 0 (the colour passes through). */
  on: TslNode;
}

/** `color` seen through the medium from the camera to `viewDepth` metres at `screenUV`. */
export function applyVolumetrics(v: VolumetricsSampler, color: TslNode, viewDepth: TslNode, screenUV: TslNode): TslNode {
  // slice coordinate: the exact inverse of the inject's exponential depth (near * (far/near)^s)
  const s = log(max(viewDepth, v.near).div(v.near)).div(log(v.far.div(v.near)));
  const uvw = vec3(screenUV.x, screenUV.y, s);
  // no per-pixel jitter: the grid is already tent-resolved and temporally jittered, so a screen-space
  // dither only adds a screen-door grain at crown edges
  const half = v.gridSize ? float(0.5).div(v.gridSize.z) : float(0);
  const sample = v.sampleIntegrated(vec3(uvw.x, uvw.y, clamp(uvw.z.sub(half), 0, 1)));
  const airlight = v.lights ? pointAirlight(v, sample.a, viewDepth) : vec3(0);
  const lit = color.rgb.mul(sample.a).add(sample.rgb).add(airlight);
  return vec4(mix(color.rgb, lit, v.on), color.a);
}

/** Closed-form in-scatter of one isotropic point light along a ray segment [0, L] in a homogeneous
 * medium (Sun et al. 2005, single scatter, transmittance taken at the light's distance):
 * sigma * I / (4 pi) * exp(-sigma * d) * (atan((L - t0) / h) + atan(t0 / h)) / h,
 * with t0 the ray parameter nearest the light and h the light's distance from the ray. */
export function airlightIntegral(sigma: number, intensity: number, t0: number, h: number, L: number, d: number): number {
  const hh = Math.max(h, 0.05);
  return (sigma * intensity / (4 * Math.PI)) * Math.exp(-sigma * d) * (Math.atan((L - t0) / hh) + Math.atan(t0 / hh)) / hh;
}

function pointAirlight(v: VolumetricsSampler, trans: TslNode, viewDepth: TslNode): TslNode {
  const L = v.lights as NonNullable<VolumetricsSampler["lights"]>;
  const cam = T.cameraPosition;
  const dirW = T.positionWorld.sub(cam);
  const segLen = min(length(dirW), v.far);
  const dir = dirW.div(max(length(dirW), float(1e-4)));
  // the medium's mean extinction along this pixel's ray, read from the grid's own transmittance
  const sigma = clamp(log(max(trans, float(1e-4))).negate().div(max(viewDepth, v.near)), 0.002, 0.5);
  const acc = vec3(0).toVar();
  Loop({ start: 0, end: L.max }, ({ i }: { i: TslNode }) => {
    If(T.int(i).lessThan(L.count), () => {
      const lp = L.pos.element(i);
      const rel = lp.xyz.sub(cam);
      const t0 = dot(rel, dir);
      const h = max(length(rel.sub(dir.mul(t0))), float(0.05));
      const d = length(rel);
      const reach = clamp(float(1).sub(d.sub(lp.w.mul(2)).div(lp.w.mul(2))), 0, 1);
      const ang = atan(segLen.sub(t0).div(h)).add(atan(t0.div(h)));
      acc.addAssign(L.col.element(i).xyz.mul(sigma.mul(1 / (4 * Math.PI)).mul(exp(sigma.mul(d).negate())).mul(ang).div(h).mul(reach)));
    });
  });
  return acc;
}
