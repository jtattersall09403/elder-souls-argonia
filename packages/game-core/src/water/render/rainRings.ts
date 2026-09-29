import { esHash21, sel } from "./waterNodes";
import type { TslNode } from "../../render/nodes/materialNodes";
import { hash21 } from "../waves";
import * as TSLNS from "three/tsl";
// TSL typings are too deep for tsc to check usefully (0107 §1): the graph is typed as TslNode.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const {
  clamp, exp, float, floor, length, max, select, smoothstep, vec2,
} = TSLNS as any;

/**
 * Analytic rain drop rings (Greenheck study §1.6, §3.1 (6)): world space is
 * tiled into ~0.5 m cells; each cell spawns a drop on its own time cycle,
 * whose ring radius grows with age while its height decays. The ring's
 * radial gradient goes into the surface normal — discrete expanding rings on
 * ALL visible water, no buffers, replacing the two-phase noise shimmer. The
 * 64 m ripple-sim rain stamps stay (they interact with contacts and banks).
 * Faded by ~100 m and by `uRainRipple`; the ring widens with distance so it
 * never aliases into fizz. Deterministic (cell hashes, no RNG).
 *
 * TS twin ↔ `RAIN_RINGS_GLSL` (which needs `esHash21` from the material's
 * noise block declared first). Edit both or neither.
 */
export const RAIN_RINGS = {
  cellM: 0.5,
  periodS: 1.4,
  maxRadiusM: 0.42,
  jitterM: 0.16,
  /** Gaussian ring half-width (m) at the camera; grows `widthPerM` per metre. */
  widthM: 0.045,
  widthPerM: 0.04,
  /** Ring height (m) at birth — a real raindrop ring is about a centimetre. */
  amplitudeM: 0.012,
  fadeStartM: 40,
  fadeEndM: 100,
} as const;

const sstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
};

/** Radial slope dh/ds of one ring at signed distance `sM` from its radius:
 * h = A·exp(−(s/w)²), A = amplitude·(1−age)²·fade, w widening with distance. */
export function rainRingSlope(sM: number, age: number, distM: number, fade: number): number {
  const w = RAIN_RINGS.widthM * (1 + distM * RAIN_RINGS.widthPerM);
  const A = RAIN_RINGS.amplitudeM * (1 - age) * (1 - age) * fade;
  return (-2 * sM * A * Math.exp(-(sM * sM) / (w * w))) / (w * w);
}

/** Slope (dh/dx, dh/dz) the rings add to the surface at world (x, z). */
export function rainRingGradient(x: number, z: number, timeS: number, intensity: number, distM: number,
  out: [number, number] = [0, 0]): [number, number] {
  out[0] = 0; out[1] = 0;
  const fade = (1 - sstep(RAIN_RINGS.fadeStartM, RAIN_RINGS.fadeEndM, distM)) * Math.min(Math.max(intensity, 0), 1);
  if (fade <= 0) return out;
  const cell = RAIN_RINGS.cellM;
  const cx0 = Math.floor(x / cell);
  const cz0 = Math.floor(z / cell);
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = cx0 + dx;
      const cz = cz0 + dz;
      const phase = hash21(cx * 0.731 + 0.17, cz * 0.529 + 0.43);
      const cycle = Math.floor(timeS / RAIN_RINGS.periodS + phase);
      const age = timeS / RAIN_RINGS.periodS + phase - cycle;
      // per-cycle activity and jitter, so the drop pattern never repeats
      const hA = hash21(cx + cycle * 0.618, cz + cycle * 0.414);
      if (hA >= intensity) continue;
      const jx = hash21(cx + cycle * 0.271 + 3.1, cz - cycle * 0.133 + 7.7);
      const jz = hash21(cx - cycle * 0.377 + 5.3, cz + cycle * 0.219 + 1.9);
      const ox = (cx + 0.5) * cell + (jx * 2 - 1) * RAIN_RINGS.jitterM;
      const oz = (cz + 0.5) * cell + (jz * 2 - 1) * RAIN_RINGS.jitterM;
      const px = x - ox;
      const pz = z - oz;
      const d = Math.hypot(px, pz);
      if (d < 1e-5) continue;
      const g = rainRingSlope(d - age * RAIN_RINGS.maxRadiusM, age, distM, fade);
      out[0] += (g * px) / d;
      out[1] += (g * pz) / d;
    }
  }
  return out;
}

/** TSL twin of rainRingGradient(): analytic cell-hashed drop rings over a 3x3 cell block. */
export function esRainRings(wp: TslNode, t: TslNode, intensity: TslNode, dist: TslNode): TslNode {
  const R = (v: number, d: number) => Number(v.toFixed(d));
  const fade = (float(1.0).sub(smoothstep(R(RAIN_RINGS.fadeStartM, 1), R(RAIN_RINGS.fadeEndM, 1), dist)) as TslNode)
    .mul(clamp(intensity, 0.0, 1.0));
  const cell = R(RAIN_RINGS.cellM, 2);
  const period = R(RAIN_RINGS.periodS, 2);
  const w = (dist as TslNode).mul(R(RAIN_RINGS.widthPerM, 3)).add(1.0).mul(R(RAIN_RINGS.widthM, 3));
  const c0 = floor((wp as TslNode).div(cell));
  let g: TslNode = vec2(0.0);
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const c = (c0 as TslNode).add(vec2(dx, dz));
      const phase = esHash21(vec2(c.x.mul(0.731).add(0.17), c.y.mul(0.529).add(0.43)));
      const cyc = floor((t as TslNode).div(period).add(phase)) as TslNode;
      const age = (t as TslNode).div(period).add(phase).sub(cyc);
      const hA = esHash21(c.add(cyc.mul(vec2(0.618, 0.414)))) as TslNode;
      const jx = esHash21(vec2(c.x.add(cyc.mul(0.271)).add(3.1), c.y.sub(cyc.mul(0.133)).add(7.7))) as TslNode;
      const jz = esHash21(vec2(c.x.sub(cyc.mul(0.377)).add(5.3), c.y.add(cyc.mul(0.219)).add(1.9))) as TslNode;
      const o = c.add(0.5).mul(cell).add(vec2(jx, jz).mul(2.0).sub(1.0).mul(R(RAIN_RINGS.jitterM, 2)));
      const p = (wp as TslNode).sub(o);
      const d = length(p) as TslNode;
      const s = d.sub(age.mul(R(RAIN_RINGS.maxRadiusM, 2)));
      const oneMinusAge = float(1.0).sub(age);
      const A = oneMinusAge.mul(oneMinusAge).mul(fade).mul(R(RAIN_RINGS.amplitudeM, 3));
      const gs = s.mul(-2.0).mul(A).mul(exp(s.mul(s).negate().div(w.mul(w)))).div(w.mul(w));
      // `continue` in the GLSL: a cell whose hash exceeds the intensity, or a zero-length offset, adds nothing
      const live = hA.lessThan(intensity).and(d.greaterThanEqual(1e-5));
      g = (g as TslNode).add(sel(live, p.mul(gs).div(max(d, 1e-5)), vec2(0.0)));
    }
  }
  // fade <= 0 returned zero in the GLSL; every term above carries fade
  return g;
}
