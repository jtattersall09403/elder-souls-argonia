import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  applyPieces,
  GC_BUDGET_STEADY_MS,
  GC_CORE_HYSTERESIS_M,
  GC_CORE_M,
  GC_INSTANCE_BYTES,
  GC_RANGE_MERGE_GAP,
  GC_UPLOAD_BUDGET_BYTES,
  generationShareMs,
  grownCapacity,
  RangeTracker,
  runSlices,
  SlotAllocator,
  slotCapacity,
  stickySector,
  takeRanges,
  type RangeCursor,
} from "./groundcoverSchedule";

/** A fake clock and a "tile" of `slices` slices, each costing `msPerSlice`. */
function longTile(slices: number, msPerSlice: number, clock: { t: number }) {
  return (function* (): Generator<void, string, void> {
    for (let s = 0; s < slices; s++) { clock.t += msPerSlice; if (s < slices - 1) yield; }
    return "tile";
  })();
}

describe("runSlices (diag16 W: the budget holds inside a tile)", () => {
  it("stops a long tile at the deadline and resumes it next call", () => {
    // Expected, written first: 20 slices of 1 ms under a 3 ms budget run
    // 3 slices a call; the tile completes on the 7th call (3*6 = 18, +2).
    const clock = { t: 0 };
    const work = longTile(20, 1, clock);
    const now = () => clock.t;
    const perCall: number[] = [];
    let calls = 0;
    let value: string | null = null;
    while (value === null && calls < 50) {
      const t0 = clock.t;
      const r = runSlices(work, t0 + 3, now);
      perCall.push(clock.t - t0);
      calls++;
      if (r.done) value = r.value;
    }
    expect(value).toBe("tile");
    expect(calls).toBe(7);
    expect(Math.max(...perCall)).toBeLessThanOrEqual(3);
  });

  it("always progresses one slice, even past the deadline", () => {
    const clock = { t: 100 };
    const work = longTile(2, 5, clock);
    const r1 = runSlices(work, 0, () => clock.t);
    expect(r1.done).toBe(false);
    expect(clock.t).toBe(105);
    const r2 = runSlices(work, 0, () => clock.t);
    expect(r2).toEqual({ done: true, value: "tile" });
  });
});

describe("one groundcover budget (diag18 G1/G2)", () => {
  /** One frame as useFrame runs it: commit, fill steps to the deadline,
   * generation in what is left. Fill steps cost `stepMs` each. */
  function frame(budgetMs: number, commitMs: number, fillSteps: number, stepMs: number) {
    const clock = { t: commitMs };
    const fill = longTile(fillSteps, stepMs, clock);
    runSlices(fill, budgetMs, () => clock.t);
    const fillMs = clock.t - commitMs;
    const share = generationShareMs(budgetMs, commitMs, fillMs);
    const genMs = share > 0 ? share : 0;
    return { fillMs, share, total: commitMs + fillMs + genMs };
  }

  it("generation gets the budget minus the commit and the fill", () => {
    // Expected, written first: 2.5 ms budget, commit 0.5, fill 2 steps of
    // 0.4 = 0.8 ms (done) -> generation 1.2 ms.
    const f = frame(GC_BUDGET_STEADY_MS, 0.5, 2, 0.4);
    expect(f.fillMs).toBeCloseTo(0.8);
    expect(f.share).toBeCloseTo(1.2);
    expect(f.total).toBeCloseTo(GC_BUDGET_STEADY_MS);
  });

  it("a long fill stops at the groundcover budget and starves generation", () => {
    // Expected: 30 steps of 0.4 ms (12 ms, the old 6 ms queue frame twice
    // over) stop at the 2.5 ms deadline: 7 steps = 2.8 ms (one step over).
    const f = frame(GC_BUDGET_STEADY_MS, 0, 30, 0.4);
    expect(f.fillMs).toBeCloseTo(2.8);
    expect(f.share).toBeLessThanOrEqual(0);
    expect(f.total).toBeLessThanOrEqual(GC_BUDGET_STEADY_MS + 0.5);
  });
});

describe("SlotAllocator (diag18 G3: stable per-record slots)", () => {
  it("entering and leaving records keep every other record's offset", () => {
    const a = new SlotAllocator();
    const s = [a.alloc(10), a.alloc(20), a.alloc(30)];
    expect(s).toEqual([0, 10, 30]);
    expect(a.highWater).toBe(60);
    a.release(10, 20); // the middle record leaves
    expect(a.highWater).toBe(60); // the others stay where they are
    expect(a.alloc(15)).toBe(10); // first fit into the hole
    expect(a.alloc(5)).toBe(25);
    expect(a.gaps()).toBe(0);
    expect(a.alloc(8)).toBe(60); // no hole left: at the top
  });

  it("a range freed at the top lowers the high water, merging free holes", () => {
    const a = new SlotAllocator();
    a.alloc(10); a.alloc(10); a.alloc(10);
    a.release(10, 10);
    a.release(20, 10);
    expect(a.highWater).toBe(10);
    expect(a.gaps()).toBe(0);
    a.reset();
    expect(a.highWater).toBe(0);
  });

  it("a refill marks only the entering and leaving records' ranges", () => {
    // Expected, written first: 100 records of 50 instances; 10 leave, 10
    // enter into the holes they left; the marked instances are those 10
    // holes, 500 of 5000 (10 %), the high water does not move, and every
    // staying record's start is unchanged.
    const a = new SlotAllocator();
    const starts = new Map<number, number>();
    for (let r = 0; r < 100; r++) starts.set(r, a.alloc(50));
    const before = new Map(starts);
    const t = new RangeTracker();
    for (let r = 0; r < 10; r++) { a.release(starts.get(r * 10)!, 50); t.mark(starts.get(r * 10)!, 50); starts.delete(r * 10); }
    for (let r = 100; r < 110; r++) { const s = a.alloc(50); starts.set(r, s); t.mark(s, 50); }
    for (const [r, s] of starts) if (r < 100) expect(s).toBe(before.get(r));
    expect(t.instances()).toBe(500);
    expect(a.highWater).toBe(5000);
  });

  it("capacity has 1.5x headroom", () => {
    expect(slotCapacity(1000)).toBe(1500);
    expect(slotCapacity(1)).toBe(64);
  });
});

describe("stickySector (diag18 G3: a tile keeps its draw slot)", () => {
  it("keeps a neighbouring wedge, moves on two, enters and leaves the core with hysteresis", () => {
    expect(stickySector(-1, 3, 100)).toBe(3);
    expect(stickySector(3, 4, 100)).toBe(3);
    expect(stickySector(1, 8, 100)).toBe(1); // wraps: 1 and 8 are neighbours
    expect(stickySector(3, 5, 100)).toBe(5);
    expect(stickySector(3, 0, GC_CORE_M)).toBe(0);
    expect(stickySector(0, 2, GC_CORE_M + GC_CORE_HYSTERESIS_M)).toBe(0);
    expect(stickySector(0, 2, GC_CORE_M + GC_CORE_HYSTERESIS_M + 1)).toBe(2);
  });
});

describe("RangeTracker (diag16 W: upload only the changed ranges)", () => {
  it("merges ascending marks that touch and keeps distant ones apart", () => {
    const r = new RangeTracker();
    r.mark(0, 10);
    r.mark(10, 5); // touches: [0, 15)
    r.mark(15 + GC_RANGE_MERGE_GAP, 4); // within the gap: [0, 35)
    r.mark(100, 8); // apart
    expect([...r.ranges()]).toEqual([0, 15 + GC_RANGE_MERGE_GAP + 4, 100, 108]);
    expect(r.instances()).toBe(35 + 8);
  });

  it("sorts and merges marks out of order (stable slots)", () => {
    const r = new RangeTracker();
    r.mark(200, 10);
    r.mark(0, 4);
    r.mark(205, 20);
    r.mark(500, 1);
    r.mark(100, 2);
    expect([...r.ranges()]).toEqual([0, 4, 100, 102, 200, 225, 500, 501]);
    r.clear();
    expect(r.instances()).toBe(0);
  });
});

describe("takeRanges + applyPieces (diag18 G3: the upload cap splits a mesh)", () => {
  it("no frame passes the cap, and the pieces cover the ranges exactly", () => {
    // Expected, written first: a 5000-instance range plus two small ones at
    // 2849 instances a frame (256 KiB / 92 B) upload in 2 frames, never more
    // than the cap, every instance once.
    const budget = Math.floor(GC_UPLOAD_BUDGET_BYTES / GC_INSTANCE_BYTES);
    const ranges = [0, 5000, 6000, 6010, 9000, 9100];
    const cursor: RangeCursor = { i: 0, at: 0 };
    const out: number[] = [];
    const covered: number[] = [];
    let frames = 0;
    while (cursor.i < ranges.length) {
      const taken = takeRanges(ranges, cursor, budget, out);
      expect(taken * GC_INSTANCE_BYTES).toBeLessThanOrEqual(GC_UPLOAD_BUDGET_BYTES);
      covered.push(...out);
      frames++;
    }
    expect(frames).toBe(2);
    let total = 0;
    for (let i = 0; i < covered.length; i += 2) total += covered[i + 1] - covered[i];
    expect(total).toBe(5000 + 10 + 100);
    expect(covered[0]).toBe(0);
    expect(covered[covered.length - 1]).toBe(9100);
  });

  it("adds update ranges without clearing pending ones, flags only with pieces", () => {
    const attr = new THREE.InstancedBufferAttribute(new Float32Array(1000 * 16), 16);
    const v0 = attr.version;
    applyPieces(attr, 16, []);
    expect(attr.version).toBe(v0);
    applyPieces(attr, 16, [10, 12]);
    applyPieces(attr, 16, [500, 503]); // next frame, mesh culled: both stay
    expect(attr.updateRanges).toEqual([{ start: 160, count: 32 }, { start: 8000, count: 48 }]);
    expect(attr.version).toBe(v0 + 2);
  });
});

describe("grownCapacity (perf10 G6: a walk stops allocating)", () => {
  it("fits keeps the capacity, growth is 1.5x the need, never shrinks", () => {
    expect(grownCapacity(1500, 1500)).toBe(1500);
    expect(grownCapacity(1500, 10)).toBe(1500);
    expect(grownCapacity(1500, 1501)).toBe(2252);
  });

  it("a seeded walk of 50 refills allocates nothing over the last 40, and frees what it replaces", () => {
    // Expected, written first: 60 live records of 30-70 instances; each
    // refill 6 leave, 6 enter, 6 change size. The live total is steady, so
    // the mesh grows only in the first few refills.
    let seed = 12345;
    const rnd = (n: number) => { seed = (seed * 1664525 + 1013904223) >>> 0; return 30 + (seed >>> 8) % n; };
    const alloc = new SlotAllocator();
    const recs = new Map<number, { start: number; size: number }>();
    let next = 0;
    const put = (n: number) => { recs.set(next++, { start: alloc.alloc(n), size: n }); };
    for (let i = 0; i < 60; i++) put(rnd(41));
    let capacity = grownCapacity(0, alloc.highWater);
    const created: { disposed: boolean }[] = [{ disposed: false }];
    const allocsPerRefill: number[] = [];
    for (let refill = 0; refill < 50; refill++) {
      let allocs = 0;
      const keys = [...recs.keys()];
      for (let k = 0; k < 6; k++) {
        const key = keys[(refill * 7 + k * 5) % keys.length];
        const r = recs.get(key);
        if (r) { alloc.release(r.start, r.size); recs.delete(key); }
      }
      for (let k = 0; k < 6; k++) {
        const r = recs.get(keys[(refill * 3 + k * 11) % keys.length]);
        if (!r) continue;
        const n = rnd(41);
        if (n <= r.size) { if (n < r.size) alloc.release(r.start + n, r.size - n); r.size = n; }
        else { alloc.release(r.start, r.size); r.start = alloc.alloc(n); r.size = n; }
      }
      while (recs.size < 60) put(rnd(41));
      const grown = grownCapacity(capacity, alloc.highWater);
      if (grown !== capacity) { created[created.length - 1].disposed = true; created.push({ disposed: false }); capacity = grown; allocs++; }
      allocsPerRefill.push(allocs);
    }
    expect(allocsPerRefill.slice(10).reduce((a, b) => a + b, 0)).toBe(0);
    expect(created.slice(0, -1).every((c) => c.disposed)).toBe(true);
  });
});
