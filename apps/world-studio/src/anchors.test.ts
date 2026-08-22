import { describe, expect, it } from "vitest";
import anchorsFile from "../../../world/sources/anchors/settlement-anchors.json";

const anchors = anchorsFile.anchors;

describe("settlement anchors source data", () => {
  it("has unique ids", () => {
    expect(new Set(anchors.map((a) => a.id)).size).toBe(anchors.length);
  });

  it("keeps every anchor and its tolerance inside the province extent", () => {
    for (const a of anchors) {
      expect(a.u, a.id).toBeGreaterThanOrEqual(0);
      expect(a.u, a.id).toBeLessThanOrEqual(1);
      expect(a.v, a.id).toBeGreaterThanOrEqual(0);
      expect(a.v, a.id).toBeLessThanOrEqual(1);
      expect(a.toleranceUV, a.id).toBeGreaterThan(0);
      expect(a.toleranceUV, a.id).toBeLessThan(0.2);
    }
  });

  it("contains the eight canonical major cities", () => {
    const majors = anchors.filter((a) => a.rank === "major").map((a) => a.id).sort();
    expect(majors).toEqual([
      "archon", "blackrose", "gideon", "helstrom",
      "lilmoth", "soulrest", "stormhold", "thorn",
    ]);
  });

  it("suggested connections reference existing anchors", () => {
    const ids = new Set(anchors.map((a) => a.id));
    for (const c of anchorsFile.suggestedConnections) {
      expect(ids.has(c.from), c.from).toBe(true);
      expect(ids.has(c.to), c.to).toBe(true);
    }
  });

  it("the suggested network connects every major city (owner requirement, plan §88)", () => {
    const adjacency = new Map<string, string[]>();
    for (const c of anchorsFile.suggestedConnections) {
      adjacency.set(c.from, [...(adjacency.get(c.from) ?? []), c.to]);
      adjacency.set(c.to, [...(adjacency.get(c.to) ?? []), c.from]);
    }
    const majors = anchors.filter((a) => a.rank === "major").map((a) => a.id);
    const seen = new Set([majors[0]]);
    const queue = [majors[0]];
    while (queue.length) {
      for (const next of adjacency.get(queue.pop()!) ?? []) {
        if (!seen.has(next)) { seen.add(next); queue.push(next); }
      }
    }
    for (const id of majors) expect(seen.has(id), id).toBe(true);
  });
});
