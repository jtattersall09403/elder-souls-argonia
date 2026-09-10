import { describe, expect, it } from "vitest";

import { gridStep, isGridKey } from "./characterPickerGrid";

/** The shipped shape: ten races, five columns, two rows. */
const COUNT = 10;
const COLUMNS = 5;

describe("character picker grid navigation", () => {
  it("recognises only the four arrow keys", () => {
    expect(isGridKey("ArrowLeft")).toBe(true);
    expect(isGridKey("ArrowDown")).toBe(true);
    expect(isGridKey("Tab")).toBe(false);
    expect(isGridKey("a")).toBe(false);
  });

  it("moves along the row and wraps around the whole list", () => {
    expect(gridStep(0, "ArrowRight", COUNT, COLUMNS)).toBe(1);
    expect(gridStep(4, "ArrowRight", COUNT, COLUMNS)).toBe(5);
    expect(gridStep(9, "ArrowRight", COUNT, COLUMNS)).toBe(0);
    expect(gridStep(0, "ArrowLeft", COUNT, COLUMNS)).toBe(9);
  });

  it("moves between rows in the same column, and wraps", () => {
    expect(gridStep(2, "ArrowDown", COUNT, COLUMNS)).toBe(7);
    expect(gridStep(7, "ArrowDown", COUNT, COLUMNS)).toBe(2);
    expect(gridStep(7, "ArrowUp", COUNT, COLUMNS)).toBe(2);
    expect(gridStep(2, "ArrowUp", COUNT, COLUMNS)).toBe(7);
  });

  it("never lands outside a ragged final row", () => {
    // Eight options: the second row holds three, so column 3 and 4 have no cell
    // below them and vertical movement must find a real one instead.
    for (let index = 0; index < 8; index += 1) {
      for (const key of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"] as const) {
        const next = gridStep(index, key, 8, COLUMNS);
        expect(next, `${key} from ${index}`).toBeGreaterThanOrEqual(0);
        expect(next, `${key} from ${index}`).toBeLessThan(8);
      }
    }
    expect(gridStep(4, "ArrowDown", 8, COLUMNS)).toBe(4);
  });

  it("tolerates an out-of-range or empty selection", () => {
    expect(gridStep(-1, "ArrowRight", COUNT, COLUMNS)).toBe(1);
    expect(gridStep(99, "ArrowLeft", COUNT, COLUMNS)).toBe(8);
    expect(gridStep(0, "ArrowRight", 0, COLUMNS)).toBe(0);
  });
});
