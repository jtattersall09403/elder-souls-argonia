import { describe, expect, it } from "vitest";
import { writeTextureSpan } from "./writeTextureSpan";

describe("writeTextureSpan", () => {
  const layer = 512 * 512 * 4;
  it("reads one layer of a 42-layer array, not the whole buffer", () => {
    expect(writeTextureSpan(42 * layer, { offset: 7 * layer, bytesPerRow: 2048 }, { width: 512, height: 512, depthOrArrayLayers: 1 }))
      .toEqual([7 * layer, 8 * layer]);
  });
  it("never runs past the buffer and keeps a layout without bytesPerRow whole", () => {
    expect(writeTextureSpan(100, { offset: 10, bytesPerRow: 64 }, [16, 16])).toEqual([10, 100]);
    expect(writeTextureSpan(100, { offset: 4 }, [1, 1])).toEqual([4, 100]);
  });
});
