/**
 * The wave model — ONE parameter table generating BOTH the GLSL vertex
 * displacement and the CPU sampler used for buoyancy/swimming, so the water
 * you see is the water you float on (module 60 §38; decision 0025).
 *
 * Gerstner band sum adapted from WaterThreeJS (MIT, © achrefelouafi —
 * https://github.com/achrefelouafi/WaterThreeJS), including the fixed-point
 * inversion of the horizontal displacement for correct height-above-(x,z)
 * queries (same approach as Crest's collision docs). Band amplitudes come
 * from a JONSWAP spectrum around `WAVES.peakWavelengthM` with a
 * frequency-dependent directional spread and a per-band fetch limit; each
 * band blends toward a standing wave in sheltered classes; every angular
 * frequency sits on the 2π/8192 s loop grid (Greenheck study §3.1 (2), §1.2).
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


const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);
const sstep = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const f = (v: number) => {
  const s = String(v);
  return s.includes(".") || s.includes("e") ? s : `${s}.0`;
};

export const WAVES = {
  /** Bands in the spectrum (high tier; low tier renders the first half —
   * fine visually, and the CPU always sums all bands: the tail carries
   * little amplitude, so physics/visual divergence on low tier is mm). */
  bands: 10,
  lowTierBands: 6,
  /**
   * JONSWAP spectrum (Hasselmann et al. 1973) around a peak wavelength —
   * open sea 90–120 m (the Greenheck study §3.1 (2): "34 m is a lake, not a
   * sea"). Band wavelengths descend geometrically from `longestRatio × peak`
   * by `bandRatio`; each band's amplitude is the spectral energy in its
   * log-band, the whole set normalised to `rmsHeightM` so the sea the owner
   * passed keeps its energy while the size moves to real swell.
   */
  peakWavelengthM: 100.0,
  longestRatio: 1.6,
  bandRatio: 1.55,
  /** JONSWAP peak-enhancement γ (3.3 is the North Sea mean). */
  gamma: 3.3,
  /** RMS surface height (m) at full exposure and calibrated wind — equal to
   * the retired geometric table (0.17 m × 0.76ⁱ, ten bands: 0.185 m). */
  rmsHeightM: 0.185,
  /** Horizontal sharpening 0..1 (bounded per-band as in GPU Gems 1). */
  choppy: 0.62,
  /** Directional spread (half-width, rad): narrow at the peak, broad at the
   * shortest band (frequency-dependent, after Hasselmann 1980). */
  spreadPeak: 0.45,
  spreadShort: 1.3,
  /** Fetch limit per band: a band is fully developed only beyond
   * `fetchPerWavelength × λ` of shore distance (never under
   * `fetchSaturationM`), so a 200 m lake carries chop, never 100 m swell. */
  fetchPerWavelength: 2.0,
  /** Prevailing wind (unit): south-easterly trade off Topal Bay. */
  windDir: [0.66, -0.75] as const,
  /** Global time scale for the deep-water dispersion phase speed. */
  speed: 1.0,
  /** Exposure model: fetch saturates over this shore distance (m)… */
  fetchSaturationM: 60.0,
  /** …and waves die below this water depth (m). */
  depthSaturationM: 1.2,
  /** Wave time loops on this period (s): every angular frequency in this
   * module is snapped to a multiple of 2π/period, so `WaterClock` can fold
   * its phase clock and the field never pops (study §1.2, item 8). */
  timePeriodS: 8192,
} as const;

/** Angular-frequency quantum: every wave in this module beats on a multiple. */
export const OMEGA_QUANTUM = (2 * Math.PI) / WAVES.timePeriodS;
/** Snap an angular frequency (rad/s) to the loop grid — CPU twin of the GLSL
 * `esSnapOmega`. Never returns 0 for a positive input. */
export function snapOmega(omega: number): number {
  return Math.max(1, Math.round(omega / OMEGA_QUANTUM)) * OMEGA_QUANTUM;
}

/**
 * Standing-wave ratio by water class (Water Pro's `standingWaveRatio`, the
 * documented recipe for harbours and lakes; study §4 (1)). Sheltered water
 * bobs in place instead of marching: lakes, marsh basins and estuaries blend
 * each band toward `cos(k·x)·cos(ωt)`; coast and rivers travel. Very large
 * lakes still march a little in their middles (shore distance term).
 * KEEP IN LOCKSTEP with `standingRatioGlsl()`.
 */
export const STANDING_BY_CLASS: Readonly<Record<string, number>> = {
  none: 0, coast: 0, estuary: 0.3, river: 0, lake: 0.45, marsh: 0.5,
};
export function standingWaveRatio(className: string, shoreDistM: number): number {
  const base = STANDING_BY_CLASS[className] ?? 0;
  return base * (1 - sstep(300, 800, shoreDistM));
}
/** GLSL twin over the compiled class table (index order from water-meta). */
export function standingRatioGlsl(classes: readonly string[]): string {
  const rows = classes.map((c, i) => `if (ci == ${i}) base = ${f(STANDING_BY_CLASS[c] ?? 0)};`).join("\n    ");
  return /* glsl */ `
  float esStandingRatio(float classIndex, float shoreDist) {
    int ci = int(classIndex + 0.5);
    float base = 0.0;
    ${rows}
    return base * (1.0 - smoothstep(300.0, 800.0, shoreDist));
  }
  `;
}

/**
 * Weather wind → wave-energy scale (Phase 8c, decision 0032): ONE shared
 * value multiplying wave exposure on BOTH the CPU query and the GPU vertex
 * stage (the renderer reads it into a uniform every frame), so storm chop is
 * the chop you float on. 1 = the owner-calibrated 8b default; the weather
 * machine maps wind speed quadratically onto ~0.8 (calm) … 6 (squall coast).
 * Round 3: range widened 0.7–2.4 → 0.35–6 (owner: waves must span a much,
 * much wider spectrum — the old cap made a squall barely rougher than calm).
 * The same value derives the wave SPEED factor and the shore-surf energy
 * below, so storm seas are bigger, faster AND break harder — one knob,
 * CPU = GPU by construction.
 */
let windWaveScale = 1;
export function setWindWaveScale(v: number): void {
  windWaveScale = Math.min(6, Math.max(0.35, Number.isFinite(v) ? v : 1));
}
export function getWindWaveScale(): number {
  return windWaveScale;
}

/** Wave-clock speed factor: storm waves arrive faster as well as bigger.
 * =1 at the calibrated default so the 8b feel is untouched in fair weather;
 * ~2.2× in a full squall. Consumed by the studio water clock (ONE shared
 * accumulator drives shader time and CPU query, so speeding it keeps
 * buoyancy and pixels in lockstep with no phase pops). */
export function windWaveSpeed(scale: number = windWaveScale): number {
  return Math.pow(Math.min(6, Math.max(0.35, scale)), 0.45);
}

/** Shore-surf energy factor from the same knob: bigger seas break harder on
 * the beach (swash runs higher, swell shoals taller, bores foam stronger).
 * Sub-linear so the calm end still laps. KEEP IN LOCKSTEP with the GLSL
 * `esSurfWind` expression in waterMaterial.ts. */
export function surfWindScale(scale: number = windWaveScale): number {
  return Math.min(3.2, Math.max(0.6, Math.pow(scale, 0.8)));
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
/** Surf frequencies on the loop grid (see WAVES.timePeriodS). */
export const SWASH_OMEGA = snapOmega(SWASH.omega);
export const GROUP_OMEGA = snapOmega(SWASH.groupOmega);

export const SHORE_SWELL = {
  amplitudeM: 0.17,
  k: 0.45, // rad/m — ~14 m wavelength near shore
  buildNearM: 30.0, // envelope builds approaching the shore…
  buildFarM: 70.0,
  breakInnerM: 3.0, // …and collapses (−70 %) inside the break zone
  breakOuterM: 9.0,
  fetchM: 60.0,
} as const;


/** Surf-beat group envelope 0.1..1 — modulates swell, swash and shore foam
 * together so successive waves differ (the anti-"barcode" ingredient). */
export function surfGroup(shoreDistM: number, timeS: number): number {
  return 0.55 + 0.45 * Math.sin(GROUP_OMEGA * timeS - SWASH.groupK * shoreDistM);
}

/** Fetch-only exposure for shore effects — pass the shore distance sampled
 * ~30 m SEAWARD of the point (see gating lesson above). */
export function fetchExposure(seawardShoreDistM: number, turbidity = 0): number {
  return clamp01(seawardShoreDistM / SHORE_SWELL.fetchM) * (1 - 0.85 * clamp01(turbidity));
}

/** Asymmetric swash height offset (m) — the moving waterline itself.
 * Wind-scaled (round 3): storm seas run visibly higher up the beach. */
export function swashAt(shoreDistM: number, fetchExp: number, timeS: number): number {
  const envelope = Math.max(1 - shoreDistM / SWASH.bandM, 0) * clamp01(fetchExp * 1.6);
  if (envelope <= 0) return 0;
  const th = SWASH_OMEGA * timeS - SWASH.k * shoreDistM - SWASH.phase;
  const skewed = Math.cos(th - SWASH.skew * Math.sin(th));
  return (skewed * 0.5 + 0.25) * SWASH.amplitudeM * surfWindScale() * envelope * surfGroup(shoreDistM, timeS);
}

/** Max swash lift (for the terrain wet band: recent waterline = W + this). */
export function swashMax(shoreDistM: number, fetchExp: number): number {
  const envelope = Math.max(1 - shoreDistM / SWASH.bandM, 0) * clamp01(fetchExp * 1.6);
  return 0.75 * SWASH.amplitudeM * surfWindScale() * envelope;
}

/** Shoaling shore swell height (m): fronts parallel to the waterline,
 * amplitude grows as depth shrinks (Green's law, capped), collapses in the
 * break zone where its energy becomes foam + swash. Wind-scaled (round 3). */
export function shoreSwellAt(shoreDistM: number, depthM: number, fetchExp: number, timeS: number): number {
  const env = (1 - sstep(SHORE_SWELL.buildNearM, SHORE_SWELL.buildFarM, shoreDistM))
    * (0.3 + 0.7 * sstep(SHORE_SWELL.breakInnerM, SHORE_SWELL.breakOuterM, shoreDistM))
    * clamp01(fetchExp * 2.0);
  if (env <= 0) return 0;
  const shoal = Math.min(Math.max(Math.pow(Math.max(depthM, 0.3) / 2.0, -0.25), 1.0), 1.8);
  const th = SHORE_SWELL.k * shoreDistM + SWASH_OMEGA * timeS;
  return SHORE_SWELL.amplitudeM * surfWindScale() * env * shoal
    * (Math.cos(th) + 0.3 * Math.cos(2.0 * th + 0.5)) * surfGroup(shoreDistM, timeS);
}

/** Exact port of WaterThreeJS's GLSL hash21 (per-band angle/phase; the
 * shader's `esHash21`). Exported for the CPU twins of cell-hashed effects. */
export function hash21(a: number, b: number): number {
  const fract = (v: number) => v - Math.floor(v);
  let px = fract(a * 123.34);
  let py = fract(b * 456.21);
  const d = px * (px + 45.32) + py * (py + 45.32);
  px += d;
  py += d;
  return fract(px * py);
}

export interface WaveBand {
  dirX: number;
  dirZ: number;
  /** Wavenumber k (rad/m). */
  freq: number;
  /** Amplitude (m) at full exposure. */
  amp: number;
  /** Angular frequency ω = sqrt(g·k)·speed, snapped to the loop grid. */
  phaseSpeed: number;
  q: number;
  phase0: number;
  /** Shore distance (m) at which this band is fully developed. */
  fetchM: number;
  wavelengthM: number;
}

/** JONSWAP spectral shape (α dropped — the set is normalised afterwards). */
export function jonswapShape(omega: number, omegaPeak: number, gamma: number = WAVES.gamma): number {
  const sigma = omega <= omegaPeak ? 0.07 : 0.09;
  const r = Math.exp(-((omega - omegaPeak) ** 2) / (2 * sigma * sigma * omegaPeak * omegaPeak));
  return Math.pow(omega, -5) * Math.exp(-1.25 * Math.pow(omegaPeak / omega, 4)) * Math.pow(gamma, r);
}

let bandCache: WaveBand[] | null = null;

/**
 * The band table: JONSWAP energy per log-band around `peakWavelengthM`,
 * normalised to `rmsHeightM`; frequency-dependent directional spread; deep
 * water dispersion with the angular frequency snapped to the loop grid.
 */
export function waveBands(): WaveBand[] {
  if (bandCache) return bandCache;
  const g = 9.81;
  const baseAngle = Math.atan2(WAVES.windDir[1], WAVES.windDir[0]);
  const omegaPeak = Math.sqrt((g * 2 * Math.PI) / WAVES.peakWavelengthM);
  const dOmegaRatio = Math.pow(WAVES.bandRatio, 0.25) - Math.pow(WAVES.bandRatio, -0.25);
  const raw: { lambda: number; k: number; omega: number; energy: number }[] = [];
  for (let i = 0; i < WAVES.bands; i++) {
    const lambda = (WAVES.peakWavelengthM * WAVES.longestRatio) / Math.pow(WAVES.bandRatio, i);
    const k = (2 * Math.PI) / lambda;
    const omega = Math.sqrt(g * k) * WAVES.speed;
    raw.push({ lambda, k, omega, energy: jonswapShape(omega, omegaPeak) * omega * dOmegaRatio });
  }
  // a_i² / 2 = energy share × rms² → Σ a_i² / 2 = rms²
  const total = raw.reduce((s, b) => s + b.energy, 0);
  const omegaShort = raw[raw.length - 1].omega;
  const bands: WaveBand[] = raw.map((b, i) => {
    const amp = Math.sqrt((2 * WAVES.rmsHeightM * WAVES.rmsHeightM * b.energy) / total);
    // spread: narrow at (and below) the peak, broadening toward the shortest band
    const t = clamp01(Math.log(Math.max(b.omega / omegaPeak, 1)) / Math.log(omegaShort / omegaPeak));
    const spread = WAVES.spreadPeak + (WAVES.spreadShort - WAVES.spreadPeak) * t;
    const angle = baseAngle + (hash21(i, 1.7) * 2 - 1) * spread;
    return {
      dirX: Math.cos(angle),
      dirZ: Math.sin(angle),
      freq: b.k,
      amp,
      phaseSpeed: snapOmega(b.omega),
      q: WAVES.choppy / Math.max(b.k * amp * WAVES.bands, 1e-3),
      phase0: hash21(i, 9.1) * 6.2831853,
      fetchM: Math.max(WAVES.fetchSaturationM, WAVES.fetchPerWavelength * b.lambda),
      wavelengthM: b.lambda,
    };
  });
  bandCache = bands;
  return bands;
}

/**
 * Gerstner sum at a REST position (the same math the vertex shader runs).
 * @param shoreDistM per-band fetch limit (long swell needs long fetch);
 *   Infinity = fully developed.
 * @param standing 0 travelling … 1 standing (`cos(k·x)·cos(ωt)`), blended
 *   per band with the horizontal displacement and normal derived
 *   consistently (a standing wave is the mean of two opposite travelling
 *   waves).
 */
export function gerstnerAt(x: number, z: number, timeS: number, exposure: number, out: WaveSample,
  shoreDistM: number = Infinity, standing: number = 0): WaveSample {
  let dx = 0;
  let dz = 0;
  let h = 0;
  let nx = 0;
  let ny = 1;
  let nz = 0;
  if (exposure > 1e-4) {
    const s = clamp01(standing);
    const tr = 1 - s;
    for (const b of waveBands()) {
      const a = b.amp * exposure * clamp01(shoreDistM / b.fetchM);
      if (a <= 0) continue;
      const argS = b.freq * (b.dirX * x + b.dirZ * z) + b.phase0;
      const tau = timeS * b.phaseSpeed;
      const sS = Math.sin(argS);
      const cS = Math.cos(argS);
      const sT = Math.sin(tau);
      const cT = Math.cos(tau);
      // travelling: sin(argS + tau); standing: sin(argS)·cos(tau)
      const hh = sS * cT + tr * cS * sT;          // ≡ sin(arg) at s = 0
      const dd = tr * cS * cT - sS * sT;          // ≡ cos(arg) at s = 0
      const wa = b.freq * a;
      dx += b.q * a * b.dirX * dd;
      dz += b.q * a * b.dirZ * dd;
      h += a * hh;
      nx -= b.dirX * wa * dd;
      nz -= b.dirZ * wa * dd;
      ny -= b.q * wa * hh;
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
export function surfaceWaveAt(x: number, z: number, timeS: number, exposure: number, out: WaveSample,
  shoreDistM: number = Infinity, standing: number = 0): WaveSample {
  let rx = x;
  let rz = z;
  for (let i = 0; i < 3; i++) {
    gerstnerAt(rx, rz, timeS, exposure, out, shoreDistM, standing);
    rx = x - out.dx;
    rz = z - out.dz;
  }
  return gerstnerAt(rx, rz, timeS, exposure, out, shoreDistM, standing);
}

/**
 * Along-flow travelling undulation for moving water (decision 0047 item 6).
 * A lowland river at 0.3 m/s used to be a flat still plate: every flow term
 * was gated at 0.3 m/s and narrow rivers get no Gerstner exposure. Three
 * sinusoids travel DOWNSTREAM at (speed + 0.4) m/s with a lateral phase
 * wobble so the crests are not ruler-straight. ONE table generates the CPU
 * sampler (`flowWaveAt`, used by `WaterWorld.sample`) and the GLSL vertex
 * function (`flowWaveGlsl` → `esFlowWave`). KEEP IN LOCKSTEP.
 */
export const FLOW_WAVE_MIN_SPEED_MS = 0.15;
export const FLOW_WAVES = {
  /** Peak amplitude (m) = ampBase + ampPerMS · min(speed, ampSpeedCapMS). */
  ampBase: 0.012,
  ampPerMS: 0.02,
  ampSpeedCapMS: 2.0,
  /** Crest speed downstream = speed + phaseSpeedAddMS (m/s). */
  phaseSpeedAddMS: 0.4,
  /** Wavelength (m), weight (of the peak amplitude), lateral wobble rad/m,
   * lateral wobble amplitude (rad), phase offset (rad). */
  bands: [
    { wavelengthM: 1.6, weight: 0.45, lateralK: 0.9, lateralAmp: 0.7, phase0: 0.0 },
    { wavelengthM: 2.7, weight: 0.33, lateralK: 0.55, lateralAmp: 0.9, phase0: 1.9 },
    { wavelengthM: 4.5, weight: 0.22, lateralK: 0.35, lateralAmp: 1.1, phase0: 4.1 },
  ],
} as const;

/** Flow-wave angular frequency k·c snapped to the loop grid: the crest speed
 * is `flowWaveOmega(k, c) / k`, within 0.1 % of `c` for every band. */
export function flowWaveOmega(k: number, c: number): number {
  return snapOmega(k * c);
}

/** CPU twin of `esFlowWave`: height + unit normal at world (x, z) for unit
 * flow direction (dirX, dirZ) and speed (m/s). No horizontal displacement. */
export function flowWaveAt(x: number, z: number, dirX: number, dirZ: number, speedMS: number, timeS: number,
  out: WaveSample): WaveSample {
  const amp = FLOW_WAVES.ampBase + FLOW_WAVES.ampPerMS * Math.min(speedMS, FLOW_WAVES.ampSpeedCapMS);
  const along = x * dirX + z * dirZ;
  const across = x * -dirZ + z * dirX;
  const c = speedMS + FLOW_WAVES.phaseSpeedAddMS;
  let h = 0;
  let dhx = 0;
  let dhz = 0;
  for (const b of FLOW_WAVES.bands) {
    const k = (2 * Math.PI) / b.wavelengthM;
    const lat = b.lateralAmp * Math.sin(across * b.lateralK + b.phase0);
    const ph = k * along - flowWaveOmega(k, c) * timeS + lat + b.phase0;
    const a = amp * b.weight;
    h += a * Math.sin(ph);
    // dph/dx = k·dirX + lateralAmp·cos(...)·lateralK·(−dirZ); same for z
    const dlat = b.lateralAmp * Math.cos(across * b.lateralK + b.phase0) * b.lateralK;
    const cph = a * Math.cos(ph);
    dhx += cph * (k * dirX + dlat * -dirZ);
    dhz += cph * (k * dirZ + dlat * dirX);
  }
  const inv = 1 / Math.hypot(dhx, 1, dhz);
  out.dx = 0;
  out.dz = 0;
  out.height = h;
  out.nx = -dhx * inv;
  out.ny = inv;
  out.nz = -dhz * inv;
  return out;
}

/** GLSL twin: `esFlowWave(vec2 pos, vec2 dir, float speed, float t, out vec3 normal)`
 * returns the height; constants baked from FLOW_WAVES. Requires `esSnapOmega`
 * from `gerstnerGlsl()` to be declared first. */
export function flowWaveGlsl(): string {
  const rows = FLOW_WAVES.bands.map((b) => {
    const k = (2 * Math.PI) / b.wavelengthM;
    return `{
      float lat = ${f(b.lateralAmp)} * sin(across * ${f(b.lateralK)} + ${f(b.phase0)});
      float ph = ${f(k)} * along - esSnapOmega(${f(k)} * c) * t + lat + ${f(b.phase0)};
      float a = amp * ${f(b.weight)};
      h += a * sin(ph);
      float dlat = ${f(b.lateralAmp)} * cos(across * ${f(b.lateralK)} + ${f(b.phase0)}) * ${f(b.lateralK)};
      float cph = a * cos(ph);
      dhx += cph * (${f(k)} * dir.x + dlat * -dir.y);
      dhz += cph * (${f(k)} * dir.y + dlat * dir.x);
    }`;
  }).join("\n    ");
  return /* glsl */ `
  // KEEP IN LOCKSTEP with flowWaveAt().
  float esFlowWave(vec2 pos, vec2 dir, float speed, float t, out vec3 normal) {
    float amp = ${f(FLOW_WAVES.ampBase)} + ${f(FLOW_WAVES.ampPerMS)} * min(speed, ${f(FLOW_WAVES.ampSpeedCapMS)});
    float along = dot(pos, dir);
    float across = dot(pos, vec2(-dir.y, dir.x));
    float c = speed + ${f(FLOW_WAVES.phaseSpeedAddMS)};
    float h = 0.0, dhx = 0.0, dhz = 0.0;
    ${rows}
    normal = normalize(vec3(-dhx, 1.0, -dhz));
    return h;
  }
  `;
}

/**
 * GLSL twin of the shore-surf closed forms (surfGroup / fetchExposure /
 * swashAt / shoreSwellAt). Included by BOTH the water vertex stage (geometry)
 * and the fragment stage (surf foam) — constants baked from the same tables.
 * `esShoreSwell` also returns dH/d(shoreDist) for the vertex normal tilt.
 * `windAmp` is surfWindScale() evaluated shader-side from uWindWave (round
 * 3): storm seas break harder — pass 1.0 for the calibrated default.
 */
export function surfGlsl(): string {
  return /* glsl */ `
  float esSurfGroup(float d, float t) {
    return 0.55 + 0.45 * sin(${f(GROUP_OMEGA)} * t - ${f(SWASH.groupK)} * d);
  }
  float esFetchExp(float seawardD, float turb) {
    return clamp(seawardD / ${f(SHORE_SWELL.fetchM)}, 0.0, 1.0)
         * (1.0 - 0.85 * clamp(turb, 0.0, 1.0));
  }
  // KEEP IN LOCKSTEP with swashAt() — the moving waterline itself.
  float esSwash(float d, float fetchExp, float t, float windAmp) {
    float envelope = max(1.0 - d / ${f(SWASH.bandM)}, 0.0) * clamp(fetchExp * 1.6, 0.0, 1.0);
    if (envelope <= 0.0) return 0.0;
    float th = ${f(SWASH_OMEGA)} * t - ${f(SWASH.k)} * d - ${f(SWASH.phase)};
    float skewed = cos(th - ${f(SWASH.skew)} * sin(th));
    return (skewed * 0.5 + 0.25) * ${f(SWASH.amplitudeM)} * windAmp * envelope * esSurfGroup(d, t);
  }
  // KEEP IN LOCKSTEP with shoreSwellAt().
  float esShoreSwell(float d, float depthM, float fetchExp, float t, float windAmp, out float dHdd) {
    float env = (1.0 - smoothstep(${f(SHORE_SWELL.buildNearM)}, ${f(SHORE_SWELL.buildFarM)}, d))
              * (0.3 + 0.7 * smoothstep(${f(SHORE_SWELL.breakInnerM)}, ${f(SHORE_SWELL.breakOuterM)}, d))
              * clamp(fetchExp * 2.0, 0.0, 1.0);
    dHdd = 0.0;
    if (env <= 0.0) return 0.0;
    float shoal = clamp(pow(max(depthM, 0.3) / 2.0, -0.25), 1.0, 1.8);
    float th = ${f(SHORE_SWELL.k)} * d + ${f(SWASH_OMEGA)} * t;
    float grp = esSurfGroup(d, t);
    float a = ${f(SHORE_SWELL.amplitudeM)} * windAmp * env * shoal * grp;
    dHdd = a * (-sin(th) - 0.6 * sin(2.0 * th + 0.5)) * ${f(SHORE_SWELL.k)};
    return a * (cos(th) + 0.3 * cos(2.0 * th + 0.5));
  }
  // Surf foam energy: a bore riding each arriving crest (peaking in the
  // break zone, where the swell's energy goes) + backwash remnants after
  // the crest passes. Same phase family as the swell — foam and geometry
  // arrive together; storm seas foam harder (sqrt so calm still laps white).
  float esSurfFoam(float d, float fetchExp, float t, float windAmp) {
    float env = (1.0 - smoothstep(2.0, ${f(SWASH.bandM)}, d)) * clamp(fetchExp * 1.8, 0.0, 1.0)
              * clamp(sqrt(windAmp), 0.7, 1.9);
    if (env <= 0.0) return 0.0;
    float th = ${f(SHORE_SWELL.k)} * d + ${f(SWASH_OMEGA)} * t;
    float crest = cos(th - ${f(SWASH.skew)} * sin(th));
    float grp = esSurfGroup(d, t);
    float bore = smoothstep(0.45, 0.92, crest) * (0.5 + 0.5 * grp);
    float back = smoothstep(0.2, 0.8, -crest) * 0.22 * grp;
    return (bore + back) * env;
  }
  `;
}

/**
 * The GLSL twin: declares `esWaveSampleEx(vec2 pos, float exposure, float
 * shoreDist, float standing, float t)` (+ the legacy `esWaveSample(pos,
 * exposure, t)` = fully developed, travelling) plus the shared exposure
 * helper and `esSnapOmega`. Constants are baked from the SAME table the CPU
 * uses. `bandCount` lets the low tier truncate the spectrum.
 */
export function gerstnerGlsl(bandCount: number = WAVES.bands): string {
  const bands = waveBands().slice(0, bandCount);
  const rows = bands
    .map(
      (b) =>
        `w = esWaveBand(pos, exposure * clamp(shoreDist / ${f(b.fetchM)}, 0.0, 1.0), standing, t, ` +
        `vec2(${f(b.dirX)}, ${f(b.dirZ)}), ${f(b.freq)}, ${f(b.amp)}, ${f(b.phaseSpeed)}, ${f(b.q)}, ${f(b.phase0)}, w);`,
    )
    .join("\n    ");
  return /* glsl */ `
  struct EsWave { vec3 disp; vec3 normal; float height; };

  float esWaveExposure(float shoreDistM, float depthM, float turbidity) {
    return clamp(shoreDistM / ${f(WAVES.fetchSaturationM)}, 0.0, 1.0)
         * clamp(depthM / ${f(WAVES.depthSaturationM)}, 0.0, 1.0)
         * (1.0 - 0.85 * clamp(turbidity, 0.0, 1.0));
  }

  // KEEP IN LOCKSTEP with snapOmega(): the loop grid of the folded wave clock.
  float esSnapOmega(float omega) {
    return max(1.0, floor(omega / ${f(OMEGA_QUANTUM)} + 0.5)) * ${f(OMEGA_QUANTUM)};
  }

  // KEEP IN LOCKSTEP with gerstnerAt(): travelling ↔ standing blend.
  EsWave esWaveBand(vec2 pos, float exposure, float standing, float t, vec2 d,
                    float freq, float amp, float omega, float q, float phase0, EsWave w) {
    float a = amp * exposure;
    float tr = 1.0 - standing;
    float argS = freq * dot(d, pos) + phase0;
    float tau = t * omega;
    float sS = sin(argS), cS = cos(argS), sT = sin(tau), cT = cos(tau);
    float hh = sS * cT + tr * cS * sT;
    float dd = tr * cS * cT - sS * sT;
    float wa = freq * a;
    w.disp += vec3(q * a * d.x * dd, a * hh, q * a * d.y * dd);
    w.normal -= vec3(d.x * wa * dd, q * wa * hh, d.y * wa * dd);
    return w;
  }

  EsWave esWaveSampleEx(vec2 pos, float exposure, float shoreDist, float standing, float t) {
    EsWave w;
    w.disp = vec3(0.0);
    w.normal = vec3(0.0, 1.0, 0.0);
    standing = clamp(standing, 0.0, 1.0);
    ${rows}
    w.height = w.disp.y;
    w.normal = normalize(w.normal);
    return w;
  }

  EsWave esWaveSample(vec2 pos, float exposure, float t) {
    return esWaveSampleEx(pos, exposure, 1.0e9, 0.0, t);
  }
  `;
}
