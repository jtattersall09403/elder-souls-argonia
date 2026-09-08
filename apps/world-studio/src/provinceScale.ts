/** Horizontal registration shared by every province-space Studio layer.
 *
 * Both rasters are vertex lattices: 4,033 source samples span 4,032 raw
 * intervals, and hydrology retains samples 0,3,...4,032. A sample count is
 * therefore never itself an extent or a normalisation denominator.
 */
export const SOURCE_GRID_SAMPLES = 4033;
export const SOURCE_GRID_INTERVALS = SOURCE_GRID_SAMPLES - 1;
export const RAW_METRES_PER_SAMPLE = 1.82784;
export const HYDRO_STEP = 3;
export const HYDRO_GRID_SAMPLES = SOURCE_GRID_INTERVALS / HYDRO_STEP + 1;
export const HYDRO_GRID_INTERVALS = HYDRO_GRID_SAMPLES - 1;
export const METRES_PER_HYDRO_SAMPLE = RAW_METRES_PER_SAMPLE * HYDRO_STEP;
export const PROVINCE_EXTENT_M = SOURCE_GRID_INTERVALS * RAW_METRES_PER_SAMPLE;

export const hydroSampleToMetres = (sample: number): number => sample * METRES_PER_HYDRO_SAMPLE;
export const hydroSampleToUv = (sample: number): number => sample / HYDRO_GRID_INTERVALS;
export const uvToRasterSample = (uv: number, samples: number): number => uv * (samples - 1);

