import { describe, expect, it } from "vitest";
import { CellRegistry, LOD_SETTLE_MS } from "./cellRegistry";

function dirtyKeys(r: CellRegistry): string[] {
  return r.dirty().map((d) => d.key);
}

function loaded(): CellRegistry {
  const r = new CellRegistry({ settleMs: 0 });
  r.chunkLoaded("a");
  r.terrainLod("a", "2");
  return r;
}

describe("CellRegistry", () => {
  it("dirties a loaded cell once, then never again", () => {
    const r = loaded();
    expect(dirtyKeys(r)).toEqual(["a"]);
    r.built("a", "2");
    expect(dirtyKeys(r)).toEqual([]);
    expect(r.rebuilds).toBe(0);
  });

  it("a camera move never dirties a cell", () => {
    const r = loaded();
    r.built("a", "2");
    for (let i = 0; i < 1000; i++) r.cameraMoved(i * 3.7, -i * 1.3);
    expect(dirtyKeys(r)).toEqual([]);
    expect(r.rebuilds).toBe(0);
  });

  it("a coarser LOD is a no-op; a finer one rebuilds once", () => {
    const r = loaded();
    r.built("a", "2");
    r.terrainLod("a", "4");
    expect(dirtyKeys(r)).toEqual([]);
    r.terrainLod("a", "1");
    expect(dirtyKeys(r)).toEqual(["a"]);
    r.built("a", "1");
    expect(r.rebuilds).toBe(1);
    expect(r.reasons["finer-lod"]).toBe(1);
    expect(dirtyKeys(r)).toEqual([]);
  });

  it("a cell built at the finest LOD never re-dirties on LOD changes", () => {
    const r = new CellRegistry({ settleMs: 0 });
    r.chunkLoaded("a");
    r.terrainLod("a", "1");
    r.built("a", "1");
    for (const lod of ["4", "2", "1"] as const) r.terrainLod("a", lod);
    expect(dirtyKeys(r)).toEqual([]);
  });

  it("a forced kit change dirties every built cell", () => {
    const r = loaded();
    r.chunkLoaded("b");
    r.terrainLod("b", "1");
    r.built("a", "2");
    r.built("b", "1");
    r.kitChanged();
    expect(dirtyKeys(r).sort()).toEqual(["a", "b"]);
    r.built("a", "2");
    expect(r.reasons.kit).toBe(1);
  });

  it("a kit ARRIVAL dirties only the cells that skipped one of its species", () => {
    const r = loaded();
    r.chunkLoaded("b");
    r.terrainLod("b", "1");
    r.built("a", "2", ["coral"]);
    r.built("b", "1", []);
    r.kitChanged(new Set(["coral", "kelp"]));
    expect(dirtyKeys(r)).toEqual(["a"]);
    // And it never re-dirties for a species it has since built.
    r.built("a", "2", []);
    r.kitChanged(new Set(["coral", "kelp"]));
    expect(dirtyKeys(r)).toEqual([]);
  });

  it("an unbuilt cell with no terrain is not dirty", () => {
    const r = new CellRegistry({ settleMs: 0 });
    r.chunkLoaded("a");
    expect(dirtyKeys(r)).toEqual([]);
  });
});

describe("a dirty flag raised mid-build", () => {
  it("survives the build that was already running", () => {
    const r = new CellRegistry({ settleMs: 0 });
    r.chunkLoaded("a");
    r.terrainLod("a", "2");
    const serial = r.serial("a");
    expect(dirtyKeys(r)).toEqual(["a"]);
    r.drawScaleChanged();          // raised WHILE the job runs
    r.built("a", "2", [], serial); // lands with the stale serial
    expect(dirtyKeys(r)).toEqual(["a"]);
    expect(r.reason("a")).toBe("first");
    // The rebuild that carries the live serial does clear it.
    r.built("a", "2", [], r.serial("a"));
    expect(dirtyKeys(r)).toEqual([]);
  });
});

/**
 * Startup LOD stream replay (walk 5, 2026-09-29). 49 cells on a 7 × 7 ring;
 * each receives the coarse LODs a cold start streams (4, then 2, then 1 for
 * the inner cells) at staggered times, the way `prefetchChunks` and the
 * terrain's distance ladder deliver them. A frame loop at 60 Hz builds every
 * dirty cell that frame. The counter is `rebuilds`: builds of a cell that had
 * already been built.
 */
function replayStartup(settleMs: number): { rebuilds: number; builds: number; settledMs: number } {
  let t = 0;
  const r = new CellRegistry({ settleMs, now: () => t });
  const events: { at: number; key: string; lod: "1" | "2" | "4" }[] = [];
  for (let z = -3; z <= 3; z++) {
    for (let x = -3; x <= 3; x++) {
      const key = `${x},${z}`;
      const ring = Math.max(Math.abs(x), Math.abs(z));
      const start = 200 + ring * 150 + ((x * 37 + z * 11) & 63);
      events.push({ at: start, key, lod: "4" });
      if (ring <= 2) events.push({ at: start + 180, key, lod: "2" });
      if (ring <= 1) events.push({ at: start + 420, key, lod: "1" });
    }
  }
  for (const e of events) r.chunkLoaded(e.key);
  const lods = new Map<string, "1" | "2" | "4">();
  let builds = 0;
  let settledMs = 0;
  for (let frame = 0; frame < 600; frame++) {
    t = frame * (1000 / 60);
    for (const e of events) if (e.at <= t && (lods.get(e.key) ?? "8") > e.lod) lods.set(e.key, e.lod);
    for (const [key, lod] of lods) r.terrainLod(key, lod);
    for (const d of r.dirty()) {
      r.built(d.key, lods.get(d.key)!, [], d.serial);
      builds++;
      settledMs = t;
    }
  }
  return { rebuilds: r.rebuilds, builds, settledMs };
}

describe("CellRegistry startup replay", () => {
  it("builds every cell once, at the LOD it settles on", () => {
    const before = replayStartup(0);
    const after = replayStartup(LOD_SETTLE_MS);
    // Before: every inner cell rebuilt per finer LOD (9 × 2 + 16 × 1 = 34).
    expect(before.rebuilds).toBe(34);
    expect(after.rebuilds).toBe(0);
    expect(after.builds).toBe(49);
    // The settle wait is bounded: the last cell builds within LOD_SETTLE_MS
    // (plus one frame) of the last LOD event.
    expect(after.settledMs - before.settledMs).toBeLessThanOrEqual(LOD_SETTLE_MS + 17);
    process.stderr.write(`[startup replay] builds ${before.builds} -> ${after.builds}, rebuilds ${before.rebuilds} -> ${after.rebuilds}, settled ${Math.round(before.settledMs)} -> ${Math.round(after.settledMs)} ms\n`);
  });

  it("LOD 1 never waits; a kit rebuild never waits", () => {
    let t = 0;
    const r = new CellRegistry({ now: () => t });
    r.chunkLoaded("a");
    r.terrainLod("a", "1");
    expect(r.reason("a")).toBe("first");
    r.built("a", "1");
    r.kitChanged();
    expect(r.reason("a")).toBe("kit");
    r.chunkLoaded("b");
    r.terrainLod("b", "4");
    expect(r.reason("b")).toBe(null);
    t = LOD_SETTLE_MS;
    expect(r.reason("b")).toBe("first");
  });
});
