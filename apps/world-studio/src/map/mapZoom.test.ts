import { describe, expect, it } from "vitest";
import { clampPan, panAbout } from "./mapZoom";

describe("map zoom maths", () => {
  it("never lets the map drift off its viewport", () => {
    expect(clampPan({ x: 40, y: -40 }, 1, 900, 900)).toEqual({ x: 0, y: 0 });
    // at ×2 the content is 1800 wide, so pan runs from -900 to 0
    expect(clampPan({ x: 100, y: -2000 }, 2, 900, 900)).toEqual({ x: 0, y: -900 });
  });

  it("holds the cursor's point still while zooming about it", () => {
    const at = { zoom: 1, pan: { x: 0, y: 0 } };
    const next = panAbout(at, 2, 300, 600, 900, 900);
    expect(next.zoom).toBe(2);
    // the province point under (300, 600) must still be under (300, 600)
    const before = (300 - at.pan.x) / at.zoom;
    expect(before * next.zoom + next.pan.x).toBeCloseTo(300, 9);
    expect(((600 - at.pan.y) / at.zoom) * next.zoom + next.pan.y).toBeCloseTo(600, 9);
  });

  it("zooming back out returns to the whole province", () => {
    const one = panAbout({ zoom: 1, pan: { x: 0, y: 0 } }, 3, 120, 800, 900, 900);
    const back = panAbout(one, 1, 120, 800, 900, 900);
    expect(back).toEqual({ zoom: 1, pan: { x: 0, y: 0 } });
  });
});
