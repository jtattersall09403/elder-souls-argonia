import * as THREE from 'three';
import type { WaterInteractionEvent } from '@elder-souls/contracts';
import { LocalWaterPatch } from '../LocalWaterPatch';
import { LOCAL_WATER_EDGE_M, localWaterVertexCoordinate } from '../localPatchPresentation';
import type { WaterAssets, LocalWaterSurfaceState } from './types';
import { NativeWaterAtlas } from './NativeWaterAtlas';

export const HERO_POOL_SIZE = 128;
export const HERO_POOL_CELL_M = 0.25;
const EXTENT = HERO_POOL_SIZE * HERO_POOL_CELL_M;

/** One persistent world-anchored local model. No whole-scene fluid simulation.
 * Domain admission is based on the hydraulic owner, native bed and local
 * still-head/flow, not the coarse water class alone. */
export class HeroPoolSurface {
  readonly mesh = new THREE.Mesh(new THREE.BufferGeometry());
  readonly field: THREE.DataTexture;
  private readonly atlas: NativeWaterAtlas;
  private readonly ownsAtlas: boolean;
  patch: LocalWaterPatch | null = null;
  state: LocalWaterSurfaceState;
  readonly diagnostics = { domainBuilds: 0, acceptedEvents: 0, rejectedEvents: 0, uploadedRevisions: 0,
    admissionBatchesLastUpdate: 0, pendingEvents: 0, admissionCancelled: 0 };
  private nextCheckS = -Infinity;
  private revision = -1;
  private timeS = 0;
  private epoch = 0;
  private pending: { work: Generator<void, void>; x: number; z: number; bodyId: string; height: number;
    events: { event: WaterInteractionEvent; timeS: number }[] } | null = null;
  constructor(private readonly assets: WaterAssets, atlas?: NativeWaterAtlas) {
    this.atlas = atlas ?? new NativeWaterAtlas(assets.data.nativeGround); this.ownsAtlas = !atlas;
    this.field = this.atlas.field;
    this.mesh.layers.set(3); this.mesh.receiveShadow = true; this.mesh.visible = false;
    this.state = { field: this.field, originX: 0, originZ: 0, cellSizeM: HERO_POOL_CELL_M,
      size: HERO_POOL_SIZE, extentM: EXTENT, edgeBlendM: LOCAL_WATER_EDGE_M, bodyIndex: 0, active: false };
  }

  private eligible(x: number, z: number, epoch: number) {
    const water = this.assets.world.sampleBoundary(x, z, epoch), data = this.assets.data.sample(x, z);
    if (!water.waterBodyId || water.depth < 0.06 || data.salinity > 0.02
      || !['lake', 'marsh', 'river'].includes(data.className)
      || Math.hypot(data.flowX, data.flowY ?? 0, data.flowZ) > 0.12
      || (data.surfaceNormal && data.surfaceNormal.y < 0.99995)) return null;
    return { water, data, x, z };
  }

  update(x: number, y: number, z: number, timeS: number, deltaS: number, epoch: number, material: THREE.Material, scale = 1): void {
    this.mesh.material = material;
    this.timeS = timeS; this.epoch = epoch;
    if (this.patch) {
      const p = this.patch;
      const level = this.assets.world.sampleBoundary(p.originX + EXTENT / 2, p.originZ + EXTENT / 2, epoch).surfaceHeight;
      // Never advance through a neck that has physically dried between the
      // slower selection checks. The inset below leaves admission-time drift
      // headroom; shallow fringe continues using the underlying water surface.
      if (level <= p.minimumSafeBaseHeightM) { this.deactivate(); this.nextCheckS = timeS; }
    }
    if (timeS >= this.nextCheckS) {
      this.nextCheckS = timeS + 0.25;
      const p = this.patch;
      let keep = !!p && x >= p.originX && z >= p.originZ && x < p.originX + EXTENT && z < p.originZ + EXTENT
        && Math.abs(y - p.baseHeightM) < 20;
      if (keep && p) {
        const centre = this.assets.world.sampleBoundary(p.originX + EXTENT / 2, p.originZ + EXTENT / 2, epoch);
        keep = Math.abs(centre.surfaceHeight - p.baseHeightM) < 0.02;
        const under = this.assets.world.sampleBoundary(x, z, epoch);
        if (under.waterBodyId && under.waterBodyId !== p.bodyId) keep = false;
      }
      if (!keep) {
        this.deactivate();
        // Shore approach admits a nearby pool before the player enters it.
        let found = false;
        for (const [dx, dz] of [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3]]) {
          const candidate = this.eligible(x + dx, z + dz, epoch);
          if (candidate && Math.abs(y - candidate.water.surfaceHeight) < 16) {
            found = true;
            const pending = this.pending;
            if (!pending || pending.bodyId !== candidate.water.waterBodyId
              || Math.abs(candidate.water.surfaceHeight - pending.height) >= 0.02
              || Math.max(Math.abs(candidate.x - pending.x), Math.abs(candidate.z - pending.z)) >= EXTENT / 2) {
              this.cancelAdmission();
              this.pending = { work: this.create(candidate, epoch), x: candidate.x, z: candidate.z,
                bodyId: candidate.water.waterBodyId!, height: candidate.water.surfaceHeight, events: [] };
            }
            break;
          }
        }
        if (!found) this.cancelAdmission();
      }
    }
    // At most 512 boundary/data queries per batch. The existing surface
    // remains visible until the complete replacement is ready.
    this.diagnostics.admissionBatchesLastUpdate = 0;
    const admissionStart = performance.now();
    while (this.pending && this.diagnostics.admissionBatchesLastUpdate < 2) {
      const pending = this.pending;
      const result = pending.work.next();
      this.diagnostics.admissionBatchesLastUpdate++;
      if (result.done) {
        this.pending = null;
        for (const saved of pending.events) if (timeS - saved.timeS <= 2) this.emit(saved.event);
        this.diagnostics.pendingEvents = 0;
      }
      if (performance.now() - admissionStart >= 2) break;
    }
    if (this.patch) {
      this.patch.advance(deltaS);
      this.sync();
      const b = this.mesh.geometry.boundingBox!;
      b.min.y = (this.patch.baseHeightM - 8) * scale; b.max.y = (this.patch.baseHeightM + 8) * scale;
      this.mesh.geometry.boundingSphere = b.getBoundingSphere(this.mesh.geometry.boundingSphere ?? new THREE.Sphere());
    }
  }

  private *create(candidate: NonNullable<ReturnType<HeroPoolSurface['eligible']>>, epoch: number): Generator<void, void> {
    const n = HERO_POOL_SIZE, cell = HERO_POOL_CELL_M;
    const originX = Math.floor(candidate.x / cell) * cell - EXTENT / 2;
    const originZ = Math.floor(candidate.z / cell) * cell - EXTENT / 2;
    const base = candidate.water.surfaceHeight, body = candidate.water.waterBodyId!;
    const ground = new Float32Array(n * n), owner = new Uint8Array(n * n);
    let wet = 0;
    for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
      const i = z * n + x, wx = originX + (x + 0.5) * cell, wz = originZ + (z + 0.5) * cell;
      const s = this.assets.world.sampleBoundary(wx, wz, epoch);
      ground[i] = s.surfaceHeight - s.depth;
      if (s.waterBodyId === body && s.depth > 0.06 && Math.abs(s.surfaceHeight - base) <= 0.01) { owner[i] = 1; wet++; }
      if ((i & 511) === 511) yield;
    }
    if (!wet) return;
    const patch = new LocalWaterPatch({ size: n, cellSizeM: cell, originX, originZ, bodyId: body, baseHeightM: base,
      groundHeights: ground, ownerMask: owner, maxSpheres: 32 });
    yield;
    const vertices = n + 2;
    const count = vertices ** 2, positions = new Float32Array(count * 3), overrides = new Float32Array(count * 4);
    const grounds = new Float32Array(count), responses = new Float32Array(count * 3), normals = new Float32Array(count * 3);
    const native = new Uint8Array(count), indices: number[] = [];
    for (let z = 0; z < vertices; z++) for (let x = 0; x < vertices; x++) {
      const i = z * vertices + x, wx = originX + localWaterVertexCoordinate(x, n, cell), wz = originZ + localWaterVertexCoordinate(z, n, cell);
      const d = this.assets.data.sample(wx, wz), b = this.assets.world.sampleBoundary(wx, wz, epoch);
      positions.set([wx, 0, wz], i * 3);
      const valid = b.waterBodyId === body && Math.abs(b.surfaceHeight - base) < 0.02;
      overrides.set([valid ? d.surfaceBase : candidate.data.surfaceBase, 0, 0, 2], i * 4);
      grounds[i] = valid ? b.surfaceHeight - b.depth : ground[Math.min(z, n - 1) * n + Math.min(x, n - 1)];
      responses.set([candidate.data.tideResponse, candidate.data.seasonResponse, 1], i * 3);
      const normal = valid ? d.surfaceNormal : candidate.data.surfaceNormal;
      normals.set([normal?.x ?? 0, normal?.y ?? 1, normal?.z ?? 0], i * 3);
      native[i] = normal ? 1 : 0;
      if (x < vertices - 1 && z < vertices - 1) {
        // Centre-aligned quads can straddle a wet-mask boundary. Retain every
        // possibly wet quad, then clip the exact nearest-cell mask in fragment.
        let touchesWet = false;
        for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) {
          const cx = Math.max(0, Math.min(n - 1, x + dx - 1));
          const cz = Math.max(0, Math.min(n - 1, z + dz - 1));
          touchesWet ||= owner[cz * n + cx] !== 0;
        }
        if (touchesWet) indices.push(i, i + vertices, i + 1, i + 1, i + vertices, i + vertices + 1);
      }
      if ((i & 255) === 255) yield;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('waterOverride', new THREE.BufferAttribute(overrides, 4));
    geometry.setAttribute('waterGround', new THREE.BufferAttribute(grounds, 1));
    geometry.setAttribute('waterLevelResponse', new THREE.BufferAttribute(responses, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute('waterNative', new THREE.BufferAttribute(native, 1));
    geometry.setIndex(indices);
    geometry.boundingBox = new THREE.Box3(new THREE.Vector3(originX, base - 8, originZ), new THREE.Vector3(originX + EXTENT, base + 8, originZ + EXTENT));
    this.mesh.geometry.dispose(); this.mesh.geometry = geometry;
    this.patch = patch; this.assets.world.setLocalPatch(patch); this.revision = -1;
    Object.assign(this.state, { originX, originZ, bodyIndex: candidate.data.bodyIndex, active: true });
    this.mesh.visible = true; this.diagnostics.domainBuilds++; this.sync();
  }

  emit(event: WaterInteractionEvent): void {
    const p = this.patch;
    if (!p && this.pending) {
      const pending = this.pending;
      if (this.assets.world.sampleBoundary(event.position.x, event.position.z, this.epoch).waterBodyId === pending.bodyId
        && Math.max(Math.abs(event.position.x - pending.x), Math.abs(event.position.z - pending.z)) < EXTENT / 2) {
        if (pending.events.length >= 24) {
          const ambient = pending.events.findIndex(saved => saved.event.kind === 'wake');
          pending.events.splice(ambient >= 0 ? ambient : 0, 1);
        }
        pending.events.push({ event: { ...event, position: { ...event.position }, velocity: event.velocity ? { ...event.velocity } : undefined }, timeS: this.timeS });
        this.diagnostics.pendingEvents = pending.events.length;
        return;
      }
    }
    if (!p?.sample(event.position.x, event.position.z)) { this.diagnostics.rejectedEvents++; return; }
    const speed = event.velocity ? Math.hypot(event.velocity.x, event.velocity.y, event.velocity.z) : 1;
    const coupling = event.kind === 'wake' ? 0.015 : event.kind === 'exit' ? 0.025 : event.kind === 'submerge' ? 0.01 : 0.08;
    const energyJ = Math.min(100, Math.max(0, event.magnitude ?? 20) * Math.max(0.2, speed) * coupling);
    p.impulse({ x: event.position.x, z: event.position.z, radiusM: Math.max(0.65, Math.min(3, (event.radius ?? 0.5) * 1.8)), energyJ });
    this.diagnostics.acceptedEvents++;
  }

  sync(): void {
    if (!this.patch || this.revision === this.patch.revision) return;
    const pixels = this.field.image.data as Float32Array;
    pixels.set(this.patch.fields);
    for (let i = 0; i < this.patch.wetMask.length; i++) pixels[i * 4 + 3] += 2 * this.patch.wetMask[i];
    this.revision = this.patch.revision; this.atlas.markHeroDirty(); this.diagnostics.uploadedRevisions++;
  }
  private deactivate(): void {
    if (this.assets.world.localPatch === this.patch) this.assets.world.setLocalPatch(null);
    this.patch?.setActive(false); this.patch = null; this.state.active = false; this.mesh.visible = false;
  }
  private cancelAdmission(): void {
    if (this.pending) { this.pending.work.return(); this.diagnostics.admissionCancelled++; }
    this.pending = null; this.diagnostics.pendingEvents = 0;
  }
  dispose(): void { this.cancelAdmission(); this.deactivate(); this.mesh.geometry.dispose(); if (this.ownsAtlas) this.atlas.dispose(); }
}
