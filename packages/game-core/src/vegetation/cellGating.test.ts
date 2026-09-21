import { describe, expect, it } from "vitest";
import {
  BEHIND_MIN_M,
  GATE_MARGIN_M,
  GATE_TILE_COUNT,
  gateSpecies,
  rangeDistances,
  rungVisible,
  type GateRung,
  type GateSpecies,
  type GateStats,
} from "./cellGating";
import { CELL_TILES, TILE_BOUNDS_STRIDE } from "./cellBuild";
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
const TILE = CELL / CELL_TILES;
/** The eye looks down −Z in every test but the behind ones. */
const NORTH = { x: 0, z: -1 };

function stats(): GateStats {
  return { visibleCopies: 0, visibleTriangles: 0, checksCell: 0, checksTile: 0 };
}

/** Tile bounds for a chosen set of occupied tiles, each one instance wide. */
function bounds(tiles: readonly number[]): Float32Array {
  const out = new Float32Array(GATE_TILE_COUNT * TILE_BOUNDS_STRIDE);
  for (const t of tiles) {
    const tx = t % CELL_TILES;
    const tz = Math.floor(t / CELL_TILES);
    const b = t * TILE_BOUNDS_STRIDE;
    out[b] = tx * TILE; out[b + 1] = 0; out[b + 2] = tz * TILE;
    out[b + 3] = (tx + 1) * TILE; out[b + 4] = 0; out[b + 5] = (tz + 1) * TILE;
    out[b + 6] = 1;
  }
  return out;
}

function offsets(tiles: readonly number[]): Uint32Array {
  const out = new Uint32Array(GATE_TILE_COUNT + 1);
  const set = new Set(tiles);
  let at = 0;
  for (let t = 0; t < GATE_TILE_COUNT; t++) {
    out[t] = at;
    if (set.has(t)) at++;
  }
  out[GATE_TILE_COUNT] = at;
  return out;
}

function rung(
  band: [number, number, number, number],
  near: boolean,
  tiles: readonly number[],
): GateRung {
  return {
    band, near,
    tileOffsets: offsets(tiles),
    tileBounds: bounds(tiles),
    state: new Uint8Array(GATE_TILE_COUNT),
    ids: [new Int32Array(tiles.length)],
    copies: tiles.length,
    triangles: tiles.length * 10,
    trianglesPerInstance: 10,
    onTiles: 0,
  };
}

function cellEntry(rungs: GateRung[]): GateSpecies {
  return {
    key: "k", cell: "c", species: "s", maxDraw: 100,
    cellBox: { minX: 0, minZ: 0, maxX: CELL, maxZ: CELL },
    reachM: 0,
    rungs, near: rungs.some((r) => r.near),
  };
}

const ALL_TILES = Array.from({ length: GATE_TILE_COUNT }, (_, i) => i);

/** Eye far enough away that no tile is within the behind radius. */
function onCount(r: GateRung): number {
  let n = 0;
  for (let t = 0; t < GATE_TILE_COUNT; t++) if (r.state[t] & 1) n++;
  return n;
}

describe("gateSpecies", () => {
  it("holds every rung of an open band on, in front of the camera", () => {
    const nearRung = rung([0, LOD_OPEN_M, 0, 0], true, ALL_TILES);
    const farRung = rung([0, LOD_OPEN_M, 0, 0], false, ALL_TILES);
    const entry = cellEntry([nearRung, farRung]);
    const s = stats();
    // The eye sits in the middle so nothing is beyond the behind radius in
    // more than one quadrant; the assertion is on the near tiles.
    gateSpecies([entry], { x: CELL / 2, y: 0, z: CELL / 2 }, NORTH,
      () => undefined, s, 0);
    expect(onCount(nearRung)).toBeGreaterThan(0);
    expect(onCount(farRung)).toBe(onCount(nearRung));
  });

  it("resolves a cell beyond the band with no per-tile test at all", () => {
    const r = rung([0, 60, 0, 8], false, ALL_TILES);
    const s = stats();
    gateSpecies([cellEntry([r])], { x: -5000, y: 0, z: -5000 }, NORTH,
      () => undefined, s, 0);
    expect(s.checksTile).toBe(0);
    expect(s.visibleCopies).toBe(0);
    expect(r.onTiles).toBe(0);
  });

  it("tests per tile only where the band's edge crosses the cell", () => {
    const r = rung([0, 60, 0, 8], false, ALL_TILES);
    const s = stats();
    const applied: boolean[] = [];
    gateSpecies([cellEntry([r])], { x: 0, y: 0, z: 0 }, NORTH,
      (_r, _t, v) => applied.push(v), s, 0);
    expect(s.checksTile).toBe(GATE_TILE_COUNT);
    // The tile at the eye is on, the far corner is off.
    expect(r.state[0] & 1).toBe(1);
    expect(r.state[GATE_TILE_COUNT - 1] & 1).toBe(0);
    expect(applied.filter((v) => v).length).toBe(s.visibleCopies);
  });

  it("holds a tile just outside a band on, with the margin", () => {
    const tile = 0;
    // The tile spans 0..29.25 m; an eye 34 m away in x is 4.75 m beyond the
    // band's outer edge, which the 8 m margin still covers.
    const eye = { x: -34, y: 0, z: 0 };
    const cellBox = { minX: 0, minZ: 0, maxX: TILE, maxZ: TILE };
    const withMargin = rung([0, TILE, 0, 0], false, [tile]);
    const s = stats();
    gateSpecies([{ ...cellEntry([withMargin]), cellBox }], eye, NORTH,
      () => undefined, s, GATE_MARGIN_M);
    expect(withMargin.onTiles).toBe(1);
    const without = rung([0, TILE, 0, 0], false, [tile]);
    gateSpecies([{ ...cellEntry([without]), cellBox }], eye, NORTH,
      () => undefined, s, 0);
    expect(without.onTiles).toBe(0);
  });

  it("switches a tile behind the camera off, with hysteresis", () => {
    // One tile, its centre 60 m north of the eye; the camera looks SOUTH, so
    // the tile is behind it.
    const tile = 0;
    const centre = TILE / 2;
    const eye = { x: centre, y: 0, z: centre + BEHIND_MIN_M + 20 };
    const cellBox = { minX: 0, minZ: 0, maxX: TILE, maxZ: TILE };
    const r = rung([0, LOD_OPEN_M, 0, 0], true, [tile]);
    const entry = { ...cellEntry([r]), cellBox };
    const s = stats();
    // Looking south (+Z): dot = −1, well below −0.5.
    gateSpecies([entry], eye, { x: 0, z: 1 }, () => undefined, s, 0);
    expect(r.onTiles).toBe(0);
    expect(s.visibleCopies).toBe(0);
    // Turning to dot = −0.35 is inside the hysteresis gap: still off.
    gateSpecies([entry], eye, { x: Math.sqrt(1 - 0.35 ** 2), z: 0.35 },
      () => undefined, s, 0);
    expect(r.onTiles).toBe(0);
    // dot = −0.1 clears the ON threshold.
    gateSpecies([entry], eye, { x: Math.sqrt(1 - 0.1 ** 2), z: 0.1 },
      () => undefined, s, 0);
    expect(r.onTiles).toBe(1);
  });

  it("keeps a tile 20 m behind the camera on", () => {
    const tile = 0;
    const centre = TILE / 2;
    const eye = { x: centre, y: 0, z: centre + 20 };
    const cellBox = { minX: 0, minZ: 0, maxX: TILE, maxZ: TILE };
    const r = rung([0, LOD_OPEN_M, 0, 0], true, [tile]);
    const s = stats();
    gateSpecies([{ ...cellEntry([r]), cellBox }], eye, { x: 0, z: 1 },
      () => undefined, s, 0);
    expect(r.onTiles).toBe(1);
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
    const rungs = bands.map((b, i) => rung(b, i === 0, ALL_TILES));
    const entry = cellEntry(rungs);
    const s = stats();
    const bounds0 = rungs[0].tileBounds;
    // The behind latch is mirrored test-side: reading it back out of `state`
    // after the call would read the value the call just wrote.
    const latch = rungs.map(() => new Uint8Array(GATE_TILE_COUNT));
    for (let trial = 0; trial < 200; trial++) {
      const eye = {
        x: random() * CELL * 3 - CELL, y: 0, z: random() * CELL * 3 - CELL,
      };
      const angle = random() * Math.PI * 2;
      const forward = { x: Math.cos(angle), z: Math.sin(angle) };
      gateSpecies([entry], eye, forward, () => undefined, s, 0);
      for (let ri = 0; ri < rungs.length; ri++) {
        const r = rungs[ri];
        for (let t = 0; t < GATE_TILE_COUNT; t++) {
          const b = t * TILE_BOUNDS_STRIDE;
          const d = rangeDistances({
            minX: bounds0[b], minZ: bounds0[b + 2],
            maxX: bounds0[b + 3], maxZ: bounds0[b + 5],
          }, eye.x, eye.z);
          let want = rungVisible(r.band, d.dMin, d.dMax);
          if (want) {
            const cx = (bounds0[b] + bounds0[b + 3]) / 2 - eye.x;
            const cz = (bounds0[b + 2] + bounds0[b + 5]) / 2 - eye.z;
            const len = Math.hypot(cx, cz);
            if (len <= BEHIND_MIN_M) latch[ri][t] = 0;
            else {
              const dot = (cx * forward.x + cz * forward.z) / len;
              const behind = latch[ri][t] ? dot < -0.2 : dot < -0.5;
              latch[ri][t] = behind ? 1 : 0;
              if (behind) want = false;
            }
          }
          expect((r.state[t] & 1) === 1, `trial ${trial} tile ${t}`).toBe(want);
        }
      }
    }
  });
});
