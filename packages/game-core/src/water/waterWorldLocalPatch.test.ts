import { expect, it } from "vitest";
import { LocalWaterPatch } from "./LocalWaterPatch";
import { sampleLocalPatchSurface } from "./localPatchPresentation";
import { WaterData } from "./waterData";
import { WaterWorld } from "./waterWorld";

function fixture() {
  const sample = { surfaceBase: 10, depthProxy: 2, supported: true, waterBodyId: "water.pool",
    tideResponse: 0, seasonResponse: 0, className: "lake", shoreDistM: 0,
    turbidity: 1, tannin: 1, salinity: 0, waveShelter: 0, flowX: 0, flowZ: 0 };
  const data = { sample: () => sample, boundaryAt: () => sample } as unknown as WaterData;
  const world = new WaterWorld(data, { tidalAmplitudeM: 0, seasonalAmplitudeM: 0, seasonScalar: () => 0 });
  const patch = new LocalWaterPatch({ size: 32, cellSizeM: .25, originX: 0, originZ: 0,
    bodyId: "water.pool", baseHeightM: 10, groundHeights: new Float32Array(1024).fill(8) });
  return { world, patch };
}

it("physical height, depth and normal use the rendered local displacement including its edge blend", () => {
  const { world, patch } = fixture();
  world.setLocalPatch(patch);
  patch.impulse({ x: 1, z: 4, radiusM: 1, energyJ: 20 });
  for (const [x, z] of [[1, 4], [.4, 4], [1.25, 4.3], [4, 4]]) {
    const local = sampleLocalPatchSurface(patch, x, z)!;
    const result = world.sample({ x, y: 9, z }, 0);
    expect(result.surfaceHeight).toBeCloseTo(10 + local.height, 10);
    expect(result.depth).toBeCloseTo(2 + local.height, 10);
    const length = Math.hypot(local.slopeX, 1, local.slopeZ);
    expect(result.surfaceNormal.x).toBeCloseTo(-local.slopeX / length, 10);
    expect(result.surfaceNormal.z).toBeCloseTo(-local.slopeZ / length, 10);
    // Domain/terrain connectivity must not feed its own transient waves back
    // into the next simulation initialization or seasonal flood solve.
    expect(world.sampleBoundary(x, z, 0).surfaceHeight).toBe(10);
  }
});

it("never applies local displacement to another body or a suspended/removed patch", () => {
  const { world, patch } = fixture();
  patch.impulse({ x: 4, z: 4, radiusM: 1, energyJ: 20 });
  world.setLocalPatch(patch);
  patch.setActive(false);
  expect(world.sample({ x: 4, y: 9, z: 4 }, 0).surfaceHeight).toBe(10);
  patch.initialize({ originX: 0, originZ: 0, bodyId: "water.other", baseHeightM: 10,
    groundHeights: new Float32Array(1024).fill(8) });
  patch.setActive(true);
  patch.impulse({ x: 4, z: 4, radiusM: 1, energyJ: 20 });
  expect(world.sample({ x: 4, y: 9, z: 4 }, 0).surfaceHeight).toBe(10);
  world.setLocalPatch(null);
  expect(world.localPatch).toBeNull();
});
