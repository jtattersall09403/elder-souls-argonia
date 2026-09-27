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

describe("groundcover reads the same place clearance (0102 round 2)", () => {
  const place: BundleClearance = {
    schemaVersion: 1, id: "patch.clearance.bundle.place.t",
    hardClear: [[[270, 2980], [295, 2980], [295, 3000], [270, 3000]]], thinned: [], kept: [],
  };
  const published = { schemaVersion: 1, patches: [] };

  it("drops a groundcover candidate on a place's hard clearance, keeps one clear of it", () => {
    const index = indexPatches(withPlaceClearances(published, clearancesOfBundle({
      settlements: [{ id: "place.t", vegetationClearance: place }] })));
    const strip = patchEntriesNear(289.6, 2985.0, index, 0.3);
    expect(survivesPatchesIn(289.6, 2985.0, 0.3, strip, 0.99)).toBe(false);
    expect(survivesPatchesIn(330, 2985.0, 0.3, patchEntriesNear(330, 2985, index, 0.3), 0.99)).toBe(true);
    // the published patches alone (the pre-0102 groundcover input) keep it
    const bare = indexPatches(published);
    expect(survivesPatchesIn(289.6, 2985.0, 0.3, patchEntriesNear(289.6, 2985.0, bare, 0.3), 0.99)).toBe(true);
  });
});
