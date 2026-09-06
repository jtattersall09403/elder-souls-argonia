import type { Vec3 } from '@elder-souls/contracts';
import type { WaterMeta } from '../waterData';

type Cascade = NonNullable<WaterMeta['cascades']>[number];
const CELL_M = 128;

export function waterSourceDistanceSquared(camera: Vec3, plunge: Vec3, lip?: Vec3): number {
  let x = plunge.x, y = plunge.y, z = plunge.z;
  if (lip) {
    const dx = lip.x - x, dy = lip.y - y, dz = lip.z - z;
    const t = Math.max(0, Math.min(1, ((camera.x - x) * dx + (camera.y - y) * dy + (camera.z - z) * dz)
      / Math.max(1e-12, dx * dx + dy * dy + dz * dz)));
    x += dx * t; y += dy * t; z += dz * t;
  }
  return (camera.x - x) ** 2 + (camera.y - y) ** 2 + (camera.z - z) ** 2;
}

/** Spatially local, nearest-first source admission. File ordering must never
 * let eight distant/behind-camera falls starve the fall beside the player. */
export class WaterCascadeSources {
  private readonly cells = new Map<string, Cascade[]>();
  private readonly seen = new Set<Cascade>();
  private readonly result: Cascade[] = [];
  private readonly distances: number[] = [];
  constructor(cascades: readonly Cascade[]) {
    for (const fall of cascades) {
      const x0 = Math.floor(Math.min(fall.lip.x, fall.plunge.x) / CELL_M);
      const x1 = Math.floor(Math.max(fall.lip.x, fall.plunge.x) / CELL_M);
      const z0 = Math.floor(Math.min(fall.lip.z, fall.plunge.z) / CELL_M);
      const z1 = Math.floor(Math.max(fall.lip.z, fall.plunge.z) / CELL_M);
      if (!Number.isFinite(x0 + x1 + z0 + z1) || (x1 - x0 + 1) * (z1 - z0 + 1) > 4096) {
        throw new Error(`Invalid cascade spatial bounds: ${fall.id}`);
      }
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const key = `${x},${z}`;
        const entries = this.cells.get(key);
        if (entries) entries.push(fall); else this.cells.set(key, [fall]);
      }
    }
  }

  /** Reused view valid until the next call. */
  nearby(camera: Vec3, radiusM = 100, limit = 8): readonly Cascade[] {
    this.result.length = 0; this.distances.length = 0; this.seen.clear();
    const radius = Math.max(0, Math.min(300, radiusM));
    const count = Math.max(0, Math.min(32, Math.floor(limit)));
    if (!count || !Number.isFinite(camera.x + camera.y + camera.z + radius)) return this.result;
    for (let z = Math.floor((camera.z - radius) / CELL_M); z <= Math.floor((camera.z + radius) / CELL_M); z++) {
      for (let x = Math.floor((camera.x - radius) / CELL_M); x <= Math.floor((camera.x + radius) / CELL_M); x++) {
        for (const fall of this.cells.get(`${x},${z}`) ?? []) {
          if (this.seen.has(fall)) continue;
          this.seen.add(fall);
          const distance = waterSourceDistanceSquared(camera, fall.plunge, fall.lip);
          if (distance > radius * radius) continue;
          let at = 0;
          while (at < this.distances.length && this.distances[at] <= distance) at++;
          if (at >= count) continue;
          this.result.splice(at, 0, fall); this.distances.splice(at, 0, distance);
          if (this.result.length > count) { this.result.pop(); this.distances.pop(); }
        }
      }
    }
    return this.result;
  }
}
