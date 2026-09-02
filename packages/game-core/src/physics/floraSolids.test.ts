import { describe, expect, it } from "vitest";
import {
  colliderFor,
  isSolid,
  collidersFor,
  selectNearestSolids,
  type FloraCollisionAsset,
} from "./floraSolids";

/** A composite whose trunk leans: measured band by band, bottom to top. */
const leaningTrunk: FloraCollisionAsset = {
  id: "composite:jungle/anvil-canopy-tree",
  sizeM: [33.8, 28.5, 42.4],
  collision: "trunk-capsule",
  collisionFrame: "pivot-yup-v2",
  collisionCapsule: { radiusM: 1.6, heightM: 33.7, baseOffsetM: [1.19, 0.38, 0.72] },
  collisionSegments: [
    { radiusM: 2.81, heightM: 2.0, centreOffsetM: [0.27, 1.38, 1.35] },
    { radiusM: 1.76, heightM: 2.0, centreOffsetM: [-0.58, 9.31, 0.54] },
    { radiusM: 1.85, heightM: 2.0, centreOffsetM: [10.27, 33.13, -10.71] },
  ],
};

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
    const { chosen } = selectNearestSolids(
      [at(30, 0), at(5, 0), at(200, 0), at(12, 0)],
      { x: 0, z: 0 }, 50, 10,
    );
    expect(chosen.map((i) => i.x)).toEqual([5, 12, 30]);
  });

  it("caps the count so a dense stand cannot flood the physics world", () => {
    const dense = Array.from({ length: 500 }, (_, i) => at(i * 0.1, 0));
    expect(selectNearestSolids(dense, { x: 0, z: 0 }, 100, 64).chosen)
      .toHaveLength(64);
  });

  it("spends the budget in COLLIDERS, because that is what costs", () => {
    // Four trees of four capsules each fits a budget of 16, not 64.
    const trees = Array.from({ length: 20 }, (_, i) => at(i + 1, 0));
    const { chosen } = selectNearestSolids(trees, { x: 0, z: 0 }, 100, 16, () => 4);
    expect(chosen).toHaveLength(4);
  });

  it("reports how far the cover actually reaches when the budget runs out", () => {
    // This is the guarantee the caller rebuilds against. Round 8: a flat
    // instance cap in a thicket left cover reaching ~12 m while the rebuild
    // waited for 12 m of walking, so the player spent much of the time
    // outside the collided set — walking through trunks.
    const dense = Array.from({ length: 500 }, (_, i) => at(i * 0.5, 0));
    const { chosen, coveredRadiusM } =
      selectNearestSolids(dense, { x: 0, z: 0 }, 200, 10);
    expect(chosen).toHaveLength(10);
    expect(coveredRadiusM).toBeCloseTo(5.0);
  });

  it("shrinks the reported cover when the body backstop binds, not just the budget", () => {
    // A cap that lies about its reach is worse than no cap: the caller
    // rebuilds against `coveredRadiusM`, so it has to be the truth.
    const dense = Array.from({ length: 100 }, (_, i) => at(i * 0.5, 0));
    const { chosen, coveredRadiusM } =
      selectNearestSolids(dense, { x: 0, z: 0 }, 200, 10_000, () => 1, 6);
    expect(chosen).toHaveLength(6);
    expect(coveredRadiusM).toBeCloseTo(3.0);
  });

  it("reports the full ring when everything inside it was affordable", () => {
    const { coveredRadiusM } =
      selectNearestSolids([at(3, 0)], { x: 0, z: 0 }, 40, 100);
    expect(coveredRadiusM).toBe(40);
  });
});

describe("a trunk that leans", () => {
  it("returns a chain that follows the trunk, not one upright cylinder", () => {
    const chain = collidersFor(leaningTrunk);
    expect(chain).toHaveLength(3);
    expect(chain.every((c) => c.kind === "capsule")).toBe(true);
    // The whole point: the top of the trunk is ~14 m from the base in plan,
    // which a single capsule at the base cannot cover — the owner walked
    // through it (round 7).
    expect(chain[0].offsetM[0]).toBeCloseTo(0.27);
    expect(chain[2].offsetM[0]).toBeCloseTo(10.27);
    expect(chain[2].offsetM[2]).toBeCloseTo(-10.71);
  });

  it("takes segment offsets as CENTRES, unlike the single capsule's base", () => {
    const [first] = collidersFor(leaningTrunk);
    // Not lifted by half the height — the builder already emits centres.
    expect(first.offsetM[1]).toBeCloseTo(1.38);
  });

  it("still exposes one usable shape for callers that want a single proxy", () => {
    expect(colliderFor(leaningTrunk)?.kind).toBe("capsule");
  });
});

describe("collidersFor on ordinary species", () => {
  it("wraps the single shape so every caller can treat it as a chain", () => {
    expect(collidersFor(trunk)).toEqual([colliderFor(trunk)]);
    expect(collidersFor(boulder)).toEqual([colliderFor(boulder)]);
  });

  it("gives walk-through species and pre-v2 kits nothing at all", () => {
    expect(collidersFor(reeds)).toEqual([]);
    expect(collidersFor({ ...leaningTrunk, collisionFrame: undefined })).toEqual([]);
  });

  it("falls back to the capsule when every segment is degenerate", () => {
    const broken = {
      ...leaningTrunk,
      collisionSegments: [{ radiusM: 0, heightM: 2, centreOffsetM: [0, 1, 0] as [number, number, number] }],
    };
    expect(collidersFor(broken)).toEqual([colliderFor(leaningTrunk)]);
  });
});
