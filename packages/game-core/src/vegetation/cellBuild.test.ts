/**
 * The round-1 parity gate (decision 0082): emitting EVERY rung must keep the
 * same one-copy-per-pixel property the old margin-based `lodCopies` had, and
 * must pick the same kit level at every camera distance.
 */
import { describe, expect, it } from "vitest";
import {
  BAYER4_THRESHOLDS,
  LOD_CULL_BAND_M,
  LOD_OPEN_M,
  lodFadeFactors,
  lodLadder,
  lodPixelKept,
  type LodRung,
} from "../fx/lodFade";
import {
  buildCell,
  cellRungs,
  copiesPerKey,
  CELL_TILES,
  TILE_BOUNDS_STRIDE,
  tileIndex,
  type CellInstance,
  type CellSpeciesParams,
  type CellSpeciesSource,
} from "./cellBuild";
import { rungVisible, rangeDistances, type GateBox } from "./cellGating";

/** The pre-0082 rebuild distance and margin, the oracle's own constants. */
const LOD_REBUILD_MOVE_M = 16;
const LOD_MARGIN_M = LOD_REBUILD_MOVE_M + 8;

/** One draw an instance is emitted into, with the band it is kept over. */
interface LodEmission {
  level: number;
  /** (dIn, dOut, wIn, wOut), metres. */
  band: [number, number, number, number];
}

/**
 * THE PRE-0082 PER-REBUILD RULE, KEPT ONLY AS THE PARITY ORACLE.
 *
 * Which copies one instance at camera distance `d` is emitted into. Every
 * rung within `margin` of `d`; each copy's inner edge closes at its rung's
 * `lo` only if the rung below was emitted too, its outer edge at `hi` only
 * if the rung above was — otherwise the edge is open. The final rung's
 * outer edge is the vanish (dithered over `LOD_CULL_BAND_M`) when `vanish`
 * is set, open otherwise. Pure, so the invariant is testable without a GPU.
 */
function lodCopies(
  d: number,
  ladder: readonly LodRung[],
  vanish: boolean,
  margin: number = LOD_MARGIN_M,
): LodEmission[] {
  const emitted: boolean[] = ladder.map((r) => d >= r.lo - margin && d < r.hi + margin);
  if (!emitted.some(Boolean)) {
    // Beyond the ladder (the caller culls there) or before it: keep the
    // nearest rung fully open rather than draw nothing.
    let best = 0;
    for (let i = 1; i < ladder.length; i++) {
      if (Math.abs(d - ladder[i].lo) < Math.abs(d - ladder[best].lo)) best = i;
    }
    emitted[best] = true;
  }
  const out: LodEmission[] = [];
  for (let i = 0; i < ladder.length; i++) {
    if (!emitted[i]) continue;
    const rung = ladder[i];
    const dIn = i > 0 && emitted[i - 1] ? rung.lo : 0;
    const isLast = i === ladder.length - 1;
    let dOut = LOD_OPEN_M;
    let wOut = 0;
    if (!isLast && emitted[i + 1]) dOut = rung.hi;
    else if (isLast && vanish) { dOut = rung.hi; wOut = LOD_CULL_BAND_M; }
    out.push({ level: rung.level, band: [dIn, dOut, 0, wOut] });
  }
  return out;
}

const CELL_M = 468;

/** Deterministic: a parity gate that shuffles is not a gate. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Fixture {
  params: CellSpeciesParams;
  source: CellSpeciesSource;
  instances: CellInstance[];
}

function species(
  id: string,
  opts: {
    heightM: number; rings: number[]; meshLevels: number; cardLevel: number | null;
    maxDraw: number; vanishes: boolean; solid: boolean; anchor: boolean;
  },
  seed: number,
): Fixture {
  const random = rng(seed);
  const instances: CellInstance[] = [];
  for (let i = 0; i < 200; i++) {
    instances.push({
      x: random() * CELL_M, y: random() * 20, z: random() * CELL_M,
      yaw: random() * 6.28, scale: 0.8 + random() * 0.6,
      tiltX: 0, tiltZ: 0, sink: random() * 0.4,
    });
  }
  return {
    instances,
    source: {
      species: id, anchorPivotTerrain: opts.anchor, count: instances.length,
      read: (i, out) => Object.assign(out, instances[i]),
    },
    params: {
      species: id,
      ladder: lodLadder(opts.rings, opts.meshLevels, opts.cardLevel, opts.maxDraw),
      vanishes: opts.vanishes,
      maxDraw: opts.maxDraw,
      sways: !opts.solid,
      trunkRadiusM: opts.solid ? null : 0.4,
      solid: opts.solid,
      cardLevel: opts.cardLevel,
      reachM: opts.heightM,
      heightM: opts.heightM,
      stiffness: () => -0.2,
    },
  };
}

const FIXTURES = [
  // A 4-level tree with a card, which does not vanish inside the ring.
  species("tree", {
    heightM: 18, rings: [60, 140, 300], meshLevels: 3, cardLevel: 3,
    maxDraw: 1500, vanishes: false, solid: false, anchor: true,
  }, 1),
  // A 2-level plant that vanishes.
  species("plant", {
    heightM: 2, rings: [30], meshLevels: 2, cardLevel: null,
    maxDraw: 70, vanishes: true, solid: false, anchor: true,
  }, 2),
  // A one-level rock: one rung, one copy, and a solid.
  species("rock", {
    heightM: 3, rings: [], meshLevels: 1, cardLevel: null,
    maxDraw: 105, vanishes: true, solid: true, anchor: true,
  }, 3),
];

const params = new Map(FIXTURES.map((f) => [f.params.species, f.params]));
const sources = FIXTURES.map((f) => f.source);
const ground = (x: number, z: number) => 10 + Math.sin(x / 50) + Math.cos(z / 70);
const build = buildCell(sources, params, ground, 1, 6000);

describe("buildCell", () => {
  it("emits every instance into every rung of its ladder", () => {
    expect(build.species.length).toBe(3);
    let copies = 0;
    for (const sb of build.species) {
      const fixture = FIXTURES.find((f) => f.params.species === sb.species)!;
      expect(sb.count).toBe(200);
      expect(sb.rungs.length).toBe(fixture.params.ladder.length);
      copies += sb.count * sb.rungs.length;
    }
    expect(build.copies).toBe(copies);
  });

  it("sorts every instance into its gate tile, losing none", () => {
    for (const sb of build.species) {
      const tiles = CELL_TILES * CELL_TILES;
      expect(sb.tileOffsets.length).toBe(tiles + 1);
      expect(sb.tileOffsets[0]).toBe(0);
      expect(sb.tileOffsets[tiles]).toBe(sb.count);
      let counted = 0;
      for (let t = 0; t < tiles; t++) {
        const from = sb.tileOffsets[t];
        const to = sb.tileOffsets[t + 1];
        expect(to).toBeGreaterThanOrEqual(from);
        counted += to - from;
        const b = t * TILE_BOUNDS_STRIDE;
        for (let i = from; i < to; i++) {
          const x = sb.placements[i * 7];
          const z = sb.placements[i * 7 + 2];
          expect(tileIndex(x, z, 0, 0, CELL_M)).toBe(t);
          expect(x).toBeGreaterThanOrEqual(sb.tileBounds[b]);
          expect(x).toBeLessThanOrEqual(sb.tileBounds[b + 3]);
          expect(z).toBeGreaterThanOrEqual(sb.tileBounds[b + 2]);
          expect(z).toBeLessThanOrEqual(sb.tileBounds[b + 5]);
          expect(sb.placements[i * 7 + 6]).toBeLessThanOrEqual(sb.tileBounds[b + 6]);
        }
      }
      expect(counted).toBe(sb.count);
      // Every source instance is still present, at the same scale multiset.
      const fixture = FIXTURES.find((f) => f.params.species === sb.species)!;
      const want = fixture.instances.map((i) => i.x).sort((a, b) => a - b);
      const got = [...Array(sb.count).keys()]
        .map((i) => sb.placements[i * 7]).sort((a, b) => a - b);
      for (let i = 0; i < want.length; i++) expect(got[i]).toBeCloseTo(want[i], 3);
    }
  });

  it("keeps exactly one copy per pixel at every distance, at the old path's level", () => {
    for (const fixture of FIXTURES) {
      const { ladder, vanishes, maxDraw } = fixture.params;
      const rungs = cellRungs(ladder, vanishes);
      for (let step = 0; step < 300; step++) {
        const d = ((maxDraw + 20) * step) / 300;
        for (const bayer of BAYER4_THRESHOLDS) {
          const kept = rungs.filter((r) => lodPixelKept(lodFadeFactors(r.band, d), bayer));
          if (d < maxDraw - LOD_CULL_BAND_M) {
            expect(kept.length, `${fixture.params.species} d=${d}`).toBe(1);
          } else if (vanishes && d > maxDraw + LOD_CULL_BAND_M) {
            expect(kept.length).toBe(0);
          } else {
            expect(kept.length).toBeLessThanOrEqual(1);
          }
          if (kept.length === 1 && d < maxDraw - LOD_CULL_BAND_M) {
            // The old path, at the same distance and the same threshold.
            const old = lodCopies(d, ladder, vanishes).filter(
              (e) => lodPixelKept(lodFadeFactors(e.band, d), bayer));
            expect(old.length).toBe(1);
            expect(kept[0].level).toBe(old[0].level);
          }
        }
      }
    }
  });

  it("gating never switches off a rung some instance needs", () => {
    const random = rng(99);
    for (let trial = 0; trial < 50; trial++) {
      const eyeX = random() * CELL_M * 2 - CELL_M / 2;
      const eyeZ = random() * CELL_M * 2 - CELL_M / 2;
      for (const sb of build.species) {
        const box: GateBox = {
          minX: sb.minX, minZ: sb.minZ, maxX: sb.maxX, maxZ: sb.maxZ,
        };
        const { dMin, dMax } = rangeDistances(box, eyeX, eyeZ);
        for (let i = 0; i < sb.count; i++) {
          const d = Math.hypot(
            sb.placements[i * 7] - eyeX, sb.placements[i * 7 + 2] - eyeZ);
          for (const rung of sb.rungs) {
            const needed = BAYER4_THRESHOLDS.some(
              (b) => lodPixelKept(lodFadeFactors(rung.band, d), b));
            if (needed) expect(rungVisible(rung.band, dMin, dMax)).toBe(true);
          }
        }
      }
    }
  });

  it("publishes exactly the solid species' instances, grounded with the sink", () => {
    const rock = FIXTURES.find((f) => f.params.species === "rock")!;
    expect(build.solids.length).toBe(200);
    expect(new Set(build.solids.map((s) => s.species))).toEqual(new Set(["rock"]));
    for (let i = 0; i < 200; i++) {
      const inst = rock.instances[i];
      expect(build.solids[i].y).toBeCloseTo(ground(inst.x, inst.z) - inst.sink, 5);
    }
  });
});

describe("copiesPerKey", () => {
  const rungs = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      level: i, band: [0, 100, 0, 0] as [number, number, number, number],
    }));

  it("sums count x rungs x parts per batch key, so nothing grows mid-fill", () => {
    const species = [
      { species: "a", count: 10, rungs: rungs(3) },
      { species: "b", count: 4, rungs: rungs(2) },
    ];
    // "a" has two parts sharing one key on its near rung; "b" one part.
    const needs = copiesPerKey(species, (sb, r) =>
      sb.species === "a"
        ? (r === 0 ? ["trunk", "leaf", "leaf"] : ["leaf"])
        : ["leaf"]);
    // a: 10 near into trunk; 10 x 2 near into leaf + 10 x 2 far rungs; b: 4 x 2.
    expect(needs.get("trunk")).toBe(10);
    expect(needs.get("leaf")).toBe(10 * 2 + 10 * 2 + 4 * 2);
  });

  it("ignores a species with no instances", () => {
    const needs = copiesPerKey(
      [{ species: "a", count: 0, rungs: rungs(2) }], () => ["leaf"]);
    expect(needs.size).toBe(0);
  });
});
