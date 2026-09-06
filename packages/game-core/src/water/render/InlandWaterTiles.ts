import * as THREE from "three";
import type { WaterData, WaterBoundaryStaticSample } from "../waterData";
import type { ChannelRibbonFootprintTriangle } from "../channelRibbons";
import { subtractRibbonFootprintSteps } from "./ribbonFootprint";
import { rasterDomainAxis, rasterDomainCells, rasterDomainVertex, type RasterDomainCell, type RasterDomainBounds } from "./rasterWaterDomain";
import { inlandBatchBudget } from "./inlandBatchBudget";
import { inlandAdaptiveLeavesSteps, inlandPotentiallyWet, rasterWaterClassInDomain, type InlandStageRange, type RasterWaterDomain } from "./inlandAdaptiveLeaves";
import { waterPatchDistance, waterPatchErrorM, waterPatchVisible, type WaterGeometryView } from "./waterStreaming";

export interface InlandWaterBudget {
  maxTriangles?: number;
  maxGeometryBytes?: number;
  buildsPerUpdate?: number;
  buildBudgetMs?: number;
  stage?: InlandStageRange;
  domain?: RasterWaterDomain;
  /** Fires only after the displayed batch changes, never on tile admission. */
  onPublication?: (batchId: string, tiles: readonly { tx: number; tz: number }[]) => void;
}
interface TileTask { key: string; tx: number; tz: number; step: number; priority: number; errorM: number; subpixelM: number }

/** Fixed world-aligned inland tiles. A triangle never joins separate bodies;
 * camera motion cannot stretch a river into the neighbouring lake or bank.
 * The ocean keeps its separate camera-centred horizon grid. */
export class InlandWaterTiles {
  readonly group = new THREE.Group();
  readonly meshes: THREE.Mesh[] = [];
  private tiles = new Map<string, THREE.Mesh>();
  private focus = "";
  private pending: TileTask[] = [];
  private active?: { task: TileTask; build: Generator<void, THREE.Mesh> };
  private readonly dirtyBatches = new Set<string>();
  private merging?: { key: string; build: Generator<void, THREE.BufferGeometry>; bounds: THREE.Box3; tiles: { tx: number; tz: number; step: number; generation: number }[] };
  private publicationVersion = 0;
  private sourceVersion = 0;
  private batches = new Map<string, THREE.Mesh>();
  private verticalScale = NaN;
  private viewKey = "";
  private readonly maxTriangles: number;
  private readonly maxGeometryBytes: number;
  private readonly buildsPerUpdate: number;
  private residentTriangles = 0;
  private residentBytes = 0;
  private builtLastUpdate = 0;
  private budgetFailures = 0;
  private readonly buildBudgetMs: number;
  private atomicStepsLastUpdate = 0;
  private maxAtomicWorkMs = 0;
  private atomicPhase = "idle";
  private maxAtomicWorkPhase = "idle";
  private buildWorkMs = 0;
  private updateWorkMs = 0;
  private cancelledBuilds = 0;
  private readonly stage?: InlandStageRange;
  private readonly domain: RasterWaterDomain;
  private readonly onPublication?: InlandWaterBudget['onPublication'];
  constructor(private readonly data: WaterData, private readonly low = false, budget: InlandWaterBudget = {}) {
    this.maxTriangles = budget.maxTriangles ?? 1000000;
    this.maxGeometryBytes = budget.maxGeometryBytes ?? (low ? 64 : 96) * 1024 * 1024;
    this.buildsPerUpdate = Math.max(1, Math.min(4, budget.buildsPerUpdate ?? 2));
    this.buildBudgetMs = Math.max(0.1, Math.min(2, budget.buildBudgetMs ?? 2));
    this.stage = budget.stage;
    this.domain = budget.domain ?? 'inland';
    this.onPublication = budget.onPublication;
  }

  get diagnostics() { return { residentTiles: this.tiles.size, residentTriangles: this.residentTriangles,
    residentGeometryBytes: this.residentBytes, pendingTiles: this.pending.length + (this.active ? 1 : 0) + this.dirtyBatches.size + (this.merging ? 1 : 0), builtLastUpdate: this.builtLastUpdate,
    drawBatches: this.meshes.length, budgetFailures: this.budgetFailures, atomicStepsLastUpdate: this.atomicStepsLastUpdate,
    maxAtomicWorkMs: this.maxAtomicWorkMs, maxAtomicWorkPhase: this.maxAtomicWorkPhase,
    buildWorkMs: this.buildWorkMs, updateWorkMs: this.updateWorkMs, cancelledBuilds: this.cancelledBuilds }; }

  private recordAtomic(start: number): void {
    const elapsed = performance.now() - start;
    if (elapsed > this.maxAtomicWorkMs) { this.maxAtomicWorkMs = elapsed; this.maxAtomicWorkPhase = this.atomicPhase; }
    this.atomicStepsLastUpdate++;
  }

  /** Reserve source arrays plus the actual promoted batch/index layout,
   * not twice source bytes (mixed batches can have a larger GPU stride). */
  private batchReservation(key: string, omit?: THREE.Mesh, insert?: THREE.Mesh): number {
    const sources = [...this.tiles.values()].filter(tile => tile !== omit && tile.userData.waterBatch === key && (tile.geometry.index?.count ?? 0) > 0).map(tile => tile.geometry);
    if (insert && (insert.geometry.index?.count ?? 0) > 0) sources.push(insert.geometry);
    return inlandBatchBudget(sources).totalBytes;
  }

  /** A near overlay may copy only displayed, native-step coarse triangles.
   * Pending replacement/source geometries confer no seam or readiness proof. */
  displayedSnapshot(bounds: RasterDomainBounds): { revision: string; sources: THREE.BufferGeometry[] } | null {
    const tileM = 64 * this.data.meta.surface.metresPerPixel, limit = Math.ceil(this.data.meta.surface.size / 64);
    if (!Object.values(bounds).every(Number.isFinite) || bounds.maxX <= bounds.minX || bounds.maxZ <= bounds.minZ
      || bounds.maxX - bounds.minX > tileM * 2 || bounds.maxZ - bounds.minZ > tileM * 2) return null;
    const wanted = new Set<string>();
    for (let tz = Math.floor(bounds.minZ / tileM); tz < Math.ceil(bounds.maxZ / tileM); tz++)
      for (let tx = Math.floor(bounds.minX / tileM); tx < Math.ceil(bounds.maxX / tileM); tx++) {
        if (tx < 0 || tz < 0 || tx >= limit || tz >= limit) return null;
        wanted.add(`${tx},${tz}`);
      }
    const sources: THREE.BufferGeometry[] = [], revisions: string[] = [];
    for (const batch of this.batches.values()) {
      let relevant = false;
      for (const tile of (batch.userData.waterTiles ?? []) as { tx: number; tz: number; step: number; generation: number }[]) {
        const id = `${tile.tx},${tile.tz}`;
        if (!wanted.has(id)) continue;
        if (tile.step !== 1) return null;
        wanted.delete(id); relevant = true; revisions.push(`${id}:${tile.generation}`);
      }
      if (relevant) sources.push(batch.geometry);
    }
    return wanted.size || !sources.length ? null : { revision: revisions.sort().join('|'), sources };
  }

  update(x: number, z: number, material: THREE.Material, verticalScale = 1, view?: WaterGeometryView): void {
    const updateBegan = performance.now();
    const changedBatches = this.dirtyBatches;
    this.builtLastUpdate = 0;
    this.atomicStepsLastUpdate = 0;
    const scale = Number.isFinite(verticalScale) && verticalScale > 0 ? verticalScale : 1;
    const mpp = this.data.meta.surface.metresPerPixel;
    const tileM = 64 * mpp;
    const cx = Math.floor(x / tileM), cz = Math.floor(z / tileM);
    const focus = `${cx},${cz}`;
    // View changes select resident geometry, not just GPU visibility. A
    // coarse angular key avoids rebuilding queues for subpixel mouse motion.
    const viewKey = view?.frustum ? view.frustum.planes.map(p => `${Math.round(p.normal.x * 24)},${Math.round(p.normal.y * 24)},${Math.round(p.normal.z * 24)},${Math.round(p.constant / tileM)}`).join(";")
      + `:${Math.round(view.position.y / 32)}:${Math.round(view.pixelsPerRadian / 100)}` : "all";
    if (focus !== this.focus || viewKey !== this.viewKey || scale !== this.verticalScale) {
      this.focus = focus;
      this.viewKey = viewKey;
      this.pending = [];
      const limit = Math.ceil(this.data.meta.surface.size / 64);
      // Visit the bounded metadata grid, but admit geometry only inside the
      // conservative view / near buffer. The marine mesh cannot substitute
      // for visible distant lakes; off-camera province geometry is not needed.
      for (let tz = 0; tz < limit; tz++) for (let tx = 0; tx < limit; tx++) {
        const key = `${tx},${tz}`;
        const current = this.tiles.get(key);
        const bounds = current ? (current.userData.waterBounds as THREE.Box3).clone()
          : new THREE.Box3(new THREE.Vector3(tx * tileM, this.data.meta.surface.minM, tz * tileM),
            new THREE.Vector3((tx + 1) * tileM, this.data.meta.surface.maxM, (tz + 1) * tileM));
        bounds.min.y = (bounds.min.y - 8) * scale; bounds.max.y = (bounds.max.y + 8) * scale;
        const radius = Math.max(Math.abs(tx - cx), Math.abs(tz - cz));
        const visible = waterPatchVisible(bounds.clone().expandByScalar(tileM), view);
        if (view && radius > 2 && !visible) {
          if (current) {
            this.residentTriangles -= (current.geometry.index?.count ?? 0) / 3;
            this.residentBytes += this.batchReservation(current.userData.waterBatch, current) - this.batchReservation(current.userData.waterBatch);
            changedBatches.add(current.userData.waterBatch);
            current.geometry.dispose(); this.tiles.delete(key);
          }
          continue;
        }
        const step = radius <= 1 ? 1 : !visible ? 32 : radius <= 3 ? 2 : radius <= 7 ? (this.low ? 8 : 4) : radius <= 12 ? 8 : 16;
        const errorM = waterPatchErrorM(bounds, view, scale);
        const errorTier = Math.max(0, Math.floor(Math.log2(errorM / 0.04)));
        if (current?.userData.waterStep !== step || current?.userData.errorTier !== errorTier) {
          const distance = view ? waterPatchDistance(bounds, view) : radius * tileM;
          this.pending.push({ key, tx, tz, step, priority: (radius <= 1 ? -2 : visible ? -1 : 0) * 1e7 + distance,
            errorM, subpixelM: view ? distance * 0.35 / Math.max(view.pixelsPerRadian, 1) : 0 });
        }
      }
      this.pending.sort((a, b) => a.priority - b.priority);
      if (this.active) {
        const task = this.pending.find(task => task.key === this.active!.task.key);
        // A stricter in-flight mesh remains valid when the view relaxes its
        // target. Exact floating-point equality starved builds while turning.
        if (!task || this.active.task.step > task.step || this.active.task.errorM > task.errorM
          || this.active.task.subpixelM > task.subpixelM) {
          this.active.build.return(undefined as never); this.active = undefined; this.cancelledBuilds++;
        } else this.pending = this.pending.filter(task => task.key !== this.active!.task.key);
      }
      // A merge holds source arrays. Cancel before any changed source can be
      // disposed; the last displayed batch remains valid until replacement.
      if (this.merging && changedBatches.has(this.merging.key)) {
        this.merging.build.return(undefined as never); changedBatches.add(this.merging.key); this.merging = undefined;
      }
    }
    // The same deterministic construction runs as small resumable units.
    // Complete a changed draw batch before admitting another tile so its
    // source arrays cannot change underneath an in-progress copy.
    const began = performance.now();
    while (performance.now() - began < this.buildBudgetMs) {
      if (!this.merging && changedBatches.size) {
        const key = changedBatches.values().next().value!; changedBatches.delete(key);
        const tiles = [...this.tiles.values()].filter(tile => tile.userData.waterBatch === key && (tile.geometry.index?.count ?? 0) > 0);
        if (!tiles.length) {
          const batch = this.batches.get(key);
          if (batch) { batch.geometry.dispose(); this.group.remove(batch); this.batches.delete(key); this.onPublication?.(key, []); }
          continue;
        }
        const bounds = new THREE.Box3(); for (const tile of tiles) bounds.union(tile.userData.waterBounds);
        this.merging = { key, bounds, build: this.mergeSteps(tiles.map(tile => tile.geometry)), tiles: tiles.map(tile => ({ ...tile.userData.waterTile, step: tile.userData.waterStep })) };
      }
      if (this.merging) {
        this.atomicPhase = "batch-copy";
        const atomic = performance.now(), result = this.merging.build.next(); this.recordAtomic(atomic);
        if (!result.done) continue;
        const { key, bounds, tiles } = this.merging; this.merging = undefined;
        let batch = this.batches.get(key);
        if (batch) { batch.geometry.dispose(); batch.geometry = result.value; }
        else { batch = new THREE.Mesh(result.value, material); batch.frustumCulled = true; batch.layers.set(3); batch.receiveShadow = true;
          this.group.add(batch); this.batches.set(key, batch); }
        batch.userData.waterBounds = bounds; batch.userData.boundsDirty = true;
        batch.userData.waterTiles = tiles; batch.userData.waterRevision = ++this.publicationVersion;
        this.onPublication?.(key, tiles);
        continue;
      }
      if (!this.active) {
        if (!this.pending.length || this.builtLastUpdate >= this.buildsPerUpdate) break;
        const task = this.pending.shift()!;
        this.active = { task, build: this.build(task.tx, task.tz, task.step, material, task.errorM, task.subpixelM) };
      }
      const atomic = performance.now(), result = this.active.build.next();
      this.recordAtomic(atomic);
      if (!result.done) continue;
      const task = this.active.task, mesh = result.value; this.active = undefined; this.builtLastUpdate++;
      const previous = this.tiles.get(task.key), previousTriangles = (previous?.geometry.index?.count ?? 0) / 3;
      const previousBytes = this.batchReservation(mesh.userData.waterBatch);
      const triangles = (mesh.geometry.index?.count ?? 0) / 3, bytes = this.batchReservation(mesh.userData.waterBatch, previous, mesh);
      if (this.residentTriangles - previousTriangles + triangles > this.maxTriangles || this.residentBytes - previousBytes + bytes > this.maxGeometryBytes) {
        mesh.geometry.dispose(); this.budgetFailures++; continue;
      }
      this.residentTriangles += triangles - previousTriangles; this.residentBytes += bytes - previousBytes;
      previous?.geometry.dispose(); this.tiles.set(task.key, mesh); changedBatches.add(mesh.userData.waterBatch);
    }
    this.buildWorkMs = performance.now() - began;
    // At most64 fixed 4x4-tile groups for the shipped32x32 province. Only
    // touched groups upload geometry; camera culling never changes physics.
    this.meshes.splice(0, this.meshes.length, ...this.batches.values());
    for (const batch of this.batches.values()) {
      batch.material = material;
      if (batch.userData.boundsDirty || scale !== this.verticalScale) {
        const box = (batch.userData.waterBounds as THREE.Box3).clone();
        box.min.y = (box.min.y - 8) * scale;
        box.max.y = (box.max.y + 8) * scale;
        batch.geometry.boundingBox = box;
        batch.geometry.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
        batch.userData.boundsDirty = false;
      }
    }
    this.verticalScale = scale;
    this.updateWorkMs = performance.now() - updateBegan;
  }

  private *build(tx: number, tz: number, requestedStep: number, material: THREE.Material, errorM = 0.04, subpixelM = 0): Generator<void, THREE.Mesh> {
    const step = requestedStep;
    this.atomicPhase = "native-samples-and-leaves";
    const leaves = yield* inlandAdaptiveLeavesSteps(this.data, tx, tz, requestedStep, errorM, subpixelM, this.stage, this.domain);
    const mpp = this.data.meta.surface.metresPerPixel;
    const baseX = tx * 64 * mpp, baseZ = tz * 64 * mpp;
    const cells = 64 / step;
    const span = step * mpp;
    const positions: number[] = [];
    let minimumHeight = Infinity, maximumHeight = -Infinity;
    const includeHeight = (x: number, z: number) => {
      // Raster vertices intentionally exclude the native ribbon override.
      // Keep its true shader W while building, never resample on merge.
      const height = this.data.surfaceBase(Math.fround(x), Math.fround(z));
      minimumHeight = Math.min(minimumHeight, height); maximumHeight = Math.max(maximumHeight, height);
    };
    const body: (string | null)[] = [], wet: boolean[] = [];
    const footprintsM: number[] = [];
    let activeFootprintM = mpp;
    const explicit: ({ sample: WaterBoundaryStaticSample; owner: number; sampleX: number; sampleZ: number } | undefined)[] = [];
    const sampleScratch: WaterBoundaryStaticSample = { surfaceBase: 0, depthProxy: 0,
      tideResponse: 0, seasonResponse: 0, supported: false, waterBodyId: null };
    const vertices = new Map<string, number>();
    const vertex = (x: number, z: number): number => {
      const key = `${x},${z}`;
      const existing = vertices.get(key);
      if (existing !== undefined) { footprintsM[existing] = Math.max(footprintsM[existing], activeFootprintM); return existing; }
      const i = body.length, sample = this.data.boundaryAt(x, z, sampleScratch, false);
      includeHeight(x, z);
      positions.push(x, 0, z); body.push(sample.waterBodyId);
      footprintsM[i] = activeFootprintM;
      wet.push(inlandPotentiallyWet(sample, this.stage) && rasterWaterClassInDomain(this.data.rasterClassAt(x, z), this.domain));
      vertices.set(key, i);
      return i;
    };
    const domainVertex = (cell: RasterDomainCell, x: number, z: number): number => {
      const key = `domain:${cell.bodyIndex}:${cell.classIndex}:${Math.fround(x)},${Math.fround(z)}`;
      const existing = vertices.get(key); if (existing !== undefined) { footprintsM[existing] = Math.max(footprintsM[existing], activeFootprintM); return existing; }
      const v = rasterDomainVertex(this.data, cell, x, z);
      const i = body.length;
      positions.push(v.x, 0, v.z); body.push(v.sample.waterBodyId);
      footprintsM[i] = activeFootprintM;
      wet.push(inlandPotentiallyWet(v.sample, this.stage));
      explicit[i] = { sample: v.sample, owner: cell.bodyIndex, sampleX: v.sampleX, sampleZ: v.sampleZ };
      minimumHeight = Math.min(minimumHeight, v.sample.surfaceBase); maximumHeight = Math.max(maximumHeight, v.sample.surfaceBase);
      vertices.set(key, i); return i;
    };
    // Index only the native footprints touching this tile. Per-cell lists
    // avoid scanning all province ribbons for every raster triangle.
    const clips = new Map<number, ChannelRibbonFootprintTriangle[]>();
    this.atomicPhase = "footprint-query";
    const footprints = this.data.ribbons.ownershipFootprintsInBounds(baseX, baseZ, baseX + 64 * mpp, baseZ + 64 * mpp);
    yield;
    this.atomicPhase = "footprint-index";
    let indexed = 0;
    for (const clip of footprints) {
      const minCol = Math.max(0, Math.floor((Math.min(clip.a.x, clip.b.x, clip.c.x) - baseX) / span));
      const maxCol = Math.min(cells - 1, Math.floor((Math.max(clip.a.x, clip.b.x, clip.c.x) - baseX) / span));
      const minRow = Math.max(0, Math.floor((Math.min(clip.a.z, clip.b.z, clip.c.z) - baseZ) / span));
      const maxRow = Math.min(cells - 1, Math.floor((Math.max(clip.a.z, clip.b.z, clip.c.z) - baseZ) / span));
      for (let row = minRow; row <= maxRow; row++) for (let col = minCol; col <= maxCol; col++) {
        const key = row * cells + col, list = clips.get(key);
        if (list) list.push(clip); else clips.set(key, [clip]);
        if ((++indexed & 63) === 0) yield;
      }
    }
    const indices: number[] = [];
    const triangle = function* (a: number, b: number, c: number, cutters?: ChannelRibbonFootprintTriangle[]): Generator<void> {
      if (!(wet[a] || wet[b] || wet[c]) || body[a] !== body[b] || body[b] !== body[c]) return;
      if (!cutters?.length) { indices.push(a, b, c); return; }
      const polygons = yield* subtractRibbonFootprintSteps([a, b, c].map(i => ({ x: positions[i * 3], z: positions[i * 3 + 2] })), cutters);
      for (const polygon of polygons) {
        // Clipped points retain the original triangle's domain. Sampling
        // the exact boundary would select the ribbon we just removed.
        const polygonIndices = polygon.map(point => {
          const index = body.length;
          includeHeight(point.x, point.z);
          positions.push(point.x, 0, point.z); body.push(body[a]); wet.push(wet[a] || wet[b] || wet[c]);
          footprintsM[index] = Math.max(footprintsM[a], footprintsM[b], footprintsM[c]);
          if (explicit[a]) {
            // Clipping preserves the parent rendered plane and coefficients;
            // resampling an exact owner edge would borrow the other domain.
            const ax = positions[a * 3], az = positions[a * 3 + 2], bx = positions[b * 3], bz = positions[b * 3 + 2], cx = positions[c * 3], cz = positions[c * 3 + 2];
            const determinant = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
            const u = ((bz - cz) * (point.x - cx) + (cx - bx) * (point.z - cz)) / determinant;
            const v = ((cz - az) * (point.x - cx) + (ax - cx) * (point.z - cz)) / determinant;
            const weights = [u, v, 1 - u - v], sources = [a, b, c].map(i => explicit[i]!.sample);
            const lerp = (field: 'surfaceBase' | 'depthProxy' | 'tideResponse' | 'seasonResponse') => sources.reduce((sum, s, i) => sum + s[field] * weights[i], 0);
            const fields = [a, b, c].map(i => explicit[i]!);
            explicit[index] = { owner: explicit[a]!.owner, sampleX: fields.reduce((sum, f, i) => sum + f.sampleX * weights[i], 0), sampleZ: fields.reduce((sum, f, i) => sum + f.sampleZ * weights[i], 0), sample: { ...sources[0], surfaceBase: lerp('surfaceBase'), depthProxy: lerp('depthProxy'), tideResponse: lerp('tideResponse'), seasonResponse: lerp('seasonResponse') } };
          }
          return index;
        });
        for (let i = 1; i < polygonIndices.length - 1; i++) indices.push(polygonIndices[0], polygonIndices[i], polygonIndices[i + 1]);
        yield;
      }
    };
    const horizontal = new Map<number, Set<number>>(), vertical = new Map<number, Set<number>>();
    const partitions = new Map<typeof leaves[number], RasterDomainCell[]>();
    this.atomicPhase = "leaf-edges";
    let edgeCount = 0;
    const add = (map: Map<number, Set<number>>, key: number, value: number) => {
      let line = map.get(key); if (!line) { line = new Set(); map.set(key, line); } line.add(value);
    };
    for (const leaf of leaves) {
      for (const x of [leaf.x, leaf.x + leaf.step]) for (const z of [leaf.z, leaf.z + leaf.step]) {
        add(horizontal, z, x); add(vertical, x, z);
      }
      const minX = baseX + leaf.x * mpp, minZ = baseZ + leaf.z * mpp, maxX = minX + leaf.step * mpp, maxZ = minZ + leaf.step * mpp;
      // Exact hydraulic domains are an explicit compiled-data contract.
      // Legacy exports interpolate one continuous raster across IDs; giving
      // only their renderer discrete domains would disagree with physics.
      if (leaf.partition && this.data.meta.surface.nativeChannelCoverage) {
        const domainCells: RasterDomainCell[] = [];
        for (const cell of rasterDomainCells(this.data, { minX, minZ, maxX, maxZ })) {
          domainCells.push(cell);
          for (const x of [cell.minX, cell.maxX]) {
            if (cell.minZ === minZ) add(horizontal, leaf.z, (x - baseX) / mpp);
            if (cell.maxZ === maxZ) add(horizontal, leaf.z + leaf.step, (x - baseX) / mpp);
          }
          for (const z of [cell.minZ, cell.maxZ]) {
            if (cell.minX === minX) add(vertical, leaf.x, (z - baseZ) / mpp);
            if (cell.maxX === maxX) add(vertical, leaf.x + leaf.step, (z - baseZ) / mpp);
          }
          yield;
        }
        partitions.set(leaf, domainCells);
      }
      if ((++edgeCount & 7) === 0) yield;
    }
    for (let i = 0; i <= 64; i++) { add(horizontal, 0, i); add(horizontal, 64, i); add(vertical, 0, i); add(vertical, 64, i); }
    if (this.data.meta.surface.nativeChannelCoverage) {
      // Adjacent tiles must share partition knots even when only one has
      // a boundary leaf; otherwise waves open cross-tile T-junctions.
      for (const x of rasterDomainAxis(this.data, baseX, baseX + 64 * mpp)) {
        add(horizontal, 0, (x - baseX) / mpp); add(horizontal, 64, (x - baseX) / mpp);
      }
      for (const z of rasterDomainAxis(this.data, baseZ, baseZ + 64 * mpp)) {
        add(vertical, 0, (z - baseZ) / mpp); add(vertical, 64, (z - baseZ) / mpp);
      }
    }
    let leafCount = 0;
    for (const leaf of leaves) {
      this.atomicPhase = "leaf-clip";
      activeFootprintM = leaf.step * mpp;
      if ((++leafCount & 15) === 0) yield;
      const x0 = baseX + leaf.x * mpp, z0 = baseZ + leaf.z * mpp;
      const x1 = baseX + (leaf.x + leaf.step) * mpp, z1 = baseZ + (leaf.z + leaf.step) * mpp;
      const cutters = clips.get(Math.floor(leaf.z / step) * cells + Math.floor(leaf.x / step));
      const partition = partitions.get(leaf);
      if (partition) {
        for (const cell of partition) {
          if (!cell.sample.supported || !cell.sample.waterBodyId || !rasterWaterClassInDomain(cell.classIndex, this.domain)) { yield; continue; }
          const a = domainVertex(cell, cell.minX, cell.minZ), b = domainVertex(cell, cell.minX, cell.maxZ);
          const c = domainVertex(cell, cell.maxX, cell.minZ), d = domainVertex(cell, cell.maxX, cell.maxZ);
          yield* triangle(a, b, c, cutters); yield* triangle(c, b, d, cutters); yield;
        }
        continue;
      }
      const edgePoints = (map: Map<number, Set<number>>, key: number, start: number, end: number) =>
        [...map.get(key)!].filter(v => v >= start && v <= end).sort((a, b) => a - b);
      const left = edgePoints(vertical, leaf.x, leaf.z, leaf.z + leaf.step);
      const bottom = edgePoints(horizontal, leaf.z + leaf.step, leaf.x, leaf.x + leaf.step);
      const right = edgePoints(vertical, leaf.x + leaf.step, leaf.z, leaf.z + leaf.step).reverse();
      const top = edgePoints(horizontal, leaf.z, leaf.x, leaf.x + leaf.step).reverse();
      if (left.length + bottom.length + right.length + top.length === 8) {
        const a = vertex(x0, z0), b = vertex(x0, z1), c = vertex(x1, z0), d = vertex(x1, z1);
        yield* triangle(a, b, c, cutters); yield* triangle(c, b, d, cutters);
      } else {
        // Every tile perimeter has native-step vertices, regardless of its
        // interior LOD. Adjacent edges therefore sample identical waves and
        // base heights, including while an old LOD awaits replacement.
        const perimeter: number[] = [];
        for (const z of left.slice(0, -1)) perimeter.push(vertex(x0, baseZ + z * mpp));
        for (const x of bottom.slice(0, -1)) perimeter.push(vertex(baseX + x * mpp, z1));
        for (const z of right.slice(0, -1)) perimeter.push(vertex(x1, baseZ + z * mpp));
        for (const x of top.slice(0, -1)) perimeter.push(vertex(baseX + x * mpp, z0));
        const center = vertex((x0 + x1) / 2, (z0 + z1) / 2);
        for (let i = 0; i < perimeter.length; i++) yield* triangle(center, perimeter[i], perimeter[(i + 1) % perimeter.length], cutters);
      }
    }
    // Raster vertices carry no per-vertex override and start with an up
    // normal. Byte attributes encode those exact constants; duplicated
    // Float32 zero vectors previously dominated persistent far-water memory.
    const remap = new Int32Array(body.length).fill(-1), usedPositions: number[] = [], usedSource: number[] = [];
    this.atomicPhase = "compact-vertices";
    const compactIndices: number[] = [];
    for (let i = 0; i < indices.length; i++) {
      const index = indices[i];
      if (remap[index] < 0) {
        remap[index] = usedPositions.length / 3;
        usedPositions.push(positions[index * 3], 0, positions[index * 3 + 2]);
        usedSource.push(index);
      }
      compactIndices.push(remap[index]);
      if ((i & 255) === 255) yield;
    }
    const count = usedPositions.length / 3, normals = new Int8Array(count * 3);
    for (let i = 1; i < normals.length; i += 3) { normals[i] = 127; if (i % 768 === 1) yield; }
    const geometry = new THREE.BufferGeometry();
    this.atomicPhase = "tile-buffer-finalize";
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(usedPositions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3, true));
    const enhanced = usedSource.some(i => explicit[i] !== undefined);
    const overrides = enhanced ? new Float32Array(count * 4) : new Int8Array(count * 4);
    if (this.domain === 'marine') for (let i = 3; i < overrides.length; i += 4) overrides[i] = -2;
    geometry.setAttribute("waterOverride", new THREE.BufferAttribute(overrides, 4));
    if (this.domain === 'marine') {
      const footprints = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        const x = usedPositions[i * 3], z = usedPositions[i * 3 + 2];
        // Tile borders always use the shared native lattice, independent
        // of either tile's current interior LOD or replacement timing.
        const border = Math.fround(x) === Math.fround(baseX) || Math.fround(x) === Math.fround(baseX + 64 * mpp)
          || Math.fround(z) === Math.fround(baseZ) || Math.fround(z) === Math.fround(baseZ + 64 * mpp);
        footprints[i] = border ? mpp : footprintsM[usedSource[i]];
      }
      geometry.setAttribute('waterCellSize', new THREE.BufferAttribute(footprints, 1));
    }
    if (enhanced) {
      const levels = new Float32Array(count * 3), grounds = new Float32Array(count), owners = new Uint16Array(count);
      for (let i = 0; i < count; i++) {
        const field = explicit[usedSource[i]];
        if (field) {
          overrides[i * 4] = this.domain === 'marine' ? 0 : field.sample.surfaceBase;
          overrides[i * 4 + 1] = field.sampleX; overrides[i * 4 + 2] = field.sampleZ;
          levels.set([field.sample.tideResponse, field.sample.seasonResponse, 1], i * 3);
          grounds[i] = field.sample.surfaceBase - field.sample.depthProxy; owners[i] = field.owner;
        }
        if ((i & 255) === 255) yield;
      }
      geometry.setAttribute('waterLevelResponse', new THREE.BufferAttribute(levels, 3));
      geometry.setAttribute('waterGround', new THREE.BufferAttribute(grounds, 1));
      geometry.setAttribute('waterBodyIndex', new THREE.BufferAttribute(owners, 1));
    }
    geometry.setIndex(compactIndices);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.waterStep = requestedStep;
    mesh.userData.waterTile = { tx, tz, generation: ++this.sourceVersion };
    mesh.userData.effectiveWaterStep = Math.min(requestedStep, ...leaves.map(leaf => leaf.step));
    mesh.userData.errorTier = Math.max(0, Math.floor(Math.log2(errorM / 0.04)));
    mesh.userData.waterBatch = `${Math.floor(tx / 4)},${Math.floor(tz / 4)}`;
    mesh.userData.waterBounds = new THREE.Box3(
      new THREE.Vector3(Math.min(baseX, Math.fround(baseX)), minimumHeight, Math.min(baseZ, Math.fround(baseZ))),
      new THREE.Vector3(Math.max(baseX + 64 * mpp, Math.fround(baseX + 64 * mpp)), maximumHeight,
        Math.max(baseZ + 64 * mpp, Math.fround(baseZ + 64 * mpp))));
    // Shader sets elevations; CPU bounding box would otherwise lie at sea level.
    mesh.frustumCulled = false; mesh.layers.set(3); mesh.receiveShadow = true;
    return mesh;
  }
  /** Fixed attribute layout; copy at most4096 scalar values per step.
   * The outgoing GPU buffer is untouched throughout construction. */
  private *mergeSteps(sources: THREE.BufferGeometry[]): Generator<void, THREE.BufferGeometry> {
    const count = sources.reduce((sum, geometry) => sum + geometry.getAttribute("position").count, 0);
    const indexCount = sources.reduce((sum, geometry) => sum + geometry.index!.count, 0);
    const position = new Float32Array(count * 3); yield;
    const normal = new Int8Array(count * 3); yield;
    const enhanced = sources.some(source => source.hasAttribute('waterLevelResponse'));
    const override = enhanced ? new Float32Array(count * 4) : new Int8Array(count * 4); yield;
    const levels = enhanced ? new Float32Array(count * 3) : undefined; yield;
    const ground = enhanced ? new Float32Array(count) : undefined; yield;
    const owner = enhanced ? new Uint16Array(count) : undefined; yield;
    const footprint = sources.some(source => source.hasAttribute('waterCellSize')) ? new Float32Array(count) : undefined; yield;
    const indices = count > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount); yield;
    let vertices = 0, cursor = 0;
    for (const source of sources) {
      for (const [name, target, width] of [["position", position, 3], ["normal", normal, 3], ["waterOverride", override, 4]] as const) {
        const values = source.getAttribute(name).array;
        for (let i = 0; i < values.length; i += 4096) {
          target.set(values.subarray(i, Math.min(values.length, i + 4096)), vertices * width + i); yield;
        }
      }
      for (const [name, target, width] of [['waterLevelResponse', levels, 3], ['waterGround', ground, 1], ['waterBodyIndex', owner, 1], ['waterCellSize', footprint, 1]] as const) {
        if (!target || !source.hasAttribute(name)) continue;
        const values = source.getAttribute(name).array;
        for (let i = 0; i < values.length; i += 4096) {
          target.set(values.subarray(i, Math.min(values.length, i + 4096)), vertices * width + i); yield;
        }
      }
      const input = source.index!.array;
      for (let i = 0; i < input.length; i++) {
        indices[cursor++] = input[i] + vertices;
        if ((i & 1023) === 1023) yield;
      }
      vertices += source.getAttribute("position").count;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(normal, 3, true));
    geometry.setAttribute("waterOverride", new THREE.BufferAttribute(override, 4));
    if (footprint) geometry.setAttribute('waterCellSize', new THREE.BufferAttribute(footprint, 1));
    if (levels && ground && owner) {
      geometry.setAttribute('waterLevelResponse', new THREE.BufferAttribute(levels, 3));
      geometry.setAttribute('waterGround', new THREE.BufferAttribute(ground, 1));
      geometry.setAttribute('waterBodyIndex', new THREE.BufferAttribute(owner, 1));
    }
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    return geometry;
  }
  dispose(): void {
    this.active?.build.return(undefined as never); this.active = undefined;
    this.merging?.build.return(undefined as never); this.merging = undefined; this.dirtyBatches.clear();
    for (const [key, batch] of this.batches) { batch.geometry.dispose(); this.onPublication?.(key, []); }
    this.batches.clear(); this.verticalScale = NaN;
    for (const mesh of this.tiles.values()) mesh.geometry.dispose();
    this.tiles.clear(); this.meshes.length = 0; this.group.clear(); this.pending = [];
    this.residentTriangles = this.residentBytes = 0;
  }
}
