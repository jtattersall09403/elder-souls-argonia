import * as THREE from 'three';
import type { WaterData } from '../waterData';
import { InlandWaterTiles } from './InlandWaterTiles';
import { MarineSurfaceController, type MarineNearCandidate } from './MarineSurfaceController';
import type { InlandStageRange } from './inlandAdaptiveLeaves';
import type { NativeWaterAtlas } from './NativeWaterAtlas';
import type { WaterUniforms } from './waterMaterial';
import type { WaterGeometryView } from './waterStreaming';

/** Scene-owned marine geometry and atomic replacement masks. Legacy data
 * never constructs this path. The original horizon remains offshore and
 * supplies loading coverage until each conforming coarse tile is displayed. */
export class MarineWaterSurface {
  readonly group = new THREE.Group();
  readonly coarse: InlandWaterTiles;
  readonly controller: MarineSurfaceController;
  private readonly near = new Map<string, THREE.Mesh>();
  private readonly mask: Float32Array;
  private material: THREE.Material | null = null;
  private scale = 1;
  private disposed = false;
  private readonly coverageInfo: THREE.Vector4;
  constructor(data: WaterData, low: boolean, stage: InlandStageRange,
    private readonly atlas: NativeWaterAtlas, private readonly uniforms: WaterUniforms) {
    if (!data.meta.surface.nativeChannelCoverage) throw new Error('Conforming marine geometry requires native water ownership');
    const stride = Math.ceil(data.meta.surface.size / 64);
    this.mask = new Float32Array(stride * stride);
    if (atlas.auxiliaryScalars < this.mask.length) throw new Error('Marine readiness prefix is not reserved');
    this.controller = new MarineSurfaceController(data, {
      coarseSnapshot: bounds => this.coarse.displayedSnapshot(bounds),
      publishNear: candidate => this.publish(candidate),
      withdrawNear: candidate => {
        const mesh = this.near.get(candidate.key);
        if (mesh) { this.group.remove(mesh); this.near.delete(candidate.key); }
        this.syncNearMask(); // Controller owns/disposes its geometry afterwards.
      },
    });
    this.coarse = new InlandWaterTiles(data, low, { stage, domain: 'marine', onPublication: (batch, tiles) => {
      this.controller.publishCoarseBatch(batch, tiles);
      this.controller.fillCoarseMask(this.mask);
      if (this.ownsUniforms()) this.atlas.writeAuxiliary(0, this.mask);
    } });
    this.group.add(this.coarse.group);
    this.coverageInfo = new THREE.Vector4(atlas.auxiliaryOffset, stride, data.meta.surface.metresPerPixel * 64, 1);
    this.acquireUniforms();
  }
  get meshes(): THREE.Mesh[] { return [...this.coarse.meshes, ...this.near.values()]; }
  get diagnostics() { return { coarse: this.coarse.diagnostics, near: this.controller.diagnostics }; }
  private ownsUniforms(): boolean { return this.uniforms.uMarineCoverageInfo.value === this.coverageInfo; }
  private acquireUniforms(): void {
    this.uniforms.uMarineCoverageInfo.value = this.coverageInfo;
    this.atlas.writeAuxiliary(0, this.mask); this.syncNearMask();
  }
  private publish(candidate: MarineNearCandidate): boolean {
    if (!this.material || this.disposed) return false;
    const mesh = new THREE.Mesh(candidate.geometry, this.material);
    mesh.layers.set(3); mesh.receiveShadow = true;
    mesh.userData.marineRect = new THREE.Vector4(candidate.x, candidate.z, candidate.x + candidate.widthM, candidate.z + candidate.depthM);
    this.setNearBounds(mesh);
    this.near.set(candidate.key, mesh); this.group.add(mesh); this.syncNearMask();
    return true;
  }
  private setNearBounds(mesh: THREE.Mesh): void {
    const r = mesh.userData.marineRect as THREE.Vector4;
    mesh.geometry.boundingBox = new THREE.Box3(new THREE.Vector3(r.x, -16 * this.scale, r.y), new THREE.Vector3(r.z, 16 * this.scale, r.w));
    mesh.geometry.boundingSphere = mesh.geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
  }
  private syncNearMask(): void {
    if (!this.ownsUniforms()) return;
    if (this.near.size > 4) throw new Error('Marine near publication exceeds shader mask bound');
    this.uniforms.uMarineNearCount.value = this.near.size;
    let i = 0;
    for (const mesh of this.near.values()) this.uniforms.uMarineNearRects.value[i++].copy(mesh.userData.marineRect);
  }
  update(x: number, z: number, focus: { x: number; y: number; z: number }, material: THREE.Material,
    scale: number, view: WaterGeometryView): void {
    if (this.disposed) return;
    // A tier replacement shares uniforms; an old instance's effect cleanup
    // must not leave the new owner disabled after its first displayed frame.
    if (!this.ownsUniforms()) this.acquireUniforms();
    this.material = material; this.scale = scale;
    this.coarse.update(x, z, material, scale, view);
    // Marine datum is zero; distant fly views do not need player-scale mesh.
    this.controller.update(focus.x, focus.z, Math.abs(focus.y) < 40);
    for (const mesh of this.near.values()) { mesh.material = material; this.setNearBounds(mesh); }
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.controller.dispose(); this.coarse.dispose();
    this.mask.fill(0);
    if (this.ownsUniforms()) {
      this.atlas.writeAuxiliary(0, this.mask);
      this.coverageInfo.w = 0; this.uniforms.uMarineNearCount.value = 0;
    }
    this.group.clear();
  }
}
