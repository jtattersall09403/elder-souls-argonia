import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  copyFloatsChanged,
  GC_RANGE_MERGE_GAP,
  RangeTracker,
  runSlices,
  takeCommitBatch,
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

describe("RangeTracker (diag16 W: upload only the changed ranges)", () => {
  it("merges ascending marks that touch and keeps distant ones apart", () => {
    const r = new RangeTracker();
    r.mark(0, 10);
    r.mark(10, 5); // touches: [0, 15)
    r.mark(15 + GC_RANGE_MERGE_GAP, 4); // within the gap: [0, 35)
    r.mark(100, 8); // apart
    expect([...r.ranges()]).toEqual([0, 15 + GC_RANGE_MERGE_GAP + 4, 100, 108]);
    expect(r.instances(1000)).toBe(35 + 8);
  });

  it("sorts and merges marks left out of order by a cancelled fill", () => {
    const r = new RangeTracker();
    r.mark(200, 10);
    r.mark(0, 4);
    r.mark(205, 20);
    expect([...r.ranges()]).toEqual([0, 4, 200, 225]);
  });

  it("points three's update ranges at the changed instances only", () => {
    const attr = new THREE.InstancedBufferAttribute(new Float32Array(1000 * 16), 16);
    const v0 = attr.version;
    const r = new RangeTracker();
    r.mark(10, 2);
    r.mark(500, 3);
    r.apply(attr, 16);
    expect(attr.updateRanges).toEqual([{ start: 160, count: 32 }, { start: 8000, count: 48 }]);
    expect(attr.version).toBe(v0 + 1);
  });

  it("flags nothing when nothing changed, and the whole buffer when full", () => {
    const attr = new THREE.InstancedBufferAttribute(new Float32Array(30), 3);
    const r = new RangeTracker();
    const v0 = attr.version;
    r.apply(attr, 3);
    expect(attr.version).toBe(v0);
    r.full = true;
    expect(r.instances(10)).toBe(10);
    r.apply(attr, 3);
    expect(attr.updateRanges).toEqual([]);
    expect(attr.version).toBe(v0 + 1);
    r.clear();
    expect(r.full).toBe(false);
    expect(r.instances(10)).toBe(0);
  });

  it("copyFloatsChanged reports a change only when a value differs", () => {
    const from = new Float32Array([1, 2, 3, 4]);
    const to = new Float32Array([0, 2, 3, 0]);
    expect(copyFloatsChanged(from, 1, 2, to, 1)).toBe(false);
    expect(copyFloatsChanged(from, 0, 4, to, 0)).toBe(true);
    expect([...to]).toEqual([1, 2, 3, 4]);
  });
});

describe("takeCommitBatch (diag16 W: per-frame byte budget, carry-over)", () => {
  it("takes whole meshes under the budget and carries the rest", () => {
    // Expected, written first, budget 100: [60, 30] | [50, 40] | [200] | [10].
    const bytes = [60, 30, 50, 40, 200, 10];
    const batches: number[][] = [];
    let c = 0;
    while (c < bytes.length) {
      const end = takeCommitBatch(bytes, c, bytes.length, 100);
      batches.push(bytes.slice(c, end));
      c = end;
    }
    expect(batches).toEqual([[60, 30], [50, 40], [200], [10]]);
  });

  it("commits everything in one call with an unbounded budget", () => {
    expect(takeCommitBatch([1e9, 1e9], 0, 2, Number.POSITIVE_INFINITY)).toBe(2);
  });
});
