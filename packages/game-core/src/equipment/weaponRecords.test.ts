import { describe, expect, it } from "vitest";

import arsenal from "./generated/arsenal.items.json";
import records from "./generated/weapon-records.json";

/**
 * The arsenal's weight, value, damage, reach and speed are Bethesda's own,
 * mined by `tooling/asset-pipeline/pipeline/weapon_records.py`. These guard the
 * contract the runtime reads them through: every built item has a record, and
 * every number in it is usable arithmetic rather than a null or a NaN.
 */

type Record_ = {
  editorId: string;
  formId: string;
  kind: string;
  model: string;
  weight: number;
  value: number;
  damage?: number;
  speed?: number;
  reach?: number;
  critDamage?: number;
  armourRating?: number;
  candidates: string[];
};

const items = records.items as Record<string, Record_>;
const ids = Object.keys(arsenal.items);

const positive = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n > 0;

describe("mined weapon records", () => {
  it("is schema version 1 and names the plugin it came from", () => {
    expect(records.schemaVersion).toBe(1);
    expect(records.source.plugin).toBe("Skyrim.esm");
    expect(records.source.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("covers every built arsenal item", () => {
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.filter((id) => !items[id])).toEqual([]);
  });

  it.each(ids)("%s has a finite positive weight and value", (id) => {
    expect(positive(items[id].weight)).toBe(true);
    expect(positive(items[id].value)).toBe(true);
  });

  it("gives every weapon damage, speed, reach and a crit", () => {
    // Shields are ARMO in Skyrim: they carry an armour rating, not a swing.
    for (const id of ids) {
      const r = items[id];
      if (r.kind === "ARMO") {
        expect(positive(r.armourRating)).toBe(true);
        continue;
      }
      expect([id, positive(r.damage), positive(r.speed), positive(r.reach), positive(r.critDamage)])
        .toEqual([id, true, true, true, true]);
    }
  });

  it("records the candidates the chosen record was picked from", () => {
    for (const id of ids) {
      expect(items[id].candidates).toContain(items[id].editorId);
    }
  });
});
