import * as THREE from "three";
import type { WaterData, WaterBoundaryStaticSample } from "../waterData";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { ChannelRibbonFootprintTriangle } from "../channelRibbons";
import { subtractRibbonFootprints } from "./ribbonFootprint";
import { inlandAdaptiveLeaves, inlandPotentiallyWet, type InlandStageRange } from "./inlandAdaptiveLeaves";
import { waterGeometryBytes, waterPatchDistance, waterPatchErrorM, waterPatchVisible, type WaterGeometryView } from "./waterStreaming";

export interface InlandWaterBudget {
  maxTriangles?: number;
  maxGeometryBytes?: number;
  buildsPerUpdate?: number;
  stage?: InlandStageRange;
}

/** Fixed world-aligned inland tiles. A triangle never joins separate bodies;
 * camera motion cannot stretch a river into the neighbouring lake or bank.
 * The ocean keeps its separate camera-centred horizon grid. */
export class InlandWaterTiles {
  readonly group = new THREE.Group();
  readonly meshes: THREE.Mesh[] = [];
  private tiles = new Map<string, THREE.Mesh>();
  private focus = "";
  private pending: { key: string; tx: number; tz: number; step: number; priority: number; errorM: number; subpixelM: number }[] = [];
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
  private readonly stage?: InlandStageRange;
  constructor(private readonly data: WaterData, private readonly low = false, budget: InlandWaterBudget = {}) {
    this.maxTriangles = budget.maxTriangles ?? 1000000;
    this.maxGeometryBytes = budget.maxGeometryBytes ?? (low ? 48 : 96) * 1024 * 1024;
    this.buildsPerUpdate = Math.max(1, Math.min(4, budget.buildsPerUpdate ?? 2));
    this.stage = budget.stage;
  }

  get diagnostics() { return { residentTiles: this.tiles.size, residentTriangles: this.residentTriangles,
    residentGeometryBytes: this.residentBytes, pendingTiles: this.pending.length, builtLastUpdate: this.builtLastUpdate,
    drawBatches: this.meshes.length, budgetFailures: this.budgetFailures }; }

  update(x: number, z: number, material: THREE.Material, verticalScale = 1, view?: WaterGeometryView): void {
    const changedBatches = new Set<string>();
    this.builtLastUpdate = 0;
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
      // Full-province coarse coverage: the marine mesh intentionally cannot
      // fill distant lakes. Iteration is bounded even for offshore cameras.
      for (let tz = 0; tz < limit; tz++) for (let tx = 0; tx < limit; tx++) {
        const key = `${tx},${tz}`;
        const current = this.tiles.get(key);
        const bounds = current ? (current.userData.waterBounds as THREE.Box3).clone()
          : new THREE.Box3(new THREE.Vector3(tx * tileM, this.data.meta.surface.minM, tz * tileM),
            new THREE.Vector3((tx + 1) * tileM, this.data.meta.surface.maxM, (tz + 1) * tileM));
        bounds.min.y = (bounds.min.y - 8) * scale; bounds.max.y = (bounds.max.y + 8) * scale;
        const radius = Math.max(Math.abs(tx - cx), Math.abs(tz - cz));
        const visible = waterPatchVisible(bounds.clone().expandByScalar(tileM), view);
        // The lightweight far representation remains resident behind the
        // camera: turning cannot reveal absent lakes. Only local/visible
        // detail receives priority; outgoing detail is replaced by far LOD.
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
    }
    // Bound upload work; nearest tiles arrive first. Static cached geometry
    // then has no CPU update cost until the camera enters another tile.
    const began = performance.now();
    for (let budget = 0; budget < this.buildsPerUpdate && this.pending.length; budget++) {
      if (budget > 0 && performance.now() - began >= 3) break;
      const task = this.pending.shift()!;
      const mesh = this.build(task.tx, task.tz, task.step, material, task.errorM, task.subpixelM);
      this.builtLastUpdate++;
      const previous = this.tiles.get(task.key);
      const previousTriangles = (previous?.geometry.index?.count ?? 0) / 3;
      const previousBytes = previous ? waterGeometryBytes(previous.geometry) * 2 : 0;
      const triangles = (mesh.geometry.index?.count ?? 0) / 3, bytes = waterGeometryBytes(mesh.geometry) * 2;
      if (this.residentTriangles - previousTriangles + triangles > this.maxTriangles || this.residentBytes - previousBytes + bytes > this.maxGeometryBytes) {
        mesh.geometry.dispose(); this.budgetFailures++; continue;
      }
      this.residentTriangles += triangles - previousTriangles;
      this.residentBytes += bytes - previousBytes;
      // Keep the previous LOD until this exact tile's replacement exists.
      this.tiles.get(task.key)?.geometry.dispose();
      this.tiles.set(task.key, mesh);
      changedBatches.add(mesh.userData.waterBatch);
    }
    for (const key of changedBatches) {
      const tiles = [...this.tiles.values()].filter(tile => tile.userData.waterBatch === key && (tile.geometry.index?.count ?? 0) > 0);
      let batch = this.batches.get(key);
      if (!tiles.length) {
        if (batch) { batch.geometry.dispose(); this.group.remove(batch); this.batches.delete(key); }
        continue;
      }
      const geometry = mergeGeometries(tiles.map(tile => tile.geometry), false)!;
      if (batch) { batch.geometry.dispose(); batch.geometry = geometry; }
      else {
        batch = new THREE.Mesh(geometry, material);
        batch.frustumCulled = true; batch.layers.set(3); batch.receiveShadow = true;
        this.group.add(batch); this.batches.set(key, batch);
      }
      const bounds = new THREE.Box3();
      for (const tile of tiles) bounds.union(tile.userData.waterBounds);
      batch.userData.waterBounds = bounds;
    }
    // At most64 fixed 4x4-tile groups for the shipped32x32 province. Only
    // touched groups upload geometry; camera culling never changes physics.
    this.meshes.splice(0, this.meshes.length, ...this.batches.values());
    for (const [key, batch] of this.batches) {
      batch.material = material;
      if (changedBatches.has(key) || scale !== this.verticalScale) {
        const box = (batch.userData.waterBounds as THREE.Box3).clone();
        box.min.y = (box.min.y - 8) * scale;
        box.max.y = (box.max.y + 8) * scale;
        batch.geometry.boundingBox = box;
        batch.geometry.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
      }
    }
    this.verticalScale = scale;
  }

  private build(tx: number, tz: number, requestedStep: number, material: THREE.Material, errorM = 0.04, subpixelM = 0): THREE.Mesh {
    const step = requestedStep;
    const leaves = inlandAdaptiveLeaves(this.data, tx, tz, requestedStep, errorM, subpixelM, this.stage);
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
    const sampleScratch: WaterBoundaryStaticSample = { surfaceBase: 0, depthProxy: 0,
      tideResponse: 0, seasonResponse: 0, supported: false, waterBodyId: null };
    const vertices = new Map<string, number>();
    const vertex = (x: number, z: number): number => {
      const key = `${x},${z}`;
      const existing = vertices.get(key);
      if (existing !== undefined) return existing;
      const i = body.length, sample = this.data.boundaryAt(x, z, sampleScratch, false);
      includeHeight(x, z);
      positions.push(x, 0, z); body.push(sample.waterBodyId);
      wet.push(inlandPotentiallyWet(sample, this.stage) && this.data.rasterClassAt(x, z) >= 3);
      vertices.set(key, i);
      return i;
    };
    // Index only the native footprints touching this tile. Per-cell lists
    // avoid scanning all province ribbons for every raster triangle.
    const clips = new Map<number, ChannelRibbonFootprintTriangle[]>();
    for (const clip of this.data.ribbons.ownershipFootprintsInBounds(baseX, baseZ, baseX + 64 * mpp, baseZ + 64 * mpp)) {
      const minCol = Math.max(0, Math.floor((Math.min(clip.a.x, clip.b.x, clip.c.x) - baseX) / span));
      const maxCol = Math.min(cells - 1, Math.floor((Math.max(clip.a.x, clip.b.x, clip.c.x) - baseX) / span));
      const minRow = Math.max(0, Math.floor((Math.min(clip.a.z, clip.b.z, clip.c.z) - baseZ) / span));
      const maxRow = Math.min(cells - 1, Math.floor((Math.max(clip.a.z, clip.b.z, clip.c.z) - baseZ) / span));
      for (let row = minRow; row <= maxRow; row++) for (let col = minCol; col <= maxCol; col++) {
        const key = row * cells + col, list = clips.get(key);
        if (list) list.push(clip); else clips.set(key, [clip]);
      }
    }
    const indices: number[] = [];
    const triangle = (a: number, b: number, c: number, cutters?: ChannelRibbonFootprintTriangle[]) => {
      if (!(wet[a] || wet[b] || wet[c]) || body[a] !== body[b] || body[b] !== body[c]) return;
      if (!cutters?.length) { indices.push(a, b, c); return; }
      const polygons = subtractRibbonFootprints([a, b, c].map(i => ({ x: positions[i * 3], z: positions[i * 3 + 2] })), cutters);
      for (const polygon of polygons) {
        // Clipped points retain the original triangle's domain. Sampling
        // the exact boundary would select the ribbon we just removed.
        const polygonIndices = polygon.map(point => {
          const index = body.length;
          includeHeight(point.x, point.z);
          positions.push(point.x, 0, point.z); body.push(body[a]); wet.push(wet[a] || wet[b] || wet[c]);
          return index;
        });
        for (let i = 1; i < polygonIndices.length - 1; i++) indices.push(polygonIndices[0], polygonIndices[i], polygonIndices[i + 1]);
      }
    };
    const horizontal = new Map<number, Set<number>>(), vertical = new Map<number, Set<number>>();
    const add = (map: Map<number, Set<number>>, key: number, value: number) => {
      let line = map.get(key); if (!line) { line = new Set(); map.set(key, line); } line.add(value);
    };
    for (const leaf of leaves) for (const x of [leaf.x, leaf.x + leaf.step]) for (const z of [leaf.z, leaf.z + leaf.step]) {
      add(horizontal, z, x); add(vertical, x, z);
    }
    for (let i = 0; i <= 64; i++) { add(horizontal, 0, i); add(horizontal, 64, i); add(vertical, 0, i); add(vertical, 64, i); }
    for (const leaf of leaves) {
      const x0 = baseX + leaf.x * mpp, z0 = baseZ + leaf.z * mpp;
      const x1 = baseX + (leaf.x + leaf.step) * mpp, z1 = baseZ + (leaf.z + leaf.step) * mpp;
      const cutters = clips.get(Math.floor(leaf.z / step) * cells + Math.floor(leaf.x / step));
      if (leaf.step === 1) {
        const a = vertex(x0, z0), b = vertex(x0, z1), c = vertex(x1, z0), d = vertex(x1, z1);
        triangle(a, b, c, cutters); triangle(c, b, d, cutters); continue;
      }
      const edgePoints = (map: Map<number, Set<number>>, key: number, start: number, end: number) =>
        [...map.get(key)!].filter(v => v >= start && v <= end).sort((a, b) => a - b);
      const left = edgePoints(vertical, leaf.x, leaf.z, leaf.z + leaf.step);
      const bottom = edgePoints(horizontal, leaf.z + leaf.step, leaf.x, leaf.x + leaf.step);
      const right = edgePoints(vertical, leaf.x + leaf.step, leaf.z, leaf.z + leaf.step).reverse();
      const top = edgePoints(horizontal, leaf.z, leaf.x, leaf.x + leaf.step).reverse();
      if (left.length + bottom.length + right.length + top.length === 8) {
        const a = vertex(x0, z0), b = vertex(x0, z1), c = vertex(x1, z0), d = vertex(x1, z1);
        triangle(a, b, c, cutters); triangle(c, b, d, cutters);
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
        for (let i = 0; i < perimeter.length; i++) triangle(center, perimeter[i], perimeter[(i + 1) % perimeter.length], cutters);
      }
    }
    // Raster vertices carry no per-vertex override and start with an up
    // normal. Byte attributes encode those exact constants; duplicated
    // Float32 zero vectors previously dominated persistent far-water memory.
    const remap = new Int32Array(body.length).fill(-1), usedPositions: number[] = [];
    const compactIndices = indices.map(index => {
      if (remap[index] >= 0) return remap[index];
      const mapped = usedPositions.length / 3;
      usedPositions.push(positions[index * 3], 0, positions[index * 3 + 2]);
      remap[index] = mapped;
      return mapped;
    });
    const count = usedPositions.length / 3, normals = new Int8Array(count * 3);
    for (let i = 1; i < normals.length; i += 3) normals[i] = 127;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(usedPositions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3, true));
    geometry.setAttribute("waterOverride", new THREE.BufferAttribute(new Int8Array(count * 4), 4));
    geometry.setIndex(compactIndices);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.waterStep = requestedStep;
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
  dispose(): void {
    for (const batch of this.batches.values()) batch.geometry.dispose();
    this.batches.clear(); this.verticalScale = NaN;
    for (const mesh of this.tiles.values()) mesh.geometry.dispose();
    this.tiles.clear(); this.meshes.length = 0; this.group.clear(); this.pending = [];
    this.residentTriangles = this.residentBytes = 0;
  }
}
