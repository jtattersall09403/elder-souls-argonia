/**
 * The fire's shared TSL maths (decision 0109; docs/standards/tsl-shaders.md):
 * hash, value noise, fbm, the teardrop mask, the 3-band ramp, the per-card
 * wobble, the flicker, and the display-to-scene encode both fire renderers
 * (cards, flameMaterial.ts; volumes, volumeFire.ts) end with.
 *
 * Each helper is a plain JS function that returns a node expression (inlined
 * where it is called), so none carries a `setLayout` (no texture sampling in
 * a laid-out function, the WebGL 2 gotcha) and every graph stays branch-free.
 * `fireFlicker` in fireTypes.ts and `displayToSceneScale` below are the TS
 * twins the tests check.
 */
import * as THREE from "three";
import * as tsl from "three/tsl";
import type { TslNode } from "../../render/nodes/materialNodes";

// TSL chains are typed loosely on purpose (tsl-shaders.md §1).
const {
  abs, clamp, dot, float, floor, fract, max, min, mix, mat3, pow, sin, smoothstep, sqrt, vec2, vec3,
} = tsl as unknown as Record<string, (...a: TslNode[]) => TslNode>;

export function fireHash(p: TslNode): TslNode {
  // pure expression (no toVar/addAssign): these helpers are inlined outside any Fn(), where TSL has no stack to assign on
  const q0 = fract(p.mul(vec2(123.34, 456.21)));
  const q = q0.add(dot(q0, q0.add(45.32)));
  return fract(q.x.mul(q.y));
}

export function fireNoise(p: TslNode): TslNode {
  const i = floor(p);
  const f = fract(p);
  const u = f.mul(f).mul(float(3).sub(f.mul(2)));
  const a = fireHash(i);
  const b = fireHash(i.add(vec2(1, 0)));
  const c = fireHash(i.add(vec2(0, 1)));
  const d = fireHash(i.add(vec2(1, 1)));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

/** 1-3 octaves (`octaves` a float node 1..3), branch-free: the unused octaves weigh 0. */
export function fireFbm(p: TslNode, octaves: TslNode): TslNode {
  const s2 = smoothstep(1.4, 1.6, octaves);
  const s3 = smoothstep(2.4, 2.6, octaves);
  const v = fireNoise(p).mul(0.5)
    .add(fireNoise(p.mul(2.03).add(17.1)).mul(0.25).mul(s2))
    .add(fireNoise(p.mul(4.01).add(31.7)).mul(0.125).mul(s3));
  return v.div(float(0.5).add(s2.mul(0.25)).add(s3.mul(0.125)));
}

/** Teardrop: widest a third of the way up, rounded root, tip narrowed by taper. */
export function fireMask(p: TslNode, taper: TslNode): TslNode {
  const y = clamp(p.y, 0, 1);
  const width = sqrt(clamp(y.mul(3), 0, 1)).mul(0.5).mul(pow(float(1).sub(y), mix(0.6, 1.6, taper)));
  const d = abs(p.x).div(max(width, 1e-3));
  return float(1).sub(smoothstep(0.55, 1.0, d))
    .mul(smoothstep(-0.04, 0.22, p.y))
    .mul(float(1).sub(smoothstep(0.85, 1.0, p.y)));
}

/** The 3-band temperature ramp up the flame (t 0 root .. 1 top; `at` = the preset's bands). */
export function fireRamp(t: TslNode, base: TslNode, midC: TslNode, tip: TslNode, at: TslNode): TslNode {
  const low = mix(base, midC, smoothstep(at.x, at.x.add(0.12), t));
  return mix(low, tip, smoothstep(at.y, at.y.add(0.14), t));
}

/** Smooth 1-D noise in -1..1 (the per-card sway and pulse). */
export function fireWobble(t: TslNode, seed: TslNode): TslNode {
  return fireNoise(vec2(t, seed.mul(57))).mul(2).sub(1);
}

/** The shader twin of fireTypes.ts `fireFlicker`. */
export function fireFlickerNode(t: TslNode, seed: TslNode, rateHz: TslNode, amount: TslNode): TslNode {
  const phase = seed.mul(6.2831853);
  const w = rateHz.mul(6.2831853);
  return float(1).add(amount.mul(
    sin(t.mul(w).add(phase)).mul(0.6).add(sin(t.mul(w).mul(1.73).add(phase.mul(2.3))).mul(0.4)),
  ));
}

// ---------------------------------------------------------------------------
// Display-referred colour through a tone-mapped frame.
//
// The fire is authored display-referred (the walk-4 fix: a flame drawn as
// scene radiance is crushed black at the noon exposure 3.9e-5 and clips white
// at the night exposure 22). The WebGL renderer honoured `toneMapped: false`;
// the node renderer tone-maps the WHOLE frame in its output pass (Renderer
// `_renderOutput`; `toneMapped` is read nowhere in three 0.184's node path).
// So the fire writes the scene value that the output pass's ACES filmic
// curve at the current exposure maps back to the colour it wants: the exact
// inverse of three's `acesFilmicToneMapping` (output matrix, RRT+ODT fit per
// channel, input matrix, /exposure·0.6). Premultiplied blending then happens
// in scene space, which is exact for the covering core (alpha 1) and a close
// approximation for the glow fringe.
// ---------------------------------------------------------------------------

/** Display values at or above this are held here (ACES's asymptote is ~1.0; half-float frames overflow near it). */
export const FIRE_DISPLAY_MAX = 0.94;
/** Scene values are clamped under half-float's 65504. */
export const FIRE_SCENE_MAX = 60000;

const ACES_IN = [0.59719, 0.35458, 0.04823, 0.076, 0.90834, 0.01566, 0.0284, 0.13383, 0.83777];
const ACES_OUT = [1.60475, -0.53108, -0.07367, -0.10208, 1.10813, -0.00605, -0.00327, -0.07276, 1.07602];

/** Column-major elements of the inverse of a TSL `mat3(...)` given in its constructor order. */
function inverseMat3Args(args: number[]): number[] {
  // TSL mat3(a..i) fills columns (JoinNode emits the scalars in order), as
  // Matrix3.fromArray reads them; inversion commutes with transposition, so
  // the inverse's scalars are right under either reading
  return new THREE.Matrix3().fromArray(args).invert().toArray();
}
const ACES_IN_INV = inverseMat3Args(ACES_IN);
const ACES_OUT_INV = inverseMat3Args(ACES_OUT);

/** Inverse of the RRT+ODT fit y = (x(x+a)-b)/(x(cx+d)+e), per channel, as the positive root. */
function inverseRrtOdt(y: TslNode): TslNode {
  const A = float(1).sub(y.mul(0.983729));
  const B = float(0.0245786).sub(y.mul(0.432951));
  const C = y.mul(0.238081).add(0.000090537).negate();
  return B.negate().add(sqrt(max(B.mul(B).sub(A.mul(C).mul(4)), 0))).div(A.mul(2));
}

/**
 * The scene-linear value that the output pass maps to display-linear
 * `display` (vec3, 0..1). `toneMapped` is a float node: 1 when the frame is
 * ACES tone mapped at `exposure`, 0 when it is not (then the value passes
 * through unchanged).
 */
export function displayToScene(display: TslNode, exposure: TslNode, toneMapped: TslNode): TslNode {
  const d = clamp(display, 0, FIRE_DISPLAY_MAX);
  // the RRT+ODT fit tends to 1.0165: a channel the output matrix pushes past
  // it has no preimage, so it is held just under
  const odt = clamp((mat3 as (...a: number[]) => TslNode)(...ACES_OUT_INV).mul(d), vec3(0), vec3(1.0));
  const rrt = vec3(inverseRrtOdt(odt.x), inverseRrtOdt(odt.y), inverseRrtOdt(odt.z));
  const lin = max((mat3 as (...a: number[]) => TslNode)(...ACES_IN_INV).mul(rrt), vec3(0))
    .mul(0.6).div(max(exposure, 1e-9));
  return min(mix(d, lin, toneMapped), vec3(FIRE_SCENE_MAX));
}

/** The TS twin of the per-channel ACES round trip, for tests: display -> scene -> display (grey). */
export function acesRoundTripGrey(display: number, exposure: number): number {
  const fit = (x: number) => (x * (x + 0.0245786) - 0.000090537) / (x * (0.983729 * x + 0.432951) + 0.238081);
  const invFit = (y: number) => {
    const A = 1 - 0.983729 * y, B = 0.0245786 - 0.432951 * y, C = -(0.000090537 + 0.238081 * y);
    return (-B + Math.sqrt(Math.max(B * B - 4 * A * C, 0))) / (2 * A);
  };
  const mul = (m: number[], v: number[]) => [0, 1, 2].map((r) => m[r] * v[0] + m[3 + r] * v[1] + m[6 + r] * v[2]);
  const d = Math.min(display, FIRE_DISPLAY_MAX);
  const odt = mul(ACES_OUT_INV, [d, d, d]).map((x) => Math.min(1, Math.max(x, 0)));
  const scene = mul(ACES_IN_INV, odt.map(invFit)).map((x) => (Math.max(x, 0) * 0.6) / exposure);
  // forward, as three's acesFilmicToneMapping
  const c = mul(ACES_IN, scene.map((x) => (x * exposure) / 0.6)).map(fit);
  return Math.min(1, Math.max(0, mul(ACES_OUT, c)[1]));
}
