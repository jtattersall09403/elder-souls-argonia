import { describe, expect, it } from "vitest";
import type { FloraKit } from "./floraKit";
import { composeFloraKit } from "./useFloraKit";

// Minimal species: only the fields installImpostors / withholdCards read.
const species = (name: string) => ({ name, levels: [{ parts: [], triangles: 10 }, { parts: [], triangles: 2 }], billboardIndex: 1 });
const kitOf = (...ids: string[]) => new Map(ids.map((id) => [id, species(id)])) as unknown as FloraKit;

describe("composeFloraKit (review 2026-09-30: no whole-ring rebuild on impostor arrival)", () => {
  const land = kitOf("tree", "fern");
  const water = kitOf("kelp", "fern");
  const part = { geometry: null, material: null } as never;

  it("waits for the sidecar, so its arrival is not a kit of its own", () => {
    expect(composeFloraKit(land, null, false, null, [])).toBeNull();
    expect(composeFloraKit(land, null, true, null, [])).toBe(land);
  });

  it("an impostor arrival changes only the impostor species; every other entry is the base's own", () => {
    const pending = composeFloraKit(land, water, true, null, ["tree"])!;
    const installed = composeFloraKit(land, water, true, new Map([["tree", { part, contentPx: 160 }]]), [])!;
    expect(pending.get("tree")!.levels).toHaveLength(1); // card withheld
    expect(installed.get("tree")!.levels[1].parts[0]).toBe(part);
    for (const kit of [pending, installed]) {
      expect(kit.get("fern")).toBe(land.get("fern")); // land first wins
      expect(kit.get("kelp")).toBe(water.get("kelp"));
    }
  });
});
