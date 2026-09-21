import { describe, expect, it } from "vitest";
import { BATCH_DATA_HEAD, createBatchDataTexture } from "./batchData";

describe("batch data head", () => {
  // three declares `float getIndirectIndex( const in int i )`; GLSL ES has no
  // implicit float -> int, so an uncast use fails to compile every batched
  // foliage program (round-2 review, CONFIRMED).
  it("casts getIndirectIndex to int", () => {
    expect(BATCH_DATA_HEAD).toContain("int(getIndirectIndex(gl_DrawID))");
  });

  it("never multiplies the raw float index", () => {
    expect(BATCH_DATA_HEAD).not.toMatch(/[^(]getIndirectIndex\(gl_DrawID\)\s*\*/);
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
