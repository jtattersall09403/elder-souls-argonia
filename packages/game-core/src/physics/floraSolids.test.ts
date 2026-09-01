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
  collisionFrame: "pivot-yup-v2",
  collisionCapsule: { radiusM: 0.4, heightM: 32, baseOffsetM: [0.02, 0.9, -1.19] },
};

const boulder: FloraCollisionAsset = {
  id: "vanilla:landscape/rocks/rockl04",
  sizeM: [3.08, 4.06, 5.96],
  collision: "convex",
  collisionFrame: "pivot-yup-v2",
  collisionBox: { halfExtentsM: [1.35, 2.62, 1.79], centreOffsetM: [0, 2.3, -0.1] },
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

  it("stands a trunk capsule up from its measured base offset", () => {
    const collider = colliderFor(trunk);
    expect(collider).toEqual({
      kind: "capsule",
      radiusM: 0.4,
      heightM: 32,
      // baseOffsetM points at the capsule BOTTOM; Rapier centres shapes, so
      // the offset is lifted half the height.
      offsetM: [0.02, 16.9, -1.19],
    });
  });

  it("passes a boulder's pivot-relative box straight through", () => {
    const collider = colliderFor(boulder);
    expect(collider).toEqual({
      kind: "box",
      halfExtentsM: [1.35, 2.62, 1.79],
      offsetM: [0, 2.3, -0.1],
    });
  });

  it("refuses a kit still on the pre-v2 collision frame — round 5 shipped its", () => {
    // capsule offsets bbox-centre-relative in z-up while the runtime read
    // them as pivot-relative y-up: metres of solid air beside passable
    // trunks. Misplaced colliders are worse than none.
    expect(colliderFor({ ...trunk, collisionFrame: undefined })).toBeNull();
    expect(colliderFor({ ...boulder, collisionFrame: "something-else" })).toBeNull();
  });

  it("refuses a degenerate shape rather than spawning a zero-size body", () => {
    expect(colliderFor({ ...trunk, collisionCapsule: {
      radiusM: 0, heightM: 32, baseOffsetM: [0, 0, 0] } })).toBeNull();
    expect(colliderFor({ ...boulder, collisionBox: {
      halfExtentsM: [1, 0, 1], centreOffsetM: [0, 0, 0] } })).toBeNull();
  });
});

describe("the collider ring", () => {
  const at = (x: number, z: number) => ({
    species: "s", x, y: 0, z, yaw: 0, tiltX: 0, tiltZ: 0, scale: 1,
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
