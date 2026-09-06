import type { WaterDisplacementSphere } from '@elder-souls/contracts';
import type { LocalWaterPatch } from './LocalWaterPatch';

const same = (a: WaterDisplacementSphere, b: WaterDisplacementSphere) => a.radiusM === b.radiusM
  && a.center.x === b.center.x && a.center.y === b.center.y && a.center.z === b.center.z;
const key = (actor: string, index: number) => `${actor.length}:${actor}:${index}`;

/** Bounded producer snapshots survive patch selection; only nearby complete
 * actors occupy the active solver. No partial hull admission or stationary
 * impulse spam. Removing/retargeting explicitly releases previous columns. */
export class WaterDisplacementRegistry {
  readonly diagnostics = { rejectedActors: 0, rejectedProxySets: 0, deferredPatchActors: 0 };
  private readonly actors = new Map<string, readonly WaterDisplacementSphere[]>();
  private readonly applied = new Map<string, WaterDisplacementSphere>();
  private patch: LocalWaterPatch | null = null;
  private count = 0;
  readonly maxActors = 64;
  readonly maxProxies = 128;
  readonly maxProxiesPerActor = 8;
  get actorCount() { return this.actors.size; }
  get proxyCount() { return this.count; }

  set(actorId: string, spheres: readonly WaterDisplacementSphere[] | null): boolean {
    if (!actorId) throw new RangeError('Water displacement requires actor identity');
    const old = this.actors.get(actorId);
    if (!spheres?.length) {
      if (old) { this.count -= old.length; this.actors.delete(actorId); this.sync(actorId); }
      return true;
    }
    if (spheres.length > this.maxProxiesPerActor || this.count - (old?.length ?? 0) + spheres.length > this.maxProxies) {
      this.diagnostics.rejectedProxySets++;
      // Never leave a moved actor's last position occupying the water after
      // its new shape was rejected. The producer receives explicit failure.
      if (old) this.set(actorId, null);
      return false;
    }
    if (!old && this.actors.size >= this.maxActors) { this.diagnostics.rejectedActors++; return false; }
    for (const s of spheres) if (![s.center.x, s.center.y, s.center.z, s.radiusM].every(Number.isFinite) || s.radiusM <= 0) throw new RangeError('Water displacement spheres must be finite with positive radii');
    if (old?.length === spheres.length && old.every((value, i) => same(value, spheres[i]))) return true;
    // Caller may reuse and mutate its arrays next physics step.
    const copy = spheres.map(s => ({ center: { ...s.center }, radiusM: s.radiusM }));
    const previouslyEligible = !!old && this.eligible(old);
    this.count += copy.length - (old?.length ?? 0); this.actors.set(actorId, copy);
    this.sync(actorId, previouslyEligible); return true;
  }

  setPatch(patch: LocalWaterPatch | null): void {
    this.patch?.batchDisplacementUpdates(() => {
      for (const id of this.applied.keys()) this.patch?.seedImmersedSphere(id, null);
    });
    this.applied.clear(); this.patch = patch; this.sync(undefined, true);
  }

  clear(): void {
    this.actors.clear(); this.count = 0; this.sync(undefined, false, true);
  }

  private eligible(spheres: readonly WaterDisplacementSphere[]): boolean {
    const p = this.patch;
    if (!p) return false;
    const extent = p.size * p.cellSizeM;
    return spheres.every(s => s.radiusM <= extent) && spheres.some(({ center: c, radiusM: r }) => c.x + r > p.originX
      && c.x - r < p.originX + extent && c.z + r > p.originZ && c.z - r < p.originZ + extent && c.y - r < p.baseHeightM);
  }

  private sync(updatedActor?: string, previouslyEligible = false, clearing = false): void {
    const patch = this.patch;
    if (!patch) return;
    const extent = patch.size * patch.cellSizeM, cx = patch.originX + extent / 2, cz = patch.originZ + extent / 2;
    const candidates: { actor: string; spheres: readonly WaterDisplacementSphere[]; distance: number; admitted: boolean }[] = [];
    for (const [actor, spheres] of this.actors) {
      if (this.eligible(spheres)) candidates.push({ actor, spheres, admitted: this.applied.has(key(actor, 0)),
        distance: Math.min(...spheres.map(s => (s.center.x - cx) ** 2 + (s.center.z - cz) ** 2)) });
    }
    candidates.sort((a, b) => Number(b.admitted) - Number(a.admitted) || a.distance - b.distance || (a.actor < b.actor ? -1 : a.actor > b.actor ? 1 : 0));
    const desired = new Map<string, WaterDisplacementSphere>();
    this.diagnostics.deferredPatchActors = 0;
    for (const candidate of candidates) {
      if (desired.size + candidate.spheres.length > patch.sphereCapacity) { this.diagnostics.deferredPatchActors++; continue; }
      candidate.spheres.forEach((sphere, i) => desired.set(key(candidate.actor, i), sphere));
    }
    // Release first so newly nearer actors cannot fail against stale slots.
    patch.batchDisplacementUpdates(() => {
      const changedPrefix = updatedActor === undefined ? null : `${updatedActor.length}:${updatedActor}:`;
      for (const id of this.applied.keys()) if (!desired.has(id)) {
        if (clearing || (changedPrefix && id.startsWith(changedPrefix))) patch.moveImmersedSphere(id, null);
        else patch.seedImmersedSphere(id, null);
        this.applied.delete(id);
      }
      for (const [id, sphere] of desired) {
        const old = this.applied.get(id);
        if (old && same(old, sphere)) continue;
        const quiet = !old && (previouslyEligible || !changedPrefix || !id.startsWith(changedPrefix));
        const method = quiet ? 'seedImmersedSphere' : 'moveImmersedSphere';
        if (patch[method](id, { ...sphere.center, radiusM: sphere.radiusM })) this.applied.set(id, sphere);
      }
    });
  }
}
