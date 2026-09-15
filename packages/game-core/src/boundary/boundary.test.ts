import { describe, expect, it } from "vitest";
import { PROVINCE_BOUNDARY } from "@elder-souls/contracts";
import { CATALOGUE, text } from "@elder-souls/text-catalogue";
import { BOUNDARY_WALL_THICKNESS_M, boundaryWallBoxes, segmentCrossesWall } from "./walls";
import {
  BOUNDARY_MESSAGE_ID,
  BOUNDARY_NEAR_M,
  BOUNDARY_REARM_M,
  boundaryMessageStep,
  distanceToBoundary,
} from "./boundaryMessage";

const E = PROVINCE_BOUNDARY.extentM;

describe("the boundary walls", () => {
  const boxes = boundaryWallBoxes(E);

  it("puts one wall on each side with its inner face exactly on the extent", () => {
    expect(boxes.map((b) => b.side).sort()).toEqual(["east", "north", "south", "west"]);
    const by = Object.fromEntries(boxes.map((b) => [b.side, b]));
    expect(by.north.centre[2] + by.north.halfExtents[2]).toBeCloseTo(0, 9);
    expect(by.south.centre[2] - by.south.halfExtents[2]).toBeCloseTo(E, 9);
    expect(by.west.centre[0] + by.west.halfExtents[0]).toBeCloseTo(0, 9);
    expect(by.east.centre[0] - by.east.halfExtents[0]).toBeCloseTo(E, 9);
  });

  it("stands entirely outside the built square, spanning the contract's heights", () => {
    for (const box of boxes) {
      expect(box.centre[1] - box.halfExtents[1]).toBeCloseTo(PROVINCE_BOUNDARY.wallBottomY, 9);
      expect(box.centre[1] + box.halfExtents[1]).toBeCloseTo(PROVINCE_BOUNDARY.wallTopY, 9);
      expect(box.halfExtents[0] * 2).toBeGreaterThanOrEqual(BOUNDARY_WALL_THICKNESS_M);
      // No part of any wall is inside [0, E]² in its thin axis.
      const thinAxis = box.halfExtents[0] < box.halfExtents[2] ? 0 : 2;
      const lo = box.centre[thinAxis] - box.halfExtents[thinAxis];
      const hi = box.centre[thinAxis] + box.halfExtents[thinAxis];
      expect(hi <= 0 + 1e-9 || lo >= E - 1e-9).toBe(true);
    }
  });

  it.each([
    ["north", [1200, 20, 500], [1200, 20, -500]],
    ["south", [1200, 20, E - 500], [1200, 20, E + 500]],
    ["west", [500, 20, 3000], [-500, 20, 3000]],
    ["east", [E - 500, 20, 3000], [E + 500, 20, 3000]],
  ] as [string, [number, number, number], [number, number, number]][])(
    "is crossed leaving the square to the %s", (_side, inside, outside) => {
      expect(boxes.some((box) => segmentCrossesWall(box, inside, outside))).toBe(true);
    },
  );

  it("is crossed by a diagonal exit through a corner", () => {
    expect(boxes.some((box) => segmentCrossesWall(box, [30, 20, 30], [-300, 20, -300]))).toBe(true);
  });

  it("is not crossed by a walk that stays inside", () => {
    expect(boxes.some((box) => segmentCrossesWall(box, [10, 20, 10], [E - 10, 20, E - 10]))).toBe(false);
  });
});

describe("the boundary message", () => {
  it("measures the distance to the nearest edge", () => {
    expect(distanceToBoundary(3, 2000, E)).toBeCloseTo(3, 9);
    expect(distanceToBoundary(2000, E - 4, E)).toBeCloseTo(4, 9);
  });

  it("fires once per approach and re-arms a few metres back inside", () => {
    let state = { armed: true };
    const fires: number[] = [];
    // Walk in to the wall, hover along it, step back a little, return.
    const walk = [200, 50, BOUNDARY_NEAR_M, 2, 1, 3, BOUNDARY_NEAR_M - 1, 20, 30, 5, 1];
    for (const d of walk) {
      const step = boundaryMessageStep(state, d, 2000, E);
      state = step.state;
      if (step.fire) fires.push(d);
    }
    // 20 and 30 are past the re-arm distance, so the walk back in (5) fires again;
    // 2, 1, 3, 7 are one stay at the wall and never re-fire.
    expect(fires).toEqual([BOUNDARY_NEAR_M, 5]);
    // Beyond the re-arm distance, the next approach fires again.
    state = boundaryMessageStep(state, BOUNDARY_REARM_M + 5, 2000, E).state;
    expect(boundaryMessageStep(state, 2, 2000, E).fire).toBe(true);
  });

  it("names a registered catalogue entry", () => {
    expect(text(CATALOGUE, BOUNDARY_MESSAGE_ID)).toMatch(/\S/);
    expect(CATALOGUE.get(BOUNDARY_MESSAGE_ID)?.surface).toBe("system");
  });
});
