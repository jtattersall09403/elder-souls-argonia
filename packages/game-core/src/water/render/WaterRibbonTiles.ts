import * as THREE from "three";
import { type ChannelRibbonRecord } from "../channelRibbons";
import type { WaterData } from "../waterData";
import { waterGeometryBytes, waterPatchDistance, waterPatchBuffer, waterPatchVisible, type WaterGeometryView } from "./waterStreaming";
import { ribbonRenderLod } from "./ribbonRenderLod";
import { compactNativeRibbonAttributes } from "./nativeRibbonAttributes";
import { indexWaterGeometry, mergeWaterGeometry } from "./indexWaterGeometry";

interface RibbonPatch {
  key: string;
  records: ChannelRibbonRecord[];
  bounds: THREE.Box3;
  revision: number;
}

/** Explicit channels retain exact native geometry at every visible scale.
 * Batches are spatial, lazily uploaded, and individually culled; the old
 * province-sized always-visible mesh ran every river's shader every frame. */
export class WaterRibbonTiles {
  readonly group = new THREE.Group();
  readonly meshes: THREE.Mesh[] = [];
  private readonly patches = new Map<string, RibbonPatch>();
  private readonly resident = new Map<string, THREE.Mesh>();
  private pending: RibbonPatch[] = [];
  private lastViewKey = "";
  private scale = NaN;
  private triangles = 0;
  private bytes = 0;
  private builtLastUpdate = 0;
  private budgetFailures = 0;
  private recordsBuiltLastUpdate = 0;
  private admissionBytes = 0;
  private admission: { patch: RibbonPatch; revision: number; work: Generator<void, THREE.BufferGeometry> } | null = null;
  constructor(private readonly data: WaterData, low = false,
    private readonly maxTriangles = 1048576,
    private readonly maxBytes = 64 * 1024 * 1024) {
    void low; // Both tiers retain the same physical shoreline geometry.
    for (const record of data.meta.ribbons ?? []) {
      const bounds = new THREE.Box3();
      for (const point of record.points) {
        let width = point.halfWidthM * 2;
        if (point.crossSectionMinOffsetM !== undefined && point.crossSectionMaxOffsetM !== undefined) {
          width = Math.max(width, Math.abs(point.crossSectionMinOffsetM), Math.abs(point.crossSectionMaxOffsetM));
        } else for (const sample of point.crossSection ?? []) width = Math.max(width, Math.abs(sample.offsetM));
        bounds.expandByPoint(new THREE.Vector3(point.x - width, point.y, point.z - width));
        bounds.expandByPoint(new THREE.Vector3(point.x + width, point.y, point.z + width));
      }
      const center = bounds.getCenter(new THREE.Vector3());
      const key = `${Math.floor(center.x / 256)},${Math.floor(center.z / 256)}`;
      const patch = this.patches.get(key);
      if (patch) { patch.records.push(record); patch.bounds.union(bounds); }
      else this.patches.set(key, { key, records: [record], bounds, revision: -1 });
    }
  }

  get diagnostics() { return { residentPatches: this.resident.size, residentTriangles: this.triangles,
    residentGeometryBytes: this.bytes, pendingPatches: this.pending.length + (this.admission ? 1 : 0), builtLastUpdate: this.builtLastUpdate,
    recordsBuiltLastUpdate: this.recordsBuiltLastUpdate, admissionBytes: this.admissionBytes,
    budgetFailures: this.budgetFailures }; }

  update(view: WaterGeometryView, material: THREE.Material, verticalScale = 1): void {
    const scale = Number.isFinite(verticalScale) && verticalScale > 0 ? verticalScale : 1;
    const key = `${Math.floor(view.position.x / 128)},${Math.floor(view.position.z / 128)},${Math.floor(view.position.y / 64)},${Math.floor(view.pixelsPerRadian / 100)}`
      + (view.frustum?.planes.map(p => `${Math.round(p.normal.x * 12)},${Math.round(p.normal.y * 12)},${Math.round(p.normal.z * 12)}`).join(";") ?? "");
    if (key !== this.lastViewKey || scale !== this.scale) {
      this.lastViewKey = key;
      this.pending = [];
      const wanted = new Set<string>();
      for (const patch of this.patches.values()) {
        const bounds = patch.bounds.clone();
        bounds.min.y = (bounds.min.y - 8) * scale; bounds.max.y = (bounds.max.y + 8) * scale;
        const distance = waterPatchDistance(bounds, view);
        // No background march across the province. A conservative near and
        // frustum buffer keeps turning/walking smooth without retaining every
        // patch the camera has ever visited.
        if (distance > 256 && !waterPatchVisible(waterPatchBuffer(bounds, 128), view)) continue;
        wanted.add(patch.key);
        const revision = Math.max(0, Math.floor(Math.log2(Math.max(1, distance) / Math.max(1, view.pixelsPerRadian))));
        if (!this.resident.has(patch.key) || patch.revision !== revision) this.pending.push(patch);
      }
      for (const [key, mesh] of this.resident) if (!wanted.has(key)) {
        this.triangles -= (mesh.geometry.index?.count ?? 0) / 3;
        this.bytes -= waterGeometryBytes(mesh.geometry);
        mesh.geometry.dispose(); this.group.remove(mesh); this.resident.delete(key);
      }
      if (this.admission && (!wanted.has(this.admission.patch.key) || scale !== this.scale)) this.cancelAdmission();
      if (this.admission) this.pending = this.pending.filter(patch => patch !== this.admission!.patch);
      this.pending.sort((a, b) => {
        const priority = (patch: RibbonPatch) => {
          const bounds = patch.bounds.clone(); bounds.min.y *= scale; bounds.max.y *= scale;
          return (waterPatchVisible(waterPatchBuffer(bounds, 256), view) ? 0 : 1e7) + waterPatchDistance(bounds, view);
        };
        return priority(a) - priority(b);
      });
    }
    this.builtLastUpdate = 0;
    this.recordsBuiltLastUpdate = 0;
    const start = performance.now();
    for (let n = 0; n < 8 && this.builtLastUpdate < 2 && (this.pending.length || this.admission); n++) {
      if (n && performance.now() - start >= 2) break;
      if (!this.admission) {
      const patch = this.pending.shift()!;
      const bounds = patch.bounds.clone(); bounds.min.y *= scale; bounds.max.y *= scale;
      const distance = waterPatchDistance(bounds, view);
      const subpixelWidth = distance * 0.35 / Math.max(1, view.pixelsPerRadian);
      const records = patch.records.filter(record => record.points.some(point => {
        const width = point.crossSectionMinOffsetM !== undefined && point.crossSectionMaxOffsetM !== undefined
          ? point.crossSectionMaxOffsetM - point.crossSectionMinOffsetM
          : point.crossSection?.length ? point.crossSection.at(-1)!.offsetM - point.crossSection[0].offsetM : point.halfWidthM * 2;
        return width >= subpixelWidth;
      }));
      const errorM = distance < 250 ? 0 : distance * 0.35 / Math.max(1, view.pixelsPerRadian) / scale;
      this.admission = { patch, revision: Math.max(0, Math.floor(Math.log2(Math.max(1, distance) / Math.max(1, view.pixelsPerRadian)))),
        work: this.buildIncrementally(records, errorM) };
      }
      const admission = this.admission;
      const result = admission.work.next();
      this.recordsBuiltLastUpdate++;
      if (!result.done) continue;
      this.admission = null;
      const patch = admission.patch;
      const mesh = new THREE.Mesh(result.value, material);
      mesh.layers.set(3); mesh.receiveShadow = true; mesh.frustumCulled = true;
      const previous = this.resident.get(patch.key);
      const oldTriangles = (previous?.geometry.index?.count ?? 0) / 3, oldBytes = previous ? waterGeometryBytes(previous.geometry) : 0;
      const triangles = (mesh.geometry.index?.count ?? 0) / 3, bytes = waterGeometryBytes(mesh.geometry);
      this.builtLastUpdate++;
      if (this.triangles - oldTriangles + triangles > this.maxTriangles || this.bytes - oldBytes + bytes > this.maxBytes) {
        mesh.geometry.dispose(); this.budgetFailures++; continue;
      }
      this.triangles += triangles - oldTriangles; this.bytes += bytes - oldBytes;
      if (previous) { previous.geometry.dispose(); this.group.remove(previous); }
      this.resident.set(patch.key, mesh); this.group.add(mesh);
      patch.revision = admission.revision;
      mesh.userData.waterBounds = patch.bounds;
      this.updateBounds(mesh, scale);
    }
    this.meshes.splice(0, this.meshes.length, ...this.resident.values());
    for (const mesh of this.meshes) {
      mesh.material = material;
      if (scale !== this.scale) this.updateBounds(mesh, scale);
    }
    this.scale = scale;
  }

  private updateBounds(mesh: THREE.Mesh, scale: number) {
    const bounds = (mesh.userData.waterBounds as THREE.Box3).clone();
    bounds.min.y = (bounds.min.y - 8) * scale; bounds.max.y = (bounds.max.y + 8) * scale;
    mesh.geometry.boundingBox = bounds;
    mesh.geometry.boundingSphere = bounds.getBoundingSphere(new THREE.Sphere());
  }

  private *buildIncrementally(records: readonly ChannelRibbonRecord[], errorM: number): Generator<void, THREE.BufferGeometry> {
    const parts: THREE.BufferGeometry[] = [];
    try {
      for (const record of records) {
        const geometry = this.build([ribbonRenderLod(record, errorM, !!this.data.nativeGround)]);
        parts.push(geometry); this.admissionBytes += waterGeometryBytes(geometry);
        yield;
      }
      return mergeWaterGeometry(parts);
    } finally {
      for (const part of parts) part.dispose();
      this.admissionBytes = 0;
    }
  }

  private cancelAdmission(): void { this.admission?.work.return(undefined as never); this.admission = null; this.admissionBytes = 0; }

  private build(records: readonly ChannelRibbonRecord[]): THREE.BufferGeometry {
    const { positions, indices, groundHeights, floodAccessOffsets, flowVelocities, levelResponses, bodyIndices } = this.data.ribbons.meshDataFor(records, { refineGround: false });
    const overrides = new Float32Array(positions.length / 3 * 4), flowY = new Float32Array(positions.length / 3);
    for (let i = 0; i < positions.length; i += 9) {
      for (let j = 0; j < 3; j++) {
        const vertex = i / 3 + j;
        overrides.set([positions[vertex * 3 + 1], flowVelocities[vertex * 3], flowVelocities[vertex * 3 + 2], 1], vertex * 4);
        flowY[vertex] = flowVelocities[vertex * 3 + 1];
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("waterOverride", new THREE.BufferAttribute(overrides, 4));
    if (!this.data.nativeGround) geometry.setAttribute("waterGround", new THREE.BufferAttribute(groundHeights, 1));
    geometry.setAttribute("waterFlowY", new THREE.BufferAttribute(flowY, 1));
    geometry.setAttribute("waterAccessOffset", new THREE.BufferAttribute(floodAccessOffsets, 1));
    geometry.setAttribute("waterLevelResponse", new THREE.BufferAttribute(levelResponses, 3));
    geometry.setAttribute("waterBodyIndex", new THREE.BufferAttribute(bodyIndices, 1));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1)); geometry.computeVertexNormals();
    if (this.data.nativeGround) compactNativeRibbonAttributes(geometry);
    const compact = indexWaterGeometry(geometry); geometry.dispose();
    return compact;
  }

  dispose(): void {
    this.cancelAdmission();
    for (const mesh of this.resident.values()) mesh.geometry.dispose();
    this.resident.clear(); this.pending = []; this.meshes.length = 0; this.group.clear(); this.triangles = this.bytes = 0;
  }
}
