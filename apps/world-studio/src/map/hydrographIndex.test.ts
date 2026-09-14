import { describe, expect, it } from "vitest";
import { buildHydrographIndex, type EntitySource, type HgBody } from "./hydrographIndex";

const MPP = 10; // metresPerSample 5 × coarseStep 2

function body(id: string, bbox: [number, number, number, number]): HgBody {
  return {
    id, kind: "lowland-swamp", origin: "measured", levelM: 0, altitudeBand: "lowland",
    areaM2: 1, maxDepthM: 1, season: "perennial", wetSeasonLevelM: 0, drySeasonLevelM: 0,
    inflow: [], outflow: null, bboxCells: bbox, deepestCell: [bbox[0], bbox[1]],
  };
}

// bboxCells are in fine sample coordinates (map pixel × coarseStep).
const big = body("body.big", [0, 0, 400, 400]);
const small = body("body.small", [100, 100, 140, 140]);

const graph = {
  grid: { metresPerSample: 5, coarseStep: 2, fullResSamples: 400 },
  rivers: [], reaches: [], bodies: [big, small],
};

const stub = (at: Record<string, string>): EntitySource => ({
  labelAt: (eastM, southM) => at[`${Math.floor(eastM / MPP)},${Math.floor(southM / MPP)}`] ?? null,
});

describe("bodyAt", () => {
  it("returns null inside a big body's bbox when the compiled water has no entity there (pre-fix: named body.big)", () => {
    const i = buildHydrographIndex(graph, 200, 200, stub({}));
    expect(i.bodyAt(10, 10, 255, 0)).toBeNull();
    expect(i.entityIdAt(10, 10)).toBeNull();
  });

  it("returns the body the entity raster names, even inside a bigger body's bbox", () => {
    const i = buildHydrographIndex(graph, 200, 200, stub({ "60,60": "body.small" }));
    expect(i.bodyAt(60, 60, 255, 0)?.id).toBe("body.small");
  });

  it("returns null for the body when the entity there is a reach", () => {
    const i = buildHydrographIndex(graph, 200, 200, stub({ "60,60": "reach.1" }));
    expect(i.bodyAt(60, 60, 255, 0)).toBeNull();
  });

  it("without an entity source keeps the old smallest-bbox behaviour", () => {
    const i = buildHydrographIndex(graph, 200, 200);
    expect(i.bodyAt(10, 10, 255, 0)?.id).toBe("body.big"); // only the big box covers it
    expect(i.bodyAt(60, 60, 255, 0)?.id).toBe("body.small"); // smallest box wins
    expect(i.bodyAt(60, 60, 0, 0)).toBeNull();
    expect(i.entityIdAt(60, 60)).toBeUndefined();
  });
});
