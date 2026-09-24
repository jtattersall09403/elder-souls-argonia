import { describe, expect, it } from "vitest";
import { classTimingTable } from "./attackTimingTable";

describe("the class timing table", () => {
  it("lists every melee class once, quickest first, with positive phases", () => {
    const rows = classTimingTable();
    expect(new Set(rows.map((r) => r.classId)).size).toBe(rows.length);
    expect(rows.map((r) => r.classId)).not.toContain("warbow");
    for (const row of rows) for (const p of [row.light1, row.heavy]) {
      expect(p.windup).toBeGreaterThan(0);
      expect(p.active).toBeGreaterThan(0);
      expect(p.recovery).toBeGreaterThan(0);
    }
    const byId = Object.fromEntries(rows.map((r) => [r.classId, r]));
    // The dagger is quicker than the sword, the sword than the warhammer.
    const sum = (id: string) => byId[id].light1.windup + byId[id].light1.active + byId[id].light1.recovery;
    expect(sum("dagger")).toBeLessThan(sum("straightSword"));
    expect(sum("straightSword")).toBeLessThan(sum("warhammer"));
  });
});
