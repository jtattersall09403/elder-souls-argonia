import { describe, expect, it } from "vitest";
import {
  recordCopyRange,
  GC_BUDGET_SLACK,
  GC_THIN_QUANTUM,
  keptCount,
  ringWeights,
  safetyFactor,
  thinThreshold,
  tileThinFactor,
} from "./groundcoverSchedule";

/*
 * Walk replay of the ground-cover budget thin (walk 5, owner: "plants pop in
 * as you approach, then pop back OUT when you get closer"). The ring as the
 * high preset keeps it: 16 m tiles, NEAR 30 m, MID 75 m, FAR 165 m, the 14 m
 * tier overlap, a 60k budget, and a jungle-like density (~350 plants a tile,
 * varied in 64 m patches) so the ring wants 10-40 % more than the budget.
 * Each tile holds a far block (35 %) and a rest block, each sorted by the
 * plant's own `keep` roll, exactly as Groundcover composes them; both rules
 * keep a prefix of each block, so a tile's pop-outs are its prefix shrinking.
 */
const TILE = 16;
const NEAR_M = 30;
const MID_M = 75;
const FAR_M = 165;
const OVERLAP_M = 14;
const MAX = 60_000;
const SAFETY_MAX = MAX * GC_BUDGET_SLACK;
const FAR_THIN = 0.35;

function hash(a: number, b: number, c: number): number {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

interface TileData { farKeeps: Float32Array; restKeeps: Float32Array }
const tiles = new Map<string, TileData>();
function tileAt(tx: number, tz: number): TileData {
  const key = `${tx},${tz}`;
  let t = tiles.get(key);
  if (t) return t;
  const patch = hash(Math.floor(tx / 4), Math.floor(tz / 4), 7);
  const n = Math.round(350 * (0.6 + 0.8 * patch));
  const far: number[] = []; const rest: number[] = [];
  for (let i = 0; i < n; i++) {
    const keep = hash(tx, tz, i * 2);
    (hash(tx, tz, i * 2 + 1) < FAR_THIN ? far : rest).push(keep);
  }
  t = {
    farKeeps: Float32Array.from(far.sort((a, b) => a - b)),
    restKeeps: Float32Array.from(rest.sort((a, b) => a - b)),
  };
  tiles.set(key, t);
  return t;
}

interface RingTile { key: string; nearest: number; data: TileData; inMid: boolean }
function ring(fx: number, fz: number): RingTile[] {
  const out: RingTile[] = [];
  const reach = Math.ceil((FAR_M + OVERLAP_M) / TILE) + 1;
  const ftx = Math.floor(fx / TILE); const ftz = Math.floor(fz / TILE);
  for (let tz = ftz - reach; tz <= ftz + reach; tz++) {
    for (let tx = ftx - reach; tx <= ftx + reach; tx++) {
      const cx = (tx + 0.5) * TILE; const cz = (tz + 0.5) * TILE;
      const nearest = Math.hypot(
        Math.max(0, Math.abs(fx - cx) - TILE / 2), Math.max(0, Math.abs(fz - cz) - TILE / 2));
      if (nearest > FAR_M + OVERLAP_M) continue;
      out.push({ key: `${tx},${tz}`, nearest, data: tileAt(tx, tz), inMid: nearest <= MID_M + OVERLAP_M });
    }
  }
  return out;
}

type Kept = Map<string, [number, number, number]>; // far kept, rest kept, nearest

/** The rule until 2026-09-29: s = max/total at every fill, ceil(n * s) per block. */
function fillOld(r: RingTile[]): { kept: Kept; drawn: number; s: number } {
  let total = 0;
  for (const t of r) total += t.data.farKeeps.length + (t.inMid ? t.data.restKeeps.length : 0);
  const s = total > MAX ? MAX / total : 1;
  const kept: Kept = new Map(); let drawn = 0;
  for (const t of r) {
    const f = Math.ceil(t.data.farKeeps.length * s);
    const re = t.inMid ? Math.ceil(t.data.restKeeps.length * s) : 0;
    kept.set(t.key, [f, re, t.nearest]); drawn += f + re;
  }
  return { kept, drawn, s };
}

/** The rule now, as Groundcover's pass three runs it: a per-tile factor from
 * the tile's own (far-subset) density, a global safety factor on top. */
const WEIGHTS = ringWeights(NEAR_M, MID_M, FAR_M, OVERLAP_M, TILE, FAR_THIN);
function fillNew(r: RingTile[], previous: number): { kept: Kept; drawn: number; s: number } {
  const tileS = r.map((t) => {
    const n = t.data.farKeeps.length / FAR_THIN;
    return tileThinFactor(n * WEIGHTS.k, n * WEIGHTS.kr, MAX);
  });
  const keptAt = (g: number, i: number): [number, number] => {
    const t = r[i];
    const thr = thinThreshold(t.nearest, tileS[i] * g, NEAR_M, MID_M);
    return [
      keptCount(t.data.farKeeps, 0, t.data.farKeeps.length, thr),
      t.inMid ? keptCount(t.data.restKeeps, 0, t.data.restKeeps.length, thr) : 0,
    ];
  };
  const drawnAt = (g: number) => {
    let n = 0;
    for (let i = 0; i < r.length; i++) { const [f, re] = keptAt(g, i); n += f + re; }
    return n;
  };
  const g = safetyFactor(drawnAt, SAFETY_MAX, previous);
  const kept: Kept = new Map(); let drawn = 0;
  for (let i = 0; i < r.length; i++) {
    const [f, re] = keptAt(g, i);
    kept.set(r[i].key, [f, re, r[i].nearest]); drawn += f + re;
  }
  return { kept, drawn, s: g };
}

/** Plants that were drawn at one fill and not at the next, in tiles the
 * focus moved CLOSER to (the owner's "pops out as you approach"). */
function popOuts(prev: Kept, next: Kept): number {
  let n = 0;
  for (const [key, [f, re, d]] of next) {
    const p = prev.get(key);
    if (!p || d >= p[2]) continue;
    n += Math.max(0, p[0] - f) + Math.max(0, p[1] - re);
  }
  return n;
}

function walk(rule: "old" | "new") {
  let prev: Kept | null = null; let s = 1;
  let pops = 0; let drawnSum = 0; let fills = 0; let maxDrawn = 0; let sChanges = 0;
  // 1.5 km north-east through the density patches, one fill every 2 m.
  for (let step = 0; step <= 750; step++) {
    const r = ring(step * 2 * 0.8, step * 2 * 0.6);
    const out = rule === "old" ? fillOld(r) : fillNew(r, s);
    if (out.s !== s) sChanges++;
    s = out.s;
    if (prev) pops += popOuts(prev, out.kept);
    prev = out.kept; drawnSum += out.drawn; fills++;
    if (out.drawn > maxDrawn) maxDrawn = out.drawn;
  }
  return { pops, meanDrawn: drawnSum / fills, maxDrawn, sChanges };
}

describe("ground-cover budget thin", () => {
  it("never removes a plant as the focus approaches it (walk replay)", () => {
    const before = walk("old");
    const after = walk("new");
    // eslint-disable-next-line no-console
    console.log(`[gc thin] old: ${JSON.stringify(before)}\n[gc thin] new: ${JSON.stringify(after)}`);
    // The pre-fix rule is the defect this replay reproduces.
    expect(before.pops).toBeGreaterThan(0);
    expect(after.pops).toBe(0);
    // Not a quality cut: the same plants on average (within 3 %), the
    // ceiling holds, and the safety factor never moved on this walk.
    expect(Math.abs(after.meanDrawn / before.meanDrawn - 1)).toBeLessThan(0.03);
    expect(after.maxDrawn).toBeLessThanOrEqual(SAFETY_MAX);
    expect(after.sChanges).toBe(0);
  });

  it("thresholds rise monotonically as distance falls, and the NEAR band is never thinned", () => {
    for (const s of [GC_THIN_QUANTUM, 0.5, 0.97, 1]) {
      let last = -1;
      for (let d = 200; d >= 0; d -= 0.5) {
        const t = thinThreshold(d, s, NEAR_M, MID_M);
        expect(t).toBeGreaterThanOrEqual(last);
        last = t;
      }
      expect(thinThreshold(NEAR_M, s, NEAR_M, MID_M)).toBe(1);
    }
  });

  it("quantises the tile factor and holds the safety factor inside its hysteresis band", () => {
    const q = GC_THIN_QUANTUM;
    expect(tileThinFactor(50_000, 20_000, 60_000)).toBe(1);
    expect(tileThinFactor(70_000, 20_000, 60_000)).toBe(Math.floor(0.5 / q) * q);
    // drawn(g) = 60k * g + 1k: at 0.75 fits 48k; 0.75 + 2q would not: hold.
    const drawnAt = (g: number) => 60_000 * g + 1_000;
    expect(safetyFactor(drawnAt, 48_000, 0.75)).toBe(0.75);
    // Two quanta of room: rise one.
    expect(safetyFactor(drawnAt, 50_000, 0.75)).toBe(0.75 + q);
    // Over budget at 0.9: drop to the first quantum that fits.
    expect(safetyFactor(drawnAt, 48_000, 0.9)).toBe(0.78125);
    // A kept count is the plants under the threshold.
    expect(keptCount(Float32Array.from([0.1, 0.2, 0.5, 0.9]), 0, 4, 0.5)).toBe(2);
  });
});

describe("recordCopyRange (thinned far mesh tier)", () => {
  // keeps ascending per block: far block 0..4, rest block 5..9
  const keeps = new Float32Array([0.05, 0.1, 0.2, 0.5, 0.9, 0.02, 0.3, 0.4, 0.6, 0.8]);
  it("mesh and card copies of a thinned species partition the far block", () => {
    const o = () => ({ farLo: -1, farN: -1, restN: -1 });
    const thin = recordCopyRange(keeps, 5, 10, false, 1, "thin", 0.15, o());
    const rest = recordCopyRange(keeps, 5, 10, false, 1, "rest", 0.15, o());
    expect(thin).toEqual({ farLo: 0, farN: 2, restN: 0 });
    expect(rest).toEqual({ farLo: 2, farN: 3, restN: 5 });
  });
  it("the budget thin caps both, the plain role is unchanged; one out object serves every record", () => {
    const out = { farLo: -1, farN: -1, restN: -1 };
    expect(recordCopyRange(keeps, 5, 10, false, 0.08, "thin", 0.15, out)).toBe(out);
    expect(out.farN).toBe(1);
    expect(recordCopyRange(keeps, 5, 10, true, 0.08, "rest", 0.15, out)).toEqual({ farLo: 2, farN: 0, restN: 0 });
    expect(recordCopyRange(keeps, 5, 10, false, 0.35, "all", 0.15, out)).toEqual({ farLo: 0, farN: 3, restN: 2 });
  });
});
