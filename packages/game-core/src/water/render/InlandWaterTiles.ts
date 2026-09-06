import * as THREE from "three";
import type { WaterData, WaterBoundaryStaticSample } from "../waterData";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { ChannelRibbonFootprintTriangle } from "../channelRibbons";
import { subtractRibbonFootprints } from "./ribbonFootprint";
import { inlandEffectiveStep } from "./inlandWaterLod";

/** Fixed world-aligned inland tiles. A triangle never joins separate bodies;
 * camera motion cannot stretch a river into the neighbouring lake or bank.
 * The ocean keeps its separate camera-centred horizon grid. */
export class InlandWaterTiles {
  readonly group = new THREE.Group();
  readonly meshes: THREE.Mesh[] = [];
  private tiles = new Map<string, THREE.Mesh>();
  private focus = "";
  private pending: { key: string; tx: number; tz: number; step: number }[] = [];
  private batches = new Map<string, THREE.Mesh>();
  private verticalScale = NaN;
  constructor(private readonly data: WaterData, private readonly low = false) {}

  update(x: number, z: number, material: THREE.Material, verticalScale = 1): void {
    const changedBatches = new Set<string>();
    const scale = Number.isFinite(verticalScale) && verticalScale > 0 ? verticalScale : 1;
    const mpp = this.data.meta.surface.metresPerPixel;
    const tileM = 64 * mpp;
    const cx = Math.floor(x / tileM), cz = Math.floor(z / tileM);
    const focus = `${cx},${cz}`;
    if (focus !== this.focus) {
      this.focus = focus;
      this.pending = [];
      const limit = Math.ceil(this.data.meta.surface.size / 64);
      // Full-province coarse coverage: the marine mesh intentionally cannot
      // fill distant lakes. Iteration is bounded even for offshore cameras.
      for (let tz = 0; tz < limit; tz++) for (let tx = 0; tx < limit; tx++) {
        const radius = Math.max(Math.abs(tx - cx), Math.abs(tz - cz));
        const step = radius <= 1 ? 1 : radius <= 3 ? 2 : radius <= 7 ? (this.low ? 8 : 4) : radius <= 12 ? 8 : 16;
        const key = `${tx},${tz}`;
        if (this.tiles.get(key)?.userData.waterStep !== step) this.pending.push({ key, tx, tz, step });
      }
      this.pending.sort((a, b) => Math.max(Math.abs(a.tx - cx), Math.abs(a.tz - cz))
        - Math.max(Math.abs(b.tx - cx), Math.abs(b.tz - cz)));
    }
    // Bound upload work; nearest tiles arrive first. Static cached geometry
    // then has no CPU update cost until the camera enters another tile.
    for (let budget = 0; budget < 4 && this.pending.length; budget++) {
      const task = this.pending.shift()!;
      const mesh = this.build(task.tx, task.tz, task.step, material);
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

  private build(tx: number, tz: number, requestedStep: number, material: THREE.Material): THREE.Mesh {
    const step = inlandEffectiveStep(this.data, tx, tz, requestedStep);
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
      wet.push(sample.supported && sample.waterBodyId !== null && this.data.rasterClassAt(x, z) >= 3 && sample.depthProxy > -2);
      vertices.set(key, i);
      return i;
    };
    // Index only the native footprints touching this tile. Per-cell lists
    // avoid scanning all province ribbons for every raster triangle.
    const clips = new Map<number, ChannelRibbonFootprintTriangle[]>();
    for (const clip of this.data.ribbons.trianglesInBounds(baseX, baseZ, baseX + 64 * mpp, baseZ + 64 * mpp)) {
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
    for (let row = 0; row < cells; row++) for (let col = 0; col < cells; col++) {
      const x0 = baseX + col * span, z0 = baseZ + row * span;
      const x1 = baseX + (col + 1) * span, z1 = baseZ + (row + 1) * span;
      const cutters = clips.get(row * cells + col);
      if (step === 1 || (row > 0 && col > 0 && row < cells - 1 && col < cells - 1)) {
        const a = vertex(x0, z0), b = vertex(x0, z1), c = vertex(x1, z0), d = vertex(x1, z1);
        triangle(a, b, c, cutters); triangle(c, b, d, cutters);
      } else {
        // Every tile perimeter has native-step vertices, regardless of its
        // interior LOD. Adjacent edges therefore sample identical waves and
        // base heights, including while an old LOD awaits replacement.
        const perimeter: number[] = [];
        const edge = (ax: number, az: number, bx: number, bz: number, count: number) => {
          for (let i = 0; i < count; i++) perimeter.push(vertex(ax + (bx - ax) * i / count, az + (bz - az) * i / count));
        };
        edge(x0, z0, x0, z1, col === 0 ? step : 1);
        edge(x0, z1, x1, z1, row === cells - 1 ? step : 1);
        edge(x1, z1, x1, z0, col === cells - 1 ? step : 1);
        edge(x1, z0, x0, z0, row === 0 ? step : 1);
        const center = vertex((x0 + x1) / 2, (z0 + z1) / 2);
        for (let i = 0; i < perimeter.length; i++) triangle(center, perimeter[i], perimeter[(i + 1) % perimeter.length], cutters);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("waterOverride", new THREE.BufferAttribute(new Float32Array(body.length * 4), 4));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.waterStep = requestedStep;
    mesh.userData.effectiveWaterStep = step;
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
  }
}
