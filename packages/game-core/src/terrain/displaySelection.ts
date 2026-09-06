import type { ChunkGrid } from './chunkStore';
import type { AdaptiveTerrainData } from './adaptiveTerrain';

export interface TerrainDisplay { grid?: ChunkGrid; adaptive?: AdaptiveTerrainData }

/** A temporary regular-grid fallback does not satisfy an adaptive request. */
export function hasTerrainAuthority(display: TerrainDisplay | undefined, wantedLod: string,
  adaptiveEnabled: boolean): boolean {
  return adaptiveEnabled && wantedLod !== '1'
    ? display?.adaptive?.lod === wantedLod : display?.grid?.lod === wantedLod;
}

/** A decoded legacy cache entry must not replace the current adaptive mesh
 * after its arrival queue has been consumed. Retain the visible mesh until
 * the requested authority is actually ready, including during LOD changes. */
export function selectTerrainDisplay(previous: TerrainDisplay | undefined, wantedLod: string,
  adaptiveEnabled: boolean, ready: AdaptiveTerrainData | undefined, grid: ChunkGrid | undefined): TerrainDisplay | undefined {
  if (wantedLod !== '1' && ready?.lod === wantedLod) return { adaptive: ready };
  if (grid?.lod === wantedLod && (wantedLod === '1' || !adaptiveEnabled || !previous)) return { grid };
  return previous;
}
