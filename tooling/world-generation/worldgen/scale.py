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

# Province coordinates have three deliberately different spans. Authored UVs
# use the historical 4034-spacing frame; terrain meshes physically support
# 4033 vertices (4032 intervals); and the cell-centred hydrology texture has
# a 4035-spacing outer edge. Conflating these lets a camera walk beyond the
# last terrain vertex or makes a texture's coverage redefine authored places.
SOURCE_GRID_SAMPLES = 4033
AUTHORED_UV_RAW_SPACINGS = 4034
AUTHORED_UV_EXTENT_M = AUTHORED_UV_RAW_SPACINGS * RAW_M
TERRAIN_SUPPORT_EXTENT_M = (SOURCE_GRID_SAMPLES - 1) * RAW_M

# Compatibility alias for authored placement code. New consumers must choose
# AUTHORED_UV_EXTENT_M or TERRAIN_SUPPORT_EXTENT_M explicitly.
PROVINCE_EXTENT_RAW_SPACINGS = AUTHORED_UV_RAW_SPACINGS
PROVINCE_EXTENT_M = AUTHORED_UV_EXTENT_M

# Hydrology, society, routes and climate are 1345 cell-centred texels. Their
# outer raster edge overshoots the authored frame by one raw spacing (one
# third of a macro pixel); converters use centre coordinates, never size as a
# substitute for PROVINCE_EXTENT_M.
HYDRO_STEP = 3
HYDRO_GRID_SAMPLES = 1345
HYDRO_PX_M = RAW_M * HYDRO_STEP
HYDRO_RASTER_EDGE_EXTENT_M = HYDRO_GRID_SAMPLES * HYDRO_PX_M


def uv_to_metres(value: float) -> float:
    """Map one normalised authored coordinate onto the authored UV span."""
    return float(value) * AUTHORED_UV_EXTENT_M


def metres_to_uv(value: float) -> float:
    """Inverse of :func:`uv_to_metres`; boundaries 0 and extent map to 0/1."""
    return float(value) / AUTHORED_UV_EXTENT_M


def hydro_pixel_center_to_metres(index: float) -> float:
    """Map a hydrology pixel index (integer or fractional) to its centre."""
    return (float(index) + 0.5) * HYDRO_PX_M


def metres_to_hydro_pixel(value: float) -> float:
    """Inverse of :func:`hydro_pixel_center_to_metres`."""
    return float(value) / HYDRO_PX_M - 0.5

TUNE = HSCALE / 3.0             # metre/km constants tuned at x3
TUNE_A = TUNE * TUNE            # km^2 (area) constants tuned at x3
TUNE_S = 1.0 / TUNE             # slope thresholds / per-slope cost factors tuned at x3
