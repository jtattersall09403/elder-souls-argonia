/** Geometry helpers of the TEMPORARY ground-painted blueprint debug layer. */
import { describe, expect, it } from "vitest";
import type { Blueprint } from "../blueprints/blueprintsData";
import { blueprintsNear, nearestVertexDistance, resample } from "./BlueprintGround";

const bp = (id: string, boundary: [number, number][]) => ({ id, boundary } as unknown as Blueprint);

describe("resample", () => {
  it("splits a long edge into ~2 m steps and keeps the end vertex", () => {
    const pts = resample([[0, 0], [10, 0]]);
    expect(pts.length).toBe(6);
    expect(pts[pts.length - 1]).toEqual([10, 0]);
    expect(pts[1]).toEqual([2, 0]);
  });
  it("never drops a short edge", () => {
    expect(resample([[0, 0], [0.4, 0]])).toEqual([[0, 0], [0.4, 0]]);
  });
});

describe("proximity", () => {
  it("measures to the nearest boundary vertex", () => {
    expect(nearestVertexDistance([[0, 0], [30, 40]], 0, 0)).toBe(0);
    expect(nearestVertexDistance(null, 0, 0)).toBe(Infinity);
  });
  it("draws only the blueprints inside the radius", () => {
    const near = bp("place.a", [[0, 0], [50, 0], [50, 50]]);
    const far = bp("place.b", [[5000, 5000]]);
    expect(blueprintsNear([far, near], 10, 10)).toEqual(["place.a"]);
    expect(blueprintsNear([far, near], 10, 10, 10000)).toEqual(["place.a", "place.b"]);
  });
});
