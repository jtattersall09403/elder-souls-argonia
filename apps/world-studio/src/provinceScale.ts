/** Horizontal registration shared by every province-space Studio layer.
 * Hydrology coordinates name cell-centred pixels. The reviewed authored UV
 * frame is 4,034 raw spacings, terrain supports 4,032 intervals, and the
 * 1,345-pixel macro raster covers 4,035 spacings at its outer edge.
 */
export const SOURCE_GRID_SAMPLES = 4033;
export const RAW_METRES_PER_SAMPLE = 1.82784;
export const HYDRO_STEP = 3;
export const PROVINCE_EXTENT_RAW_SPACINGS = 4034;
export const HYDRO_GRID_SAMPLES = 1345;
export const METRES_PER_HYDRO_SAMPLE = RAW_METRES_PER_SAMPLE * HYDRO_STEP;
export const AUTHORED_UV_EXTENT_M = PROVINCE_EXTENT_RAW_SPACINGS * RAW_METRES_PER_SAMPLE;
export const TERRAIN_SUPPORT_EXTENT_M = (SOURCE_GRID_SAMPLES - 1) * RAW_METRES_PER_SAMPLE;
export const HYDRO_RASTER_EDGE_EXTENT_M = HYDRO_GRID_SAMPLES * METRES_PER_HYDRO_SAMPLE;
/** Compatibility alias for authored placement code. */
export const PROVINCE_EXTENT_M = AUTHORED_UV_EXTENT_M;

export const hydroPixelCenterToMetres = (pixel: number): number => (pixel + 0.5) * METRES_PER_HYDRO_SAMPLE;
export const hydroPixelCenterToUv = (pixel: number): number => hydroPixelCenterToMetres(pixel) / AUTHORED_UV_EXTENT_M;
export const metresToHydroPixel = (metres: number): number => metres / METRES_PER_HYDRO_SAMPLE - 0.5;
