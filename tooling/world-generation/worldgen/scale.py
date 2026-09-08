"""Province scale and horizontal registration (single source of truth).

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

# Argonia is a 126-cell square.  Each LAND cell contributes 32 intervals and
# shares its 33rd boundary sample with the next cell, so the stitched source is
# a 4033-sample *vertex lattice* spanning 4032 intervals.  Extent must
# therefore use ``(sample_count - 1) * spacing``.  Treating samples as texel
# areas (``sample_count * spacing``) adds a phantom cell at the east/south
# edges; the former blueprint constants accidentally added two raw samples.
SOURCE_GRID_SAMPLES = 4033
PROVINCE_EXTENT_M = (SOURCE_GRID_SAMPLES - 1) * RAW_M

# Hydrology, society, routes and climate use source samples 0, 3, ... 4032:
# 1345 lattice samples, 1344 intervals, exactly the same physical extent.
HYDRO_STEP = 3
HYDRO_GRID_SAMPLES = (SOURCE_GRID_SAMPLES - 1) // HYDRO_STEP + 1
HYDRO_PX_M = RAW_M * HYDRO_STEP


def uv_to_metres(value: float) -> float:
    """Map one normalised province coordinate onto the vertex-lattice span."""
    return float(value) * PROVINCE_EXTENT_M


def metres_to_uv(value: float) -> float:
    """Inverse of :func:`uv_to_metres`; boundaries 0 and extent map to 0/1."""
    return float(value) / PROVINCE_EXTENT_M


def hydro_sample_to_metres(index: float) -> float:
    """Map a hydrology lattice sample index (integer or fractional) to metres."""
    return float(index) * HYDRO_PX_M


def metres_to_hydro_sample(value: float) -> float:
    """Inverse of :func:`hydro_sample_to_metres`."""
    return float(value) / HYDRO_PX_M

TUNE = HSCALE / 3.0             # metre/km constants tuned at x3
TUNE_A = TUNE * TUNE            # km^2 (area) constants tuned at x3
TUNE_S = 1.0 / TUNE             # slope thresholds / per-slope cost factors tuned at x3
