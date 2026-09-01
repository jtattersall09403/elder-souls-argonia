import { describe, expect, it } from "vitest";

import { weaponById } from "../equipment/arsenal";
import { selectEnemyIntent, scoreEnemyIntents, type EnemyAiContext } from "./enemyAi";
import { weaponTactics } from "./weaponTactics";

/**
 * The property under test is the one the hard-coded distances broke: an enemy
 * should fight at the range *its own weapon* wants, not at a sword's.
 */

const dagger = weaponTactics(weaponById("steel-dagger"));
const sword = weaponTactics(weaponById("steel-sword"));
const greatsword = weaponTactics(weaponById("steel-greatsword"));
const bow = weaponTactics(weaponById("steel-longbow"));

function context(overrides: Partial<EnemyAiContext> = {}): EnemyAiContext {
  return {
    distance: 3,
    healthRatio: 1,
    stamina: 100,
    estus: 0,
    playerAction: "idle",
    playerPhase: "none",
    playerRecovering: false,
    personality: 0.5,
    ...overrides,
  };
}

describe("what a weapon wants", () => {
  it("stands further off the longer the weapon", () => {
    expect(dagger.engageRange).toBeLessThan(sword.engageRange);
    expect(sword.engageRange).toBeLessThan(greatsword.engageRange);
  });

  it("makes a quick weapon keener to swing than a slow one", () => {
    expect(dagger.aggression).toBeGreaterThan(greatsword.aggression);
  });

  it("makes a short weapon work for its angle", () => {
    expect(dagger.circling).toBeGreaterThan(greatsword.circling);
  });

  it("treats a bow as a different problem entirely", () => {
    expect(bow.ranged).toBe(true);
    expect(bow.standoffRange).toBeGreaterThan(greatsword.engageRange * 3);
    expect(sword.standoffRange).toBeNull();
  });
});

describe("how that changes what an enemy decides", () => {
  const best = (scores: ReturnType<typeof scoreEnemyIntents>) =>
    scores.reduce((a, b) => (b.score > a.score ? b : a)).intent;

  it("has a dagger close where a greatsword is already in range", () => {
    // Two metres: comfortable for a greatsword, well outside a dagger's reach.
    const at = context({ distance: 2 });
    expect(best(scoreEnemyIntents({ ...at, tactics: dagger }))).toBe("approach");
    expect(best(scoreEnemyIntents({ ...at, tactics: greatsword }))).not.toBe("approach");
  });

  it("never has an archer walk toward a player at bow range", () => {
    for (const distance of [7, 9, 11]) {
      const intent = selectEnemyIntent(context({ distance, tactics: bow }), 0.5);
      expect(intent, `at ${distance} m`).not.toBe("approach");
    }
  });

  it("has an archer shoot when it has the room, and give ground when it does not", () => {
    expect(best(scoreEnemyIntents(context({ distance: 9, tactics: bow })))).toBe("shoot");
    expect(best(scoreEnemyIntents(context({ distance: 5, tactics: bow })))).toBe("withdraw");
  });

  it("has an archer roll away from a swing rather than trade with it", () => {
    const cornered = context({
      distance: 1.6,
      tactics: bow,
      playerAction: "light1",
      playerPhase: "windup",
    });
    expect(best(scoreEnemyIntents(cornered))).toBe("dodge");
  });

  it("never offers a bow a parry or a guard, which it cannot do", () => {
    const scores = scoreEnemyIntents(context({
      distance: 2,
      tactics: bow,
      playerAction: "light1",
      playerPhase: "windup",
    }));
    expect(scores.map((entry) => entry.intent)).not.toContain("parry");
    expect(scores.map((entry) => entry.intent)).not.toContain("guard");
  });

  it("leaves a swordsman's decisions where they were", () => {
    // The fallback is the sword's own tactics, so an actor with no resolved
    // weapon behaves exactly as it did before any of this existed.
    const at = context({ distance: 2.4 });
    expect(scoreEnemyIntents(at)).toEqual(scoreEnemyIntents({ ...at, tactics: sword }));
  });
});
