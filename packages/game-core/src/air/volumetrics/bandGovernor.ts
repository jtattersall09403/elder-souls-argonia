/**
 * Volumetric quality (decision 0112 §7): the per-tier spend in one spec (`VOLUMETRIC_BANDS`), and the
 * band per frame (`BandGovernor`). The renderer tier (`?q=`/`?quality=`, mobile on a touch device) sets
 * the governor's starting band and its ceiling; a `?vol=` URL override wins; the WebGL backend is off.
 * Otherwise the governor steps down when the median frame time over 2 s is above 20 ms (never below
 * low), and back up (to the tier's ceiling at most) once the 2 s median has stayed under 12 ms for
 * 8 s; never two changes within 8 s. Frame times are what the host feeds (CPU frame deltas).
 */
import type { VolumetricBand } from "./froxelGrid";
import { FOG_NOISE, type FogBandNoise } from "./fogNoise";
import type { FireVolumeTier } from "../../fx/fire/fireTypes";

/** The renderer's volumetric tier: the quality preset's name, or mobile (touch devices). */
export type VolumetricTier = "low" | "medium" | "high" | "mobile";

/** One row of spend: froxel grid, reach, temporal reprojection, the fog shape's noise (FOG_NOISE.bands:
 * octaves summed, warp layers, shape texels), the per-pixel march steps (dust motes inside window
 * beams; sun shafts under the canopy), and the fire volume tier (FlameSystem.setVolumeTier). */
export interface BandSpec {
  grid: readonly [number, number, number];
  farM: number;
  temporal: boolean;
  fog: FogBandNoise;
  moteSteps: number;
  shaftSteps: number;
  fireTier: FireVolumeTier;
}

/** The spend per tier. The governor's bands low/medium/high read their rows; a mobile renderer reads
 * the mobile row whatever its band (its 64^3 fog shape is chosen at construction). GPU memory per row
 * (std 16): the four grids are always MAX_GRID (high) rgba16f, 4 x 160x90x64x8 B = 28 MiB; the fog
 * shape FOG_NOISE.textureBytes(fog.shapeTexels): 8.1 MiB at 128^3, 1.1 MiB at 64^3. */
export const VOLUMETRIC_BANDS: Readonly<Record<VolumetricTier, BandSpec>> = {
  mobile: { grid: [64, 36, 24], farM: 300, temporal: false, fog: FOG_NOISE.bands.mobile, moteSteps: 0, shaftSteps: 4, fireTier: "mobile" },
  low: { grid: [80, 45, 32], farM: 400, temporal: false, fog: FOG_NOISE.bands.low, moteSteps: 12, shaftSteps: 8, fireTier: "low" },
  medium: { grid: [128, 72, 48], farM: 800, temporal: true, fog: FOG_NOISE.bands.medium, moteSteps: 20, shaftSteps: 12, fireTier: "medium" },
  high: { grid: [160, 90, 64], farM: 1500, temporal: true, fog: FOG_NOISE.bands.high, moteSteps: 28, shaftSteps: 16, fireTier: "high" },
};

/** The spec a renderer of `tier` draws at `band`. */
export function bandSpec(band: Exclude<VolumetricBand, "off">, tier: VolumetricTier): BandSpec {
  return VOLUMETRIC_BANDS[tier === "mobile" ? "mobile" : band];
}

/** The renderer tier from the quality preset's name and whether the device is a touch (mobile) one. */
export function volumetricTier(quality: "low" | "medium" | "high", mobile: boolean): VolumetricTier {
  return mobile ? "mobile" : quality;
}

const ORDER: VolumetricBand[] = ["off", "low", "medium", "high"];
/** The band a tier starts at, and the highest it ever steps up to. */
const TIER_BAND: Readonly<Record<VolumetricTier, Exclude<VolumetricBand, "off">>> = { mobile: "low", low: "low", medium: "medium", high: "high" };
export const DOWN_MS = 20;
export const UP_MS = 12;
export const DOWN_WINDOW_S = 2;
export const UP_WINDOW_S = 8;
/** No band change within this long of the last one, either way (hysteresis; walk 10 B stepped every 2 s). */
export const HOLD_S = 8;

/** The `vol` query parameter, when it names a band. */
export function volBandOverride(search: string): VolumetricBand | null {
  const v = new URLSearchParams(search).get("vol");
  return v === "off" || v === "low" || v === "medium" || v === "high" ? v : null;
}

export class BandGovernor {
  band: VolumetricBand;
  readonly tier: VolumetricTier;
  private readonly fixed: boolean;
  private readonly ceiling: number;
  /** The last 2 s of frames as a ring (512 frames: the full 2 s down to 4 ms frames, far under both bars): ms, and seconds since the last band change when recorded. */
  private readonly ms = new Float64Array(512);
  private readonly t = new Float64Array(512);
  private readonly sorted = new Float64Array(512);
  private head = 0;
  private count = 0;
  private sinceChange = 0;
  /** Seconds the 2 s median has been under `UP_MS` without a break. */
  private calmS = 0;

  /** `tier` defaults to medium, the character view's default quality preset. */
  constructor(opts: { backend: "webgpu" | "webgl"; tier?: VolumetricTier; override?: VolumetricBand | null }) {
    this.tier = opts.tier ?? "medium";
    const start = TIER_BAND[this.tier];
    this.ceiling = ORDER.indexOf(start);
    if (opts.override) { this.band = opts.override; this.fixed = true; }
    else if (opts.backend === "webgl") { this.band = "off"; this.fixed = true; }
    else { this.band = start; this.fixed = false; }
  }

  /** The spend of the current band for this tier; null while off. */
  get spec(): BandSpec | null {
    return this.band === "off" ? null : bandSpec(this.band, this.tier);
  }

  /** Feed one frame; returns the band for the next frame. Allocation-free. */
  frame(frameMs: number): VolumetricBand {
    if (this.fixed || !(frameMs > 0)) return this.band;
    this.sinceChange += frameMs / 1000;
    const cap = this.ms.length;
    if (this.count === cap) this.head = (this.head + 1) % cap; else this.count++;
    const last = (this.head + this.count - 1) % cap;
    this.ms[last] = frameMs; this.t[last] = this.sinceChange;
    const keepFrom = this.sinceChange - DOWN_WINDOW_S;
    while (this.count > 1 && this.t[this.head] < keepFrom) { this.head = (this.head + 1) % cap; this.count--; }
    const i = ORDER.indexOf(this.band);
    const med = this.median();
    this.calmS = med < UP_MS ? this.calmS + frameMs / 1000 : 0;
    if (this.sinceChange >= HOLD_S && i > 1 && med > DOWN_MS) return this.change(ORDER[i - 1]);
    if (this.calmS >= UP_WINDOW_S && i < this.ceiling) return this.change(ORDER[i + 1]);
    return this.band;
  }

  private median(): number {
    const n = this.count, s = this.sorted, cap = this.ms.length;
    for (let k = 0; k < n; k++) s[k] = this.ms[(this.head + k) % cap];
    s.fill(Infinity, n);
    s.sort();
    const m = n >> 1;
    return n % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  private change(b: VolumetricBand): VolumetricBand {
    this.band = b;
    this.head = 0; this.count = 0;
    this.sinceChange = 0;
    this.calmS = 0;
    return b;
  }
}
