import { describe, expect, it } from "vitest";
import {
  cropRectFor,
  headingWedge,
  mapPxToWorld,
  positionInCrop,
  worldToMapPx,
} from "./minimap";

// 4033² raster at 16.7 m/px ≈ the province hydrology scale (decision 0006).
const meta = { imageWidth: 4033, imageHeight: 4033, metresPerPixel: 16.7 };

describe("minimap math", () => {
  it("round-trips world ↔ map pixels", () => {
    const { px, py } = worldToMapPx(8350, 16700, meta);
    expect(px).toBeCloseTo(500);
    expect(py).toBeCloseTo(1000);
    const back = mapPxToWorld(px, py, meta);
    expect(back.xM).toBeCloseTo(8350);
    expect(back.zM).toBeCloseTo(16700);
  });

  it("centres the crop on the player away from borders", () => {
    const crop = cropRectFor(30000, 30000, 1500, meta);
    expect(crop.size).toBeCloseTo(1500 / 16.7);
    const centre = mapPxToWorld(crop.x + crop.size / 2, crop.y + crop.size / 2, meta);
    expect(centre.xM).toBeCloseTo(30000);
    expect(centre.zM).toBeCloseTo(30000);
    const dot = positionInCrop(30000, 30000, crop, meta, 180);
    expect(dot.x).toBeCloseTo(90);
    expect(dot.y).toBeCloseTo(90);
  });

  it("clamps the crop at map borders and moves the dot off-centre", () => {
    const crop = cropRectFor(0, 0, 1500, meta);
    expect(crop.x).toBe(0);
    expect(crop.y).toBe(0);
    const dot = positionInCrop(0, 0, crop, meta, 180);
    expect(dot.x).toBeCloseTo(0);
    expect(dot.y).toBeCloseTo(0);

    const far = meta.imageWidth * meta.metresPerPixel;
    const cropFar = cropRectFor(far, far, 1500, meta);
    expect(cropFar.x + cropFar.size).toBeCloseTo(meta.imageWidth);
    expect(cropFar.y + cropFar.size).toBeCloseTo(meta.imageHeight);
  });

  it("never exceeds the raster for oversized spans", () => {
    const crop = cropRectFor(1000, 1000, 1e9, meta);
    expect(crop.size).toBe(4033);
    expect(crop.x).toBe(0);
    expect(crop.y).toBe(0);
  });

  it("points the heading wedge the right way (north-up map)", () => {
    const [tipN] = headingWedge(90, 90, 0, 10);
    expect(tipN[0]).toBeCloseTo(90); // north → straight up
    expect(tipN[1]).toBeCloseTo(80);
    const [tipE] = headingWedge(90, 90, 90, 10);
    expect(tipE[0]).toBeCloseTo(100); // east → right
    expect(tipE[1]).toBeCloseTo(90);
  });
});
