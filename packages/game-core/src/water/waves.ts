/**
 * The wave model — ONE parameter table generating BOTH the GLSL vertex
 * displacement and the CPU sampler used for buoyancy/swimming, so the water
 * you see is the water you float on (module 60 §38; decision 0025).
 *
 * Gerstner spectrum adapted from WaterThreeJS (MIT, © achrefelouafi —
 * https://github.com/achrefelouafi/WaterThreeJS), including the fixed-point
 * inversion of the horizontal displacement for correct height-above-(x,z)
 * queries (same approach as Crest's collision docs).
 *
 * KEEP IN LOCKSTEP: `gerstnerGlsl()` bakes the same constants this module's
 * CPU functions use — change the table, both sides follow. The per-band
 * pseudo-random angle/phase hash is ported verbatim.
 *
 * Wave energy is scaled by local **exposure** — a product of fetch (shore
 * distance) and depth, both baked channels of the compiled water rasters —
 * so open Topal Bay carries swell, lake middles carry chop, and reed-fringed
 * marsh pools sit still. Rivers get their motion from flow-advected detail
 * normals in the fragment shader, not from Gerstner displacement.
 */

export const WAVES = {
  /** Bands in the spectrum (high tier; low tier renders the first half —
   * fine visually, and the CPU always sums all bands: the tail carries
   * little amplitude, so physics/visual divergence on low tier is mm). */
  bands: 12,
  lowTierBands: 6,
  /** Longest wavelength (m) and its amplitude (m) at full exposure. */
  baseWavelength: 34.0,
  baseAmplitude: 0.17,
  /** Horizontal sharpening 0..1 (bounded per-band as in GPU Gems 1). */
  choppy: 0.62,
  /** Angular spread (radians) around the prevailing wind. */
  dirSpread: 0.9,
  freqMul: 1.31,
  ampMul: 0.76,
  /** Prevailing wind (unit): south-easterly trade off Topal Bay. */
  windDir: [0.66, -0.75] as const,
  /** Global time scale for the deep-water dispersion phase speed. */
  speed: 1.0,
  /** Exposure model: fetch saturates over this shore distance (m)… */
  fetchSaturationM: 60.0,
  /** …and waves die below this water depth (m). */
  depthSaturationM: 1.2,
} as const;

export interface WaveSample {
  /** Horizontal displacement of the surface point that renders above the
   * rest position (m). */
  dx: number;
  dz: number;
  /** Water surface height offset (m) — add to the still-water surface. */
  height: number;
  /** Unit surface normal. */
  nx: number;
  ny: number;
  nz: number;
}

/** Exposure 0..1 from shore distance, depth and turbidity — MUST match the
 * GLSL below. Turbid (marsh/blackwater) surfaces sit nearly still: reeds,
 * canopy shelter and organic load kill wind chop (owner round 2: whitecaps
 * were appearing on marsh flats far from "shore"). */
export function waveExposure(shoreDistM: number, depthM: number, turbidity = 0): number {
  const fetch = Math.min(Math.max(shoreDistM / WAVES.fetchSaturationM, 0), 1);
  const deep = Math.min(Math.max(depthM / WAVES.depthSaturationM, 0), 1);
  return fetch * deep * (1 - 0.85 * Math.min(Math.max(turbidity, 0), 1));
}

/** Shore swash: the slow lapping rhythm that runs the waterline up and down
 * the beach (research: distance-field wave bands — docs/research/
 * water-edges-and-shore-waves.md). Shared by the vertex shader, the CPU
 * query and the terrain wetness band. Returns a HEIGHT offset (m). */
export const SWASH = {
  amplitudeM: 0.09,
  bandM: 18.0, // swash influence fades out this far from shore
  omega: 0.9, // rad/s
  k: 0.5, // rad/m of shore distance (bands travel shoreward)
} as const;

export function swashAt(shoreDistM: number, exposure: number, timeS: number): number {
  const envelope = Math.max(1 - shoreDistM / SWASH.bandM, 0) * Math.min(exposure * 2.5, 1);
  if (envelope <= 0) return 0;
  return (Math.sin(SWASH.omega * timeS + SWASH.k * shoreDistM) * 0.5 + 0.2) * SWASH.amplitudeM * envelope;
}

/** Max swash lift (for the terrain wet band: recent waterline = W + this). */
export function swashMax(shoreDistM: number, exposure: number): number {
  const envelope = Math.max(1 - shoreDistM / SWASH.bandM, 0) * Math.min(exposure * 2.5, 1);
  return 0.7 * SWASH.amplitudeM * envelope;
}

/** Exact port of WaterThreeJS's GLSL hash21 (per-band angle/phase). */
function hash21(a: number, b: number): number {
  const fract = (v: number) => v - Math.floor(v);
  let px = fract(a * 123.34);
  let py = fract(b * 456.21);
  const d = px * (px + 45.32) + py * (py + 45.32);
  px += d;
  py += d;
  return fract(px * py);
}

interface Band {
  dirX: number;
  dirZ: number;
  freq: number;
  amp: number;
  phaseSpeed: number;
  q: number;
  phase0: number;
}

let bandCache: Band[] | null = null;

export function waveBands(): Band[] {
  if (bandCache) return bandCache;
  const baseAngle = Math.atan2(WAVES.windDir[1], WAVES.windDir[0]);
  const bands: Band[] = [];
  let freq = (2 * Math.PI) / WAVES.baseWavelength;
  let amp = WAVES.baseAmplitude;
  for (let i = 0; i < WAVES.bands; i++) {
    const r0 = hash21(i, 1.7);
    const r1 = hash21(i, 9.1);
    const angle = baseAngle + (r0 * 2 - 1) * WAVES.dirSpread;
    bands.push({
      dirX: Math.cos(angle),
      dirZ: Math.sin(angle),
      freq,
      amp,
      phaseSpeed: Math.sqrt(9.81 * freq) * WAVES.speed,
      q: WAVES.choppy / Math.max(freq * amp * WAVES.bands, 1e-3),
      phase0: r1 * 6.2831853,
    });
    freq *= WAVES.freqMul;
    amp *= WAVES.ampMul;
  }
  bandCache = bands;
  return bands;
}

/** Gerstner sum at a REST position (the same math the vertex shader runs). */
export function gerstnerAt(x: number, z: number, timeS: number, exposure: number, out: WaveSample): WaveSample {
  let dx = 0;
  let dz = 0;
  let h = 0;
  let nx = 0;
  let ny = 1;
  let nz = 0;
  if (exposure > 1e-4) {
    for (const b of waveBands()) {
      const a = b.amp * exposure;
      const arg = b.freq * (b.dirX * x + b.dirZ * z) + timeS * b.phaseSpeed + b.phase0;
      const s = Math.sin(arg);
      const c = Math.cos(arg);
      const wa = b.freq * a;
      dx += b.q * a * b.dirX * c;
      dz += b.q * a * b.dirZ * c;
      h += a * s;
      nx -= b.dirX * wa * c;
      nz -= b.dirZ * wa * c;
      ny -= b.q * wa * s;
    }
  }
  const inv = 1 / Math.hypot(nx, ny, nz);
  out.dx = dx;
  out.dz = dz;
  out.height = h;
  out.nx = nx * inv;
  out.ny = ny * inv;
  out.nz = nz * inv;
  return out;
}

/**
 * Height + normal of the water actually RENDERED above world (x, z):
 * Gerstner displaces vertices sideways, so invert that map with fixed-point
 * iterations before the final sample (WaterThreeJS `surfaceSample`).
 */
export function surfaceWaveAt(x: number, z: number, timeS: number, exposure: number, out: WaveSample): WaveSample {
  let rx = x;
  let rz = z;
  for (let i = 0; i < 3; i++) {
    gerstnerAt(rx, rz, timeS, exposure, out);
    rx = x - out.dx;
    rz = z - out.dz;
  }
  return gerstnerAt(rx, rz, timeS, exposure, out);
}

const f = (v: number) => {
  const s = String(v);
  return s.includes(".") || s.includes("e") ? s : `${s}.0`;
};

/**
 * The GLSL twin: declares `esWaveSample(vec2 pos, float exposure, float t)`
 * plus the shared exposure helper. Constants are baked from the SAME table
 * the CPU uses. `bandCount` lets the low tier truncate the spectrum.
 */
export function gerstnerGlsl(bandCount: number = WAVES.bands): string {
  const bands = waveBands().slice(0, bandCount);
  const rows = bands
    .map(
      (b) =>
        `w = esWaveBand(pos, exposure, t, vec2(${f(b.dirX)}, ${f(b.dirZ)}), ` +
        `${f(b.freq)}, ${f(b.amp)}, ${f(b.phaseSpeed)}, ${f(b.q)}, ${f(b.phase0)}, w);`,
    )
    .join("\n    ");
  return /* glsl */ `
  struct EsWave { vec3 disp; vec3 normal; float height; };

  float esWaveExposure(float shoreDistM, float depthM, float turbidity) {
    return clamp(shoreDistM / ${f(WAVES.fetchSaturationM)}, 0.0, 1.0)
         * clamp(depthM / ${f(WAVES.depthSaturationM)}, 0.0, 1.0)
         * (1.0 - 0.85 * clamp(turbidity, 0.0, 1.0));
  }

  // KEEP IN LOCKSTEP with swashAt() — the lapping shoreline rhythm.
  float esSwash(float shoreDistM, float exposure, float t) {
    float envelope = max(1.0 - shoreDistM / ${f(SWASH.bandM)}, 0.0) * min(exposure * 2.5, 1.0);
    if (envelope <= 0.0) return 0.0;
    return (sin(${f(SWASH.omega)} * t + ${f(SWASH.k)} * shoreDistM) * 0.5 + 0.2)
         * ${f(SWASH.amplitudeM)} * envelope;
  }

  EsWave esWaveBand(vec2 pos, float exposure, float t, vec2 d,
                    float freq, float amp, float phaseSpeed, float q, float phase0, EsWave w) {
    float a = amp * exposure;
    float arg = freq * dot(d, pos) + t * phaseSpeed + phase0;
    float s = sin(arg);
    float c = cos(arg);
    float wa = freq * a;
    w.disp += vec3(q * a * d.x * c, a * s, q * a * d.y * c);
    w.normal -= vec3(d.x * wa * c, q * wa * s, d.y * wa * c);
    return w;
  }

  EsWave esWaveSample(vec2 pos, float exposure, float t) {
    EsWave w;
    w.disp = vec3(0.0);
    w.normal = vec3(0.0, 1.0, 0.0);
    ${rows}
    w.height = w.disp.y;
    w.normal = normalize(w.normal);
    return w;
  }
  `;
}
