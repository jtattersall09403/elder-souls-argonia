import type { Vec3, WaterInteractionEvent, WorldWaterQuery } from '@elder-souls/contracts';
import type { WaterMeta } from '../waterData';

export type Cascade = NonNullable<WaterMeta['cascades']>[number];
const CELL_M = 128;

/** The compiled lip remains authoritative; the receiving height follows the
 * live wet query. No pool is invented when a source loses its receiving water. */
export function cascadeEmission(fall: Cascade, query: WorldWaterQuery, epochMinutes: number):
  { event: WaterInteractionEvent; mist: number; fallFrom: Vec3 } | { reason: string } {
  const water = query.sample(fall.plunge, epochMinutes);
  if (!water.waterBodyId || water.depth <= 0.015 || !Number.isFinite(water.surfaceHeight)) {
    return { reason: 'cascadeDryReceiver' };
  }
  const dropM = fall.lip.y - water.surfaceHeight;
  if (!(dropM > 0.5) || !Number.isFinite(dropM)) return { reason: 'cascadeSubmergedLip' };
  const flightS = Math.sqrt(2 * dropM / 9.81);
  return { event: { kind: 'splash', actorId: fall.id,
    position: { x: fall.plunge.x, y: water.surfaceHeight, z: fall.plunge.z },
    velocity: { x: (fall.plunge.x - fall.lip.x) / flightS, y: -9.81 * flightS,
      z: (fall.plunge.z - fall.lip.z) / flightS },
    radius: Math.min(2.5, fall.widthM * 0.25), magnitude: Math.min(120, dropM * fall.widthM * 3) },
    mist: Math.min(1, dropM / 8), fallFrom: fall.lip };
}

/** A traced point on a fall's sheet path; the sheet builder produces these. */
export interface CascadeStation { x: number; y: number; z: number; speedMS: number }

export interface CascadeEmitter {
  id: string;
  event: WaterInteractionEvent;
  mist: number;
  ratePerSecond: number;
  fallFrom?: Vec3;
}

/** Only the nearest few falls get the full kit; the rest keep the plunge. */
export const CASCADE_PATH_LIMIT = 2;
/**
 * Spray emitters are spaced down the fall by HEIGHT (decision 0064: the
 * owner saw no spray at all under the old 1/2/4-emitter accent kit): one
 * every `SPRAY_SPACING_M` of drop, at most `SPRAY_MAX_MIDS`, plus the lip on
 * a tall fall and the plunge cloud on every fall. Rates grow with the
 * distance fallen (Varden) and with width.
 */
export const SPRAY_SPACING_M = 6;
export const SPRAY_MAX_MIDS = 10;
export const SPRAY_LIP_DROP_M = 30;
/**
 * Bursts per second (each burst spawns `waterEmissionProfile(event).count`
 * particles, ~10 at these magnitudes): a mid emitter at the lip and at the
 * foot, the lip emitter, the plunge cloud. Sized so the nearest two hero
 * falls stay inside the high-tier pool (`WaterfallSheets.test.ts`).
 */
export const SPRAY_RATE = { midTop: 0.4, midFoot: 1.2, lip: 0.8, cloud: 3 } as const;
/** Impact bursts (crowns + droplets) at the plunge, per second, on the nearest falls. */
export const IMPACT_BURSTS_PER_S = 2.5;

/**
 * The emitter kit for a drop: mid-sheet emitters every `SPRAY_SPACING_M`
 * (as fractions of the drop), the lip on a fall over `SPRAY_LIP_DROP_M`.
 */
export function cascadeEmitterKit(dropM: number): { lip: boolean; mids: readonly number[] } {
  const n = Math.min(Math.max(Math.round(dropM / SPRAY_SPACING_M), 1), SPRAY_MAX_MIDS);
  const mids = Array.from({ length: n }, (_, i) => (i + 0.5) / n);
  return { lip: dropM >= SPRAY_LIP_DROP_M, mids };
}

/**
 * The spray/mist kit ALONG a fall, not only under it (the standard reference
 * recipe: spray at the lip, emitters down the run whose rate grows with the
 * distance fallen and the local speed, a mist cloud and surface splash at the
 * bottom) — sized by `cascadeEmitterKit`. Mid-air emitters carry a
 * `sheetContact` so the particle stack spawns them on the falling sheet
 * rather than rejecting them as being above the water surface. Every rate
 * scales with width and drop.
 */
export function cascadePathEmitters(
  fall: Cascade,
  stations: readonly CascadeStation[],
  query: WorldWaterQuery,
  epochMinutes: number,
): CascadeEmitter[] {
  if (stations.length < 3) return [];
  const water = query.sample(fall.plunge, epochMinutes);
  if (!water.waterBodyId || water.depth <= 0.015 || !Number.isFinite(water.surfaceHeight)) return [];
  const dropM = fall.lip.y - water.surfaceHeight;
  if (!(dropM > 0.5) || !Number.isFinite(dropM)) return [];
  const widthScale = Math.sqrt(Math.min(Math.max(fall.widthM / 6, 0.5), 2));
  const dx = fall.direction.x, dz = fall.direction.z;
  // The sheet face looks back up the fall line; the particle stack only needs
  // a valid unit-ish normal to treat the contact as sheet-borne water.
  const normal = { x: -dx, y: 0.35, z: -dz };
  const emitters: CascadeEmitter[] = [];

  const kit = cascadeEmitterKit(dropM);
  const lip = stations[1] ?? stations[0];
  if (kit.lip) emitters.push({
    id: `${fall.id}:lip`, mist: 0.25, ratePerSecond: SPRAY_RATE.lip * widthScale, fallFrom: fall.lip,
    event: { kind: 'splash', actorId: `${fall.id}:lip`,
      position: { x: lip.x, y: lip.y, z: lip.z },
      velocity: { x: dx * lip.speedMS, y: -1.5, z: dz * lip.speedMS },
      radius: 0.6 * widthScale, magnitude: 6,
      sheetContact: { waterBodyId: water.waterBodyId, normal } },
  });

  for (const at of kit.mids) {
    // Spaced by HEIGHT fallen, not by station index: the trace steps by path
    // length, so index fractions would bunch every emitter near the plunge.
    const target = fall.lip.y - dropM * at;
    let station = stations[1];
    for (const candidate of stations) {
      if (Math.abs(candidate.y - target) < Math.abs(station.y - target)) station = candidate;
    }
    if (station.y <= water.surfaceHeight + 0.15) continue;
    const fallen = Math.min(Math.max((fall.lip.y - station.y) / dropM, 0), 1);
    const speed = Math.max(station.speedMS, 1);
    emitters.push({
      id: `${fall.id}:mid${at.toFixed(2)}`, mist: 0.9, fallFrom: fall.lip,
      ratePerSecond: (SPRAY_RATE.midTop + (SPRAY_RATE.midFoot - SPRAY_RATE.midTop) * fallen) * widthScale,
      event: { kind: 'splash', actorId: `${fall.id}:mid`,
        position: { x: station.x, y: station.y, z: station.z },
        velocity: { x: dx * speed * 0.3, y: -speed, z: dz * speed * 0.3 },
        // the puffs must be SEEN from the pool: a metre-scale radius, more
        // lower down; the magnitude sets the burst COUNT (~10), not the size
        radius: (0.8 + 0.9 * fallen) * widthScale, magnitude: 9,
        sheetContact: { waterBodyId: water.waterBodyId, normal } },
    });
  }

  // The plunge cloud: a hanging mist several metres across over the impact,
  // riding the pool surface (no sheet contact); the runtime's aerial term
  // tints it with everything else.
  emitters.push({
    id: `${fall.id}:cloud`, mist: 1, ratePerSecond: SPRAY_RATE.cloud, fallFrom: fall.lip,
    event: { kind: 'splash', actorId: `${fall.id}:cloud`,
      position: { x: fall.plunge.x, y: water.surfaceHeight, z: fall.plunge.z },
      velocity: { x: 0, y: -1, z: 0 },
      radius: Math.min(3, 1 + fall.widthM * 0.25), magnitude: 12 },
  });
  return emitters;
}

/**
 * The impact itself: a discrete splash at the plunge (crown ring + droplets
 * thrown up, `WaterEffects.emit`), `IMPACT_BURSTS_PER_S` times a second per
 * fall, phased by fall id so neighbours do not beat together. Returns the
 * burst events due between `prevS` and `nowS` (world seconds).
 */
export function cascadeImpactBursts(fall: Cascade, query: WorldWaterQuery, epochMinutes: number,
  prevS: number, nowS: number): WaterInteractionEvent[] {
  if (!(nowS > prevS) || nowS - prevS > 2) return [];
  const water = query.sample(fall.plunge, epochMinutes);
  if (!water.waterBodyId || water.depth <= 0.015 || !Number.isFinite(water.surfaceHeight)) return [];
  const dropM = fall.lip.y - water.surfaceHeight;
  if (!(dropM > 0.5) || !Number.isFinite(dropM)) return [];
  let phase = 0;
  for (let i = 0; i < fall.id.length; i++) phase = (phase * 31 + fall.id.charCodeAt(i)) % 997;
  const period = 1 / IMPACT_BURSTS_PER_S;
  const offset = (phase / 997) * period;
  const first = Math.ceil((prevS - offset) / period);
  const last = Math.floor((nowS - offset) / period);
  const out: WaterInteractionEvent[] = [];
  const speed = Math.min(Math.sqrt(2 * 9.81 * dropM), 40);
  for (let k = first; k <= last && out.length < 4; k++) {
    const jitter = ((k * 7919 + phase) % 100) / 100 - 0.5;
    out.push({ kind: 'splash', actorId: `${fall.id}:impact`,
      position: { x: fall.plunge.x + jitter * fall.widthM * 0.4, y: water.surfaceHeight, z: fall.plunge.z + jitter * 0.3 * fall.widthM },
      velocity: { x: fall.direction.x * 2, y: -speed, z: fall.direction.z * 2 },
      radius: Math.min(2.5, 0.5 + fall.widthM * 0.2), magnitude: Math.min(120, dropM * fall.widthM * 2) });
  }
  return out;
}

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
