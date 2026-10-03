/**
 * The wave model — ONE parameter table generating BOTH the node vertex
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
 * KEEP IN LOCKSTEP: render/waterNodes.ts (`esWaveSampleEx`) reads the same
 * constants this module's CPU functions use — change the table, both sides follow. The per-band
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
  /** The band table is normalised to a UNIT rms (1 m); the metres come from
   * `seaRmsHeightM(wind, fetch)` at sample time (Phase 16c, ruling 7: the
   * energy is set by the wind and the fetch, never a fixed number). */
  rmsHeightM: 1.0,
  /** Horizontal sharpening 0..1 (bounded per-band as in GPU Gems 1). */
  choppy: 0.62,
  /** Directional spread (half-width, rad): narrow at the peak, broad at the
   * shortest band (frequency-dependent, after Hasselmann 1980). */
  spreadPeak: 0.45,
  spreadShort: 1.3,
  /** Fetch limit per band: a band is fully developed only beyond
   * `fetchPerWavelength × λ` of open-water FETCH (the compiled directional
   * fetch raster, `water-flow.png` B), so a 200 m lake carries chop, never
   * 100 m swell. */
  fetchPerWavelength: 2.0,
  /** Shortest per-band fetch limit (m): the ripple bands develop within this. */
  fetchMinM: 60.0,
  /** Prevailing wind (unit): south-easterly trade off Topal Bay. */
  windDir: [0.66, -0.75] as const,
  /** Global time scale for the deep-water dispersion phase speed. */
  speed: 1.0,
  /** Exposure model: the deep-water swell hands over to the shore swell
   * across this band of shore distance (m) — it is 0 at the waterline, where
   * the shoaling shore swell and the swash carry the motion, and 1 beyond
   * `handoverFarM` (= SHORE_SWELL.buildFarM, so the two systems cross-fade). */
  handoverNearM: 30.0,
  handoverFarM: 70.0,
  /** …and waves die below this water depth (m). */
  depthSaturationM: 1.2,
  /** Wave time loops on this period (s): every angular frequency in this
   * module is snapped to a multiple of 2π/period, so `WaterClock` can fold
   * its phase clock and the field never pops (study §1.2, item 8). */
  timePeriodS: 8192,
} as const;

/**
 * The sea's energy from the wind and the fetch (Phase 16c, plan §7 ruling 7).
 *
 * Significant wave height from the JONSWAP fetch-limited growth law,
 * `Hs = 0.0016 · U · sqrt(F / g)` (Hasselmann et al. 1973; SPM 1984), capped
 * by the fully developed Pierson–Moskowitz sea `Hs = 0.21 · U² / g`; the rms
 * surface height is `Hs / 4`. `U` is the 10 m wind (m/s) but never under
 * `swellFloorWindMS`: the open sea is never glassy, because swell arrives
 * from storms far beyond the province — THIS is the owner's calm-sea knob.
 * `F` is the compiled directional fetch (m). At the province's 60 km open
 * fetch: 7 m/s → Hs 0.87 m (rms 0.22), 12 m/s → 1.5 m, 17 m/s → 2.1 m.
 */
export const SEA = {
  swellFloorWindMS: 7.0,
  /** Fetch beyond the raster (open sea), m; the compile's own cap. */
  fetchMaxM: 60000.0,
  /** Whitecap coverage: `calmCoverage · (U / refWindMS)²`, clamped. At the
   * floor wind that is 2 % of the sea, at 12 m/s 6 %, at 17 m/s 12 %. */
  whitecap: { calmCoverage: 0.02, refWindMS: 7.0, minCoverage: 0.004, maxCoverage: 0.14 },
} as const;

export function seaWindMS(windMS: number): number {
  return Math.max(SEA.swellFloorWindMS, Number.isFinite(windMS) ? windMS : 0);
}

/** rms surface height (m) of the open-water spectrum for a 10 m wind and a
 * fetch. KEEP IN LOCKSTEP with the GLSL `esSeaRms`. */
export function seaRmsHeightM(windMS: number, fetchM: number): number {
  const g = 9.81;
  const u = seaWindMS(windMS);
  const f = Math.max(fetchM, 0);
  const hsFetch = 0.0016 * u * Math.sqrt(f / g);
  const hsFull = (0.21 * u * u) / g;
  return Math.min(hsFetch, hsFull) / 4;
}

export function whitecapCoverage(windMS: number): number {
  const u = seaWindMS(windMS);
  const w = SEA.whitecap;
  return clamp01(Math.min(Math.max(w.calmCoverage * (u / w.refWindMS) ** 2, w.minCoverage), w.maxCoverage));
}

/**
 * The crest noise the field fragment thresholds for whitecaps:
 * `esFbm(p, 3) · 0.5 + esFbm(p · 2.7 + 11, 2) · 0.5` at 0.085 cycles/m.
 * Its moments were measured by porting the noise (water.test.ts, which
 * re-measures them); a coverage becomes a threshold at the matching
 * upper quantile of a normal with these moments.
 */
export const CREST_NOISE = { mean: 0.4051, std: 0.0907 } as const;

/** Inverse normal CDF (Acklam's rational approximation, |err| < 1e-9). */
export function inverseNormal(p: number): number {
  const q = Math.min(Math.max(p, 1e-9), 1 - 1e-9);
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (q < lo) {
    const t = Math.sqrt(-2 * Math.log(q));
    return (((((c[0] * t + c[1]) * t + c[2]) * t + c[3]) * t + c[4]) * t + c[5]) / ((((d[0] * t + d[1]) * t + d[2]) * t + d[3]) * t + 1);
  }
  if (q > 1 - lo) {
    const t = Math.sqrt(-2 * Math.log(1 - q));
    return -(((((c[0] * t + c[1]) * t + c[2]) * t + c[3]) * t + c[4]) * t + c[5]) / ((((d[0] * t + d[1]) * t + d[2]) * t + d[3]) * t + 1);
  }
  const t = q - 0.5;
  const r = t * t;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * t
    / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** The crest-noise threshold above which a pixel whitecaps, for a wind. */
export function whitecapThreshold(windMS: number): number {
  return CREST_NOISE.mean + inverseNormal(1 - whitecapCoverage(windMS)) * CREST_NOISE.std;
}

/** Drift of the fine detail normals on still water (m/s), along the wind:
 * the ripples travel at their own phase speed, never a fixed 3 cm/s. */
export function stillWaterDriftMS(windMS: number): number {
  return Math.min(Math.max(0.5, 0.15 + 0.06 * Math.max(windMS, 0)), 1.5);
}

/** Whitecap pattern advection (m/s): the group speed of the peak band. */
export function whitecapDriftMS(): number {
  return 0.5 * Math.sqrt((9.81 * WAVES.peakWavelengthM) / (2 * Math.PI));
}

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
 * bobs in place instead of marching: lakes and marsh basins blend each band
 * toward `cos(k·x)·cos(ωt)`; coast, estuary and rivers travel. Very large
 * lakes still march a little in their middles (shore distance term).
 *
 * The standing share of a band is `sin(k·x)·cos(ωt)`: its envelope rises and
 * falls IN UNISON over the whole field, so any standing share on open water
 * makes the sea breathe — the whitecap fraction (mesh crest > 0.16 m)
 * pulsed ×1.35 every two seconds at 0.3 and ×1.62 at 0.45 against ×1.13
 * travelling (16c round 2, the owner's "whole ocean foams at once"). The
 * estuary is open sea water and travels; the pulse is kept for the small,
 * sheltered lake the owner likes.
 * KEEP IN LOCKSTEP with the node twin in render/waterNodes.ts.
 */
export const STANDING_BY_CLASS: Readonly<Record<string, number>> = {
  none: 0, coast: 0, estuary: 0, river: 0, lake: 0.45, marsh: 0.5,
};
export function standingWaveRatio(className: string, shoreDistM: number): number {
  const base = STANDING_BY_CLASS[className] ?? 0;
  return base * (1 - sstep(300, 800, shoreDistM));
}
/**
 * Weather wind → wave-energy scale (Phase 8c, decision 0032): ONE shared
 * value multiplying wave exposure on BOTH the CPU query and the GPU vertex
 * stage (the renderer reads it into a uniform every frame), so storm chop is
 * the chop you float on. 1 = the owner-calibrated 8b default; the weather
 * machine maps wind speed quadratically onto ~0.8 (calm) … 6 (squall coast).
 * Round 3: range widened 0.7–2.4 → 0.35–6 (owner: waves must span a much,
 * much wider spectrum — the old cap made a squall barely rougher than calm).
 * The same value derives the wave SPEED factor below. (The shore surf's
 * energy no longer reads it: since 16c round 2 that is `surfEnergyScale`,
 * from the wind speed and the compiled fetch.)
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

/**
 * THE shore-surf energy knob (16c round 2): the sea's rms height for the
 * weather wind and the compiled fetch at that shore, over the calm open sea's
 * 0.22 m — so the swash, the shore swell and the surf foam scale with the
 * same sea the swell is drawn from (1.0 at the floor wind on Topal Bay, ~1.4
 * at 10 m/s, ~2.4 at 17 m/s; a lee shore stays at the floor). Replaces the
 * old `surfWindScale` (a power of the wave-scale knob, blind to the fetch).
 * KEEP IN LOCKSTEP with the node `esSurfEnergy` in render/waterNodes.ts.
 */
export const SURF_ENERGY = { refRmsM: 0.22, min: 0.6, max: 3.5 } as const;
export function surfEnergyScale(windMS: number, fetchM: number): number {
  return Math.min(SURF_ENERGY.max, Math.max(SURF_ENERGY.min, seaRmsHeightM(windMS, fetchM) / SURF_ENERGY.refRmsM));
}

/**
 * Along-shore phase (16c round 2): the swash and the shore swell used to be
 * functions of shore distance only, so the whole waterline rose and fell as
 * one and the owner saw "the sea level breathing, no waves". A slow sinusoid
 * along the beach (`s` = the position projected on the shore tangent) shifts
 * the crest phase by up to `amp` radians every `wavelengthM`, so crests
 * arrive obliquely and run along the beach; `driftOmega` (on the loop grid)
 * walks the pattern so it never freezes. KEEP IN LOCKSTEP with `esAlongPhase`.
 */
export const ALONG_SHORE = { wavelengthM: 75.0, amp: 0.9, driftOmega: 0.045 } as const;
export const ALONG_DRIFT_OMEGA = snapOmega(ALONG_SHORE.driftOmega);
export const ALONG_K = (2 * Math.PI) / ALONG_SHORE.wavelengthM;
/** `shoreDir` is the unit SHOREWARD direction (−∇ shore distance), or (0, 0)
 * where the raster has no gradient — then the phase is 0 (the |dir|² gate)
 * and the closed forms fall back to shore distance alone. */
export function alongShorePhase(x: number, z: number, shoreDirX: number, shoreDirZ: number, timeS: number): number {
  const s = -x * shoreDirZ + z * shoreDirX;
  return ALONG_SHORE.amp * Math.sin(ALONG_K * s + ALONG_DRIFT_OMEGA * timeS)
    * (shoreDirX * shoreDirX + shoreDirZ * shoreDirZ);
}

/** The swash's uprush/backwash asymmetry grows with the sea's energy (a
 * storm's bore is steeper), capped so the oscillator stays single-valued.
 * KEEP IN LOCKSTEP with `esSwashSkew`. */
export function swashSkew(energy: number): number {
  return Math.min(SWASH.skewMax, Math.max(SWASH.skewMin, SWASH.skew + SWASH.skewPerEnergy * (energy - 1)));
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
 * GLSL below. The deep-water swell fades out over the handover band at the
 * shore (the shore swell takes over there) and below the depth floor. Turbid
 * (marsh/blackwater) surfaces sit nearly still: reeds, canopy shelter and
 * organic load kill wind chop (owner round 2: whitecaps were appearing on
 * marsh flats far from "shore"). The FETCH is a separate, per-band limit
 * (`gerstnerAt`'s `fetchM`), never folded in here. */
export function waveExposure(shoreDistM: number, depthM: number, turbidity = 0): number {
  const shore = sstep(WAVES.handoverNearM, WAVES.handoverFarM, shoreDistM);
  const deep = Math.min(Math.max(depthM / WAVES.depthSaturationM, 0), 1);
  return shore * deep * (1 - 0.85 * Math.min(Math.max(turbidity, 0), 1));
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
  skew: 0.6, // asymmetric oscillator at unit energy: fast uprush, slow gravity backwash
  skewPerEnergy: 0.25, // …steeper as the sea's energy grows (swashSkew)
  skewMin: 0.35,
  skewMax: 0.9,
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
  /** Open-water fetch (m, the compiled directional fetch) over which the
   * surf builds to full: a 5 km bay breaks on its windward beach, a 150 m
   * pond laps at a quarter of that, the lee of a headland stays quiet. */
  fetchM: 600.0,
  /** Stokes-like steepening: in-phase 2nd and 3rd harmonics sharpen the
   * crest and flatten the trough (16c round 2, a breaking front rather
   * than a sine). */
  harmonic2: 0.3,
  harmonic3: 0.12,
} as const;


/** Surf-beat group envelope 0.1..1 — modulates swell, swash and shore foam
 * together so successive waves differ (the anti-"barcode" ingredient). */
export function surfGroup(shoreDistM: number, timeS: number): number {
  return 0.55 + 0.45 * Math.sin(GROUP_OMEGA * timeS - SWASH.groupK * shoreDistM);
}

/** Fetch-only exposure for shore effects: the compiled directional fetch at
 * the point (metres of open water the waves have crossed to get here — see
 * the gating lesson above: never the depth term, which is 0 at the
 * waterline). */
export function fetchExposure(fetchM: number, turbidity = 0): number {
  return clamp01(fetchM / SHORE_SWELL.fetchM) * (1 - 0.85 * clamp01(turbidity));
}

/** Asymmetric swash height offset (m) — the moving waterline itself.
 * @param energy `surfEnergyScale(wind, fetch)`: a storm sea runs higher up
 *   the beach and its uprush is steeper (`swashSkew`).
 * @param along `alongShorePhase(...)`: the crest's phase shift along the
 *   beach, so the waterline runs obliquely instead of rising as one. */
export function swashAt(shoreDistM: number, fetchExp: number, timeS: number, energy = 1, along = 0): number {
  const envelope = Math.max(1 - shoreDistM / SWASH.bandM, 0) * clamp01(fetchExp * 1.6);
  if (envelope <= 0) return 0;
  const th = SWASH_OMEGA * timeS - SWASH.k * shoreDistM - SWASH.phase + along;
  const skewed = Math.cos(th - swashSkew(energy) * Math.sin(th));
  return (skewed * 0.5 + 0.25) * SWASH.amplitudeM * energy * envelope * surfGroup(shoreDistM, timeS);
}

/** Max swash lift (for the terrain wet band: recent waterline = W + this). */
export function swashMax(shoreDistM: number, fetchExp: number, energy = 1): number {
  const envelope = Math.max(1 - shoreDistM / SWASH.bandM, 0) * clamp01(fetchExp * 1.6);
  return 0.75 * SWASH.amplitudeM * energy * envelope;
}

/** The shore swell's crest profile: a Stokes-like sum whose harmonics sit in
 * phase with the fundamental (sharp crest, flat trough). KEEP IN LOCKSTEP
 * with the GLSL `esShoreSwell`. */
export function shoreSwellProfile(th: number): number {
  return Math.cos(th) + SHORE_SWELL.harmonic2 * Math.cos(2 * th) + SHORE_SWELL.harmonic3 * Math.cos(3 * th);
}

/** Shoaling shore swell height (m): fronts parallel to the waterline,
 * amplitude grows as depth shrinks (Green's law, capped), collapses in the
 * break zone where its energy becomes foam + swash. `energy` and `along` as
 * in `swashAt`. */
export function shoreSwellAt(shoreDistM: number, depthM: number, fetchExp: number, timeS: number,
  energy = 1, along = 0): number {
  const env = (1 - sstep(SHORE_SWELL.buildNearM, SHORE_SWELL.buildFarM, shoreDistM))
    * (0.3 + 0.7 * sstep(SHORE_SWELL.breakInnerM, SHORE_SWELL.breakOuterM, shoreDistM))
    * clamp01(fetchExp * 2.0);
  if (env <= 0) return 0;
  const shoal = Math.min(Math.max(Math.pow(Math.max(depthM, 0.3) / 2.0, -0.25), 1.0), 1.8);
  const th = SHORE_SWELL.k * shoreDistM + SWASH_OMEGA * timeS + along;
  return SHORE_SWELL.amplitudeM * energy * env * shoal * shoreSwellProfile(th) * surfGroup(shoreDistM, timeS);
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
      fetchM: Math.max(WAVES.fetchMinM, WAVES.fetchPerWavelength * b.lambda),
      wavelengthM: b.lambda,
    };
  });
  bandCache = bands;
  return bands;
}

/**
 * Gerstner sum at a REST position (the same math the vertex shader runs).
 * @param exposure the amplitude scale in METRES: the sea's rms height
 *   (`seaRmsHeightM`) times the local exposure (`waveExposure`); the band
 *   table is unit-rms.
 * @param fetchM the open-water fetch (m): the per-band limit (long swell
 *   needs long fetch); Infinity = fully developed.
 * @param standing 0 travelling … 1 standing (`cos(k·x)·cos(ωt)`), blended
 *   per band with the horizontal displacement and normal derived
 *   consistently (a standing wave is the mean of two opposite travelling
 *   waves).
 */
export function gerstnerAt(x: number, z: number, timeS: number, exposure: number, out: WaveSample,
  fetchM: number = Infinity, standing: number = 0): WaveSample {
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
      const a = b.amp * exposure * clamp01(fetchM / b.fetchM);
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
  fetchM: number = Infinity, standing: number = 0): WaveSample {
  let rx = x;
  let rz = z;
  for (let i = 0; i < 3; i++) {
    gerstnerAt(rx, rz, timeS, exposure, out, fetchM, standing);
    rx = x - out.dx;
    rz = z - out.dz;
  }
  return gerstnerAt(rx, rz, timeS, exposure, out, fetchM, standing);
}

/**
 * Along-flow travelling undulation for moving water (decision 0047 item 6).
 * A lowland river at 0.3 m/s used to be a flat still plate: every flow term
 * was gated at 0.3 m/s and narrow rivers get no Gerstner exposure. Three
 * sinusoids travel DOWNSTREAM at (speed + 0.4) m/s with a lateral phase
 * wobble so the crests are not ruler-straight. ONE table generates the CPU
 * sampler (`flowWaveAt`, used by `WaterWorld.sample`) and the GLSL vertex
 * function (render/waterNodes.ts `esFlowWave`). KEEP IN LOCKSTEP.
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

/**
 * Vertex share of a band on a grid of `gridCellM` (perf-diag9 V1): a band
 * shorter than ~2x the cell aliases into flat-lit cell-sized facets in the
 * per-vertex normal, so the vertex path fades it out over 2.0-2.5x the cell
 * and the fragment carries the rest (`gerstnerFragGlsl`). `gridCellM` 0 keeps
 * every band on the vertex (foam field).
 */
export function vertexBandWeight(wavelengthM: number, gridCellM: number): number {
  if (gridCellM <= 0) return 1;
  const t = clamp01((wavelengthM - 2.0 * gridCellM) / (0.5 * gridCellM));
  return t * t * (3 - 2 * t);
}

/**
 * The crest-defining bands (perf-diag11 W1): the `count` highest-curvature
 * bands of the first `bandCount` that stay whole on the vertex path
 * (`vertexBandWeight` 1), ranked by amp*k^2 (perf-diag12 Q2): the mesh
 * carries each band as one plane per triangle, and the error of that plane
 * (pale crest triangles, kinked Gouraud normals) scales with the band's
 * curvature against the grid, not with its amplitude.
 */
export function crestBands(bandCount: number, gridCellM: number, count: number): WaveBand[] {
  if (count <= 0) return [];
  return waveBands()
    .slice(0, bandCount)
    .filter((b) => vertexBandWeight(b.wavelengthM, gridCellM) === 1)
    .sort((a, b) => b.amp * b.freq * b.freq - a.amp * a.freq * a.freq)
    .slice(0, count);
}
