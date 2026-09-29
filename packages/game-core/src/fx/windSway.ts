/**
 * Wind sway for instanced vegetation — a `positionNode` feature shared by
 * every plant material in the world (decision 0109).
 *
 * The recipe is the standard one (research/rendering/vegetation-scatter-instancing-threejs.md
 * §4, after GPU Gems 3 ch. 16): displace along the wind direction, weighted by
 * height above the instance's own base so trunks stay planted while crowns
 * move; two sines plus a scrolled noise term for gusts; a per-instance phase
 * so a forest never sways in unison; and a distance fade because nobody can
 * see a leaf move at 600 m.
 *
 * **The one thing that must not be got wrong**: the shadow must sway with the
 * tree. In node materials the shadow pass reuses `positionNode` (and
 * `castShadowPositionNode`, which this also wraps when a feature set one), so
 * there is no depth twin to forget. Detail (per-leaf) bending is
 * deliberately not implemented: our sourced meshes carry no authored vertex
 * colours to drive it, and main bending alone is the documented fallback.
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
  claimFeature, wrapPosition, wrapShadowPosition, type TslNode,
} from "../render/nodes/materialNodes";

// TSL chains are typed loosely on purpose (tsl-shaders.md §1).
const {
  cameraPosition, cos, dot, float, fract, length, mat3, max, min, pow, select, sin,
  smoothstep, transpose, uniform, vec2, vec3,
} = tsl as unknown as Record<string, TslNode>;

/** The uniform block a group of vegetation materials shares (`uniform()` nodes; write `.value`). */
export interface WindUniforms {
  /** Seconds, monotonic — the caller's elapsed clock, set by `updateWindSway`. */
  esWindTime: { value: number } & TslNode;
  /** Travel direction (XZ unit) × strength, plus gustiness in `z`. */
  esWindVec: { value: THREE.Vector3 } & TslNode;
  /** Beyond this distance from the camera, sway fades to nothing. */
  esWindFadeM: { value: number } & TslNode;
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
 * Per-instance wind tuning, as a `vec2` instanced attribute (or texel 1 of a
 * batch's data texture, `batchData.ts`):
 *
 *   `.x` = stiffness − 1   `.y` = sink metres
 *
 * Both are offsets from the neutral value ON PURPOSE. An instanced draw whose
 * geometry lacks the attribute reads WebGL's generic default of `(0, 0)`,
 * (what `optionalAttribute` reads for a missing one), which decodes to stiffness 1 and sink 0 — exactly the behaviour before this
 * existed. A missing attribute therefore degrades to the old look rather than
 * silently switching wind off altogether.
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
    esWindTime: uniform(0) as WindUniforms["esWindTime"],
    esWindVec: uniform(new THREE.Vector3(1, 0, 0)) as WindUniforms["esWindVec"],
    esWindFadeM: uniform(WIND_FADE_M) as WindUniforms["esWindFadeM"],
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
): void {
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
 * The per-instance phase hash (`esWindPhase`): `fract(sin(dot(p, (12.9898,
 * 78.233))) · 43758.5453)`, 0..1. The node graph computes the same.
 */
export function windPhase(x: number, z: number): number {
  const v = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * The world-space sway offset of one vertex, the arithmetic the node graph
 * runs (kept in TS so it is unit-tested without a GPU). `heightM` is the
 * vertex height above the instance pivot, `origin` the instance pivot,
 * `camera` the camera position, `windVec` = (dirX·strength, dirZ·strength,
 * gustiness).
 */
export function windOffset(args: {
  heightM: number;
  origin: readonly [number, number, number];
  camera: readonly [number, number, number];
  timeS: number;
  windVec: readonly [number, number, number];
  fadeM?: number;
  stiffness?: number;
  sinkM?: number;
}): [number, number, number] {
  const { origin, camera, timeS: t, windVec } = args;
  const fadeM = args.fadeM ?? WIND_FADE_M;
  const height = Math.max(0, args.heightM - (args.sinkM ?? 0));
  const strength = Math.hypot(windVec[0], windVec[1]);
  if (!(strength > 0.0001 && height > 0.01)) return [0, 0, 0];
  const phase = windPhase(origin[0], origin[2]) * 6.2831853;
  const gust = Math.sin(t * 1.7 + phase) + 0.5 * Math.sin(t * 2.9 + phase * 1.7)
    + windVec[2] * Math.sin(t * 0.31 + phase * 0.5);
  const weight = Math.pow(Math.min(height / 10, 1.6), 0.8) * (args.stiffness ?? 1);
  const dist = Math.hypot(camera[0] - origin[0], camera[1] - origin[1], camera[2] - origin[2]);
  const e0 = fadeM * 0.6;
  const u = Math.min(1, Math.max(0, (dist - e0) / (fadeM - e0)));
  const fade = 1 - u * u * (3 - 2 * u);
  const amount = weight * fade * (0.5 + 0.5 * gust);
  const ox = windVec[0] * amount;
  const oz = windVec[1] * amount;
  const lean = Math.hypot(ox, oz);
  const oy = -height * (1 - Math.cos(Math.min(lean / Math.max(height, 0.01), 1)));
  return [ox, oy, oz];
}

/**
 * The node form of `windOffset` for the object-space position `p` (three
 * applies the instance matrix AFTER `positionNode`, as it did after
 * `begin_vertex`). The offset is computed in WORLD space so every tree in a
 * stand bends the same way whatever its own yaw, then brought back to object
 * space: the basis is rotation × uniform scale, so its inverse is basisᵀ/s².
 */
function swayNode(material: NodeMaterial, uniforms: WindUniforms, p: TslNode): TslNode {
  const m = instanceMatrixNode();
  const c0 = matrixColumn(m, 0);
  const basis = mat3(c0, matrixColumn(m, 1), matrixColumn(m, 2));
  const origin = matrixColumn(m, 3);
  const scaleSq = max(dot(c0, c0), 1e-6);
  const tune = instanceDataNode(material, 1, WIND_TUNE_ATTRIBUTE, "vec2");
  const stiffness = float(1).add(tune.x);
  const sink = tune.y;
  // Height above the GROUND LINE, not above the (sunk) pivot: see windOffset.
  const height = max(float(0), basis.mul(p).y.sub(sink));
  const windVec = uniforms.esWindVec;
  const strength = length(windVec.xy);
  const phase = fract(sin(dot(origin.xz, vec2(12.9898, 78.233))).mul(43758.5453)).mul(6.2831853);
  const t = uniforms.esWindTime;
  const gust = sin(t.mul(1.7).add(phase))
    .add(sin(t.mul(2.9).add(phase.mul(1.7))).mul(0.5))
    .add(windVec.z.mul(sin(t.mul(0.31).add(phase.mul(0.5)))));
  const weight = pow(min(height.div(10), 1.6), 0.8).mul(stiffness);
  const fadeM = uniforms.esWindFadeM;
  const fade = float(1).sub(smoothstep(fadeM.mul(0.6), fadeM, length(cameraPosition.sub(origin))));
  const amount = weight.mul(fade).mul(gust.mul(0.5).add(0.5));
  const flat = vec3(windVec.x, 0, windVec.y).mul(amount);
  const lean = length(flat);
  const drop = height.mul(float(1).sub(cos(min(lean.div(max(height, 0.01)), 1))));
  const worldOffset = vec3(flat.x, flat.y.sub(drop), flat.z);
  const offset = transpose(basis).mul(worldOffset).div(scaleSq);
  const active = strength.greaterThan(0.0001).and(height.greaterThan(0.01));
  return select(active, p.add(offset), p);
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
