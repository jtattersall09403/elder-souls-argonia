import type { WaterData } from '../waterData';
import type { BufferGeometry } from 'three';
import { marineNearBounds, marineSeamPatchSteps, type MarineSeamPatch } from './marineSeamPatch';
import type { RasterDomainBounds } from './rasterWaterDomain';

export interface MarinePublishedTile { tx: number; tz: number }
export interface MarineNearCandidate {
  key: string; x: number; z: number; widthM: number; depthM: number;
  geometry: BufferGeometry; seam: MarineSeamPatch;
}
export interface MarineSurfaceHooks {
  /** Actual displayed step1 source, including attributes; null until the
   * whole patch is resolved. Revision identifies only relevant source draws. */
  coarseSnapshot?: (bounds: RasterDomainBounds) => { revision: string | number; sources: readonly BufferGeometry[] } | null;
  /** Attach the already seam-validated geometry AND publish its ownership
   * mask in the same render transaction. Return false until upload is ready. */
  publishNear?: (candidate: MarineNearCandidate) => boolean;
  /** Clear its ownership mask and detach its mesh in the same transaction. */
  withdrawNear?: (candidate: MarineNearCandidate) => void;
  buildStepsPerUpdate?: number;
}

/** Native-data-only readiness and bounded near-geometry preparation. The
 * app still owns camera/scene activation; this controller does NOT certify
 * the old horizon's variable-stage geometry while coarse tiles are loading.
 * Coarse publications come from displayed merged batches, never load tasks.
 * No GPU allocations, readbacks, mutable globals or hidden frame callbacks. */
export class MarineSurfaceController {
  readonly enabled: boolean;
  private readonly coarseTileM: number;
  private readonly coarseLimit: number;
  private readonly batches = new Map<string, Set<string>>();
  private readonly coarseReferences = new Map<string, number>();
  private required = new Set<string>();
  private selection?: RasterDomainBounds;
  private desiredKey = '';
  private readonly candidates = new Map<string, MarineNearCandidate>();
  private readonly published = new Map<string, MarineNearCandidate>();
  private active?: { key: string; bounds: RasterDomainBounds; build: Generator<void, MarineSeamPatch> };
  private readonly stepsPerUpdate: number;
  private cancelled = 0;
  private disposed = false;
  private failedKey = '';
  private buildFailure: string | null = null;
  constructor(private readonly data: WaterData, private readonly hooks: MarineSurfaceHooks = {}) {
    this.enabled = data.meta.surface.nativeChannelCoverage === true;
    this.coarseTileM = data.meta.surface.metresPerPixel * 64;
    this.coarseLimit = Math.ceil(data.meta.surface.size / 64);
    if (!Number.isFinite(this.coarseTileM) || this.coarseTileM <= 0 || this.coarseLimit > 128)
      throw new RangeError('Marine readiness requires a bounded valid raster grid');
    if (!!hooks.publishNear !== !!hooks.withdrawNear) throw new Error('Marine publication and withdrawal hooks must be paired');
    if (hooks.buildStepsPerUpdate !== undefined && !Number.isFinite(hooks.buildStepsPerUpdate)) throw new RangeError('Invalid marine build step budget');
    this.stepsPerUpdate = Math.max(1, Math.min(32, Math.floor(hooks.buildStepsPerUpdate ?? 8)));
  }
  get diagnostics() { return { enabled: this.enabled, coarseTiles: this.coarseReferences.size, requiredCoarseTiles: this.required.size,
    readyForActivation: this.readyForActivation, preparedNearTiles: this.candidates.size, displayedNearTiles: this.published.size,
    pendingNearBuilds: this.desiredKey && !this.candidates.has(this.desiredKey) ? 1 : 0, activeBuild: !!this.active, cancelledBuilds: this.cancelled,
    buildFailure: this.buildFailure, preparedBytes: [...this.candidates.values()].reduce((sum, tile) => sum + tile.seam.diagnostics.bytes, 0) }; }
  get coarseGridSize(): number { return this.coarseLimit; }
  /** Call after coarse publication, not every frame. Values reflect only
   * displayed snapshots and fit the existing atlas auxiliary prefix. */
  fillCoarseMask(target: Float32Array): void {
    if (target.length !== this.coarseLimit ** 2) throw new RangeError('Marine coarse mask dimensions disagree with the raster');
    target.fill(0);
    for (const key of this.coarseReferences.keys()) {
      const [tx, tz] = key.split(',').map(Number); target[tz * this.coarseLimit + tx] = 1;
    }
  }
  get readyForActivation(): boolean {
    return this.enabled && !this.disposed && [...this.required].every(key => this.coarseReferences.has(key));
  }
  /** Read-only snapshots; renderer must not mutate prepared typed arrays. */
  get preparedNear(): readonly MarineNearCandidate[] { return [...this.candidates.values()]; }
  get displayedNear(): readonly MarineNearCandidate[] { return [...this.published.values()]; }

  private key(tile: MarinePublishedTile): string {
    if (!Number.isInteger(tile.tx) || !Number.isInteger(tile.tz) || tile.tx < 0 || tile.tz < 0
      || tile.tx >= this.coarseLimit || tile.tz >= this.coarseLimit) throw new RangeError('Invalid marine coarse tile');
    return `${tile.tx},${tile.tz}`;
  }
  /** Supply only required nonempty marine tiles, not known-dry tiles whose
   * empty geometry intentionally never appears in a displayed batch. */
  setRequiredCoarse(tiles: readonly MarinePublishedTile[]): void {
    if (tiles.length > this.coarseLimit ** 2) throw new RangeError('Marine required tiles exceed province bound');
    this.required = new Set(tiles.map(tile => this.key(tile)));
  }
  /** Direct adapter for InlandWaterTiles.onPublication. Replacing a batch
   * replaces exactly its displayed footprint; queued tiles confer no readiness. */
  publishCoarseBatch(batchId: string, tiles: readonly MarinePublishedTile[]): void {
    if (!this.enabled || this.disposed) return;
    if (!batchId || batchId.length > 128 || (!this.batches.has(batchId) && this.batches.size >= 1024)
      || tiles.length > this.coarseLimit ** 2) throw new RangeError('Marine publication exceeds bounded registry');
    const next = new Set(tiles.map(tile => this.key(tile)));
    const previous = this.batches.get(batchId);
    for (const key of previous ?? []) {
      const remaining = (this.coarseReferences.get(key) ?? 1) - 1;
      if (remaining) this.coarseReferences.set(key, remaining); else this.coarseReferences.delete(key);
    }
    for (const key of next) this.coarseReferences.set(key, (this.coarseReferences.get(key) ?? 0) + 1);
    if (next.size) this.batches.set(batchId, next); else this.batches.delete(batchId);
  }
  /** One native-aligned patch, with a full-detail6m ring plus bounded
   * transition/hysteresis. Coarse geometry stays displayed while preparing. */
  update(focusX: number, focusZ: number, nearEnabled = true): void {
    if (!nearEnabled) { this.clearNear(); return; }
    if (!this.enabled || this.disposed || !Number.isFinite(focusX) || !Number.isFinite(focusZ)) return;
    const mpp = this.data.meta.surface.metresPerPixel, margin = 6 + mpp;
    if (!this.selection || focusX - margin < this.selection.minX || focusX + margin > this.selection.maxX
      || focusZ - margin < this.selection.minZ || focusZ + margin > this.selection.maxZ)
      this.selection = marineNearBounds(focusX, focusZ, mpp);
    const bounds = this.selection, snapshot = this.hooks.coarseSnapshot?.(bounds);
    const key = snapshot ? `${bounds.minX},${bounds.minZ},${bounds.maxX},${bounds.maxZ}:${snapshot.revision}` : '';
    this.desiredKey = key;
    if (this.active && this.active.key !== key) { this.active.build.return(undefined as never); this.active = undefined; this.cancelled++; }
    for (const [previous, tile] of this.candidates) if (previous !== key) {
      // Keep the old displayed patch through a movement rebuild only while
      // its own coarse perimeter still exists unchanged. A new desired
      // rectangle is not evidence that the previous seam became invalid.
      const oldBounds = tile.seam.bounds;
      const oldSnapshot = snapshot && this.published.has(previous) ? this.hooks.coarseSnapshot?.(oldBounds) : null;
      if (oldSnapshot && previous === `${oldBounds.minX},${oldBounds.minZ},${oldBounds.maxX},${oldBounds.maxZ}:${oldSnapshot.revision}`) continue;
      if (this.published.has(previous)) { this.hooks.withdrawNear?.(tile); this.published.delete(previous); }
      tile.geometry.dispose(); this.candidates.delete(previous);
    }
    if (!snapshot || key === this.failedKey) return;
    for (let step = 0; step < this.stepsPerUpdate; step++) {
      if (!this.active) {
        if (this.candidates.has(key)) break;
        this.buildFailure = null;
        this.active = { key, bounds, build: marineSeamPatchSteps(this.data, snapshot.sources, bounds) };
      }
      let result: IteratorResult<void, MarineSeamPatch>;
      try { result = this.active.build.next(); }
      catch (error) { this.failedKey = key; this.buildFailure = error instanceof Error ? error.message : String(error); this.active = undefined; return; }
      if (result.done) {
        this.active = undefined;
        this.candidates.set(key, { key, x: bounds.minX, z: bounds.minZ, widthM: bounds.maxX - bounds.minX,
          depthM: bounds.maxZ - bounds.minZ, geometry: result.value.geometry, seam: result.value });
      }
    }
    const tile = this.candidates.get(key);
    if (tile && !this.published.has(key) && tile.geometry.index?.count && this.hooks.publishNear?.(tile)) {
      this.published.set(key, tile);
      // Attach the accepted replacement before retiring the old rectangle;
      // both mask mutations complete in this same synchronous update.
      for (const [previous, old] of this.candidates) if (previous !== key) {
        if (this.published.has(previous)) { this.hooks.withdrawNear?.(old); this.published.delete(previous); }
        old.geometry.dispose(); this.candidates.delete(previous);
      }
    }
  }
  /** Coarse residency remains intact. Used by fly mode and scene suspension. */
  clearNear(): void {
    if (this.active) { this.active.build.return(undefined as never); this.active = undefined; this.cancelled++; }
    for (const tile of this.published.values()) this.hooks.withdrawNear?.(tile);
    for (const tile of this.candidates.values()) tile.geometry.dispose();
    this.published.clear(); this.candidates.clear(); this.selection = undefined; this.desiredKey = '';
    this.failedKey = ''; this.buildFailure = null;
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.clearNear();
    this.batches.clear(); this.coarseReferences.clear(); this.required.clear();
  }
}
