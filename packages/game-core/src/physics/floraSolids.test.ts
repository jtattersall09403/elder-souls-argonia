import { describe, expect, it } from "vitest";
import {
  colliderFor,
  isSolid,
  selectNearestSolids,
  type FloraCollisionAsset,
} from "./floraSolids";

const trunk: FloraCollisionAsset = {
  id: "bmv:landscape/trees/cypress1",
  sizeM: [8, 8, 32],
  collision: "trunk-capsule",
  collisionCapsule: { radiusM: 2.4, heightM: 32, centreOffsetM: [0.02, 1.19] },
};

const boulder: FloraCollisionAsset = {
  id: "vanilla:landscape/rocks/rockl04",
  sizeM: [3.08, 4.06, 5.96],
  collision: "convex",
  collisionBox: { halfExtentsM: [1.35, 1.79, 2.62], centreOffsetM: [0, 0, 2.3] },
};

const reeds: FloraCollisionAsset = {
  id: "bmv:landscape/grass/vurt_reeds",
  sizeM: [1, 1, 0.7],
  collision: "none",
};

const shell: FloraCollisionAsset = {
  id: "bmv:landscape/rocks/moss_rockcliff01",
  sizeM: [10.5, 22.7, 9.89],
  collision: "none",
};

describe("what the world makes solid", () => {
  it("follows the source games: trunks and boulders stop you, undergrowth does not", () => {
    expect(isSolid(trunk)).toBe(true);
    expect(isSolid(boulder)).toBe(true);
    expect(isSolid(reeds)).toBe(false);
    // The open-backed cliff shell has no honest solid volume to offer.
    expect(isSolid(shell)).toBe(false);
    expect(isSolid(undefined)).toBe(false);
  });

  it("gives walk-through species no collider at all", () => {
    expect(colliderFor(reeds)).toBeNull();
  });

  it("stands a trunk capsule up from the base, not centred on the pivot", () => {
    const collider = colliderFor(trunk);
    expect(collider).toEqual({
      kind: "capsule",
      radiusM: 2.4,
      heightM: 32,
      // Source-space [x, y] becomes world [x, _, z]; the capsule is lifted
      // half its height so its foot sits at the pivot.
      offsetM: [0.02, 16, 1.19],
    });
  });

  it("converts a boulder's z-up box into y-up world axes", () => {
    const collider = colliderFor(boulder);
    expect(collider).toEqual({
      kind: "box",
      halfExtentsM: [1.35, 2.62, 1.79],
      offsetM: [0, 2.3, 0],
    });
  });

  it("refuses a degenerate shape rather than spawning a zero-size body", () => {
    expect(colliderFor({ ...trunk, collisionCapsule: {
      radiusM: 0, heightM: 32, centreOffsetM: [0, 0] } })).toBeNull();
    expect(colliderFor({ ...boulder, collisionBox: {
      halfExtentsM: [1, 0, 1], centreOffsetM: [0, 0, 0] } })).toBeNull();
  });
});

describe("the collider ring", () => {
  const at = (x: number, z: number) => ({
    species: "s", x, y: 0, z, yaw: 0, scale: 1,
  });

  it("takes the nearest instances inside the radius and no others", () => {
    const chosen = selectNearestSolids(
      [at(30, 0), at(5, 0), at(200, 0), at(12, 0)],
      { x: 0, z: 0 }, 50, 10,
    );
    expect(chosen.map((i) => i.x)).toEqual([5, 12, 30]);
  });

  it("caps the count so a dense stand cannot flood the physics world", () => {
    const dense = Array.from({ length: 500 }, (_, i) => at(i * 0.1, 0));
    expect(selectNearestSolids(dense, { x: 0, z: 0 }, 100, 64)).toHaveLength(64);
  });
});
