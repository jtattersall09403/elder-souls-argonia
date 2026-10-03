/**
 * TSL twins of the water GLSL libraries (decision 0107): the noise, the
 * shared raster samplers, the Gerstner / surf / flow-wave closed forms and
 * the class tables. Same maths and the same baked constants as the GLSL they
 * replace (waves.ts gerstnerGlsl / surfGlsl / flowWaveGlsl /
 * standingRatioGlsl, waterData.ts tideResponseGlsl, waterMaterial.ts
 * NOISE_GLSL / SAMPLER_GLSL). KEEP IN LOCKSTEP with the TS CPU twins in
 * ../waves.ts and ../waterData.ts, exactly as the GLSL was.
 *
 * Early `return 0.0` guards in the GLSL (`if (env <= 0.0) return 0.0`) are
 * dropped where the result is already multiplied by that envelope: the
 * value is identical, the branch was only a shortcut.
 *
 * Loops the GLSL ran over a compile-time table (bands, octaves) are unrolled
 * in JS while the graph is built, which is what the GLSL compiler did.
 */
import * as THREE from "three";
import type { TslNode } from "../../render/nodes/materialNodes";
import {
  ALONG_DRIFT_OMEGA, ALONG_K, ALONG_SHORE, FLOW_WAVES, GROUP_OMEGA, OMEGA_QUANTUM, SEA, SHORE_SWELL,
  STANDING_BY_CLASS, SURF_ENERGY, SWASH, SWASH_OMEGA, WAVES, crestBands, vertexBandWeight, waveBands,
} from "../waves";
import { TIDAL_CLASSES } from "../waterData";
import * as TSLNS from "three/tsl";
// TSL typings are too deep for tsc to check usefully (0107 §1): the graph is typed as TslNode.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const {
  Fn, If, clamp, cos, dot, float, floor, fract, int, ivec2, max, min, mix, normalize, pow, sin, smoothstep, sqrt, step, vec2, vec3, vec4,
} = TSLNS as any;

/* eslint-disable @typescript-eslint/no-explicit-any */
const n = (v: TslNode): any => v;

/**
 * Branch-free choice: `c ? a : b` as `mix(b, a, c ? 1 : 0)`. TSL compiles
 * `select` on non-constant operands to an if/else, and a node first built
 * inside one branch is declared there; a later use of the same node outside
 * that branch then read an unassigned variable (the vertex normal came out
 * NaN on both backends). Only constants ever sit inside the if/else here.
 * Both operands are evaluated, as the GLSL ternaries were on a GPU; every
 * operand is finite (divisions are guarded with max()).
 */
import { sel } from "../../render/nodes/materialNodes";
export { sel };

/* ------------------------------------------------------------------ *
 * Noise (adapted from WaterThreeJS, MIT) — NOISE_GLSL twin.
 * ------------------------------------------------------------------ */

export const esHash21 = Fn(([p0]: [TslNode]) => {
  const p = n(fract(n(p0).mul(vec2(123.34, 456.21)))).toVar();
  p.addAssign(dot(p, p.add(45.32)));
  return fract(p.x.mul(p.y));
}).setLayout({ name: "esHash21", type: "float", inputs: [{ name: "p", type: "vec2" }] });

/** vec3(value, d/dx, d/dy) of the quintic value noise. */
export const esNoised = Fn(([x]: [TslNode]) => {
  const p = floor(x);
  const f = n(fract(x));
  const u = f.mul(f).mul(f).mul(f.mul(f.mul(6.0).sub(15.0)).add(10.0));
  const du = float(30.0).mul(f).mul(f).mul(f.mul(f.sub(2.0)).add(1.0));
  const a = n(esHash21(p));
  const b = n(esHash21(n(p).add(vec2(1.0, 0.0))));
  const c = n(esHash21(n(p).add(vec2(0.0, 1.0))));
  const d = n(esHash21(n(p).add(vec2(1.0, 1.0))));
  const k1 = b.sub(a);
  const k2 = c.sub(a);
  const k3 = a.sub(b).sub(c).add(d);
  const nv = a.add(k1.mul(u.x)).add(k2.mul(u.y)).add(k3.mul(u.x).mul(u.y));
  const g = n(du).mul(vec2(k1.add(k3.mul(u.y)), k2.add(k3.mul(u.x))));
  return vec3(nv, g);
}).setLayout({ name: "esNoised", type: "vec3", inputs: [{ name: "x", type: "vec2" }] });

/** mat2(a, b, c, d) * p with GLSL's column-major constructor. */
function mat2Mul(a: number, b: number, c: number, d: number, p: TslNode): TslNode {
  return vec2(n(p).x.mul(a).add(n(p).y.mul(c)), n(p).x.mul(b).add(n(p).y.mul(d)));
}

function fbmInline(p0: TslNode, oct: number): TslNode {
  let p = p0;
  let amp = 0.5;
  let sum: TslNode = float(0.0);
  for (let i = 0; i < Math.min(oct, 6); i++) {
    sum = n(sum).add(n(esNoised(p)).x.mul(amp));
    p = mat2Mul(1.6, 1.2, -1.2, 1.6, p);
    amp *= 0.5;
  }
  return sum;
}

/** One shader function per octave count (the GLSL's esFbm(p, oct) was one
 * function; inlining every call made the water shader half a megabyte). */
const FBM_FNS = [1, 2, 3, 4, 5, 6].map((oct) =>
  Fn(([p]: [TslNode]) => fbmInline(p, oct))
    .setLayout({ name: `esFbm${oct}`, type: "float", inputs: [{ name: "p", type: "vec2" }] }));

/** `esFbm(p, oct)`: `oct` is a JS integer (every call site passes a literal). */
export function esFbm(p: TslNode, oct: number): TslNode {
  return FBM_FNS[Math.min(Math.max(oct, 1), 6) - 1](p);
}

function detailGradInline(p0: TslNode, flow: TslNode): TslNode {
  let g: TslNode = vec2(0.0);
  let amp = 1.0;
  let p = p0;
  let fl = n(flow);
  for (let i = 0; i < 3; i++) {
    const nn = n(esNoised(n(p).add(fl)));
    g = n(g).add(nn.yz.mul(amp));
    p = mat2Mul(1.7, 1.1, -1.1, 1.7, p);
    fl = fl.negate().mul(0.85);
    amp *= 0.55;
  }
  return g;
}
const DETAIL_GRAD_FN = Fn(([p, flow]: [TslNode, TslNode]) => detailGradInline(p, flow))
  .setLayout({ name: "esDetailGrad", type: "vec2", inputs: [{ name: "p", type: "vec2" }, { name: "flow", type: "vec2" }] });
export function esDetailGrad(p: TslNode, flow: TslNode): TslNode {
  return DETAIL_GRAD_FN(p, flow);
}

/* ------------------------------------------------------------------ *
 * Class tables — standingRatioGlsl / tideResponseGlsl twins.
 * ------------------------------------------------------------------ */

/** `esStandingRatio(classIndex, shoreDist)` baked over the class table. */
export function esStandingRatio(classes: readonly string[], classIndex: TslNode, shoreDist: TslNode): TslNode {
  const ci = n(int(n(classIndex).add(0.5)));
  let base: TslNode = float(0.0);
  classes.forEach((c, i) => {
    base = sel(ci.equal(i), float(STANDING_BY_CLASS[c] ?? 0), base);
  });
  return n(base).mul(float(1.0).sub(smoothstep(300.0, 800.0, shoreDist)));
}

/** `esTideResponse(classIndex)`: 1 on the tidal classes, else 0. */
export function esTideResponse(classes: readonly string[], classIndex: TslNode): TslNode {
  const ci = n(int(n(classIndex).add(0.5)));
  let hit: TslNode | null = null;
  classes.forEach((name, i) => {
    if (!(TIDAL_CLASSES as readonly string[]).includes(name)) return;
    const t = ci.equal(i);
    hit = hit ? n(hit).or(t) : t;
  });
  return hit ? sel(hit, float(1.0), float(0.0)) : float(0.0);
}

/* ------------------------------------------------------------------ *
 * Gerstner spectrum — gerstnerGlsl twin.
 * ------------------------------------------------------------------ */

export function esWaveExposure(shoreDistM: TslNode, depthM: TslNode, turbidity: TslNode): TslNode {
  return n(smoothstep(WAVES.handoverNearM, WAVES.handoverFarM, shoreDistM))
    .mul(clamp(n(depthM).div(WAVES.depthSaturationM), 0.0, 1.0))
    .mul(float(1.0).sub(n(clamp(turbidity, 0.0, 1.0)).mul(0.85)));
}

export function esSeaRms(windMS: TslNode, fetchM: TslNode): TslNode {
  const u = n(max(SEA.swellFloorWindMS, windMS));
  const hsFetch = u.mul(0.0016).mul(sqrt(n(max(fetchM, 0.0)).div(9.81)));
  const hsFull = u.mul(u).mul(0.21).div(9.81);
  return n(min(hsFetch, hsFull)).mul(0.25);
}

export function esSnapOmega(omega: TslNode): TslNode {
  return n(max(1.0, floor(n(omega).div(OMEGA_QUANTUM).add(0.5)))).mul(OMEGA_QUANTUM);
}

export interface EsWave { disp: TslNode; normal: TslNode; height: TslNode }

/**
 * `esWaveSampleEx(pos, exposure, fetchM, standing, t)` over the first
 * `bandCount` bands (low tier truncates). `gridCellM` (the surface grid's
 * cell; 0 keeps every band) drops the bands that grid cannot carry
 * (`vertexBandWeight`, perf-diag9 V1); `esWaveFrag` draws them per pixel.
 * Returns disp, normalised normal and height, like the GLSL struct.
 */
export function esWaveSampleEx(pos: TslNode, exposure: TslNode, fetchM: TslNode, standing0: TslNode,
  t: TslNode, bandCount: number = WAVES.bands, gridCellM = 0): EsWave {
  const bands = waveBands().slice(0, bandCount);
  const standing = n(clamp(standing0, 0.0, 1.0));
  const tr = float(1.0).sub(standing);
  let disp: TslNode = vec3(0.0);
  let normal: TslNode = vec3(0.0, 1.0, 0.0);
  for (const b of bands) {
    const w = vertexBandWeight(b.wavelengthM, gridCellM);
    if (w <= 0) continue;
    const a = n(exposure).mul(clamp(n(fetchM).div(b.fetchM), 0.0, 1.0)).mul(b.amp * w);
    const argS = n(dot(vec2(b.dirX, b.dirZ), pos)).mul(b.freq).add(b.phase0);
    const tau = n(t).mul(b.phaseSpeed);
    const sS = n(sin(argS)), cS = n(cos(argS)), sT = n(sin(tau)), cT = n(cos(tau));
    const hh = sS.mul(cT).add(tr.mul(cS).mul(sT));
    const dd = tr.mul(cS).mul(cT).sub(sS.mul(sT));
    const wa = a.mul(b.freq);
    disp = n(disp).add(vec3(a.mul(dd).mul(b.q * b.dirX), a.mul(hh), a.mul(dd).mul(b.q * b.dirZ)));
    normal = n(normal).sub(vec3(wa.mul(dd).mul(b.dirX), wa.mul(hh).mul(b.q), wa.mul(dd).mul(b.dirZ)));
  }
  return { disp, normal: normalize(normal), height: n(disp).y };
}

/**
 * Fragment twin of the bands `esWaveSampleEx` drops on a `gridCellM` grid
 * (waves.ts gerstnerFragGlsl on dev): the height gradient (dh/dx, dh/dz) of
 * those bands in xy and their height in z, per pixel. No band, zero.
 */
export function esWaveFrag(pos: TslNode, exposure: TslNode, fetchM: TslNode, standing0: TslNode,
  t: TslNode, bandCount: number, gridCellM: number): TslNode {
  const tr = float(1.0).sub(clamp(standing0, 0.0, 1.0));
  let g: TslNode = vec3(0.0);
  for (const b of waveBands().slice(0, bandCount)) {
    const w = 1 - vertexBandWeight(b.wavelengthM, gridCellM);
    if (w <= 0) continue;
    const aa = n(exposure).mul(clamp(n(fetchM).div(b.fetchM), 0.0, 1.0)).mul(b.amp * w);
    const argS = n(dot(vec2(b.dirX, b.dirZ), pos)).mul(b.freq).add(b.phase0);
    const tau = n(t).mul(b.phaseSpeed);
    const sS = n(sin(argS)), cS = n(cos(argS)), sT = n(sin(tau)), cT = n(cos(tau));
    const slope = aa.mul(b.freq).mul(n(tr).mul(cS).mul(cT).sub(sS.mul(sT)));
    g = n(g).add(vec3(slope.mul(b.dirX), slope.mul(b.dirZ), aa.mul(sS.mul(cT).add(n(tr).mul(cS).mul(sT)))));
  }
  return g;
}

/**
 * `esWaveCrestH`: the `crestBands` set's height gradient (xy, the slope term
 * of `esWaveSampleEx`'s normal) and height (z, the term it adds to the vertex
 * displacement). The vertex evaluates it at the rest xz into a varying; the
 * fragment evaluates it per pixel and swaps the interpolated height for the
 * exact one in the crest (perf-diag11 W1, diag12 Q2), so the sharpest bands
 * are per pixel while the surface stays the one vertex sum (decision 0047).
 */
export function esWaveCrestH(pos: TslNode, exposure: TslNode, fetchM: TslNode, standing0: TslNode,
  t: TslNode, bandCount: number, gridCellM: number, count: number): TslNode {
  const tr = float(1.0).sub(clamp(standing0, 0.0, 1.0));
  let g: TslNode = vec3(0.0);
  for (const b of crestBands(bandCount, gridCellM, count)) {
    const a = n(exposure).mul(clamp(n(fetchM).div(b.fetchM), 0.0, 1.0)).mul(b.amp);
    const argS = n(dot(vec2(b.dirX, b.dirZ), pos)).mul(b.freq).add(b.phase0);
    const tau = n(t).mul(b.phaseSpeed);
    const sS = n(sin(argS)), cS = n(cos(argS)), sT = n(sin(tau)), cT = n(cos(tau));
    const slope = a.mul(b.freq).mul(n(tr).mul(cS).mul(cT).sub(sS.mul(sT)));
    g = n(g).add(vec3(slope.mul(b.dirX), slope.mul(b.dirZ), a.mul(sS.mul(cT).add(n(tr).mul(cS).mul(sT)))));
  }
  return g;
}

/* ------------------------------------------------------------------ *
 * Shore surf — surfGlsl twin.
 * ------------------------------------------------------------------ */

export function esSurfGroup(d: TslNode, t: TslNode): TslNode {
  return float(0.55).add(n(sin(n(t).mul(GROUP_OMEGA).sub(n(d).mul(SWASH.groupK)))).mul(0.45));
}
export function esFetchExp(fetchM: TslNode, turb: TslNode): TslNode {
  return n(clamp(n(fetchM).div(SHORE_SWELL.fetchM), 0.0, 1.0))
    .mul(float(1.0).sub(n(clamp(turb, 0.0, 1.0)).mul(0.85)));
}
export function esSurfEnergy(windMS: TslNode, fetchM: TslNode): TslNode {
  const u = n(max(SEA.swellFloorWindMS, windMS));
  const hs = n(min(u.mul(0.0016).mul(sqrt(n(max(fetchM, 0.0)).div(9.81))), u.mul(u).mul(0.21).div(9.81)));
  return clamp(hs.mul(0.25).div(SURF_ENERGY.refRmsM), SURF_ENERGY.min, SURF_ENERGY.max);
}
export function esAlongPhase(pos: TslNode, shoreDir: TslNode, t: TslNode): TslNode {
  const sd = n(shoreDir);
  const s = n(dot(pos, vec2(sd.y.negate(), sd.x)));
  return n(sin(s.mul(ALONG_K).add(n(t).mul(ALONG_DRIFT_OMEGA)))).mul(ALONG_SHORE.amp).mul(dot(sd, sd));
}
export function esSwashSkew(energy: TslNode): TslNode {
  return clamp(n(energy).sub(1.0).mul(SWASH.skewPerEnergy).add(SWASH.skew), SWASH.skewMin, SWASH.skewMax);
}
export function esSwash(d: TslNode, fetchExp: TslNode, t: TslNode, energy: TslNode, along: TslNode): TslNode {
  const envelope = n(max(float(1.0).sub(n(d).div(SWASH.bandM)), 0.0)).mul(clamp(n(fetchExp).mul(1.6), 0.0, 1.0));
  const th = n(t).mul(SWASH_OMEGA).sub(n(d).mul(SWASH.k)).sub(SWASH.phase).add(along);
  const skewed = n(cos(th.sub(n(esSwashSkew(energy)).mul(sin(th)))));
  return skewed.mul(0.5).add(0.25).mul(SWASH.amplitudeM).mul(energy).mul(envelope).mul(esSurfGroup(d, t));
}
/** `esShoreSwell(...)` → { h, dHdd } (the GLSL's out parameter). */
export function esShoreSwell(d: TslNode, depthM: TslNode, fetchExp: TslNode, t: TslNode, energy: TslNode,
  along: TslNode): { h: TslNode; dHdd: TslNode } {
  const env = n(float(1.0).sub(smoothstep(SHORE_SWELL.buildNearM, SHORE_SWELL.buildFarM, d)))
    .mul(n(smoothstep(SHORE_SWELL.breakInnerM, SHORE_SWELL.breakOuterM, d)).mul(0.7).add(0.3))
    .mul(clamp(n(fetchExp).mul(2.0), 0.0, 1.0));
  const shoal = clamp(pow(n(max(depthM, 0.3)).div(2.0), -0.25), 1.0, 1.8);
  const th = n(d).mul(SHORE_SWELL.k).add(n(t).mul(SWASH_OMEGA)).add(along);
  const grp = esSurfGroup(d, t);
  const a = n(energy).mul(SHORE_SWELL.amplitudeM).mul(env).mul(shoal).mul(grp);
  const dHdd = a.mul(n(sin(th)).negate()
    .sub(n(sin(th.mul(2.0))).mul(2 * SHORE_SWELL.harmonic2))
    .sub(n(sin(th.mul(3.0))).mul(3 * SHORE_SWELL.harmonic3))).mul(SHORE_SWELL.k);
  const h = a.mul(n(cos(th)).add(n(cos(th.mul(2.0))).mul(SHORE_SWELL.harmonic2))
    .add(n(cos(th.mul(3.0))).mul(SHORE_SWELL.harmonic3)));
  return { h, dHdd };
}
export function esSurfFoam(d: TslNode, fetchExp: TslNode, t: TslNode, energy: TslNode, along: TslNode = float(0.0)): TslNode {
  const env = n(float(1.0).sub(smoothstep(2.0, SWASH.bandM, d))).mul(clamp(n(fetchExp).mul(1.8), 0.0, 1.0))
    .mul(clamp(sqrt(energy), 0.7, 1.9));
  const th = n(d).mul(SHORE_SWELL.k).add(n(t).mul(SWASH_OMEGA)).add(along);
  const crest = n(cos(th.sub(n(esSwashSkew(energy)).mul(sin(th)))));
  const grp = n(esSurfGroup(d, t));
  const bore = n(smoothstep(0.45, 0.92, crest)).mul(grp.mul(0.5).add(0.5));
  const back = n(smoothstep(0.2, 0.8, crest.negate())).mul(0.22).mul(grp);
  return bore.add(back).mul(env);
}

/* ------------------------------------------------------------------ *
 * Along-flow undulation — flowWaveGlsl twin → { h, normal }.
 * ------------------------------------------------------------------ */

export function esFlowWave(pos: TslNode, dir: TslNode, speed: TslNode, t: TslNode): { h: TslNode; normal: TslNode } {
  const dr = n(dir);
  const amp = n(min(speed, FLOW_WAVES.ampSpeedCapMS)).mul(FLOW_WAVES.ampPerMS).add(FLOW_WAVES.ampBase);
  const along = n(dot(pos, dr));
  const across = n(dot(pos, vec2(dr.y.negate(), dr.x)));
  const c = n(speed).add(FLOW_WAVES.phaseSpeedAddMS);
  let h: TslNode = float(0.0);
  let dhx: TslNode = float(0.0);
  let dhz: TslNode = float(0.0);
  for (const b of FLOW_WAVES.bands) {
    const k = (2 * Math.PI) / b.wavelengthM;
    const lat = n(sin(across.mul(b.lateralK).add(b.phase0))).mul(b.lateralAmp);
    const ph = along.mul(k).sub(n(esSnapOmega(c.mul(k))).mul(t)).add(lat).add(b.phase0);
    const a = amp.mul(b.weight);
    h = n(h).add(a.mul(sin(ph)));
    const dlat = n(cos(across.mul(b.lateralK).add(b.phase0))).mul(b.lateralAmp * b.lateralK);
    const cph = a.mul(cos(ph));
    dhx = n(dhx).add(cph.mul(dr.x.mul(k).add(dlat.mul(dr.y.negate()))));
    dhz = n(dhz).add(cph.mul(dr.y.mul(k).add(dlat.mul(dr.x))));
  }
  return { h, normal: normalize(vec3(n(dhx).negate(), 1.0, n(dhz).negate())) };
}

/* ------------------------------------------------------------------ *
 * Shared raster samplers — SAMPLER_GLSL twin, over injected uniform nodes.
 * ------------------------------------------------------------------ */

/** The uniform nodes the samplers read (a subset of WaterUniforms). */
export interface WaterSamplerNodes {
  uSurfTex: TslNode; uSurfMin: TslNode; uSurfSpan: TslNode; uSurfSize: TslNode; uSurfMpp: TslNode;
  uSurfShoreMax: TslNode; uSurfDepthMin: TslNode; uSurfDepthSpan: TslNode; uSurfBuried: TslNode;
  uSurfShore: TslNode; uColourOn: TslNode; uKlassTex: TslNode; uFlowExtentM: TslNode; uFetchMax: TslNode;
  uHasApron: TslNode; uApronRow0: TslNode; uApronMin: TslNode; uApronSpan: TslNode; uApronOrigin: TslNode;
  uApronMpp: TslNode; uApronSize: TslNode;
}

/** KEEP IN LOCKSTEP with waterData.decodeDepthByte(): B is SIGNED depth. */
function decodeSurf(u: WaterSamplerNodes, t: TslNode): TslNode {
  const tt = n(t);
  const w = n(u.uSurfMin).add(tt.r.mul(255.0 * 256.0).add(tt.g.mul(255.0)).div(65535.0).mul(u.uSurfSpan));
  return vec2(w, tt.b.mul(u.uSurfDepthSpan).add(u.uSurfDepthMin));
}

export function esOutside(u: WaterSamplerNodes, wpos: TslNode): TslNode {
  const extent = n(u.uSurfSize).mul(u.uSurfMpp);
  const w = n(wpos);
  return w.x.lessThan(0.0).or(w.y.lessThan(0.0)).or(w.x.greaterThanEqual(extent)).or(w.y.greaterThanEqual(extent));
}

function apronTexel(u: WaterSamplerNodes, i: TslNode): TslNode {
  const ii = n(i);
  const t = n(n(u.uSurfTex).load(ivec2(ii.x, n(int(u.uApronRow0)).add(ii.y))));
  return n(u.uApronMin).add(t.r.mul(255.0 * 256.0).add(t.g.mul(255.0)).div(65535.0).mul(u.uApronSpan));
}

/** The apron ground (m): manual bilinear over the RG16 tile. KEEP IN LOCKSTEP with WaterData.apronHeight(). */
export function esApronGround(u: WaterSamplerNodes, wpos: TslNode): TslNode {
  const f = n(clamp(n(wpos).sub(u.uApronOrigin).div(u.uApronMpp), vec2(0.0), n(u.uApronSize).sub(1.001)));
  const i0 = n(ivec2(f));
  const t = f.sub(vec2(i0));
  const i1 = n(min(i0.add(1), n(ivec2(u.uApronSize)).sub(1)));
  return mix(
    mix(apronTexel(u, i0), apronTexel(u, ivec2(i1.x, i0.y)), t.x),
    mix(apronTexel(u, ivec2(i0.x, i1.y)), apronTexel(u, i1), t.x), t.y);
}

/** `esSurfaceAt(wpos)` → vec2(height, signed depth). KEEP IN LOCKSTEP with WaterData.surfaceBase / depthProxy. */
/** Inline (no `setLayout`): three r184's GLSL builder does not declare a
 * sampler that is read only inside a layout function (the WebGL 2 backend
 * failed with "undeclared identifier"), so texture readers stay inline and
 * only the pure-maths helpers (noise, fbm, detail gradient) are functions. */
export const makeSurfaceAt = (u: WaterSamplerNodes, _name = "esSurfaceAt") => Fn(([wpos]: [TslNode]) => {
  // Real branch, as dev's early return: beyond the province the 4 apron
  // loads, inside it the 4 surface loads, never both (webgpu10 F2; the field
  // fragment calls this 5 times). Loads only, legal inside If.
  const out = vec2(0.0).toVar();
  If(n(u.uHasApron).greaterThan(0.5).and(esOutside(u, wpos)), () => {
    out.assign(vec2(0.0, n(esApronGround(u, wpos)).negate()));
  }).Else(() => {
    const f = n(clamp(n(wpos).div(u.uSurfMpp).sub(0.5), vec2(0.0), vec2(n(u.uSurfSize).sub(1.001))));
    const i0 = n(ivec2(f));
    const t = n(f.sub(vec2(i0)));
    const i1 = n(min(i0.add(1), ivec2(n(int(u.uSurfSize)).sub(1))));
    const s00 = n(decodeSurf(u, n(u.uSurfTex).load(i0)));
    const s10 = n(decodeSurf(u, n(u.uSurfTex).load(ivec2(i1.x, i0.y))));
    const s01 = n(decodeSurf(u, n(u.uSurfTex).load(ivec2(i0.x, i1.y))));
    const s11 = n(decodeSurf(u, n(u.uSurfTex).load(i1)));
    const bw = vec4(float(1.0).sub(t.x).mul(float(1.0).sub(t.y)), t.x.mul(float(1.0).sub(t.y)),
      float(1.0).sub(t.x).mul(t.y), t.x.mul(t.y));
    const wet = vec4(step(u.uSurfBuried, s00.y), step(u.uSurfBuried, s10.y),
      step(u.uSurfBuried, s01.y), step(u.uSurfBuried, s11.y));
    const ww = n(n(bw).mul(wet));
    const wsum = ww.x.add(ww.y).add(ww.z).add(ww.w);
    const plain = n(mix(mix(s00, s10, t.x), mix(s01, s11, t.x), t.y));
    const hWeighted = ww.x.mul(s00.x).add(ww.y.mul(s10.x)).add(ww.z.mul(s01.x)).add(ww.w.mul(s11.x)).div(max(wsum, 1e-30));
    out.assign(vec2(sel(wsum.greaterThan(0.0), hWeighted, plain.x), plain.y));
  });
  return out;
});

/** 16f colour constituents at wpos: x algae, y dark. */
export function esColourAt(u: WaterSamplerNodes, wpos: TslNode): TslNode {
  const extent = n(u.uSurfSize).mul(u.uSurfMpp);
  const algae = n(n(u.uSurfShore).sample(clamp(n(wpos).div(extent), vec2(0.0), vec2(1.0)))).a;
  const dark = n(n(u.uKlassTex).sample(clamp(n(wpos).div(u.uFlowExtentM), vec2(0.0), vec2(1.0)))).a;
  return sel(n(u.uColourOn).lessThan(0.5), vec2(0.0), vec2(algae, dark));
}

/** Shore raster: x shore distance (m), y season response, z tannin. */
export function esShoreAt(u: WaterSamplerNodes, wpos: TslNode): TslNode {
  const extent = n(u.uSurfSize).mul(u.uSurfMpp);
  const s = n(n(u.uSurfShore).sample(clamp(n(wpos).div(extent), vec2(0.0), vec2(1.0)))).rgb;
  return vec3(s.r.mul(u.uSurfShoreMax), s.g, s.b);
}

/** The compiled open-water fetch (m) (flow raster B, sqrt-encoded). */
export function esFetchAt(u: WaterSamplerNodes, flowTexel: TslNode): TslNode {
  return n(flowTexel).z.mul(n(flowTexel).z).mul(u.uFetchMax);
}

/** A 1×1 placeholder so a texture node always has a texture to bind. */
export function placeholderTexture(rgba: [number, number, number, number] = [0, 0, 0, 0]): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array(rgba), 1, 1, THREE.RGBAFormat);
  t.needsUpdate = true;
  return t;
}

