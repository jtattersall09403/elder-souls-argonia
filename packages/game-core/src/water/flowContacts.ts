import type { Vec3, WaterInteractionEvent, WorldWaterQuery } from "@elder-souls/contracts";

/** Local terrain-obstacle contacts, not a fluid solver. The caller's water
 * query must include the real terrain. Dynamic objects emit their own events. */
export class WaterFlowContacts {
  private cursor = 0;
  private clock = 0;
  private scanTime = 0;
  private readonly active = new Map<string, { event: WaterInteractionEvent; expires: number }>();

  update(query: WorldWaterQuery, epoch: number, camera: Vec3, delta: number,
    emit: (id: string, event: WaterInteractionEvent, rate: number, delta: number) => void): void {
    if (!Number.isFinite(delta) || delta <= 0 || delta > 0.5) return;
    this.clock += delta;
    this.scanTime += delta;
    // Twelve sites per 50 ms, fixed world lattice, ~1.2 s for the local ring.
    // Consume elapsed slices at slower frame rates so active contacts are
    // refreshed before expiry. Cap work after stalls at 48 sites per frame.
    if (this.scanTime >= 0.05) {
      const slices = Math.min(4, Math.floor((this.scanTime + 1e-9) / 0.05));
      this.scanTime = Math.max(0, this.scanTime - slices * 0.05);
      if (slices === 4) this.scanTime %= 0.05;
      const cx = Math.round(camera.x / 1.5), cz = Math.round(camera.z / 1.5);
      for (let count = 0; count < 12 * slices; count++) {
        const site = this.cursor++ % 289;
        const x = (cx + site % 17 - 8) * 1.5, z = (cz + Math.floor(site / 17) - 8) * 1.5;
        const id = `water-obstacle.${Math.round(x / 1.5)}.${Math.round(z / 1.5)}`;
        const sample = query.sample({ x, y: camera.y, z }, epoch);
        const speed = Math.hypot(sample.flowVelocity.x, sample.flowVelocity.z);
        if (!sample.waterBodyId || sample.depth < 0.025 || sample.depth > 1.5 || speed < 0.6
          || camera.y < sample.surfaceHeight - 0.1 || camera.y > sample.surfaceHeight + 20) {
          this.active.delete(id); continue;
        }
        const dx = sample.flowVelocity.x / speed, dz = sample.flowVelocity.z / speed;
        const probe = (ox: number, oz: number) => query.sample({ x: x + ox, y: sample.surfaceHeight, z: z + oz }, epoch);
        // A dry obstruction ahead, with a wet escape to either side. This
        // excludes arbitrary deep-water spray and closed/draining puddles.
        const ahead = probe(dx * 0.9, dz * 0.9);
        const left = probe(-dz * 0.8, dx * 0.8), right = probe(dz * 0.8, -dx * 0.8);
        if (ahead.waterBodyId || (left.waterBodyId !== sample.waterBodyId && right.waterBodyId !== sample.waterBodyId)) {
          this.active.delete(id); continue;
        }
        if (!this.active.has(id) && this.active.size >= 16) continue;
        this.active.set(id, { expires: this.clock + 1.5, event: {
          kind: speed > 1.4 ? "splash" : "wake", actorId: id,
          // Event velocity is the emitter's world velocity. This obstacle
          // is stationary; WaterEffects subtracts the local current once.
          position: { x, y: sample.surfaceHeight, z }, velocity: { x: 0, y: 0, z: 0 },
          radius: Math.min(0.55, sample.depth * 0.6 + 0.12), magnitude: Math.min(35, speed * speed * sample.depth * 8),
        } });
      }
    }
    for (const [id, source] of this.active) {
      if (source.expires < this.clock || Math.hypot(source.event.position.x - camera.x, source.event.position.z - camera.z) > 20
        || camera.y < source.event.position.y - 0.1 || camera.y > source.event.position.y + 20) this.active.delete(id);
      else emit(id, source.event, 2, delta);
    }
  }
}
