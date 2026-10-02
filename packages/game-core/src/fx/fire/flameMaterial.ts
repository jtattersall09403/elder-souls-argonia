/**
 * The flame-card and ember materials (16k walk 5; TSL port under decision 0111, volume hand-off decision 0110):
 * NodeMaterials over instanced unit quads, consuming `FireConfig`
 * (fireTypes.ts). One graph for both backends of the node renderer; on the
 * WebGPU backend the large presets' cards hand over to the raymarched volume
 * (volumeFire.ts) within `FIRE_VOLUME_REACH_M` of the camera.
 *
 * Why it reads by day and by night (the walk-4 defect: invisible by day, a
 * white blob at night). The scene's exposure spans 3.9e-5 (noon) to 22
 * (night) (world-studio sky/lightRig.ts EXPOSURE_CURVE), so a flame drawn as
 * scene radiance is crushed to black by day and clips by night. The flame is
 * authored display-referred: `uNight` (from `renderer.toneMappingExposure`)
 * picks the day/night blend, and the colour is written through
 * `displayToScene` (fireNodes.ts), the inverse of the output pass's tone map
 * at the current exposure, so the frame's tone map lands it on the intended
 * display colour. The blend is premultiplied alpha (`ONE,
 * ONE_MINUS_SRC_ALPHA`): the core carries alpha, so it COVERS the background
 * (an orange shape in full sun); the fringe carries colour with no alpha, so
 * it ADDS glow (a halo at night).
 *
 * Instance attributes (FlameSystem.ts writes them):
 *   iPosSeed  vec4  emitter position (m) in the FlameSystem group's space, seed 0..1
 *
 * Both vertex shaders take `iPosSeed.xyz` through `modelWorldMatrix` before the
 * camera maths. An interior cell's emitters are cell-local and its group
 * stands at (door x, 4000 m, door z) (interior/doors.ts
 * INTERIOR_SPACE_LIFT_M); read as world positions they drew 4 km below the
 * player, past `uMaxDistance`, so every interior flame faded to nothing
 * in the studio while the look harness (cell at the origin) showed them
 * (16k walk 7). A settlement's fixture group stands at the identity.
 *   iShape    vec4  width m, height m, turbulence 0..1, rise (heights/s)
 *   iParams   vec4  intensity 0..1, palette row, layer (0 core, 1 outer), taper
 *   iAnim     vec4  flicker Hz, flicker share, wind response, volume preset (1: the
 *                   card yields to the volume where the volume draws)
 *   iMotion   vec4  sway (card widths at the tip), pulse share, motion Hz, unused
 */
import * as THREE from "three";
import { NodeMaterial } from "three/webgpu";
import * as tsl from "three/tsl";
import type { TslNode } from "../../render/nodes/materialNodes";
import { sel } from "../../render/nodes/materialNodes";
import { sharedUniform } from "../../render/nodes/sharedUniform";
import { DEFAULT_RAMP_BANDS, FIRE_PRESETS, FIRE_PRESET_ORDER } from "./fireTypes";
import {
  displayToScene, fireFbm, fireFlickerNode, fireMask, fireRamp, fireWobble,
} from "./fireNodes";

// TSL chains are typed loosely on purpose (tsl-shaders.md §1).
const T = tsl as unknown as Record<string, (...a: TslNode[]) => TslNode> & Record<string, TslNode>;
const {
  Fn, If, Discard, attribute, clamp, float, int, length, max, min, mix, normalize, smoothstep, step,
  uniformArray, varying, vec2, vec3, vec4,
} = T;

/** A flame never draws narrower than this angle (radians, ~4 px at 1080p),
 * so a 3.5 cm candle flame still reads as a point of fire at 50 m. */
export const FLAME_MIN_ANGLE_RAD = 0.004;
/** Flames fade out over the last `FLAME_FADE_M` before `FLAME_MAX_DISTANCE_M`. */
export const FLAME_MAX_DISTANCE_M = 250;
export const FLAME_FADE_M = 30;
/** Embers are drawn only this close (m). */
export const EMBER_MAX_DISTANCE_M = 60;
/** The card's root stands this share of its height below the emitter: the
 * flame's dark base wraps the wick, it does not float above it. */
export const FLAME_ROOT_SHARE = 0.12;
/** WebGPU: a volume preset draws as a raymarched volume inside this distance
 * (m), as cards beyond it; the two cross-fade over `FIRE_VOLUME_BLEND_M`. */
export const FIRE_VOLUME_REACH_M = 35;
export const FIRE_VOLUME_BLEND_M = 5;

/** Uniform nodes the flame, ember and volume materials share (one object, by reference). */
export interface FireUniforms {
  uTime: TslNode;
  /** 0 day .. 1 night, from the renderer's exposure (`nightShareOfExposure`). */
  uNight: TslNode;
  /** The renderer's tone-mapping exposure, and 1 when the frame is tone mapped (fireNodes `displayToScene`). */
  uExposure: TslNode;
  uToneMapped: TslNode;
  /** xz wind, m/s (a Vector2). */
  uWind: TslNode;
  uMinAngle: TslNode;
  uMaxDistance: TslNode;
  uFade: TslNode;
  /** 1 when the volume renderer is live (WebGPU): volume-preset cards yield inside its reach. */
  uVolumeOn: TslNode;
  uVolumeReach: TslNode;
  /** Per palette row: base, mid, tip (3 entries each). */
  uRamp: TslNode;
  /** Per palette row: gain by day, by night. */
  uGain: TslNode;
  /** Per palette: where the body and tip bands start (`FireConfig.bands`). */
  uBands: TslNode;
}

/** The palette tables from the presets, in `FIRE_PRESET_ORDER`. */
export function makeFireUniforms(): FireUniforms {
  const ramp: THREE.Vector3[] = [];
  const gain: THREE.Vector2[] = [];
  const bands: THREE.Vector2[] = [];
  for (const id of FIRE_PRESET_ORDER) {
    const c = FIRE_PRESETS[id];
    ramp.push(new THREE.Vector3(...c.ramp.base), new THREE.Vector3(...c.ramp.mid), new THREE.Vector3(...c.ramp.tip));
    gain.push(new THREE.Vector2(c.gain.day, c.gain.night));
    const b = c.bands ?? DEFAULT_RAMP_BANDS;
    bands.push(new THREE.Vector2(b.mid, b.tip));
  }
  return {
    uTime: sharedUniform(0), uNight: sharedUniform(0), uExposure: sharedUniform(1), uToneMapped: sharedUniform(1),
    uWind: sharedUniform(new THREE.Vector2()),
    uMinAngle: sharedUniform(FLAME_MIN_ANGLE_RAD), uMaxDistance: sharedUniform(FLAME_MAX_DISTANCE_M),
    uFade: sharedUniform(FLAME_FADE_M), uVolumeOn: sharedUniform(0), uVolumeReach: sharedUniform(FIRE_VOLUME_REACH_M),
    uRamp: uniformArray(ramp, "vec3"), uGain: uniformArray(gain, "vec2"), uBands: uniformArray(bands, "vec2"),
  };
}

/** The shared blend state of every fire material (cards, embers, volumes). */
export function premultipliedFireMaterial(material: NodeMaterial, name: string): NodeMaterial {
  material.name = name;
  material.transparent = true;
  material.depthWrite = false;
  material.depthTest = true;
  material.fog = false;
  material.lights = false;
  material.side = THREE.DoubleSide;
  material.blending = THREE.CustomBlending;
  material.blendEquation = THREE.AddEquation;
  material.blendSrc = THREE.OneFactor;
  material.blendDst = THREE.OneMinusSrcAlphaFactor;
  material.blendSrcAlpha = THREE.OneFactor;
  material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  // the graph writes premultiplied colour itself: NodeMaterial's
  // premultipliedAlpha would multiply the fringe (alpha 0) away
  material.premultipliedAlpha = false;
  return material;
}

/** Share of a volume preset drawn as the volume at distance `dist` (1 near .. 0 beyond the reach). */
export function volumeShareAt(dist: number, reach = FIRE_VOLUME_REACH_M, blend = FIRE_VOLUME_BLEND_M): number {
  const x = Math.min(1, Math.max(0, (reach - dist) / blend));
  return x * x * (3 - 2 * x);
}

/** The node twin of `volumeShareAt`, times `uVolumeOn`. */
export function volumeShareNode(u: FireUniforms, dist: TslNode): TslNode {
  return smoothstep(float(0), float(FIRE_VOLUME_BLEND_M), u.uVolumeReach.sub(dist)).mul(u.uVolumeOn);
}

export function makeFlameMaterial(u: FireUniforms): NodeMaterial {
  const material = premultipliedFireMaterial(new NodeMaterial(), "fire-flame");
  const iPosSeed = attribute("iPosSeed", "vec4");
  const iShape = attribute("iShape", "vec4");
  const iParams = attribute("iParams", "vec4");
  const iAnim = attribute("iAnim", "vec4");
  const iMotion = attribute("iMotion", "vec4");
  const position = attribute("position", "vec3");

  const at = T.modelWorldMatrix.mul(vec4(iPosSeed.xyz, 1)).xyz;
  const seed = iPosSeed.w;
  const toCam = T.cameraPosition.sub(at);
  const dist = length(toCam);
  // Y-locked billboard: the card turns about the vertical only, like
  // Skyrim's and BotW's fire cards, so it never tips edge-on from the side
  const hx = toCam.x;
  const hz = toCam.z;
  const hl = length(vec2(hx, hz));
  const right = sel(hl.greaterThan(1e-4), vec3(hz, 0, hx.negate()).div(max(hl, 1e-4)), vec3(1, 0, 0));
  const grow = max(float(1), dist.mul(u.uMinAngle).div(max(iShape.x, 1e-4)));
  // the outer layer is wider and a little shorter
  const outerV = step(0.5, iParams.z);
  // per-card motion on the card's own phase: width and height pulse (the
  // flame breathes, taller when thinner), the upper body sways sideways
  const mt = u.uTime.mul(iMotion.z);
  const pw = fireWobble(mt.mul(1.3), seed.add(0.31));
  const ph = fireWobble(mt.mul(1.7), seed.add(0.67));
  const w = iShape.x.mul(grow).mul(mix(1, 1.45, outerV)).mul(float(1).add(iMotion.y.mul(pw)));
  const h = iShape.y.mul(grow).mul(mix(1, 0.9, outerV))
    .mul(float(1).add(iMotion.y.mul(ph.mul(0.8).sub(pw.mul(0.3)))));
  const y = position.y; // 0 root .. 1 tip
  const sway = iMotion.x.mul(w).mul(fireWobble(mt, seed).mul(0.7).add(fireWobble(mt.mul(2.9), seed.add(0.13)).mul(0.3)));
  const lean = u.uWind.mul(iAnim.z).mul(h).mul(y).mul(y);
  const p = at.add(right.mul(position.x.mul(w).add(sway.mul(y).mul(y))))
    .add(vec3(lean.x, y.sub(FLAME_ROOT_SHARE).mul(h), lean.y));
  const fade = clamp(u.uMaxDistance.sub(dist).div(u.uFade), 0, 1);
  // a volume preset's card yields to the volume inside its reach
  const cardShare = float(1).sub(volumeShareNode(u, dist).mul(step(0.5, iAnim.w)));
  const intensity = iParams.x.mul(fade).mul(cardShare).mul(fireFlickerNode(u.uTime, seed, iAnim.x, iAnim.y));
  const clip = T.cameraProjectionMatrix.mul(T.cameraViewMatrix).mul(vec4(p, 1));
  material.vertexNode = sel(intensity.greaterThan(0), clip, vec4(2, 2, 2, 1));

  const vUv = varying(vec2(position.x, y), "vFireUv");
  const vSeed = varying(seed, "vFireSeed");
  const vIntensity = varying(intensity, "vFireIntensity");
  const vPalette = varying(iParams.y, "vFirePalette");
  const vLayer = varying(iParams.z, "vFireLayer");
  const vTaper = varying(iParams.w, "vFireTaper");
  const vTurb = varying(iShape.z, "vFireTurb");
  const vRise = varying(iShape.w, "vFireRise");
  const vOctaves = varying(sel(dist.lessThan(40), float(3), sel(dist.lessThan(120), float(2), float(1))), "vFireOctaves");

  material.fragmentNode = Fn(() => {
    const row = int(vPalette.add(0.5));
    const outer = step(0.5, vLayer);
    const turb = vTurb.mul(float(1).add(outer.mul(0.6)));
    const q = vec2(vUv.x.mul(3), vUv.y.mul(2.2).sub(u.uTime.mul(vRise))).add(vSeed.mul(37));
    const n = fireFbm(q, vOctaves);
    const n2 = fireFbm(q.mul(1.7).add(9.3), max(float(1), vOctaves.sub(1)));
    // distort more toward the tip: the root is steady, the tongues lick
    const pp = vec2(vUv.x.add(n.sub(0.5).mul(turb).mul(0.9).mul(vUv.y)), vUv.y.add(n2.sub(0.5).mul(turb).mul(0.35)));
    const mask = fireMask(pp, vTaper);
    // heat: hottest low in the core, cooling up and out
    const heat = mask.mul(float(1).sub(vUv.y.mul(0.55))).mul(n.mul(0.5).add(0.75)).mul(mix(1, 0.55, outer)).toVar();
    If(heat.lessThan(0.01), () => { Discard(); });
    const base = u.uRamp.element(row.mul(3));
    const midC = u.uRamp.element(row.mul(3).add(1));
    const tip = u.uRamp.element(row.mul(3).add(2));
    // the ramp's band coordinate: height up the (distorted) flame, pushed
    // down to the base band at the cool fringe, so the root and the edges are
    // dark red, the body bright yellow-white, the top the pale tip
    const band0 = clamp(pp.y, 0, 1);
    const band1 = mix(band0, float(0), float(1).sub(smoothstep(0.08, 0.4, mask)).mul(float(1).sub(band0.mul(0.5))));
    // the outer cards are the cooler flanks: orange tongues, red at the root
    const band = mix(band1, max(band1, float(0.62)), outer);
    const bands = u.uBands.element(row);
    const col = fireRamp(band, base, midC, tip, bands);
    // the tip thins to transparent from just above the tip band's start
    heat.mulAssign(float(1).sub(smoothstep(bands.y.add(0.05), float(0.95), pp.y).mul(0.85)));
    const gainDN = u.uGain.element(row);
    const gain = mix(gainDN.x, gainDN.y, u.uNight);
    // core covers (alpha), fringe adds (colour with no alpha)
    const core = smoothstep(0.3, 0.75, heat).mul(float(1).sub(outer.mul(0.5)));
    const fringe = smoothstep(0.0, 0.5, heat).mul(mix(0.06, 0.55, u.uNight));
    const a = clamp(core.mul(mix(0.95, 0.7, u.uNight)).mul(vIntensity), 0, 1);
    const k = clamp(core.mul(mix(1.0, 0.8, u.uNight)).add(fringe).mul(vIntensity), 0, 1);
    const scene = displayToScene(min(col.mul(gain), vec3(1)), u.uExposure, u.uToneMapped);
    return vec4(scene.mul(k), a);
  })();
  return material;
}

/** Embers write alpha 0, so under the premultiplied blend they purely add:
 * order-free, one pass draws the same colours (three's transparent DoubleSide
 * back-then-front pass relinked twice a frame, perf10 O10). The flame writes
 * coverage (`a > 0`), so its two passes stay. */
export function makeEmberMaterial(u: FireUniforms): NodeMaterial {
  const material = premultipliedFireMaterial(new NodeMaterial(), "fire-ember");
  const iPosSeed = attribute("iPosSeed", "vec4"); // emitter, seed
  const iEmber = attribute("iEmber", "vec4"); // rise m, size m, life s, spread m
  const iParams = attribute("iParams", "vec4"); // intensity, palette, index, unused
  const position = attribute("position", "vec3");
  const h1 = (x: TslNode) => T.fract(T.sin(x.mul(91.3458)).mul(47453.5453));
  const k = iPosSeed.w.mul(97).add(iParams.z.mul(13.7));
  const life = max(iEmber.z, 0.1);
  const t = T.fract(u.uTime.div(life).add(h1(k)));
  const ang = h1(k.add(1)).mul(6.2831853);
  const drift = vec3(T.cos(ang.add(t.mul(3))), 0, T.sin(ang.add(t.mul(3)))).mul(iEmber.w).mul(t.add(0.4));
  const wind = u.uWind.mul(t).mul(t).mul(iEmber.x).mul(0.5);
  const p0 = T.modelWorldMatrix.mul(vec4(iPosSeed.xyz, 1)).xyz.add(drift).add(vec3(wind.x, t.mul(iEmber.x), wind.y));
  const toCam = T.cameraPosition.sub(p0);
  const dist = length(toCam);
  const f = normalize(toCam);
  const right = normalize(T.cross(vec3(0, 1, 0), f).add(vec3(1e-5, 0, 0)));
  const up = T.cross(f, right);
  const s = iEmber.y.mul(max(float(1), dist.mul(0.002).div(max(iEmber.y, 1e-4))));
  const p = p0.add(right.mul(position.x).add(up.mul(position.y.sub(0.5))).mul(s));
  const alpha = iParams.x.mul(float(1).sub(t)).mul(smoothstep(0.0, 0.1, t)).mul(step(dist, u.uMaxDistance));
  const clip = T.cameraProjectionMatrix.mul(T.cameraViewMatrix).mul(vec4(p, 1));
  material.vertexNode = sel(alpha.greaterThan(0), clip, vec4(2, 2, 2, 1));
  const vUv = varying(vec2(position.x, position.y.sub(0.5)), "vEmberUv");
  const vAlpha = varying(alpha, "vEmberAlpha");
  const vPalette = varying(iParams.y, "vEmberPalette");
  material.fragmentNode = Fn(() => {
    const d = length(vUv).mul(2);
    const glow = float(1).sub(smoothstep(0.2, 1.0, d)).toVar();
    If(glow.lessThanEqual(0), () => { Discard(); });
    const row = int(vPalette.add(0.5));
    const col = mix(u.uRamp.element(row.mul(3).add(1)), u.uRamp.element(row.mul(3).add(2)), glow);
    // pure glow: colour, no alpha (adds under the premultiplied blend)
    const scene = displayToScene(col, u.uExposure, u.uToneMapped);
    return vec4(scene.mul(glow).mul(vAlpha), 0);
  })();
  material.forceSinglePass = true;
  return material;
}

/** The flame card: x -0.5..0.5, y 0 (root) .. 1 (tip). */
export function makeFlameQuad(): THREE.InstancedBufferGeometry {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}
