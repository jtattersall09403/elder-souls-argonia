import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  clearancesOfBundle, makeClearanceFilter, instanceRoll, patchIdHash, withPlaceClearances,
  type BundleClearance,
} from "./clearanceFilter";
import { indexPatches, patchEntriesNear, survivesPatchesIn } from "./vegetationPatches";
import { buildCell, type CellInstance, type CellSpeciesParams, type CellSpeciesSource } from "./cellBuild";

interface Fixture {
  seed: number;
  idHash: string;
  clearance: BundleClearance;
  points: { x: number; z: number; radiusM: number; roll: number; survives: boolean }[];
}

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(here, "__fixtures__/clearance-survives.json"), "utf8")) as Fixture;

describe("bundle vegetation clearance (decision 0102)", () => {
  it("hashes and rolls exactly as apply_vegetation_patches does", () => {
    expect(patchIdHash(fixture.clearance.id).toString()).toBe(fixture.idHash);
    for (const p of fixture.points) {
      expect(instanceRoll(fixture.seed, patchIdHash(fixture.clearance.id), p.x, p.z)).toBe(p.roll);
    }
  });

  it("keeps and drops the same plants as the Python stage", () => {
    const filter = makeClearanceFilter([fixture.clearance], fixture.seed);
    const kept = fixture.points.filter((p) => p.survives).length;
    expect(kept).toBeGreaterThan(0);
    expect(kept).toBeLessThan(fixture.points.length);
    for (const p of fixture.points) {
      expect(filter.survives(p.x, p.z, p.radiusM), `${p.x},${p.z} r${p.radiusM}`).toBe(p.survives);
    }
  });

  it("a cell build drops every instance inside a place's hard clearance", () => {
    const instances: CellInstance[] = [];
    for (let i = 0; i < 40; i++) {
      instances.push({ x: 250 + i * 3, y: 30, z: 3000, yaw: 0, scale: 1, tiltX: 0, tiltZ: 0, sink: 0 });
    }
    const source: CellSpeciesSource = {
      species: "fern", anchorPivotTerrain: false, count: instances.length,
      read: (i, out) => Object.assign(out, instances[i]),
    };
    const params: CellSpeciesParams = {
      species: "fern", ladder: [{ level: 0, lo: 0, hi: 60 }], vanishes: true, maxDraw: 60,
      sways: false, trunkRadiusM: null, solid: false, cardLevel: null, reachM: 1, heightM: 1,
      clearRadiusM: 0, stiffness: () => 0,
    };
    const map = new Map([["fern", params]]);
    const filter = makeClearanceFilter([fixture.clearance], fixture.seed);
    const built = buildCell([source], map, () => null, 1, 1000, 0, 2808, 468, filter);
    const xs: number[] = [];
    for (let i = 0; i < built.species[0].count; i++) xs.push(built.species[0].placements[i * 7]);
    expect(xs.some((x) => x > 260 && x < 350)).toBe(false);      // the hard core is bare
    expect(xs.filter((x) => x < 240 || x > 370)).toHaveLength(
      instances.filter((p) => p.x < 240 || p.x > 370).length);    // beyond the fringe untouched
    const unfiltered = buildCell([source], map, () => null, 1, 1000, 0, 2808, 468);
    expect(unfiltered.species[0].count).toBe(instances.length);
  });
});

describe("groundcover reads the place's ground-cover tier (0102 round 2, 16k walk 4)", () => {
  // A 25 x 20 m yard the trees are cleared from, a 1.2 m path across it
  // (grown 0.25 m) the ground cover dies on.
  const path: [number, number][] = [[270, 2989.15], [295, 2989.15], [295, 2990.85], [270, 2990.85]];
  const place: BundleClearance = {
    schemaVersion: 2, id: "patch.clearance.bundle.place.t",
    hardClear: [[[270, 2980], [295, 2980], [295, 3000], [270, 3000]]], thinned: [], kept: [],
    groundClear: [path], groundEdgeJitterM: 0.5,
  };
  const published = { schemaVersion: 1, patches: [] };
  const index = indexPatches(withPlaceClearances(published, clearancesOfBundle({
    settlements: [{ id: "place.t", vegetationClearance: place }] })));
  const survives = (x: number, z: number) =>
    survivesPatchesIn(x, z, 0.3, patchEntriesNear(x, z, index, 0.3), 0.99);

  it("keeps ground cover 3 m from every hard surface inside the tree clearance", () => {
    expect(survives(282, 2986.85 - 0.3)).toBe(true);    // 3 m from the path edge (+ its reach)
    expect(survives(272, 2996)).toBe(true);             // an open corner of the yard
    // the trees are cleared there all the same
    expect(makeClearanceFilter([place]).survives(282, 2996, 0)).toBe(false);
  });

  it("judges a sub-metre species on the ground-cover tier, a taller one on the tree tier", () => {
    const filter = makeClearanceFilter([place]);
    expect(filter.survives(272, 2996, 0, 0.3)).toBe(true);    // a 0.3 m plant in the open yard
    expect(filter.survives(272, 2996, 0, 0.6)).toBe(false);   // 0.6 m is the tree tier's
    expect(filter.survives(282, 2990, 0, 0.3)).toBe(false);   // on the path both tiers clear it
    expect(filter.survives(272, 2996, 0)).toBe(false);        // no height: the tree tier
  });

  it("drops ground cover on the path", () => {
    expect(survives(282, 2990)).toBe(false);
    expect(survives(271, 2989.5)).toBe(false);
  });

  it("refuses a clearance without the tiers, naming its version", () => {
    const v1 = { ...place, schemaVersion: 1 };
    expect(() => clearancesOfBundle({ settlements: [{ id: "place.t", vegetationClearance: v1 }] }))
      .toThrow(/schemaVersion 1, expected 2/);
    const noGround = { ...place, groundClear: undefined };
    expect(() => clearancesOfBundle({ settlements: [{ id: "place.t", vegetationClearance: noGround }] }))
      .toThrow(/schemaVersion 2 has no groundClear/);
  });
});
