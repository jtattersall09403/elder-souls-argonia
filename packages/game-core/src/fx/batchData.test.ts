import { describe, expect, it } from "vitest";
import { BATCH_DATA_HEAD, createBatchDataTexture } from "./batchData";

describe("batch data head", () => {
  // GLSL ES has no implicit float -> int, and the slot rides a float
  // attribute, so the cast is load-bearing: an uncast use fails to compile
  // every foliage program (round-2 review, CONFIRMED; kept at round 12).
  it("casts the slot attribute to int", () => {
    expect(BATCH_DATA_HEAD).toContain("int(esSlot)");
  });

  it("declares the slot attribute inside its own guard", () => {
    expect(BATCH_DATA_HEAD).toContain("attribute float esSlot;");
    expect(BATCH_DATA_HEAD).toContain("#ifdef ES_BATCH_SLOTS");
  });

  it("carries no multi-draw index", () => {
    expect(BATCH_DATA_HEAD).not.toContain("gl_DrawID");
  });
});

describe("batch data texture", () => {
  it("sizes a small batch square-ish rather than a full 1024 row", () => {
    const texture = createBatchDataTexture(256);
    expect(texture.image.width).toBe(32);
    expect(texture.image.width * texture.image.height).toBeGreaterThanOrEqual(512);
    expect((texture.image.data as Float32Array).length)
      .toBe(texture.image.width * texture.image.height * 4);
  });

  it("caps the width at 1024 and grows in height", () => {
    const texture = createBatchDataTexture(1_000_000);
    expect(texture.image.width).toBe(1024);
    expect(texture.image.width * texture.image.height)
      .toBeGreaterThanOrEqual(2_000_000);
  });
});
