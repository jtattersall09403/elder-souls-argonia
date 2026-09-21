import { describe, expect, it } from "vitest";
import { CellRegistry } from "./cellRegistry";

function dirtyKeys(r: CellRegistry): string[] {
  return r.dirty().map((d) => d.key);
}

function loaded(): CellRegistry {
  const r = new CellRegistry();
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
    const r = new CellRegistry();
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
    const r = new CellRegistry();
    r.chunkLoaded("a");
    expect(dirtyKeys(r)).toEqual([]);
  });
});

describe("a dirty flag raised mid-build", () => {
  it("survives the build that was already running", () => {
    const r = new CellRegistry();
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
