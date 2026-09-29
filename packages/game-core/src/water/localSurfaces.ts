/** Local still-water surfaces a PLACE brings with it: a spring pool, a
 * cistern, a stone basin. The province's water record (the frozen rasters,
 * decision 0065) knows nothing of them; they travel in the place bundle
 * (decision 0102 decision 1) and are registered here at load. The renderer
 * draws each as a strip-mode disc (its level and bed ride in the vertices,
 * so the field shader's raster lookup is never consulted), and the water
 * query answers a pool's level inside its rim, so a walker gets wet in it.
 *
 * Injected, never a module singleton (decision 0038): the studio owns one
 * registry, hands it to the settlement loader and to `WaterSurface`.
 */
export interface LocalPoolRecord {
  id: string;
  /** Rim centre, world metres. */
  centreM: [number, number];
  /** Rim radius, metres (2..12). */
  radiusM: number;
  /** Still level, metres above sea (Y-up, sea 0). */
  levelM: number;
  /** Bed height at the centre; the bed rises to the level at the rim. */
  bedM: number;
}

export type LocalSurfacesListener = (pools: readonly LocalPoolRecord[]) => void;

export class LocalWaterSurfaces {
  private readonly pools = new Map<string, LocalPoolRecord>();
  private readonly listeners = new Set<LocalSurfacesListener>();
  private snapshot: readonly LocalPoolRecord[] = [];

  list(): readonly LocalPoolRecord[] { return this.snapshot; }

  /** Adds or replaces the pools of one owner (a place id); removing an
   * owner's pools is `set(owner, [])`. */
  set(owner: string, pools: readonly LocalPoolRecord[]): void {
    for (const key of [...this.pools.keys()]) if (key.startsWith(owner + "\u0000")) this.pools.delete(key);
    for (const p of pools) {
      if (!(p.radiusM >= 2 && p.radiusM <= 12) || !(p.levelM > p.bedM)) {
        throw new RangeError(`local pool ${p.id}: radius 2..12 m and level above bed required`);
      }
      this.pools.set(owner + "\u0000" + p.id, p);
    }
    this.snapshot = Object.freeze([...this.pools.values()]);
    for (const l of this.listeners) l(this.snapshot);
  }

  subscribe(listener: LocalSurfacesListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** The pool under (x, z), if any: the still level and the bed there. */
  at(x: number, z: number): { pool: LocalPoolRecord; levelM: number; bedM: number } | null {
    for (const p of this.snapshot) {
      const dx = x - p.centreM[0], dz = z - p.centreM[1];
      const r = Math.hypot(dx, dz);
      if (r > p.radiusM) continue;
      return { pool: p, levelM: p.levelM, bedM: poolBedAt(p, r) };
    }
    return null;
  }
}

/** The bed profile: a bowl, deepest at the centre, meeting the level at the
 * rim (a natural spring basin, never a vertical wall). */
export function poolBedAt(p: LocalPoolRecord, r: number): number {
  const t = Math.min(1, Math.max(0, r / p.radiusM));
  const bowl = 1 - t * t;
  return p.levelM - (p.levelM - p.bedM) * bowl;
}
