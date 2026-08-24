"""Province scale (single source of truth — decisions 0006, 0015).

HSCALE multiplies the raw Skyrim-map sample spacing into world metres.
Decision 0015 (2026-08-24) set HSCALE = 1.0 (was 3.0, decision 0006): the
province is its raw 7.37 km extent, and the vertical exaggeration at
geometry time is 1.0 (was 5.0) — terrain drama lives in the height data.

The Phase 3-6 tuning constants (distances, areas, slope thresholds) were
tuned on the x3 map and owner-approved in PIXEL space over the Phase 3/4/6
gates. Changing HSCALE relabels the metres under those same pixels, so the
inherited constants convert with the factors below to keep the approved
rasters identical. At HSCALE=3 all factors equal 1. New code (Phase 6b+)
should express constants in true physical metres and NOT use these factors.
"""

RAW_METRES_PER_SAMPLE = 4096.0 * 0.01428 / 32.0   # 1.828 m at Skyrim map scale
HSCALE = 1.0                    # horizontal world scale (0015; was 3.0, 0006)
RAW_M = RAW_METRES_PER_SAMPLE * HSCALE            # full-res sample size, world m
VERTICAL_SCALE_AT_GEOMETRY = 1.0                  # 0015 (was 5.0, 0006 addendum)

TUNE = HSCALE / 3.0             # metre/km constants tuned at x3
TUNE_A = TUNE * TUNE            # km^2 (area) constants tuned at x3
TUNE_S = 1.0 / TUNE             # slope thresholds / per-slope cost factors tuned at x3
