import type { Vec3, WorldWaterQuery, WaterDisplacementSphere } from "@elder-souls/contracts";
import { PhysicsMassUnits } from "../physics/massUnits";
import { computeBuoyancy, type BuoyancyParams, type BuoyancyResult } from "./buoyancy";
import { WaterContactEmitter } from "./contactEmitter";

/** Structural Rapier boundary; no renderer, React, engine import or duplicate
 * integration. Rapier owns gravity, collisions and the actual rigid body. */
export interface WaterRigidBody {
  translation(): Vec3;
  rotation(): { x: number; y: number; z: number; w: number };
  linvel(): Vec3;
  angvel(): Vec3;
  worldCom(): Vec3;
  applyImpulseAtPoint(impulse: Vec3, point: Vec3, wakeUp: boolean): void;
}
export interface WaterRigidBodyOptions {
  actorId: string;
  /** Author volume and drag in SI. The shared mass conversion is applied once. */
  buoyancy: Omit<BuoyancyParams, "forceScale">;
  massUnits?: PhysicsMassUnits;
  /** Local collision-envelope half extents; surface contacts follow rotation. */
  halfExtentsM: Vec3;
  contactRadiusM?: number;
  /** Optional local hydrodynamic probe centres (at most 8). Equal sphere
   * volumes always sum to buoyancy.volumeM3; this is not exact hull clipping. */
  displacementPoints?: readonly Vec3[];
}

/** One reusable per-body fixed-step driver for dropped props and future hulls.
 * Create with body lifetime, call immediately before each physics step, reset
 * after teleport/pooling. Dense bodies sink naturally: no float/sink flag. */
export class WaterRigidBodyDriver {
  private readonly params: BuoyancyParams;
  private readonly contacts: WaterContactEmitter;
  private readonly displacementPoints: readonly Vec3[];
  private readonly displacement: WaterDisplacementSphere[];
  private lastQuery: WorldWaterQuery | null = null;
  constructor(private readonly options: WaterRigidBodyOptions) {
    const h = options.halfExtentsM;
    if (![h.x, h.y, h.z].every(v => Number.isFinite(v) && v > 0)) {
      throw new RangeError("Water body half extents must be positive and finite");
    }
    this.params = { ...options.buoyancy, forceScale: options.massUnits?.massUnitsPerKg ?? 1 };
    this.contacts = new WaterContactEmitter(options.actorId,
      options.contactRadiusM ?? Math.hypot(h.x, h.z), h.y * 2, { registerDisplacement: false });
    const points = options.displacementPoints ?? options.buoyancy.points;
    // Deterministic representative probes keep the displacement boundary
    // bounded even when a detailed buoyancy hull uses many more force probes.
    this.displacementPoints = points.length ? Array.from({ length: Math.min(8, points.length) }, (_, i) =>
      ({ ...points[Math.floor(i * points.length / Math.min(8, points.length))] })) : [{ x: 0, y: 0, z: 0 }];
    if (!Number.isFinite(options.buoyancy.volumeM3) || options.buoyancy.volumeM3 < 0
      || this.displacementPoints.some(p => ![p.x, p.y, p.z].every(Number.isFinite))) throw new RangeError('Invalid displaced volume or probe positions');
    const radiusM = Math.cbrt(3 * options.buoyancy.volumeM3 / (4 * Math.PI * this.displacementPoints.length));
    this.displacement = this.displacementPoints.map(() => ({ center: { x: 0, y: 0, z: 0 }, radiusM }));
  }
  step(query: WorldWaterQuery, epochMinutes: number, body: WaterRigidBody, dt: number): BuoyancyResult | null {
    if (dt === 0) return null;
    if (!Number.isFinite(dt) || dt < 0 || dt > 0.1) throw new RangeError("Water bodies require fixed physics steps in (0, 0.1] seconds");
    const position = body.translation(), velocity = body.linvel(), q = body.rotation();
    const rotate = (v: Vec3): Vec3 => {
      const tx = 2 * (q.y * v.z - q.z * v.y);
      const ty = 2 * (q.z * v.x - q.x * v.z);
      const tz = 2 * (q.x * v.y - q.y * v.x);
      return { x: v.x + q.w * tx + q.y * tz - q.z * ty,
        y: v.y + q.w * ty + q.z * tx - q.x * tz,
        z: v.z + q.w * tz + q.x * ty - q.y * tx };
    };
    if (this.lastQuery && this.lastQuery !== query) this.lastQuery.setDisplacementSpheres?.(this.options.actorId, null);
    this.lastQuery = query;
    if (this.params.volumeM3 > 0) {
      for (let i = 0; i < this.displacement.length; i++) {
        const offset = rotate(this.displacementPoints[i]), proxy = this.displacement[i];
        proxy.center.x = position.x + offset.x; proxy.center.y = position.y + offset.y; proxy.center.z = position.z + offset.z;
      }
      query.setDisplacementSpheres?.(this.options.actorId, this.displacement);
    } else query.setDisplacementSpheres?.(this.options.actorId, null);
    const result = computeBuoyancy(query, epochMinutes, position, rotate, velocity,
      this.params, { angularVelocity: body.angvel(), centerOfMass: body.worldCom() });
    for (const { force, point } of result.pointForces) {
      if (force.x === 0 && force.y === 0 && force.z === 0) continue;
      body.applyImpulseAtPoint({ x: force.x * dt, y: force.y * dt, z: force.z * dt }, point, true);
    }
    const h = this.options.halfExtentsM;
    // Project the rotated collision envelope onto vertical; an overturned
    // hull's water-entry boundary is not its old upright bottom.
    const halfHeight = Math.abs(2 * (q.x * q.y + q.w * q.z)) * h.x
      + Math.abs(1 - 2 * (q.x * q.x + q.z * q.z)) * h.y
      + Math.abs(2 * (q.y * q.z - q.w * q.x)) * h.z;
    this.contacts.update(query, epochMinutes,
      { x: position.x, y: position.y - halfHeight, z: position.z }, velocity.y, dt, velocity, halfHeight * 2);
    return result;
  }
  reset(): void {
    this.contacts.reset(); this.lastQuery?.setDisplacementSpheres?.(this.options.actorId, null); this.lastQuery = null;
  }
  dispose(): void { this.reset(); }
}
