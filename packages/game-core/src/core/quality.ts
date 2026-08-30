/**
 * Runtime quality settings (module 65 budgets, first slice — owner
 * 2026-08-30: character view lags, "we absolutely need some now").
 *
 * One injectable settings object instead of per-component URL params or
 * module constants (CLAUDE.md package rule; no `__STUDIO_*` globals). The
 * Skyrim analogy: these are the uGridsToLoad / grass-fade / shadow-distance
 * levers — draw distance and density scale down, never simulation. Phase 14
 * extends this into the full streaming budget system; nothing here should
 * fight that, it is the same object growing more fields.
 */

export interface QualitySettings {
  readonly name: "low" | "medium" | "high";
  /** Multiplies every per-species vegetation LOD ring and draw-distance cull
   * (T1/T2/T4 tiers). 1 = authored distances. */
  readonly vegDrawScale: number;
  /** Vegetation chunk ring around the focus (chunks are ~468 m). */
  readonly vegChunkRing: number;
  /** T3 groundcover ring radius in metres. */
  readonly groundcoverRadiusM: number;
  /** T3 groundcover hard instance budget. */
  readonly groundcoverMaxInstances: number;
  /** Upper devicePixelRatio clamp for the canvas. */
  readonly dprMax: number;
}

export const QUALITY_PRESETS: Record<QualitySettings["name"], QualitySettings> = {
  low: {
    name: "low",
    vegDrawScale: 0.55,
    vegChunkRing: 1,
    groundcoverRadiusM: 50,
    groundcoverMaxInstances: 30_000,
    dprMax: 1,
  },
  medium: {
    name: "medium",
    vegDrawScale: 0.8,
    vegChunkRing: 2,
    groundcoverRadiusM: 65,
    groundcoverMaxInstances: 45_000,
    dprMax: 1.25,
  },
  high: {
    name: "high",
    vegDrawScale: 1,
    vegChunkRing: 2,
    groundcoverRadiusM: 75,
    groundcoverMaxInstances: 60_000,
    dprMax: 1.5,
  },
};

/** Parse a `?q=` style value; unknown/absent falls back to `fallback`. */
export function parseQuality(
  value: string | null | undefined,
  fallback: QualitySettings["name"] = "medium",
): QualitySettings {
  const name = value === "low" || value === "medium" || value === "high" ? value : fallback;
  return QUALITY_PRESETS[name];
}
