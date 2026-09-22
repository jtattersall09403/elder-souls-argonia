import { describe, expect, it } from "vitest";
import { TRI_BUCKETS, bucketOf, bucketSlot, emptyBuckets } from "./triangleBuckets";

describe("triangle attribution buckets", () => {
  it("reads a mesh's own perfTag", () => {
    expect(bucketOf({ userData: { perfTag: "terrain" } })).toBe("terrain");
    expect(bucketOf({ userData: { perfTag: "gc" } })).toBe("gc");
  });

  it("falls back to veg for batched meshes and other for everything else", () => {
    expect(bucketOf({ userData: { perfTag: "veg" } })).toBe("veg");
    expect(bucketOf({ userData: {} })).toBe("other");
    expect(bucketOf({})).toBe("other");
    expect(bucketOf(null)).toBe("other");
    expect(bucketOf({ userData: { perfTag: 7 } })).toBe("other");
    expect(bucketOf({ userData: { perfTag: "water" } })).toBe("other");
  });

  it("sums every draw into exactly one slot, so the buckets equal the total", () => {
    const draws = [
      { object: { userData: { perfTag: "terrain" } }, shadow: false, tris: 4_000_000 },
      { object: { userData: { perfTag: "terrain" } }, shadow: true, tris: 1_500_000 },
      { object: { userData: { perfTag: "veg" } }, shadow: false, tris: 3_000_000 },
      { object: { userData: { perfTag: "veg" } }, shadow: true, tris: 2_100_000 },
      { object: { userData: { perfTag: "gc" } }, shadow: false, tris: 800_000 },
      { object: {}, shadow: false, tris: 400_000 },
    ];
    const buckets = emptyBuckets();
    let total = 0;
    for (const d of draws) {
      const i = TRI_BUCKETS.indexOf(bucketOf(d.object));
      buckets[bucketSlot(d.shadow, i)] += d.tris;
      total += d.tris;
    }
    expect(buckets.reduce((a, b) => a + b, 0)).toBe(total);
    expect(buckets[bucketSlot(false, TRI_BUCKETS.indexOf("veg"))]).toBe(3_000_000);
    expect(buckets[bucketSlot(true, TRI_BUCKETS.indexOf("veg"))]).toBe(2_100_000);
    expect(buckets[bucketSlot(false, TRI_BUCKETS.indexOf("other"))]).toBe(400_000);
  });
});
