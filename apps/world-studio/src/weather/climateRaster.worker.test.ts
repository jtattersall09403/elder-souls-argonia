import { describe, expect, it } from "vitest";

describe("climateRaster.worker decode", () => {
  it("decodes like the <img> -> canvas path (colour conversion on)", async () => {
    (globalThis as { self?: unknown }).self ??= globalThis;
    const { DECODE } = await import("./climateRaster.worker");
    expect(DECODE.colorSpaceConversion).toBe("default");
    expect(DECODE.premultiplyAlpha).toBe("default");
  });
});
