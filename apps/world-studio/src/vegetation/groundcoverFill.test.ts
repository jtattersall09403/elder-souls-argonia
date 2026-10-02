import { describe, expect, it } from "vitest";
import { FillScratch, ROLE_ALL, ROLE_REST, ROLE_THIN, type FillRole } from "./groundcoverFill";

type Sp = { id: string };
const SPECIES = 3, SLOTS = 4;

/** One rebuild's worth of pushes, deterministic from `seed`; `n` scales how
 * much is pushed, so a big rebuild followed by a small one exercises reuse. */
function rebuild(s: FillScratch<Sp, string, string, string>, seed: number, n: number): void {
  s.reset(SPECIES, SLOTS);
  const sp: Sp[] = [{ id: `a${seed}` }, { id: `b${seed}` }, { id: `c${seed}` }];
  const roles: FillRole[] = [ROLE_ALL, ROLE_THIN, ROLE_REST];
  for (let i = 0; i < n; i++) {
    s.pushLive(seed * 1000 + i, i * 1.5, i, -i);
    s.pushRecord(i % SPECIES, (i * 7 + seed) % SLOTS, i + 1, sp[i % SPECIES], i % 2 === 0, i % 4, roles[i % 3],
      i, i + seed, i * 2.5, 0.5 + seed, 10, 20, -i, i);
    if (i % 2) s.pushBudget(sp[i % SPECIES], i % 3 === 0, i * 3, 0.25, 11, 22);
    if (i % 5 === 0) s.liveMeshes.add(`m${seed}-${i}`);
    s.pushCommit(`mesh${seed}-${i}`, i * 4, `bands${i}`, `geo${i % 2}`, i, -i, i * 2, i + 0.5);
  }
}

/** Everything a fill reads back, sliced to the counts. */
function snapshot(s: FillScratch<Sp, string, string, string>) {
  return {
    live: [s.liveCount, [...s.liveKey.subarray(0, s.liveCount)], [...s.liveNearest.subarray(0, s.liveCount)],
      [...s.liveTx.subarray(0, s.liveCount)], [...s.liveTz.subarray(0, s.liveCount)], [...s.liveKeys]],
    rec: [s.recCount, s.recSpecies.map((x) => x.id), [...s.recFar.subarray(0, s.recCount)], [...s.recTier.subarray(0, s.recCount)],
      [...s.recRole.subarray(0, s.recCount)], [...s.recTx.subarray(0, s.recCount)], [...s.recTz.subarray(0, s.recCount)],
      [...s.recNearest.subarray(0, s.recCount)], [...s.recThin.subarray(0, s.recCount)], [...s.recMinY.subarray(0, s.recCount)]],
    slots: s.slotRecords.map((l) => l.map((r) => [...r])), counts: s.slotCounts.map((c) => [...c]),
    budget: [s.budgetCount, s.budgetSpecies.map((x) => x.id), [...s.budgetInMid.subarray(0, s.budgetCount)],
      [...s.budgetNearest.subarray(0, s.budgetCount)]],
    commits: [s.commitCount, [...s.commitMesh], [...s.commitDrawn.subarray(0, s.commitCount)], [...s.commitRadius.subarray(0, s.commitCount)]],
    meshes: [...s.liveMeshes],
  };
}

describe("groundcover fill scratch (perf10 C3)", () => {
  it("a rebuild on reused state equals the same rebuild on fresh state", () => {
    const reused = new FillScratch<Sp, string, string, string>();
    rebuild(reused, 1, 3000); // grows every array past its initial size
    rebuild(reused, 2, 40);
    const fresh = new FillScratch<Sp, string, string, string>();
    rebuild(fresh, 2, 40);
    expect(snapshot(reused)).toEqual(snapshot(fresh));
    // And twice in a row is stable.
    rebuild(reused, 2, 40);
    expect(snapshot(reused)).toEqual(snapshot(fresh));
  });

  it("keeps capacity across rebuilds (no reallocation once grown)", () => {
    const s = new FillScratch<Sp, string, string, string>();
    rebuild(s, 1, 3000);
    const recFar = s.recFar, slot = s.slotRecords[0][0];
    rebuild(s, 2, 40);
    expect(s.recFar).toBe(recFar);
    expect(s.slotRecords[0][0]).toBe(slot);
  });
});
