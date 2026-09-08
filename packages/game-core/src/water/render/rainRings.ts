import { hash21 } from "../waves";

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

export const RAIN_RINGS_GLSL = /* glsl */ `
// KEEP IN LOCKSTEP with rainRingGradient(). Needs esHash21.
vec2 esRainRings(vec2 wp, float t, float intensity, float dist){
  float fade = (1.0 - smoothstep(${RAIN_RINGS.fadeStartM.toFixed(1)}, ${RAIN_RINGS.fadeEndM.toFixed(1)}, dist))
             * clamp(intensity, 0.0, 1.0);
  if (fade <= 0.0) return vec2(0.0);
  float cell = ${RAIN_RINGS.cellM.toFixed(2)};
  float w = ${RAIN_RINGS.widthM.toFixed(3)} * (1.0 + dist * ${RAIN_RINGS.widthPerM.toFixed(3)});
  vec2 c0 = floor(wp / cell);
  vec2 g = vec2(0.0);
  for (int dz = -1; dz <= 1; dz++) {
    for (int dx = -1; dx <= 1; dx++) {
      vec2 c = c0 + vec2(float(dx), float(dz));
      float phase = esHash21(vec2(c.x * 0.731 + 0.17, c.y * 0.529 + 0.43));
      float cyc = floor(t / ${RAIN_RINGS.periodS.toFixed(2)} + phase);
      float age = t / ${RAIN_RINGS.periodS.toFixed(2)} + phase - cyc;
      float hA = esHash21(c + cyc * vec2(0.618, 0.414));
      if (hA >= intensity) continue;
      float jx = esHash21(vec2(c.x + cyc * 0.271 + 3.1, c.y - cyc * 0.133 + 7.7));
      float jz = esHash21(vec2(c.x - cyc * 0.377 + 5.3, c.y + cyc * 0.219 + 1.9));
      vec2 o = (c + 0.5) * cell + (vec2(jx, jz) * 2.0 - 1.0) * ${RAIN_RINGS.jitterM.toFixed(2)};
      vec2 p = wp - o;
      float d = length(p);
      if (d < 1e-5) continue;
      float s = d - age * ${RAIN_RINGS.maxRadiusM.toFixed(2)};
      float A = ${RAIN_RINGS.amplitudeM.toFixed(3)} * (1.0 - age) * (1.0 - age) * fade;
      float gs = -2.0 * s * A * exp(-(s * s) / (w * w)) / (w * w);
      g += gs * p / d;
    }
  }
  return g;
}
`;
