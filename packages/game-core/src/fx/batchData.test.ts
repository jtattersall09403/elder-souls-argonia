import { describe, expect, it } from "vitest";
import { createBatchDataTexture, createBatchDataUniforms, createDeferredDisposer } from "./batchData";

describe("batch data uniforms", () => {
  it("are nodes whose value re-points without a rebuild", () => {
    const uniforms = createBatchDataUniforms();
    for (const u of Object.values(uniforms)) expect((u as { isNode?: boolean }).isNode).toBe(true);
    const grown = createBatchDataTexture(64);
    uniforms.esBatchData.value = grown;
    expect(uniforms.esBatchData.value).toBe(grown);
    expect(uniforms.esOccParams.value.toArray()).toEqual([0, 0, 128, 32]);
  });

  it("start on placeholders of the formats that replace them", () => {
    // The bind layout's sample type is fixed at build: an RGBA float data
    // texture and an R8 occlusion mask replace them later.
    const uniforms = createBatchDataUniforms();
    const data = createBatchDataTexture(1);
    expect(uniforms.esBatchData.value.format).toBe(data.format);
    expect(uniforms.esBatchData.value.type).toBe(data.type);
    expect(uniforms.esOccMask.value.format).toBe(1028); // RedFormat
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

describe("deferred disposer", () => {
  it("disposes a deferred texture only after N ticks, and flush disposes the rest", () => {
    const d = createDeferredDisposer(3);
    let a = 0, b = 0;
    d.defer({ dispose: () => { a++; } });
    d.tick(); d.tick();
    expect(a).toBe(0);
    d.tick();
    expect(a).toBe(1);
    d.defer({ dispose: () => { b++; } });
    d.tick();
    expect(b).toBe(0);
    d.flush();
    expect(b).toBe(1);
    d.tick();
    expect(a).toBe(1);
    expect(b).toBe(1);
  });
});
