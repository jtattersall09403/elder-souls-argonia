import type { Vec3, WorldWaterQuery, WaterDisplacementSphere } from "@elder-souls/contracts";

/** Surface crossings and distance-spaced wakes for any moving actor/hull.
 * Pass the object's lowest point in metres after each physics substep, with
 * that step's simulated dt (not wall time discarded by a catch-up cap).
 * Explicit suspension/teleport lifecycle calls reset(), independently of FPS. */
export class WaterContactEmitter {
  private previous: Vec3 | null = null;
  private wet = false;
  private submerged = false;
  private bodyId: string | null = null;
  private distance = 0;
  private lastQuery: WorldWaterQuery | null = null;
  private sheetCooldown = 0;
  private readonly sheetProbe: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly displacement: WaterDisplacementSphere[] = Array.from({ length: 4 }, () => ({ center: { x: 0, y: 0, z: 0 }, radiusM: 0 }));
  constructor(readonly actorId: string, readonly radiusM = 0.35, readonly heightM = 1.7,
    private readonly options: { registerDisplacement?: boolean } = {}) {
    if (!actorId || !Number.isFinite(radiusM) || radiusM <= 0 || !Number.isFinite(heightM) || heightM <= 0) {
      throw new RangeError("Water contacts require an actor ID and positive finite dimensions");
    }
  }

  update(query: WorldWaterQuery, epoch: number, feet: Vec3, verticalSpeed: number, dt: number,
    worldVelocity?: Vec3, heightM = this.heightM, displacementVolumeM3?: number): void {
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    if (!Number.isFinite(heightM) || heightM <= 0 || (displacementVolumeM3 !== undefined
      && (!Number.isFinite(displacementVolumeM3) || displacementVolumeM3 <= 0))) throw new RangeError('Invalid water contact dimensions or volume');
    const water = query.sample(feet, epoch);
    const wet = water.waterBodyId !== null && feet.y < water.surfaceHeight;
    if (this.options.registerDisplacement !== false) {
      if (this.lastQuery && this.lastQuery !== query) this.lastQuery.setDisplacementSpheres?.(this.actorId, null);
      this.lastQuery = query;
      if (wet) {
        // Four equal-volume spheres approximate the actual upright capsule;
        // overlap is a volume quadrature, not a Boolean collision-mesh union.
        const radius = Math.min(this.radiusM, heightM / 2), cylinder = Math.max(0, heightM - 2 * radius);
        const volume = displacementVolumeM3 ?? Math.PI * radius * radius * cylinder + 4 / 3 * Math.PI * radius ** 3;
        const proxyRadius = Math.cbrt(3 * volume / (4 * Math.PI * this.displacement.length));
        for (let i = 0; i < this.displacement.length; i++) {
          const proxy = this.displacement[i];
          proxy.center.x = feet.x; proxy.center.z = feet.z;
          proxy.center.y = feet.y + heightM / 2 + Math.max(0, heightM / 2 - proxyRadius) * (2 * i / (this.displacement.length - 1) - 1);
          proxy.radiusM = proxyRadius;
        }
        query.setDisplacementSpheres?.(this.actorId, this.displacement);
      } else query.setDisplacementSpheres?.(this.actorId, null);
    }
    const submerged = wet && feet.y + heightM <= water.surfaceHeight;
    const surfaceContact = wet && !submerged;
    const previous = this.previous;
    const displacement = previous ? Math.hypot(feet.x - previous.x, feet.y - previous.y, feet.z - previous.z) : 0;
    const sameBody = !this.bodyId || !water.waterBodyId || this.bodyId === water.waterBodyId;
    const continuous = previous !== null && dt < 0.5 && displacement < 8 && sameBody;
    const velocity = worldVelocity ?? { x: continuous ? (feet.x - previous!.x) / dt : 0,
      y: verticalSpeed, z: continuous ? (feet.z - previous!.z) / dt : 0 };
    this.sheetCooldown = Math.max(0, this.sheetCooldown - Math.min(dt, 0.25));
    if (continuous && query.sampleSheetContact && this.sheetCooldown <= 0) {
      // Three bounded capsule-axis spheres find real sheet contact, never
      // water volume in the air beneath it. Drivers use this same emitter.
      const radius = Math.min(4, this.radiusM, heightM / 2);
      let contact: ReturnType<NonNullable<WorldWaterQuery['sampleSheetContact']>> = null;
      this.sheetProbe.x = feet.x; this.sheetProbe.z = feet.z;
      for (let i = 0; i < 3; i++) {
        this.sheetProbe.y = feet.y + radius + (heightM - 2 * radius) * i / 2;
        const hit = query.sampleSheetContact(this.sheetProbe, radius, epoch);
        if (hit && (!contact || hit.distanceM < contact.distanceM)) contact = hit;
      }
      this.sheetCooldown = contact ? 0.12 : 0.05;
      if (contact) {
        const relativeSpeed = Math.hypot(velocity.x - contact.flowVelocity.x,
          velocity.y - contact.flowVelocity.y, velocity.z - contact.flowVelocity.z);
        if (relativeSpeed > 0.1) query.emitInteraction({ kind: 'splash', position: contact.position,
          velocity, waterVelocity: contact.flowVelocity, radius,
          sheetContact: { waterBodyId: contact.waterBodyId, normal: contact.normal },
          magnitude: Math.min(160, radius * radius * relativeSpeed * relativeSpeed * 8), actorId: this.actorId });
      }
    }
    const relative = Math.hypot(velocity.x - water.flowVelocity.x, velocity.z - water.flowVelocity.z);
    const position = { x: feet.x, y: water.surfaceHeight, z: feet.z };
    if (continuous && wet && !this.wet) {
      query.emitInteraction({ kind: "enter", position, velocity, actorId: this.actorId,
        radius: this.radiusM, magnitude: Math.min(160, 8 + 15 * Math.max(relative, water.flowVelocity.y - velocity.y, 0)) });
      this.distance = 0;
    } else if (continuous && !wet && this.wet && water.waterBodyId && feet.y >= water.surfaceHeight) {
      query.emitInteraction({ kind: "exit", position, velocity, actorId: this.actorId,
        radius: this.radiusM * 0.7, magnitude: Math.min(40, 4 + relative * 4) });
    }
    if (continuous && submerged && !this.submerged) {
      query.emitInteraction({ kind: "submerge", position, velocity, actorId: this.actorId,
        radius: this.radiusM * 0.8, magnitude: Math.min(60, 4 + Math.abs(velocity.y - water.flowVelocity.y) * 8) });
    } else if (continuous && surfaceContact && this.submerged) {
      query.emitInteraction({ kind: "splash", position, velocity, actorId: this.actorId,
        radius: this.radiusM * 0.7, magnitude: Math.min(60, 4 + Math.abs(velocity.y - water.flowVelocity.y) * 8) });
    }
    if (continuous && surfaceContact && this.wet && !this.submerged && relative > 0.2) {
      const spacing = Math.max(0.25, this.radiusM * 1.5);
      const travel = relative * dt;
      const initialDistance = this.distance;
      this.distance += travel;
      const count = Math.min(4, Math.floor(this.distance / spacing));
      this.distance %= spacing;
      // Several spaced wakes, not one frame-bound stamp, for fast hulls.
      // Four per update bounds hitch work; discarded backlog never bursts later.
      for (let i = 0; i < count; i++) {
        const fraction = Math.min(1, Math.max(0, (spacing * (i + 1) - initialDistance) / travel));
        const at = {
          x: previous!.x + (feet.x - previous!.x) * fraction,
          y: feet.y, z: previous!.z + (feet.z - previous!.z) * fraction,
        };
        const local = query.sample(at, epoch);
        if (local.waterBodyId !== water.waterBodyId) continue;
        query.emitInteraction({ kind: "wake", position: { x: at.x, y: local.surfaceHeight, z: at.z },
          velocity, actorId: this.actorId, radius: this.radiusM, magnitude: Math.min(60, relative * relative * 2) });
      }
    } else this.distance = 0;
    this.wet = wet;
    this.submerged = submerged;
    this.bodyId = water.waterBodyId;
    this.previous = { ...feet };
  }
  reset(): void {
    this.lastQuery?.setDisplacementSpheres?.(this.actorId, null); this.lastQuery = null;
    this.previous = null; this.wet = false; this.submerged = false; this.bodyId = null; this.distance = 0;
    this.sheetCooldown = 0;
  }
  dispose(): void { this.reset(); }
}
