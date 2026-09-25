/** 16h check-in 3 §5: a floor clears its footprint, a raised deck only its
 * contacts; both clear their door aprons. */
import { describe, expect, it } from "vitest";
import { treatmentClearancePolygons } from "./groundTreatment";
import type { GroundTreatment } from "./types";

function inside(x: number, z: number, poly: [number, number][]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]; const [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
}
const cleared = (t: GroundTreatment, x: number, z: number) =>
  treatmentClearancePolygons(t).some((poly) => inside(x, z, poly));

const outline: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
const leg = (x: number, z: number): [number, number][] =>
  [[x - 0.6, z - 0.6], [x + 0.6, z - 0.6], [x + 0.6, z + 0.6], [x - 0.6, z + 0.6]];

const floor: GroundTreatment = {
  id: "treatment.floor", kind: "floor", footprintM: outline, apronsM: [[5, -0.5, 1.5]],
};
const deck: GroundTreatment = {
  id: "treatment.deck", kind: "deck", footprintM: outline,
  contactsM: [leg(1, 1), leg(9, 1), leg(1, 9), leg(9, 9)], apronsM: [[5, -0.5, 1.5]],
};

describe("groundcover clearance by treatment kind", () => {
  it("a floor clears its whole footprint and its door apron", () => {
    expect(cleared(floor, 5, 5)).toBe(true);
    expect(cleared(floor, 5, -1.9)).toBe(true); // 1.4 m out from the threshold
    expect(cleared(floor, 5, -2.2)).toBe(false);
    expect(cleared(floor, 12, 5)).toBe(false);
  });

  it("a raised deck keeps groundcover under it, clearing only its legs and apron", () => {
    expect(cleared(deck, 5, 5)).toBe(false); // under the deck, between the legs
    expect(cleared(deck, 1.3, 1.3)).toBe(true); // at a leg
    expect(cleared(deck, 9, 9)).toBe(true);
    expect(cleared(deck, 5, -1.9)).toBe(true); // the door apron
    expect(treatmentClearancePolygons(deck)).toHaveLength(5);
  });

  it("a deck with no recorded contacts clears only its aprons", () => {
    const bare: GroundTreatment = { ...deck, contactsM: undefined };
    expect(treatmentClearancePolygons(bare)).toHaveLength(1);
    expect(cleared(bare, 1, 1)).toBe(false);
  });
});
