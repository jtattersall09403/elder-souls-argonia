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
  /** Architecture LOD/draw-distance multiplier. Colliders and gameplay data
   * are unchanged; only the visual tier boundary moves. */
  readonly architectureDrawScale: number;
  /** T3 groundcover MID radius in metres: full-density card tier ends here.
   * The near (full-mesh) tier ends at 0.4x this. */
  readonly groundcoverRadiusM: number;
  /** T3 groundcover FAR radius in metres: the thinned card tier runs from
   * `groundcoverRadiusM` to here and fades to nothing at it. Short species
   * (under 0.6 m) stop proportionally sooner — a 30 cm tuft at 150 m is a
   * pixel that still costs a vertex. */
  readonly groundcoverFarRadiusM: number;
  /** T3 groundcover hard instance budget. */
  readonly groundcoverMaxInstances: number;
  /**
   * Upper devicePixelRatio clamp for the canvas. Rendering above the display's
   * native ratio is supersampling: measured at the jungle on the owner's card
   * it cost 3.4 ms of a 28 ms frame, so the default presets stop at native and
   * only `high` buys a little beyond it.
   */
  readonly dprMax: number;
}

export const QUALITY_PRESETS: Record<QualitySettings["name"], QualitySettings> = {
  low: {
    name: "low",
    vegDrawScale: 0.55,
    vegChunkRing: 1,
    architectureDrawScale: 0.65,
    groundcoverRadiusM: 50,
    groundcoverFarRadiusM: 110,
    groundcoverMaxInstances: 30_000,
    dprMax: 1,
  },
  medium: {
    name: "medium",
    vegDrawScale: 0.8,
    vegChunkRing: 2,
    architectureDrawScale: 1,
    groundcoverRadiusM: 65,
    groundcoverFarRadiusM: 145,
    groundcoverMaxInstances: 45_000,
    dprMax: 1,
  },
  high: {
    name: "high",
    vegDrawScale: 1,
    vegChunkRing: 2,
    architectureDrawScale: 1.25,
    groundcoverRadiusM: 75,
    groundcoverFarRadiusM: 165,
    groundcoverMaxInstances: 60_000,
    dprMax: 1.25,
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

/**
 * Triangles a frame may issue across ALL passes (main, shadow, water).
 * Measured on the owner's Apple M2 in Chrome, 2026-09-22: ~2.6 ms a million
 * triangles, so 60 fps is about four million a frame. The HUD prints the
 * frame's total against this (decision 0084); it is a budget to design the
 * LOD ladders to, not a runtime clamp.
 */
export const FRAME_TRIANGLE_BUDGET = 4_000_000;
