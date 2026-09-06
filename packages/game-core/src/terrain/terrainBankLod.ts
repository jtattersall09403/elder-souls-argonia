import type { AdaptiveTerrainChunk } from './adaptiveTerrain';

export interface TerrainBankLodView {
  /** Conservative projection denominator for the whole chunk, never a centre
   * distance; projectedTerrainBankView also supports orthographic cameras. */
  distanceM: number;
  /** Matching projection-sensitivity numerator (pixels per radian in the
   * simplest perspective bound, pixels per world metre for orthographic). */
  pixelsPerRadian: number;
  verticalScale?: number;
  maximumErrorPixels?: number;
  /** Shared projection helper's displayed-Y rounding allowance; already
   * scaled, and conservative across all candidate assets. */
  scaledHeightRoundoffM?: number;
}

/** Preserve the native collider/near ring and existing dryland LOD policy.
 * Only optional protected-bank approximations replace a far LOD4 mesh; their
 * exporter bound already includes final Float32 world-coordinate error. */
export function selectTerrainBankLod(chunk: AdaptiveTerrainChunk, baseLod: string, view: TerrainBankLodView): string {
  if (baseLod !== '4') return baseLod;
  const scale = view.verticalScale ?? 1, pixels = view.maximumErrorPixels ?? 0.5;
  if (!(view.distanceM > 0) || !(view.pixelsPerRadian > 0) || !(scale > 0) || !(pixels > 0)
    || ![view.distanceM, view.pixelsPerRadian, scale, pixels].every(Number.isFinite)) return baseLod;
  if (view.scaledHeightRoundoffM !== undefined
    && (!Number.isFinite(view.scaledHeightRoundoffM) || view.scaledHeightRoundoffM < 0)) return baseLod;
  let selected = baseLod, triangles = chunk.lods[baseLod].triangles;
  for (const [key, asset] of Object.entries(chunk.lods)) {
    const maximumHeight = Math.max(Math.abs(asset.minM), Math.abs(asset.maxM)) * scale;
    // Native/coarse heights are already Float32 at scale1. Diagnostic
    // vertical exaggeration rounds both uploaded Y fields once more.
    const scaledHeightRoundoff = view.scaledHeightRoundoffM
      ?? (scale !== 1 && maximumHeight > 0 ? 2 ** (Math.floor(Math.log2(maximumHeight)) - 23) : 0);
    const errorM = (asset.maximumBankErrorM ?? Infinity) * scale + scaledHeightRoundoff;
    if (asset.baseLod !== baseLod || !Number.isFinite(asset.maximumBankErrorM)
      || errorM * view.pixelsPerRadian > pixels * view.distanceM
      || asset.triangles >= triangles) continue;
    selected = key; triangles = asset.triangles;
  }
  return selected;
}
