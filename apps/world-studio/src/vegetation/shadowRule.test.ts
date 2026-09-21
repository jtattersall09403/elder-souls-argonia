import { describe, expect, it } from "vitest";
import { castsShadowFor, shadowLevelFor } from "./shadowRule";

/** A ladder that touches every kit level 0..maxLevel. */
const ladder = (maxLevel: number) =>
  Array.from({ length: maxLevel + 1 }, (_, level) => ({ level }));

describe("the shadow rule", () => {
  it("casts from the mid rung when level 1 is a mesh", () => {
    // [mesh0, mesh1, mesh2, card]: four kit levels, the card is level 3.
    expect(shadowLevelFor(ladder(3), 3, 3)).toBe(1);
    expect(castsShadowFor(ladder(3), 3, 3, 1)).toBe(true);
    for (const level of [0, 2, 3]) {
      expect(castsShadowFor(ladder(3), 3, 3, level)).toBe(false);
    }
  });

  it("casts from the full mesh when level 1 is the card", () => {
    // [mesh0, card] — every alpha-tested species after `buildKit` folds the
    // chain to this, and the round-7 rule left it with no caster at all.
    expect(shadowLevelFor(ladder(1), 1, 1)).toBe(0);
    expect(castsShadowFor(ladder(1), 1, 1, 0)).toBe(true);
    expect(castsShadowFor(ladder(1), 1, 1, 1)).toBe(false);
  });

  it("casts from the full mesh when there is only one level", () => {
    expect(castsShadowFor(ladder(0), 0, null, 0)).toBe(true);
  });

  it("never casts from a card", () => {
    for (const cardIndex of [1, 2, 3]) {
      expect(castsShadowFor(ladder(3), 3, cardIndex, cardIndex)).toBe(false);
    }
  });
});
