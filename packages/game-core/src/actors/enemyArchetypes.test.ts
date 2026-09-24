import { describe, expect, it } from "vitest";
import { ARCHER_WARDEN, ENEMY_ARCHETYPES } from "./enemyArchetypes";

/**
 * Expected answers, written before the code (combat-sandbox lane round 4,
 * decision 0092 §4): every archetype carries its perception; the placeholder
 * is spot 40, a 60° half-cone and 30 m, the archer sees to 45 m.
 */
describe("enemy perception", () => {
  it("gives every archetype the placeholder perception, the archer a longer view", () => {
    for (const archetype of Object.values(ENEMY_ARCHETYPES)) {
      const range = archetype.id === ARCHER_WARDEN.id ? 45 : 30;
      expect(archetype.perception, archetype.id).toEqual({ spotScore: 40, viewHalfAngleDegrees: 60, viewRangeMetres: range });
    }
  });
});
