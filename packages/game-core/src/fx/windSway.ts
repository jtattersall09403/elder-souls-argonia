/**
 * Wind sway for instanced vegetation — a `positionNode` feature shared by
 * every plant material in the world (decision 0082; walk-8 lane E rewrite;
 * node form, decision 0111).
 *
 * The recipe (research/rendering/vegetation-scatter-instancing-threejs.md §4,
 * GPU Gems 3 ch. 16, the fable5 demo's gust fronts): trunk bend by height
 * squared at a frequency set by plant size, branch sway, leaf flutter, a gust
 * field that travels downwind across the stand, a per-instance phase so a
 * forest never sways in unison, and a distance fade. Vertex stage only, no
 * texture fetch, four uniforms' worth of state.
 *
 * **The one thing that must not be got wrong**: the shadow must sway with the
 * tree. In node materials the shadow pass reuses `positionNode` (and
 * `castShadowPositionNode`, which this also wraps when a feature set one), so
 * there is no depth twin to forget; the distance fade reads the player's eye
 * never the pass camera, so shadows keep swaying in the shadow pass.
 * The branch and leaf weights are read from the geometry (distance from the
 * trunk axis, height), because the sourced meshes carry no authored wind
 * vertex colours.
 *
 * Lives in a package rather than in the studio app because it is game
 * rendering, not scene composition (owner ruling 2026-08-30, decision 0038
 * addendum).
 */

import * as THREE from "three";
import type { NodeMaterial } from "three/webgpu";
import * as tsl from "three/tsl";
import { instanceDataNode } from "./batchData";
import { instanceMatrixNode, matrixColumn } from "./instanceNodes";
import {
  claimFeature, sel, wrapPosition, wrapShadowPosition, type TslNode,
} from "../render/nodes/materialNodes";
import { sharedUniform } from "../render/nodes/sharedUniform";

// TSL chains are typed loosely on purpose (tsl-shaders.md §1).
const {
  clamp, cos, dot, float, floor, fract, inverseSqrt, length, mat3, max, min, mix, pow, sin,
  smoothstep, transpose, vec2, vec3,
} = tsl as unknown as Record<string, TslNode>;

/** The uniform block a group of vegetation materials shares (`uniform()` nodes; write `.value`). */
export interface WindUniforms {
  /** Seconds, monotonic — the caller's elapsed clock, set by `updateWindSway`. */
  esWindTime: { value: number } & TslNode;
  /** Travel direction (XZ unit) × strength, plus gustiness in `z`. */
  esWindVec: { value: THREE.Vector3 } & TslNode;
  /** Beyond this distance from the camera, sway fades to nothing. */
  esWindFadeM: { value: number } & TslNode;
  /** The player's view point (the MAIN camera), set by `updateWindSway`. The
   * fade reads this, never `cameraPosition`: in the shadow pass that is the
   * shadow camera, past the cascades, and shadows would stop swaying with
   * their plants. */
  esWindEye: { value: THREE.Vector3 } & TslNode;
}
/**
 * Metres. Sway is a near-field effect: past this the per-vertex motion is
 * sub-pixel, and switching it off keeps it away from the billboard tier
 * entirely (research §4: "wind never runs on the impostor tier").
 */
export const WIND_FADE_M = 220;

/**
 * Metres of crown displacement per m/s of wind, at the top of the plant.
 * Calibrated to read as movement without the rubbery over-bend that makes
 * vegetation look like seaweed: a 15 m tree in a 10 m/s blow leans ~0.9 m.
 */
export const WIND_METRES_PER_MS = 0.09;

/**
 * Per-instance wind tuning, as a `vec3` instanced attribute:
 *
 *   `.x` = stiffness − 1   `.y` = sink metres   `.z` = plant height metres
 *
 * Each reads its neutral value at 0 ON PURPOSE (height 0 = ground cover, 1 m). An instanced draw whose
 * geometry lacks the attribute reads zero
 * (what `optionalAttribute` reads for a missing one; on the foliage batches
 * it is texel 1 of the data texture, `batchData.ts`), which decodes to
 * stiffness 1, sink 0 and a 1 m plant: a missing attribute
 * degrades to ground-cover motion rather than switching wind off.
 */
export const WIND_TUNE_ATTRIBUTE = "esWindTune";

/**
 * Trunk radius, in metres, that gets the calibrated (×1) amount of sway.
 * The median canopy trunk in the flora kit; species fatter than this stiffen,
 * thinner ones loosen.
 */
export const WIND_REFERENCE_TRUNK_RADIUS_M = 0.36;

/**
 * Clamp on the stiffness multiplier. The ceiling is **1.0 on purpose**: this
 * term only ever STIFFENS a plant relative to the calibrated baseline, never
 * loosens it. Round 7 let thin trunks scale up to 2.2 and the owner
 * immediately read palms as swaying too much, worst in light winds — which
 * makes sense, because the round-6 amplitude they had already accepted was
 * tuned for exactly those slender trees. Fat trunks were the defect; thin ones
 * were never the problem, so they keep the amplitude that passed.
 */
export const WIND_STIFFNESS_RANGE: readonly [number, number] = [0.18, 1.0];

/**
 * How much a plant sways relative to the calibrated median, from the width of
 * its trunk at the ground.
 *
 * Owner round-6 defect: "trees with big wide trunks sway just as much as ones
 * with thin trunks, which looks odd". They were right and the physics agrees.
 * For a cantilever the tip deflection goes as `q·H⁴/(E·I)` with the second
 * moment `I ∝ r⁴`; the wind load `q` scales with crown area, which in tree
 * allometry grows roughly as `r²`. The two together leave deflection `∝ r⁻²`,
 * which is the exponent used here — a 1.2 m-radius buttressed giant lands on
 * the floor of the clamp and barely stirs. The result is capped at 1 (see
 * WIND_STIFFNESS_RANGE): slender trunks keep the amplitude that was already
 * signed off, they are not amplified.
 *
 * `scale` is the instance's uniform scale, because a species placed at ×2 has
 * a trunk twice as thick.
 */
export function windStiffness(trunkRadiusM: number, scale = 1): number {
  const radius = trunkRadiusM * scale;
  if (!(radius > 0)) return 1;
  const ratio = WIND_REFERENCE_TRUNK_RADIUS_M / radius;
  const [lo, hi] = WIND_STIFFNESS_RANGE;
  return Math.min(hi, Math.max(lo, ratio * ratio));
}

export function createWindUniforms(): WindUniforms {
  return {
    esWindTime: sharedUniform(0) as WindUniforms["esWindTime"],
    esWindVec: sharedUniform(new THREE.Vector3(1, 0, 0)) as WindUniforms["esWindVec"],
    esWindFadeM: sharedUniform(WIND_FADE_M) as WindUniforms["esWindFadeM"],
    esWindEye: sharedUniform(new THREE.Vector3()) as WindUniforms["esWindEye"],
  };
}

/**
 * Fold this frame's weather wind into the shared uniforms.
 *
 * `windDirXZ` and `windSpeedMS` come straight off the weather sample, so the
 * plants, the waves and the rain all gust from the same source.
 */
export function updateWindSway(
  uniforms: WindUniforms,
  elapsedSeconds: number,
  wind: { windDirXZ: readonly [number, number]; windSpeedMS: number; gustiness: number },
  eye: THREE.Vector3,
): void {
  uniforms.esWindEye.value.copy(eye);
  // Absolute, not accumulated: two systems sharing one uniform block (the
  // instanced flora and the groundcover ring both do) may each call this per
  // frame, and accumulation would run the clock at double speed.
  uniforms.esWindTime.value = elapsedSeconds;
  const strength = wind.windSpeedMS * WIND_METRES_PER_MS;
  uniforms.esWindVec.value.set(
    wind.windDirXZ[0] * strength,
    wind.windDirXZ[1] * strength,
    wind.gustiness,
  );
}

/**
 * Every gust-field and rustle constant, in one place (walk 9 owner correction:
 * the fault was a gust field so constant that everything moved alike under
 * every weather). The node graph is built from these values and
 * `windSway.test.ts` measures the TypeScript law below, which mirrors it.
 *
 * The envelope is Taylor's frozen turbulence: a pattern carried downwind at
 * `driftBase + driftPerMS × wind`, so a front keeps its shape across tens of
 * metres and reaches a plant 5 m downwind a fraction of a second later. The
 * pattern is a row of discrete gust fronts along the wind: every `slotM`
 * metres one slot may hold a front (chance rising with gustiness), with its
 * own position, length and strength drawn from a hash, so fronts come at
 * irregular spacing with calm between them. A coarse lull field modulates
 * the chance (active minutes and quiet minutes: the red end of the
 * spectrum), and the draw is blended across the wind over `crossCellM`, so
 * a front is a broad band that fades out sideways rather than a wall.
 * Lengths are in metres, so a front lasts longer in light wind and passes
 * faster in a gale, as real gusts do.
 */
export const WIND_GUST = {
  /** Gust fronts travel at this many m/s plus `driftPerMS` × wind speed. */
  driftBase: 1,
  driftPerMS: 0.9,
  /** One possible front per this many metres along the wind. */
  slotM: 60,
  /** Where in its slot a front's centre falls (fraction of the slot). */
  centreSpan: [0.15, 0.85] as readonly number[],
  /** Front half-length, metres along the wind. */
  halfLengthM: [16, 55] as readonly number[],
  /** Chance a slot holds a front: `occupancyBase + occupancyPerGust × gustiness`, times the lull field. */
  occupancyBase: 0.1,
  occupancyPerGust: 0.75,
  /** The lull field: value noise of this cell (m), scaling the chance by `lullRange`. */
  lullCellM: 520,
  lullRange: [0.35, 1.45] as readonly number[],
  /** Across the wind, the draw is blended over this many metres. */
  crossCellM: 150,
  /** Per-front strength draw. */
  strengthRange: [0.35, 1] as readonly number[],
  /** Ground cover is still at or below this wind, m/s (the clear-weather states blow 2.2). */
  coverCalmMS: 2.5,
  /** At or above this wind, m/s, ground cover is laid over. */
  coverFullMS: 12,
  /** Ground-cover slow-bend rate, Hz, from calm to full wind. */
  coverHz: [0.4, 1.2] as readonly number[],
  /** Tip lean at full wind in a full front, as a fraction of plant height. */
  coverLean: 0.9,
  /** Share of the lean that is steady (the rest arrives with the front). */
  coverSteady: 0.35,
  /** Rustle (high-frequency flutter), rad/s, and its tip amplitude as a fraction of plant height. */
  rustleRadS: 44,
  rustleCover: 0.05,
  /** Rustle grows with (wind / rustleFullMS)²; above `rustleStrongMS` a floor of it stays between fronts. */
  rustleFullMS: 14,
  rustleStrongMS: [10, 14] as readonly number[],
  rustleStrongFloor: 0.35,
} as const;

function windHash(x: number, z: number): number {
  const v = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

function windNoise(x: number, z: number): number {
  const ix = Math.floor(x); const iz = Math.floor(z);
  let fx = x - ix; let fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
  const a = windHash(ix, iz) + (windHash(ix + 1, iz) - windHash(ix, iz)) * fx;
  const b = windHash(ix, iz + 1) + (windHash(ix + 1, iz + 1) - windHash(ix, iz + 1)) * fx;
  return a + (b - a) * fz;
}

function smoothstepJs(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/**
 * The gust envelope at a plant root, 0 (calm spell) .. 1 (the heart of a
 * strong front): the shader's `esEnv`. Zero whenever gustiness is zero.
 */
export function windGustEnvelope(originXZ: readonly [number, number], dirXZ: readonly [number, number],
  speedMS: number, gustiness: number, t: number): number {
  const G = WIND_GUST;
  const g = Math.min(1, Math.max(0, gustiness));
  if (g <= 0) return 0;
  const u = originXZ[0] * dirXZ[0] + originXZ[1] * dirXZ[1] - t * (G.driftBase + G.driftPerMS * speedMS);
  const v = -originXZ[0] * dirXZ[1] + originXZ[1] * dirXZ[0];
  const lull = G.lullRange[0] + (G.lullRange[1] - G.lullRange[0]) * windNoise(u / G.lullCellM + 3.1, v / G.lullCellM);
  const p = Math.min(0.95, (G.occupancyBase + G.occupancyPerGust * g) * lull);
  const cv = v / G.crossCellM; const iv = Math.floor(cv); const fv = smoothstepJs(0, 1, cv - iv);
  const slot = Math.floor(u / G.slotM);
  let env = 0;
  for (let k = slot - 1; k <= slot + 1; k++) {
    const occ = windHash(k, iv) + (windHash(k, iv + 1) - windHash(k, iv)) * fv;
    const present = smoothstepJs(1 - p - 0.06, 1 - p + 0.06, occ);
    if (present <= 0) continue;
    const centre = (k + G.centreSpan[0] + (G.centreSpan[1] - G.centreSpan[0]) * windHash(k, 3.7)) * G.slotM;
    const half = G.halfLengthM[0] + (G.halfLengthM[1] - G.halfLengthM[0]) * windHash(k, 5.3);
    const s0 = windHash(k + 0.5, iv); const s1 = windHash(k + 0.5, iv + 1);
    const strength = G.strengthRange[0] + (G.strengthRange[1] - G.strengthRange[0]) * (s0 + (s1 - s0) * fv);
    const d = Math.max(0, 1 - ((u - centre) / half) ** 2);
    env = Math.max(env, present * strength * d * d);
  }
  return env;
}

/** The gust multiplier on a tree's bend (the shader's `esGust`): 0.4 in a lull, 2 in a full front. */
export function windGustAt(originXZ: readonly [number, number], dirXZ: readonly [number, number],
  speedMS: number, gustiness: number, t: number): number {
  const g = Math.min(1, Math.max(0, gustiness));
  return 1 + (0.4 + 1.6 * windGustEnvelope(originXZ, dirXZ, speedMS, gustiness, t) - 1) * g;
}

/**
 * How much high-frequency rustle a plant carries, 0..1: it rides the gust
 * envelope and the wind speed, with a floor between fronts only in strong
 * wind (never at 2 m/s).
 */
export function windRustleGate(speedMS: number, gustiness: number, envelope: number): number {
  const G = WIND_GUST;
  const g = Math.min(1, Math.max(0, gustiness));
  const speed = Math.min(1, (speedMS / G.rustleFullMS) ** 2);
  const strong = G.rustleStrongFloor * smoothstepJs(G.rustleStrongMS[0], G.rustleStrongMS[1], speedMS);
  return speed * Math.max(envelope * g, strong);
}

/**
 * The ground-cover branch of the vertex law in TypeScript: the downwind
 * lean (`along`) and the cross-wind rustle (`across`), metres, of a vertex
 * `heightM` above the ground of a plant of `plantH` (1 when untuned).
 */
export function groundCoverSway(p: {
  speedMS: number; gustiness: number; dirXZ: readonly [number, number];
  originXZ: readonly [number, number]; heightM: number; plantH?: number; t: number; leafPhase?: number;
}): { along: number; across: number; envelope: number } {
  const G = WIND_GUST;
  const plantH = p.plantH ?? 1;
  const env = windGustEnvelope(p.originXZ, p.dirXZ, p.speedMS, p.gustiness, p.t);
  const g = Math.min(1, Math.max(0, p.gustiness));
  const w = smoothstepJs(G.coverCalmMS, G.coverFullMS, p.speedMS);
  const freq = (G.coverHz[0] + (G.coverHz[1] - G.coverHz[0]) * w) * 2 * Math.PI;
  const phase = windHash(p.originXZ[0], p.originXZ[1]) * 2 * Math.PI;
  const profile = Math.min(p.heightM / plantH, 1.2) ** 2;
  const push = G.coverSteady + (1 - G.coverSteady) * env * g;
  const along = G.coverLean * plantH * w * profile * push
    * (0.75 + 0.25 * (0.3 + 0.7 * env) * Math.sin(p.t * freq + phase));
  const across = G.rustleCover * plantH * profile * windRustleGate(p.speedMS, p.gustiness, env)
    * Math.sin(p.t * G.rustleRadS + (p.leafPhase ?? 0));
  return { along, across, envelope: env };
}

/**
 * The whole vertex law in TypeScript (the node graph below runs the same
 * arithmetic; kept here so it is unit-tested without a GPU): the world-space
 * offset of a vertex at `local` (world-oriented, relative to the instance
 * pivot) of a plant rooted at `origin`, seen from `eye`. `tune` is the
 * `WIND_TUNE_ATTRIBUTE` vector (stiffness − 1, sink m, plant height m; height
 * 0 = ground cover). `windVec` = (dirX·strength, dirZ·strength, gustiness).
 */
export function windSwayOffset(args: {
  local: readonly [number, number, number];
  origin: readonly [number, number, number];
  eye: readonly [number, number, number];
  timeS: number;
  windVec: readonly [number, number, number];
  tune?: readonly [number, number, number];
  fadeM?: number;
}): [number, number, number] {
  const { local, origin, eye, timeS: t, windVec } = args;
  const tune = args.tune ?? [0, 0, 0];
  const fadeM = args.fadeM ?? WIND_FADE_M;
  const height = Math.max(0, local[1] - tune[1]);
  const strength = Math.hypot(windVec[0], windVec[1]);
  const dist = Math.hypot(eye[0] - origin[0], eye[1] - origin[1], eye[2] - origin[2]);
  const fade = 1 - smoothstepJs(fadeM * 0.6, fadeM, dist);
  if (!(strength > 0.0001 && height > 0.01 && fade > 0)) return [0, 0, 0];
  const stiffness = 1 + tune[0];
  const plantH = tune[2] > 0.05 ? tune[2] : 1;
  const dir: [number, number] = [windVec[0] / strength, windVec[1] / strength];
  const perp = [-dir[1], dir[0]];
  const phase = windHash(origin[0], origin[2]) * 2 * Math.PI;
  const speedMS = strength / WIND_METRES_PER_MS;
  const g = Math.min(1, Math.max(0, windVec[2]));
  const env = windGustEnvelope([origin[0], origin[2]], dir, speedMS, g, t);
  const gust = 1 + (0.4 + 1.6 * env - 1) * g;
  const rustle = windRustleGate(speedMS, g, env);
  const leafPhase = local[0] * 17.3 + local[1] * 11.1 + local[2] * 13.7;
  let o: [number, number, number];
  if (tune[2] <= 0.05) {
    const cover = groundCoverSway({ speedMS, gustiness: g, dirXZ: dir, originXZ: [origin[0], origin[2]],
      heightM: height, plantH, t, leafPhase });
    o = [dir[0] * cover.along + perp[0] * cover.across, 0, dir[1] * cover.along + perp[1] * cover.across];
    const l = Math.hypot(o[0], o[2]);
    o[1] -= height * (1 - Math.cos(Math.min(l / Math.max(height, 0.01), 1)));
  } else {
    const freq = Math.min(2.2, Math.max(0.3, 2.2 / Math.sqrt(plantH))) * 2 * Math.PI;
    const profile = Math.min(height / plantH, 1.3) ** 2;
    const crown = Math.min(plantH / 10, 1.6) ** 0.8 * stiffness * strength;
    const osc = Math.sin(t * freq + phase) + 0.4 * Math.sin(t * freq * 1.73 + phase * 1.3);
    const bend = crown * profile * (0.5 * gust + 0.35 * osc * (0.5 + 0.5 * gust));
    const cross = crown * profile * 0.15 * gust * Math.sin(t * freq * 0.71 + phase * 2.1);
    o = [dir[0] * bend + perp[0] * cross, 0, dir[1] * bend + perp[1] * cross];
    const l = Math.hypot(o[0], o[2]);
    o[1] -= height * (1 - Math.cos(Math.min(l / Math.max(height, 0.01), 1)));
    const radial = Math.hypot(local[0], local[2]);
    const outer = smoothstepJs(0.06 * plantH, 0.4 * plantH, radial) * Math.min(height / plantH, 1);
    if (outer > 0) {
      const limb = stiffness * strength * Math.min(plantH / 10, 1) * gust;
      const branchPhase = phase + (local[0] + local[1] * 0.6 + local[2] * 0.8) * 2 / Math.max(0.3 * plantH, 0.5);
      const b = 0.12 * limb * outer * Math.sin(t * freq * 2.1 + branchPhase);
      const near = 1 - smoothstepJs(30, 60, dist);
      const lf = 0.03 * rustle * strength * gust * outer * near * Math.sin(t * WIND_GUST.rustleRadS + leafPhase);
      o = [o[0] + 0.6 * dir[0] * b + perp[0] * lf, o[1] + b + 0.7 * lf, o[2] + 0.6 * dir[1] * b + perp[1] * lf];
    }
  }
  return [o[0] * fade, o[1] * fade, o[2] * fade];
}

const G = WIND_GUST;
const TAU = 6.2831853;

/** `windHash` as nodes. */
const hashNode = (p: TslNode): TslNode => fract(sin(dot(p, vec2(12.9898, 78.233))).mul(43758.5453));
const hash2 = (x: TslNode, z: TslNode | number): TslNode => hashNode(vec2(x, z));

/** `windNoise` as nodes: value noise, 0..1, four hashes. */
function noiseNode(p: TslNode): TslNode {
  const i = floor(p);
  const f0 = fract(p);
  const f = f0.mul(f0).mul(float(3).sub(f0.mul(2)));
  return mix(mix(hashNode(i), hashNode(i.add(vec2(1, 0))), f.x),
    mix(hashNode(i.add(vec2(0, 1))), hashNode(i.add(vec2(1, 1))), f.x), f.y);
}

/** `windGustEnvelope` as nodes (the slot loop unrolled over its three slots). */
function gustEnvelopeNode(origin: TslNode, dir: TslNode, speedMS: TslNode, gust: TslNode, t: TslNode): TslNode {
  const u = dot(origin, dir).sub(t.mul(speedMS.mul(G.driftPerMS).add(G.driftBase))).toVar();
  const v = dot(origin, vec2(dir.y.negate(), dir.x)).toVar();
  const lull = noiseNode(vec2(u.div(G.lullCellM).add(3.1), v.div(G.lullCellM)))
    .mul(G.lullRange[1] - G.lullRange[0]).add(G.lullRange[0]);
  const p = min(0.95, gust.mul(G.occupancyPerGust).add(G.occupancyBase).mul(lull)).toVar();
  const cv = v.div(G.crossCellM);
  const iv = floor(cv).toVar();
  const fv = smoothstep(0, 1, cv.sub(iv)).toVar();
  const slot = floor(u.div(G.slotM)).toVar();
  let env: TslNode = float(0);
  for (const j of [-1, 0, 1]) {
    const k = slot.add(j);
    const occ = mix(hash2(k, iv), hash2(k, iv.add(1)), fv);
    const present = smoothstep(float(1).sub(p).sub(0.06), float(1).sub(p).add(0.06), occ);
    const centre = k.add(G.centreSpan[0]).add(hash2(k, 3.7).mul(G.centreSpan[1] - G.centreSpan[0])).mul(G.slotM);
    const half = hash2(k, 5.3).mul(G.halfLengthM[1] - G.halfLengthM[0]).add(G.halfLengthM[0]);
    const strength = mix(hash2(k.add(0.5), iv), hash2(k.add(0.5), iv.add(1)), fv)
      .mul(G.strengthRange[1] - G.strengthRange[0]).add(G.strengthRange[0]);
    const dd = u.sub(centre).div(half);
    const d = max(0, float(1).sub(dd.mul(dd)));
    env = max(env, present.mul(strength).mul(d).mul(d));
  }
  return sel(gust.greaterThan(0), env, float(0));
}

/** `windRustleGate` as nodes. */
function rustleGateNode(speedMS: TslNode, gust: TslNode, env: TslNode): TslNode {
  const r = speedMS.div(G.rustleFullMS);
  const sp = min(1, r.mul(r));
  const strong = smoothstep(G.rustleStrongMS[0], G.rustleStrongMS[1], speedMS).mul(G.rustleStrongFloor);
  return sp.mul(max(env.mul(gust), strong));
}

/**
 * The node form of `windSwayOffset` for the object-space position `p` (three
 * applies the instance matrix AFTER `positionNode`, as it did after
 * `begin_vertex`). The offset is computed in WORLD space so every tree in a
 * stand bends the same way whatever its own yaw, then brought back to object
 * space: the basis is rotation × uniform scale, so its inverse is basisᵀ/s².
 * Ground cover (tune height 0) and trees take their own branch, chosen with
 * the branch-free `sel` (decision 0111 gotcha).
 */
function swayNode(material: NodeMaterial, uniforms: WindUniforms, p: TslNode): TslNode {
  const m = instanceMatrixNode();
  const c0 = matrixColumn(m, 0);
  const basis = mat3(c0, matrixColumn(m, 1), matrixColumn(m, 2));
  const origin = matrixColumn(m, 3);
  const scaleSq = max(dot(c0, c0), 1e-6);
  const tune = instanceDataNode(material, 1, WIND_TUNE_ATTRIBUTE, "vec3").toVar();
  const local = basis.mul(p).toVar();
  // Height above the GROUND LINE, not the (sunk) pivot (owner round 6).
  const height = max(float(0), local.y.sub(tune.y)).toVar();
  const windVec = uniforms.esWindVec;
  const strength = length(windVec.xy).toVar();
  const dist = length(uniforms.esWindEye.sub(origin)).toVar();
  const fadeM = uniforms.esWindFadeM;
  const fade = float(1).sub(smoothstep(fadeM.mul(0.6), fadeM, dist)).toVar();
  const stiffness = float(1).add(tune.x);
  const isCover = tune.z.lessThanEqual(0.05);
  // Unknown height (ground cover draws without the tune) reads as 1 m.
  const plantH = sel(isCover, float(1), tune.z).toVar();
  const dir = windVec.xy.div(max(strength, 0.0001)).toVar();
  const perp = vec2(dir.y.negate(), dir.x).toVar();
  const t = uniforms.esWindTime;
  const phase = hashNode(origin.xz).mul(TAU).toVar();
  const speedMS = strength.div(WIND_METRES_PER_MS).toVar();
  const g = clamp(windVec.z, 0, 1).toVar();
  const env = gustEnvelopeNode(origin.xz, dir, speedMS, g, t).toVar();
  const gust = mix(float(1), env.mul(1.6).add(0.4), g).toVar();
  const rustle = rustleGateNode(speedMS, g, env).toVar();
  const leafPhase = dot(local, vec3(17.3, 11.1, 13.7)).toVar();
  const settle = (o: TslNode): TslNode => {
    // Length-preserving correction: without it a bent plant visibly stretches.
    const lean = length(o.xz);
    return vec3(o.x, o.y.sub(height.mul(float(1).sub(cos(min(lean.div(max(height, 0.01)), 1))))), o.z);
  };

  // Ground cover (groundCoverSway): a steady lean that scales with the wind,
  // a front's push on top, a slow bend, and the rustle only as a front
  // passes or in strong wind.
  const w = smoothstep(G.coverCalmMS, G.coverFullMS, speedMS);
  const gcFreq = w.mul(G.coverHz[1] - G.coverHz[0]).add(G.coverHz[0]).mul(TAU);
  const gcP = min(height.div(plantH), 1.2);
  const gcProfile = gcP.mul(gcP);
  const push = env.mul(g).mul(1 - G.coverSteady).add(G.coverSteady);
  const gcLean = plantH.mul(G.coverLean).mul(w).mul(gcProfile).mul(push)
    .mul(env.mul(0.7).add(0.3).mul(0.25).mul(sin(t.mul(gcFreq).add(phase))).add(0.75));
  const gcRustle = plantH.mul(G.rustleCover).mul(gcProfile).mul(rustle)
    .mul(sin(t.mul(G.rustleRadS).add(leafPhase)));
  const coverOffset = settle(vec3(dir.x.mul(gcLean).add(perp.x.mul(gcRustle)), 0,
    dir.y.mul(gcLean).add(perp.y.mul(gcRustle))));

  // Trunk bend: crown amplitude keeps the calibrated pow(H/10, 0.8) law; the
  // profile up the plant is (h/H)², so trunks stay planted and crowns swing;
  // the natural frequency falls with plant size.
  const freq = clamp(inverseSqrt(plantH).mul(2.2), 0.3, 2.2).mul(TAU).toVar();
  const pr = min(height.div(plantH), 1.3);
  const profile = pr.mul(pr);
  const crown = pow(min(plantH.div(10), 1.6), 0.8).mul(stiffness).mul(strength).mul(profile).toVar();
  const osc = sin(t.mul(freq).add(phase)).add(sin(t.mul(freq).mul(1.73).add(phase.mul(1.3))).mul(0.4));
  const bend = crown.mul(gust.mul(0.5).add(osc.mul(0.35).mul(gust.mul(0.5).add(0.5))));
  const cross = crown.mul(0.15).mul(gust).mul(sin(t.mul(freq).mul(0.71).add(phase.mul(2.1))));
  const trunk = settle(vec3(dir.x.mul(bend).add(perp.x.mul(cross)), 0, dir.y.mul(bend).add(perp.y.mul(cross))));
  // Branch sway: weight by distance from the trunk axis and height.
  const outer = smoothstep(plantH.mul(0.06), plantH.mul(0.4), length(local.xz))
    .mul(min(height.div(plantH), 1)).toVar();
  const limb = stiffness.mul(strength).mul(min(plantH.div(10), 1)).mul(gust);
  const branchPhase = phase.add(dot(local, vec3(1.0, 0.6, 0.8)).mul(2).div(max(plantH.mul(0.3), 0.5)));
  const branch = vec3(dir.x.mul(0.6), 1, dir.y.mul(0.6))
    .mul(limb.mul(outer).mul(0.12).mul(sin(t.mul(freq).mul(2.1).add(branchPhase))));
  // Leaf flutter, near field only (beyond ~60 m it is sub-pixel shimmer),
  // gated like the ground-cover rustle: it shivers as a front passes and in
  // strong wind, never in a light breeze.
  const near = float(1).sub(smoothstep(30, 60, dist));
  const leaf = vec3(perp.x, 0.7, perp.y).mul(rustle.mul(strength).mul(gust).mul(outer).mul(near).mul(0.03)
    .mul(sin(t.mul(G.rustleRadS).add(leafPhase))));
  const treeOffset = trunk.add(branch).add(leaf);

  const worldOffset = sel(isCover, coverOffset, treeOffset).mul(fade);
  const offset = transpose(basis).mul(worldOffset).div(scaleSq);
  const active = strength.greaterThan(0.0001).and(height.greaterThan(0.01)).and(fade.greaterThan(0));
  return sel(active, p.add(offset), p);
}

/**
 * Patch one material to sway. Safe to call repeatedly on the same material —
 * a material shared across LOD levels must only be patched once, or the
 * plant bends double. Wraps `castShadowPositionNode` too when a feature has
 * set one, so a separate shadow position still sways.
 */
export function applyWindSway(
  material: NodeMaterial,
  uniforms: WindUniforms,
): void {
  if (!claimFeature(material, "wind")) return;
  wrapPosition(material, (p) => swayNode(material, uniforms, p));
  if (material.castShadowPositionNode) {
    wrapShadowPosition(material, (p) => swayNode(material, uniforms, p));
  }
}

/**
 * The old colour-and-depth-twin pairing: the shadow pass now reuses the
 * colour material's `positionNode`, so `depthMaterial` is ignored.
 */
export function applyWindSwayWithShadow(
  material: NodeMaterial,
  depthMaterial: THREE.Material | undefined,
  uniforms: WindUniforms,
): void {
  void depthMaterial;
  applyWindSway(material, uniforms);
}
