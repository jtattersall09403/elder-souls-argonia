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
const { Loop, If, atan, clamp, cos, dot, exp, float, length, log, max, min, mix, pow, sin, vec3, vec4 } = T;

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
  /** Per-pixel extra in-scatter along the view ray (world dir, segment length, mean extinction):
   * sharp canopy shafts and beam motes the froxel grid is too coarse to hold. */
  extra?(dir: TslNode, segLen: TslNode, sigma: TslNode): TslNode;
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

/** Lamp phase: an isotropic floor plus a forward Henyey-Greenstein lobe. The round glow a lamp wears
 * in fog is light scattered a few degrees off its straight path toward the eye, so the lobe sets
 * the halo; the floor keeps a faint wide skirt (fitted by eye to the owner's misty-lamp photo). */
export const LAMP_PHASE: { readonly g: number; readonly forward: number } = { g: 0.85, forward: 0.88 };
/** Midpoint steps of the equiangular march per lamp. */
export const LAMP_STEPS = 10;

export function lampPhase(c: number, g = LAMP_PHASE.g, forward = LAMP_PHASE.forward): number {
  const hg = (1 - g * g) / (4 * Math.PI * Math.pow(Math.max(1 + g * g - 2 * g * c, 1e-4), 1.5));
  return (1 - forward) / (4 * Math.PI) + forward * hg;
}

/** Single-scatter in-scatter of one point light along a ray [0, L] in a homogeneous medium, marched
 * equiangularly (Kulla and Fajardo 2012): t = t0 + h tan(theta), dt / r^2 = dtheta / h, and the
 * scattering cosine at the sample is sin(theta). t0 is the ray parameter nearest the light, h its
 * distance from the ray. Plain TS twin of the shader loop. */
export function airlightIntegral(sigma: number, intensity: number, t0: number, h: number, L: number,
  steps = LAMP_STEPS, forward: number = LAMP_PHASE.forward): number {
  const hh = Math.max(h, 0.05);
  const a = Math.atan(-t0 / hh), b = Math.atan((L - t0) / hh), dth = (b - a) / steps;
  let sum = 0;
  for (let k = 0; k < steps; k++) {
    const th = a + (k + 0.5) * dth;
    const t = t0 + hh * Math.tan(th), r = hh / Math.cos(th);
    sum += lampPhase(Math.sin(th), LAMP_PHASE.g, forward) * Math.exp(-sigma * (t + r));
  }
  return sigma * intensity * sum * dth / hh;
}

function pointAirlight(v: VolumetricsSampler, trans: TslNode, viewDepth: TslNode): TslNode {
  const L = v.lights as NonNullable<VolumetricsSampler["lights"]>;
  const cam = T.cameraPosition;
  const dirW = T.positionWorld.sub(cam);
  const segLen = min(length(dirW), v.far);
  const dir = dirW.div(max(length(dirW), float(1e-4)));
  // the medium's mean extinction along this pixel's ray, read from the grid's own transmittance
  const sigma = clamp(log(max(trans, float(1e-4))).negate().div(max(viewDepth, v.near)), 0.002, 0.5);
  const { g, forward } = LAMP_PHASE;
  const acc = vec3(0).toVar();
  Loop({ start: 0, end: L.max }, ({ i }: { i: TslNode }) => {
    If(T.int(i).lessThan(L.count), () => {
      const lp = L.pos.element(i);
      const rel = lp.xyz.sub(cam);
      const t0 = dot(rel, dir);
      const h = max(length(rel.sub(dir.mul(t0))), float(0.05));
      const d = length(rel);
      const reach = clamp(float(1).sub(d.sub(lp.w.mul(2)).div(lp.w.mul(2))), 0, 1);
      const a = atan(t0.negate().div(h)), b = atan(segLen.sub(t0).div(h));
      const dth = b.sub(a).div(LAMP_STEPS);
      const sum = float(0).toVar();
      for (let k = 0; k < LAMP_STEPS; k++) {
        const th = a.add(dth.mul(k + 0.5));
        const c = sin(th);
        const t = t0.add(h.mul(sin(th).div(cos(th))));
        const r = h.div(cos(th));
        const ph = float((1 - forward) / (4 * Math.PI)).add(float(forward * (1 - g * g) / (4 * Math.PI))
          .div(pow(max(float(1 + g * g).sub(c.mul(2 * g)), float(1e-4)), float(1.5))));
        sum.addAssign(ph.mul(exp(sigma.mul(t.add(r)).negate())));
      }
      acc.addAssign(L.col.element(i).xyz.mul(sigma.mul(sum).mul(dth).div(h).mul(reach)));
    });
  });
  const extra = v.extra ? v.extra(dir, segLen, sigma) : vec3(0);
  return acc.add(extra);
}
