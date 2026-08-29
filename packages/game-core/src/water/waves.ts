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
  bands: 10,
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

/**
 * Weather wind → wave-energy scale (Phase 8c, decision 0032): ONE shared
 * value multiplying wave exposure on BOTH the CPU query and the GPU vertex
 * stage (the renderer reads it into a uniform every frame), so storm chop is
 * the chop you float on. 1 = the owner-calibrated 8b default; the weather
 * machine maps wind speed onto ~0.8 (dead calm) … 1.5 (squall).
 */
let windWaveScale = 1;
export function setWindWaveScale(v: number): void {
  windWaveScale = Math.min(1.6, Math.max(0.7, Number.isFinite(v) ? v : 1));
}
export function getWindWaveScale(): number {
  return windWaveScale;
}

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

/** Shore surf system (round 7; research doc §5): the waterline must visibly
 * TRAVEL up and down the beach, fed by arriving, shoaling swell. Three shared
 * closed forms — surf group envelope, asymmetric swash, shore swell — used
 * identically by the vertex shader, the CPU query, the foam system and the
 * terrain wetness band.
 *
 * CRITICAL GATING LESSON: never gate shore effects by `waveExposure` — its
 * depth term goes to ZERO exactly at the waterline, which silently muted all
 * lapping in rounds 2–6. Shore effects gate on FETCH exposure instead,
 * sampled a little seaward so the beach edge of a big bay keeps the bay's
 * energy. */
export const SWASH = {
  amplitudeM: 0.22, // vertical; ~5–8 m horizontal runup on a beach apron
  bandM: 26.0, // swash influence fades out this far from shore
  omega: 0.9, // rad/s (shared with the swell so one wave feeds one uprush)
  k: 0.35, // rad/m of shore distance (bands travel shoreward)
  skew: 0.6, // asymmetric oscillator: fast uprush, slow gravity backwash
  phase: 0.8, // uprush peaks just after the swell crest arrives at d=0
  groupOmega: 0.15, // surf-beat: wave sets, one wave runs visibly farther
  groupK: 0.06,
} as const;

export const SHORE_SWELL = {
  amplitudeM: 0.17,
  k: 0.45, // rad/m — ~14 m wavelength near shore
  buildNearM: 30.0, // envelope builds approaching the shore…
  buildFarM: 70.0,
  breakInnerM: 3.0, // …and collapses (−70 %) inside the break zone
  breakOuterM: 9.0,
  fetchM: 60.0,
} as const;

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);
const sstep = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/** Surf-beat group envelope 0.1..1 — modulates swell, swash and shore foam
 * together so successive waves differ (the anti-"barcode" ingredient). */
export function surfGroup(shoreDistM: number, timeS: number): number {
  return 0.55 + 0.45 * Math.sin(SWASH.groupOmega * timeS - SWASH.groupK * shoreDistM);
}

/** Fetch-only exposure for shore effects — pass the shore distance sampled
 * ~30 m SEAWARD of the point (see gating lesson above). */
export function fetchExposure(seawardShoreDistM: number, turbidity = 0): number {
  return clamp01(seawardShoreDistM / SHORE_SWELL.fetchM) * (1 - 0.85 * clamp01(turbidity));
}

/** Asymmetric swash height offset (m) — the moving waterline itself. */
export function swashAt(shoreDistM: number, fetchExp: number, timeS: number): number {
  const envelope = Math.max(1 - shoreDistM / SWASH.bandM, 0) * clamp01(fetchExp * 1.6);
  if (envelope <= 0) return 0;
  const th = SWASH.omega * timeS - SWASH.k * shoreDistM - SWASH.phase;
  const skewed = Math.cos(th - SWASH.skew * Math.sin(th));
  return (skewed * 0.5 + 0.25) * SWASH.amplitudeM * envelope * surfGroup(shoreDistM, timeS);
}

/** Max swash lift (for the terrain wet band: recent waterline = W + this). */
export function swashMax(shoreDistM: number, fetchExp: number): number {
  const envelope = Math.max(1 - shoreDistM / SWASH.bandM, 0) * clamp01(fetchExp * 1.6);
  return 0.75 * SWASH.amplitudeM * envelope;
}

/** Shoaling shore swell height (m): fronts parallel to the waterline,
 * amplitude grows as depth shrinks (Green's law, capped), collapses in the
 * break zone where its energy becomes foam + swash. */
export function shoreSwellAt(shoreDistM: number, depthM: number, fetchExp: number, timeS: number): number {
  const env = (1 - sstep(SHORE_SWELL.buildNearM, SHORE_SWELL.buildFarM, shoreDistM))
    * (0.3 + 0.7 * sstep(SHORE_SWELL.breakInnerM, SHORE_SWELL.breakOuterM, shoreDistM))
    * clamp01(fetchExp * 2.0);
  if (env <= 0) return 0;
  const shoal = Math.min(Math.max(Math.pow(Math.max(depthM, 0.3) / 2.0, -0.25), 1.0), 1.8);
  const th = SHORE_SWELL.k * shoreDistM + SWASH.omega * timeS;
  return SHORE_SWELL.amplitudeM * env * shoal
    * (Math.cos(th) + 0.3 * Math.cos(2.0 * th + 0.5)) * surfGroup(shoreDistM, timeS);
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
 * GLSL twin of the shore-surf closed forms (surfGroup / fetchExposure /
 * swashAt / shoreSwellAt). Included by BOTH the water vertex stage (geometry)
 * and the fragment stage (surf foam) — constants baked from the same tables.
 * `esShoreSwell` also returns dH/d(shoreDist) for the vertex normal tilt.
 */
export function surfGlsl(): string {
  return /* glsl */ `
  float esSurfGroup(float d, float t) {
    return 0.55 + 0.45 * sin(${f(SWASH.groupOmega)} * t - ${f(SWASH.groupK)} * d);
  }
  float esFetchExp(float seawardD, float turb) {
    return clamp(seawardD / ${f(SHORE_SWELL.fetchM)}, 0.0, 1.0)
         * (1.0 - 0.85 * clamp(turb, 0.0, 1.0));
  }
  // KEEP IN LOCKSTEP with swashAt() — the moving waterline itself.
  float esSwash(float d, float fetchExp, float t) {
    float envelope = max(1.0 - d / ${f(SWASH.bandM)}, 0.0) * clamp(fetchExp * 1.6, 0.0, 1.0);
    if (envelope <= 0.0) return 0.0;
    float th = ${f(SWASH.omega)} * t - ${f(SWASH.k)} * d - ${f(SWASH.phase)};
    float skewed = cos(th - ${f(SWASH.skew)} * sin(th));
    return (skewed * 0.5 + 0.25) * ${f(SWASH.amplitudeM)} * envelope * esSurfGroup(d, t);
  }
  // KEEP IN LOCKSTEP with shoreSwellAt().
  float esShoreSwell(float d, float depthM, float fetchExp, float t, out float dHdd) {
    float env = (1.0 - smoothstep(${f(SHORE_SWELL.buildNearM)}, ${f(SHORE_SWELL.buildFarM)}, d))
              * (0.3 + 0.7 * smoothstep(${f(SHORE_SWELL.breakInnerM)}, ${f(SHORE_SWELL.breakOuterM)}, d))
              * clamp(fetchExp * 2.0, 0.0, 1.0);
    dHdd = 0.0;
    if (env <= 0.0) return 0.0;
    float shoal = clamp(pow(max(depthM, 0.3) / 2.0, -0.25), 1.0, 1.8);
    float th = ${f(SHORE_SWELL.k)} * d + ${f(SWASH.omega)} * t;
    float grp = esSurfGroup(d, t);
    float a = ${f(SHORE_SWELL.amplitudeM)} * env * shoal * grp;
    dHdd = a * (-sin(th) - 0.6 * sin(2.0 * th + 0.5)) * ${f(SHORE_SWELL.k)};
    return a * (cos(th) + 0.3 * cos(2.0 * th + 0.5));
  }
  // Surf foam energy: a bore riding each arriving crest (peaking in the
  // break zone, where the swell's energy goes) + backwash remnants after
  // the crest passes. Same phase family as the swell — foam and geometry
  // arrive together.
  float esSurfFoam(float d, float fetchExp, float t) {
    float env = (1.0 - smoothstep(2.0, ${f(SWASH.bandM)}, d)) * clamp(fetchExp * 1.8, 0.0, 1.0);
    if (env <= 0.0) return 0.0;
    float th = ${f(SHORE_SWELL.k)} * d + ${f(SWASH.omega)} * t;
    float crest = cos(th - ${f(SWASH.skew)} * sin(th));
    float grp = esSurfGroup(d, t);
    float bore = smoothstep(0.45, 0.92, crest) * (0.5 + 0.5 * grp);
    float back = smoothstep(0.2, 0.8, -crest) * 0.22 * grp;
    return (bore + back) * env;
  }
  `;
}

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
