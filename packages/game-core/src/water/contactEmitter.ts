import type { Vec3, WorldWaterQuery } from "@elder-souls/contracts";

/** Surface crossings and distance-spaced wakes for any moving actor/hull.
 * Pass the object's lowest point in metres, independently of render cadence. */
export class WaterContactEmitter {
  private previous: Vec3 | null = null;
  private wet = false;
  private distance = 0;
  constructor(readonly actorId: string, readonly radiusM = 0.35, readonly heightM = 1.7) {}

  update(query: WorldWaterQuery, epoch: number, feet: Vec3, verticalSpeed: number, dt: number): void {
    const water = query.sample(feet, epoch);
    const wet = water.waterBodyId !== null && feet.y < water.surfaceHeight
      && feet.y + this.heightM > water.surfaceHeight;
    const previous = this.previous;
    const displacement = previous ? Math.hypot(feet.x - previous.x, feet.z - previous.z) : 0;
    const continuous = previous !== null && dt > 0 && dt < 0.5 && displacement < 8;
    const velocity = { x: continuous ? (feet.x - previous!.x) / dt : 0,
      y: verticalSpeed, z: continuous ? (feet.z - previous!.z) / dt : 0 };
    const relative = Math.hypot(velocity.x - water.flowVelocity.x, velocity.z - water.flowVelocity.z);
    const position = { x: feet.x, y: water.surfaceHeight, z: feet.z };
    if (continuous && wet && !this.wet) {
      query.emitInteraction({ kind: "enter", position, velocity, actorId: this.actorId,
        radius: this.radiusM, magnitude: Math.min(160, 8 + 15 * Math.max(relative, -verticalSpeed, 0)) });
      this.distance = 0;
    } else if (continuous && !wet && this.wet && water.waterBodyId && feet.y >= water.surfaceHeight) {
      query.emitInteraction({ kind: "exit", position, velocity, actorId: this.actorId,
        radius: this.radiusM * 0.7, magnitude: Math.min(40, 4 + relative * 4) });
    }
    if (continuous && wet) {
      this.distance += relative * dt;
      if (this.distance >= Math.max(0.25, this.radiusM * 1.5) && relative > 0.2) {
        this.distance %= Math.max(0.25, this.radiusM * 1.5);
        query.emitInteraction({ kind: "wake", position, velocity, actorId: this.actorId,
          radius: this.radiusM, magnitude: Math.min(60, relative * relative * 2) });
      }
    }
    this.wet = wet;
    this.previous = { ...feet };
  }
  reset(): void { this.previous = null; this.wet = false; this.distance = 0; }
}
