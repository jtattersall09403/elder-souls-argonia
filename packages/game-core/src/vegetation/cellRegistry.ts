/**
 * Which cells need building, and why (decision 0082 §1).
 *
 * The no-rebuild-on-move gate lives here and nowhere else: `cameraMoved` is
 * deliberately a no-op for dirtiness, and the unit test asserts it. A cell is
 * built when its chunk is loaded and its terrain is at some LOD; it is built
 * AGAIN only when a FINER terrain LOD arrives (re-grounding), or when the kit
 * or the quality `drawScale` changes — both rare and user-driven.
 */

export type TerrainLod = "1" | "2" | "4" | null;

/** Finer is a SMALLER number: "1" is the finest. */
function finer(a: Exclude<TerrainLod, null>, b: Exclude<TerrainLod, null>): boolean {
  return Number(a) < Number(b);
}

export type CellRebuildReason = "finer-lod" | "kit" | "draw-scale";

interface CellState {
  loaded: boolean;
  lod: TerrainLod;
  builtAt: TerrainLod;
  /** Forced dirty by a kit or drawScale change. */
  forced: CellRebuildReason | null;
  /** Species in this chunk the kit did not hold at build time. */
  skipped: readonly string[];
  /** Bumped by every dirtying event. A build that lands with a stale serial
   * leaves the cell dirty: the flag raised mid-build is not swallowed. */
  serial: number;
}

/** A dirty cell and the serial its build job must carry back. */
export interface DirtyCell {
  key: string;
  serial: number;
}

export class CellRegistry {
  private readonly cells = new Map<string, CellState>();

  /** Builds of a cell that had already been built. */
  rebuilds = 0;

  /** Why those rebuilds happened. */
  readonly reasons: Record<CellRebuildReason, number> = {
    "finer-lod": 0, kit: 0, "draw-scale": 0,
  };

  private state(key: string): CellState {
    let s = this.cells.get(key);
    if (!s) {
      s = {
        loaded: false, lod: null, builtAt: null, forced: null, skipped: [],
        serial: 0,
      };
      this.cells.set(key, s);
    }
    return s;
  }

  chunkLoaded(key: string): void {
    const s = this.state(key);
    s.loaded = true;
    s.serial++;
  }

  chunkUnloaded(key: string): void {
    this.cells.delete(key);
  }

  terrainLod(key: string, lod: TerrainLod): void {
    const s = this.cells.get(key);
    if (!s) return;
    if (s.lod !== lod) s.serial++;
    s.lod = lod;
  }

  /** Deliberately does nothing: a camera move never dirties a cell. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  cameraMoved(_x: number, _z: number): void {
    /* no-op by design — decision 0082 §1 */
  }

  /**
   * A kit arrived. With `nowInKit`, only the cells that SKIPPED one of the
   * arriving species are dirtied: a cell never rebuilds for a species it has
   * already built. Without it (the dev force-rebuild hook), every cell.
   */
  kitChanged(nowInKit?: ReadonlySet<string>): void {
    for (const s of this.cells.values()) {
      if (s.builtAt === null) continue;
      if (nowInKit && !s.skipped.some((id) => nowInKit.has(id))) continue;
      s.forced = "kit";
      s.serial++;
    }
  }

  drawScaleChanged(): void {
    for (const s of this.cells.values()) {
      if (s.builtAt === null) {
        // An in-flight FIRST build also has to be redone: its speciesParams
        // were captured against the old ladder.
        s.serial++;
        continue;
      }
      s.forced = "draw-scale";
      s.serial++;
    }
  }

  /** Why this cell is dirty, or null when it is not. */
  reason(key: string): CellRebuildReason | "first" | null {
    const s = this.cells.get(key);
    if (!s || !s.loaded || s.lod === null) return null;
    if (s.builtAt === null) return "first";
    if (s.forced) return s.forced;
    if (finer(s.lod, s.builtAt)) return "finer-lod";
    return null;
  }

  /** The dirty cells, each with the serial its build must hand back. */
  dirty(): DirtyCell[] {
    const out: DirtyCell[] = [];
    for (const [key, s] of this.cells) {
      if (this.reason(key)) out.push({ key, serial: s.serial });
    }
    return out;
  }

  /** The serial to capture when a build job starts. */
  serial(key: string): number {
    return this.cells.get(key)?.serial ?? -1;
  }

  /** Record that `key` has been built against terrain LOD `lod`. */
  built(
    key: string,
    lod: TerrainLod,
    skipped: readonly string[] = [],
    serial?: number,
  ): void {
    const s = this.cells.get(key);
    if (!s) return;
    s.skipped = skipped;
    // A dirtying event DURING the build (a kit, a quality change, a finer
    // terrain LOD) bumped the serial: this result is stale, so the cell keeps
    // exactly the dirtiness it had and is built again against live parameters.
    if (serial !== undefined && serial !== s.serial) return;
    if (s.builtAt !== null) {
      this.rebuilds++;
      const why = s.forced ?? "finer-lod";
      this.reasons[why]++;
    }
    s.builtAt = lod;
    s.forced = null;
  }

  get size(): number {
    return this.cells.size;
  }
}
