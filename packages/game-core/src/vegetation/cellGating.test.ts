import { describe, expect, it } from "vitest";
import {
  BEHIND_MIN_M,
  casterCascadeMask,
  casterReachesCascade,
  GATE_MARGIN_M,
  GATE_TILE_COUNT,
  GatePass,
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
    const inside = rangeDistances(box, 5, 5, { dMin: 0, dMax: 0 });
    expect(inside.dMin).toBe(0);
    expect(inside.dMax).toBeCloseTo(Math.hypot(5, 5));
    const outside = rangeDistances(box, -10, 5, { dMin: 0, dMax: 0 });
    expect(outside.dMin).toBeCloseTo(10);
    expect(outside.dMax).toBeCloseTo(Math.hypot(20, 5));
  });

  it("writes into the caller's object and returns it, with no new object (diag9 A4)", () => {
    const out = { dMin: -1, dMax: -1 };
    for (let i = 0; i < 1000; i++) expect(rangeDistances(box, -10, 5, out)).toBe(out);
    expect(out.dMin).toBeCloseTo(10);
    expect(out.dMax).toBeCloseTo(Math.hypot(20, 5));
  });
});

describe("casterReachesCascade (diag9 C1)", () => {
  it("keeps the near casters of a 120 m cascade and drops the far-rung batches", () => {
    const noon = { perM: 0.1 };            // sun 84° up: 4 m shadows
    // nearest visible copy per casting batch in a fixture scene
    const batches = { fern: 6, palm: 90, cypress: 185, farMangrove: 240, distantOak: 900, none: Infinity };
    const casting = Object.entries(batches)
      .filter(([, d]) => casterReachesCascade(d, 120, noon)).map(([k]) => k);
    expect(casting).toEqual(["fern", "palm", "cypress"]);
  });

  it("allows for a long low-sun shadow towards the camera, capped", () => {
    expect(casterReachesCascade(300, 120, { perM: 0.1 })).toBe(false);
    expect(casterReachesCascade(300, 120, { perM: 3 })).toBe(true);   // 120 m shadow
    expect(casterReachesCascade(330, 120, { perM: 50 })).toBe(false); // capped at 120 m
  });

  it("casts nothing with no sun shadow, and everything with no cascade bound", () => {
    expect(casterReachesCascade(5, 120, null)).toBe(false);
    expect(casterReachesCascade(5000, Infinity, { perM: 0.1 })).toBe(true);
    expect(casterReachesCascade(Infinity, Infinity, { perM: 0.1 })).toBe(false);
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
          }, eye.x, eye.z, { dMin: 0, dMax: 0 });
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
  // 1.4 s alone; ~6 s under four concurrent preflight gates (2026-09-26/27).
  }, 30_000);
});

describe("GatePass (perf10 c9 F38b: one regate spread over frames)", () => {
  const bands: [number, number, number, number][] = [
    [0, 60, 0, 8], [40, 200, 8, 8], [0, LOD_OPEN_M, 0, 0], [100, 400, 8, 8], [0, 30, 0, 4],
  ];
  const build = () => Array.from({ length: 11 }, (_, i) =>
    cellEntry([rung(bands[i % bands.length], i % 2 === 0, ALL_TILES), rung(bands[(i + 2) % bands.length], false, ALL_TILES)]));
  const eyes = [{ x: 0, y: 0, z: 0 }, { x: 150, y: 0, z: 90 }, { x: -300, y: 0, z: 40 }];

  it("a pass split over N steps gives the same latches, applies and stats as one pass", () => {
    const one = build();
    const split = build();
    const oneApplied: string[] = [];
    const splitApplied: string[] = [];
    const s1 = stats();
    const s2 = stats();
    const pass = new GatePass();
    for (const eye of eyes) {
      gateSpecies(one, eye, NORTH, (r, t, v) => oneApplied.push(`${one.findIndex((e) => e.rungs.includes(r))}:${t}:${v}`), s1, GATE_MARGIN_M);
      pass.start(eye, NORTH);
      let steps = 0;
      while (!pass.step(split, (r, t, v) => splitApplied.push(`${split.findIndex((e) => e.rungs.includes(r))}:${t}:${v}`), s2, 3)) steps++;
      expect(steps).toBe(3);   // 11 entries at 3 per step: the fourth step completes
      expect(pass.running).toBe(false);
      expect(s2).toEqual(s1);
    }
    expect(splitApplied).toEqual(oneApplied);
    expect(oneApplied.length).toBeGreaterThan(0);
    for (let e = 0; e < one.length; e++) {
      for (let r = 0; r < one[e].rungs.length; r++) {
        expect(Array.from(split[e].rungs[r].state)).toEqual(Array.from(one[e].rungs[r].state));
        expect(split[e].rungs[r].onTiles).toBe(one[e].rungs[r].onTiles);
      }
    }
  });

  it("resolves the list it started with when the caller swaps it mid-pass", () => {
    const first = build();
    const pass = new GatePass();
    pass.start({ x: 0, y: 0, z: 0 }, NORTH);
    const seen = new Set<unknown>();
    const apply = (r: unknown) => { seen.add(r); };
    expect(pass.step(first, apply, stats(), 1)).toBe(false);
    let steps = 1;
    // a cell built mid-pass: the caller now hands a one-entry list
    while (!pass.step(first.slice(0, 1), apply, stats(), 1)) steps++;
    expect(steps + 1).toBe(first.length);
  });

  it("leaves the caller's stats alone until the pass completes", () => {
    const s = stats();
    s.visibleCopies = -7;
    const pass = new GatePass();
    pass.start({ x: 0, y: 0, z: 0 }, NORTH);
    expect(pass.step(build(), () => undefined, s, 2)).toBe(false);
    expect(s.visibleCopies).toBe(-7);
  });
});

describe("casterCascadeMask (diag20 E5c)", () => {
  it("a batch enters only the cascades its nearest copy can shadow", () => {
    const noon = { perM: 0.1 };
    const fars = [40, 400, 6000];
    expect(casterCascadeMask(6, fars, 3, noon)).toBe(0b111);
    expect(casterCascadeMask(300, fars, 3, noon)).toBe(0b110);
    expect(casterCascadeMask(2000, fars, 3, noon)).toBe(0b100);
    expect(casterCascadeMask(20000, fars, 3, noon)).toBe(0);
    expect(casterCascadeMask(6, fars, 3, null)).toBe(0);
  });
});
