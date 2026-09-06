import { Box3, Frustum, Matrix4, Vector3, type Camera } from 'three';
import type { ChunkMeta, ChunksManifest } from './chunkStore';
import type { AdaptiveTerrainChunk } from './adaptiveTerrain';
import { selectTerrainBankLod } from './terrainBankLod';
import { projectedTerrainBankView } from './projectedTerrainBankView';

export interface TerrainViewEntry { chunk: ChunkMeta; lod: string; }
export interface TerrainBankResidencyView {
  chunks: ReadonlyMap<string, AdaptiveTerrainChunk>;
  widthPx: number;
  heightPx: number;
}

/** Residency, not terrain simplification: never changes a selected mesh's
 * vertices or the native collider ring. Actual AABBs avoid sphere-culling's
 * large false positives on tall/narrow terrain chunks. */
export class TerrainViewResidency {
  private readonly frustum = new Frustum();
  private readonly matrix = new Matrix4();
  private readonly previousMatrix = new Matrix4().makeScale(0, 0, 0);
  private readonly scratch = new Box3();
  private readonly bounds: { chunk: ChunkMeta; box: Box3 }[];
  private entries: TerrainViewEntry[] = [];
  private retained = new Set<string>();
  private focusX = -1;
  private focusZ = -1;
  private previousBankChunks?: ReadonlyMap<string, AdaptiveTerrainChunk>;
  private widthPx = 0;
  private heightPx = 0;

  constructor(readonly manifest: ChunksManifest, private readonly verticalScale: number,
    private readonly options: { prefetchM?: number; retainM?: number; nearRing?: number } = {}) {
    if (!Number.isFinite(verticalScale) || verticalScale <= 0) throw new Error('Invalid terrain residency vertical scale');
    this.bounds = manifest.chunks.map(chunk => {
      const native = chunk.lods['1'];
      const lods = Object.values(chunk.lods);
      // Native bed overlay lowers at most 5 m; regular-grid skirts add 2.5 m.
      // Source extrema cover all LODs, including fallback meshes during swaps.
      const min = Math.min(...lods.map(lod => lod.minM)) - 7.5;
      const max = Math.max(...lods.map(lod => lod.maxM));
      return { chunk, box: new Box3(new Vector3(chunk.originM[0], min * verticalScale, chunk.originM[1]),
        new Vector3(chunk.originM[0] + (native.shape[1] - 1) * native.metresPerSample,
          max * verticalScale, chunk.originM[1] + (native.shape[0] - 1) * native.metresPerSample)).expandByScalar(0.01) };
    });
  }

  update(camera: Camera, focusX: number, focusZ: number, bankView?: TerrainBankResidencyView): readonly TerrainViewEntry[] {
    const cx = Math.max(0, Math.min(this.manifest.grid[0] - 1, Math.floor(focusX / this.manifest.chunkMetres)));
    const cz = Math.max(0, Math.min(this.manifest.grid[1] - 1, Math.floor(focusZ / this.manifest.chunkMetres)));
    camera.updateMatrixWorld();
    this.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const width = bankView?.widthPx ?? 0, height = bankView?.heightPx ?? 0;
    if (cx === this.focusX && cz === this.focusZ && this.matrix.equals(this.previousMatrix)
      && this.previousBankChunks === bankView?.chunks && this.widthPx === width && this.heightPx === height) return this.entries;
    this.previousMatrix.copy(this.matrix); this.focusX = cx; this.focusZ = cz;
    this.previousBankChunks = bankView?.chunks; this.widthPx = width; this.heightPx = height;
    this.frustum.setFromProjectionMatrix(this.matrix);
    const next: TerrainViewEntry[] = [];
    const keys = new Set<string>();
    for (const { chunk, box } of this.bounds) {
      const ring = Math.max(Math.abs(chunk.cx - cx), Math.abs(chunk.cy - cz));
      const key = `${chunk.cx},${chunk.cy}`;
      const margin = this.retained.has(key) ? this.options.retainM ?? 128 : this.options.prefetchM ?? 64;
      if (ring > (this.options.nearRing ?? 2) && !this.frustum.intersectsBox(this.scratch.copy(box).expandByScalar(margin))) continue;
      keys.add(key);
      let lod = ring <= 1 ? '1' : ring <= 3 ? '2' : '4';
      const bankChunk = bankView?.chunks.get(key);
      if (lod === '4' && bankChunk) {
        const error = Math.max(0, ...Object.values(bankChunk.lods).map(asset => asset.maximumBankErrorM ?? 0));
        lod = selectTerrainBankLod(bankChunk, lod, projectedTerrainBankView(box, camera, width, height, error, this.verticalScale));
      }
      next.push({ chunk, lod });
    }
    next.sort((a, b) => Math.max(Math.abs(a.chunk.cx - cx), Math.abs(a.chunk.cy - cz))
      - Math.max(Math.abs(b.chunk.cx - cx), Math.abs(b.chunk.cy - cz))
      || a.chunk.cy - b.chunk.cy || a.chunk.cx - b.chunk.cx);
    this.retained = keys;
    if (next.length !== this.entries.length || next.some((entry, i) => entry.chunk !== this.entries[i].chunk || entry.lod !== this.entries[i].lod)) this.entries = next;
    return this.entries;
  }
}
