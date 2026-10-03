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
import type { VolumetricTier } from "./bandGovernor";

const T = tsl as unknown as Record<string, (...a: TslNode[]) => TslNode> & Record<string, TslNode>;
const { Loop, If, atan, clamp, cos, dot, exp, float, length, log, max, min, mix, pow, sin, smoothstep, sqrt, vec3, vec4 } = T;

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
  /** Lamp-halo medium floor (extinction /m, LAMP_HALO x the fog field's `halo` dampness) and the camera
   * distance (m) out to which a lamp keeps its full halo; minReachM is the tier's `lampHalo` row. */
  halo?: { sigmaFloor: TslNode; viewM: TslNode; minReachM: number };
  /** Per-pixel extra in-scatter along the view ray (world dir, segment length, mean extinction):
   * sharp canopy shafts and beam motes the froxel grid is too coarse to hold. */
  extra?(dir: TslNode, segLen: TslNode, sigma: TslNode): TslNode;
  /** Grid uvw of a world position in the camera basis the grid was injected with; when given the
   * lookup uses it instead of the render camera's screen position (a stale grid stays on the geometry). */
  gridUvw?(worldPos: TslNode): TslNode;
  /** 1 when a band is on, else 0 (the colour passes through). */
  on: TslNode;
}

/** `color` seen through the medium from the camera to `viewDepth` metres at `screenUV`. */
export function applyVolumetrics(v: VolumetricsSampler, color: TslNode, viewDepth: TslNode, screenUV: TslNode): TslNode {
  // slice coordinate: the exact inverse of the inject's exponential depth (near * (far/near)^s)
  const s = log(max(viewDepth, v.near).div(v.near)).div(log(v.far.div(v.near)));
  const uvw = v.gridUvw ? v.gridUvw(T.positionWorld) : vec3(screenUV.x, screenUV.y, s);
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
export const LAMP_PHASE: { readonly g: number; readonly forward: number } = { g: 0.75, forward: 0.8 };
/** A lamp's airlight is marched only inside LAMP_REACH x its light radius, fading from LAMP_REACH_FADE
 * of that: at 3 radii the in-scatter has fallen to a few percent of its peak, so the phase lobe and the
 * medium set the halo edge, not the cut; the cut still keeps distant ground free of lit haze. */
export const LAMP_REACH = 3;
/** Lamp halos in damp air. sigmaFloorPerM: the halo medium's extinction at full dampness (fogField
 * `halo` = 1), so a humid clear night still scatters lamp light into a halo (a clear-air grid alone
 * gives ~0.002 /m and no visible halo). minReachM: the marched sphere is never smaller than this, so a
 * small candle's halo spans tens of pixels at 10-30 m. viewM: full halo out to this camera distance,
 * fading to none at twice it. */
export const LAMP_HALO = {
  high: { sigmaFloorPerM: 0.02, minReachM: 6, viewM: 30 },
  mobile: { sigmaFloorPerM: 0.02, minReachM: 4, viewM: 20 },
} as const;
/** The LAMP_HALO row a renderer of `tier` draws: mobile its own, every desktop tier high. */
export function lampHalo(tier: VolumetricTier): (typeof LAMP_HALO)[keyof typeof LAMP_HALO] {
  return tier === "mobile" ? LAMP_HALO.mobile : LAMP_HALO.high;
}
export const LAMP_REACH_FADE = 0.6;
const smooth = (e0: number, e1: number, x: number) => { const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1); return t * t * (3 - 2 * t); };
/** Midpoint steps of the equiangular march per lamp. */
export const LAMP_STEPS = 10;

export function lampPhase(c: number, g = LAMP_PHASE.g, forward = LAMP_PHASE.forward): number {
  const hg = (1 - g * g) / (4 * Math.PI * Math.pow(Math.max(1 + g * g - 2 * g * c, 1e-4), 1.5));
  return (1 - forward) / (4 * Math.PI) + forward * hg;
}

/** Scattering (/m) of the smoke-thick air at a fire (a light with `VolumeLight.fire`), falling to the medium's own
 * over FIRE_HALO_FALLOFF_M from the emitter: the in-scatter only, the extinction stays the medium's (vol10 diag4 D7:
 * the cell-wide 0.012 /m showed no halo; a visible 1-2 m glow needs ~0.1-0.15 /m). Packed in the light's col.w. */
export const FIRE_HALO_SIGMA_PER_M = 0.12;
export const FIRE_HALO_FALLOFF_M = 2;

/** Scattering coefficient at distance r from a light whose local (fire) scattering is `local`. */
export function localScatter(sigma: number, local: number, r: number): number {
  return Math.max(sigma, local * (1 - smooth(0, FIRE_HALO_FALLOFF_M, r)));
}

/** Single-scatter in-scatter of one point light along a ray [0, L] in a homogeneous medium, marched
 * equiangularly (Kulla and Fajardo 2012): t = t0 + h tan(theta), dt / r^2 = dtheta / h, and the
 * scattering cosine at the sample is sin(theta). t0 is the ray parameter nearest the light, h its
 * distance from the ray. Plain TS twin of the shader loop. */
export function airlightIntegral(sigma: number, intensity: number, t0: number, h: number, L: number,
  steps = LAMP_STEPS, forward: number = LAMP_PHASE.forward, R = Infinity, local = 0): number {
  const hh = Math.max(h, 0.05);
  const half = Math.sqrt(Math.max(R * R - hh * hh, 0));
  const a = Math.atan((Math.max(t0 - half, 0) - t0) / hh);
  const b = Math.max(Math.atan((Math.min(t0 + half, L) - t0) / hh), a), dth = (b - a) / steps;
  let sum = 0;
  for (let k = 0; k < steps; k++) {
    const th = a + (k + 0.5) * dth;
    const t = t0 + hh * Math.tan(th), r = hh / Math.cos(th);
    const fade = Number.isFinite(R) ? 1 - smooth(R * LAMP_REACH_FADE, R, r) : 1;
    sum += localScatter(sigma, local, r) * lampPhase(Math.sin(th), LAMP_PHASE.g, forward) * Math.exp(-sigma * (t + r)) * fade;
  }
  return intensity * sum * dth / hh;
}

function pointAirlight(v: VolumetricsSampler, trans: TslNode, viewDepth: TslNode): TslNode {
  const L = v.lights as NonNullable<VolumetricsSampler["lights"]>;
  const cam = T.cameraPosition;
  const dirW = T.positionWorld.sub(cam);
  const segLen = min(length(dirW), v.far);
  const dir = dirW.div(max(length(dirW), float(1e-4)));
  // the medium's mean extinction along this pixel's ray, read from the grid's own transmittance
  const gridSigma = clamp(log(max(trans, float(1e-4))).negate().div(max(viewDepth, v.near)), 0.002, 0.5);
  const sigma = v.halo ? max(gridSigma, v.halo.sigmaFloor) : gridSigma;
  const minReach = float(v.halo?.minReachM ?? LAMP_HALO.high.minReachM);
  const { g, forward } = LAMP_PHASE;
  const acc = vec3(0).toVar();
  Loop({ start: 0, end: L.max }, ({ i }: { i: TslNode }) => {
    If(T.int(i).lessThan(L.count), () => {
      const lp = L.pos.element(i);
      const rel = lp.xyz.sub(cam);
      const t0 = dot(rel, dir);
      const h = max(length(rel.sub(dir.mul(t0))), float(0.05));
      const d = length(rel);
      // full halo out to max(2 radii, viewM) from the camera, none at twice that
      const d0 = v.halo ? max(lp.w.mul(2), v.halo.viewM) : lp.w.mul(2);
      const reach = clamp(float(1).sub(d.sub(d0).div(d0)), 0, 1);
      // the lamp lights only the air inside its reach sphere (LAMP_REACH x radius, soft over the outer
      // part): march the chord through it, not the whole ray, or distant ground reads as lit haze
      const R = max(lp.w.mul(LAMP_REACH), minReach);
      const half = sqrt(max(R.mul(R).sub(h.mul(h)), float(0)));
      const a = atan(max(t0.sub(half), float(0)).sub(t0).div(h));
      const b = max(atan(min(t0.add(half), segLen).sub(t0).div(h)), a);
      const dth = b.sub(a).div(LAMP_STEPS);
      const local = L.col.element(i).w;
      const sum = float(0).toVar();
      for (let k = 0; k < LAMP_STEPS; k++) {
        const th = a.add(dth.mul(k + 0.5));
        const c = sin(th);
        const t = t0.add(h.mul(sin(th).div(cos(th))));
        const r = h.div(cos(th));
        const ph = float((1 - forward) / (4 * Math.PI)).add(float(forward * (1 - g * g) / (4 * Math.PI))
          .div(pow(max(float(1 + g * g).sub(c.mul(2 * g)), float(1e-4)), float(1.5))));
        const scat = max(sigma, local.mul(float(1).sub(smoothstep(float(0), float(FIRE_HALO_FALLOFF_M), r))));
        sum.addAssign(scat.mul(ph).mul(exp(sigma.mul(t.add(r)).negate())).mul(float(1).sub(smoothstep(R.mul(LAMP_REACH_FADE), R, r))));
      }
      acc.addAssign(L.col.element(i).xyz.mul(sum.mul(dth).div(h).mul(reach)));
    });
  });
  const extra = v.extra ? v.extra(dir, segLen, sigma) : vec3(0);
  return acc.add(extra);
}
