import { describe, expect, it } from "vitest";
import {
  GATE_MARGIN_M,
  gateSpecies,
  rangeDistances,
  rungVisible,
  type GateRung,
  type GateSpecies,
  type GateStats,
  type GateTile,
} from "./cellGating";
import { LOD_OPEN_M } from "../fx/lodFade";

const box = { minX: 0, minZ: 0, maxX: 10, maxZ: 10 };

describe("rangeDistances", () => {
  it("is zero inside the box, and the farthest corner is dMax", () => {
    const inside = rangeDistances(box, 5, 5);
    expect(inside.dMin).toBe(0);
    expect(inside.dMax).toBeCloseTo(Math.hypot(5, 5));
    const outside = rangeDistances(box, -10, 5);
    expect(outside.dMin).toBeCloseTo(10);
    expect(outside.dMax).toBeCloseTo(Math.hypot(20, 5));
  });
});

describe("rungVisible", () => {
  it("closes at both band edges and allows for the vanish half-width", () => {
    expect(rungVisible([50, 100, 0, 0], 0, 40)).toBe(false);
    expect(rungVisible([50, 100, 0, 0], 0, 50)).toBe(true);
    expect(rungVisible([50, 100, 0, 0], 100, 200)).toBe(false);
    expect(rungVisible([50, 100, 0, 8], 105, 200)).toBe(true);
    expect(rungVisible([0, LOD_OPEN_M, 0, 0], 5000, 6000)).toBe(true);
  });
});

const CELL = 468;
const TILES = 8;

function stats(): GateStats {
  return { visibleCopies: 0, visibleTriangles: 0, checksCell: 0, checksTile: 0 };
}

function tileAt(tx: number, tz: number): GateTile {
  const s = CELL / TILES;
  return {
    box: { minX: tx * s, minZ: tz * s, maxX: (tx + 1) * s, maxZ: (tz + 1) * s },
    ids: [new Int32Array(1)],
    copies: 1,
    triangles: 10,
  };
}

function rung(
  band: [number, number, number, number],
  near: boolean,
  tiles: GateTile[],
): GateRung {
  return {
    band, near, tiles, state: new Uint8Array(tiles.length),
    copies: tiles.reduce((a, t) => a + t.copies, 0),
    triangles: tiles.reduce((a, t) => a + t.triangles, 0),
    uniform: 0,
  };
}

function cellEntry(rungs: GateRung[]): GateSpecies {
  return {
    key: "k", cell: "c", species: "s", maxDraw: 100,
    cellBox: { minX: 0, minZ: 0, maxX: CELL, maxZ: CELL },
    rungs, near: rungs.some((r) => r.near),
  };
}

function allTiles(): GateTile[] {
  const out: GateTile[] = [];
  for (let tz = 0; tz < TILES; tz++) for (let tx = 0; tx < TILES; tx++) out.push(tileAt(tx, tz));
  return out;
}

describe("gateSpecies", () => {
  it("holds every rung of an open band on, wherever the camera looks", () => {
    const nearRung = rung([0, LOD_OPEN_M, 0, 0], true, allTiles());
    const farRung = rung([0, LOD_OPEN_M, 0, 0], false, allTiles());
    const entry = cellEntry([nearRung, farRung]);
    const s = stats();
    gateSpecies([entry], { x: 0, y: 0, z: 0 }, () => undefined, s, 0);
    expect(nearRung.uniform).toBe(1);
    expect(farRung.uniform).toBe(1);
    expect(s.visibleCopies).toBe(nearRung.copies + farRung.copies);
  });

  it("resolves a cell beyond the band with no per-tile test at all", () => {
    const r = rung([0, 60, 0, 8], false, allTiles());
    const s = stats();
    gateSpecies([cellEntry([r])], { x: -5000, y: 0, z: -5000 },
      () => undefined, s, 0);
    expect(s.checksTile).toBe(0);
    expect(s.visibleCopies).toBe(0);
    expect(r.uniform).toBe(0);
  });

  it("tests per tile only where the band's edge crosses the cell", () => {
    const r = rung([0, 60, 0, 8], false, allTiles());
    const s = stats();
    const applied: boolean[] = [];
    gateSpecies([cellEntry([r])], { x: 0, y: 0, z: 0 },
      (_t, v) => applied.push(v), s, 0);
    expect(s.checksTile).toBe(64);
    // The tiles nearest the eye are on, the far corner is off.
    expect(r.state[0]).toBe(1);
    expect(r.state[63]).toBe(0);
    expect(applied.filter((v) => v).length).toBe(s.visibleCopies);
  });

  it("holds a tile just outside a band on, with the margin", () => {
    const tiles = [tileAt(0, 0)];
    // The tile spans 0..58.5 m; an eye 78.5 m away in x is 20 m beyond the
    // band's outer edge, which the 24 m margin still covers.
    const eye = { x: -78.5, y: 0, z: 0 };
    const withMargin = rung([0, 58.5, 0, 0], false, tiles);
    const s = stats();
    gateSpecies([{ ...cellEntry([withMargin]), cellBox: tiles[0].box }], eye,
      () => undefined, s, GATE_MARGIN_M);
    expect(withMargin.uniform).not.toBe(0);
    const without = rung([0, 58.5, 0, 0], false, [tileAt(0, 0)]);
    gateSpecies([{ ...cellEntry([without]), cellBox: without.tiles[0].box }],
      eye, () => undefined, s, 0);
    expect(without.uniform).toBe(0);
  });

  it("matches a brute-force per-tile evaluation at 200 random eyes", () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const bands: [number, number, number, number][] = [
      [0, 60, 0, 8], [60, 140, 0, 0], [140, LOD_OPEN_M, 0, 0], [0, 24, 0, 8],
    ];
    const rungs = bands.map((b, i) => rung(b, i === 0, allTiles()));
    const entry = cellEntry(rungs);
    const s = stats();
    for (let trial = 0; trial < 200; trial++) {
      const eye = {
        x: random() * CELL * 3 - CELL, y: 0, z: random() * CELL * 3 - CELL,
      };
      gateSpecies([entry], eye, () => undefined, s, 0);
      for (const r of rungs) {
        for (let i = 0; i < r.tiles.length; i++) {
          const d = rangeDistances(r.tiles[i].box, eye.x, eye.z);
          const want = rungVisible(r.band, d.dMin, d.dMax);
          expect(r.state[i] === 1, `trial ${trial} tile ${i}`).toBe(want);
        }
      }
    }
  });
});
