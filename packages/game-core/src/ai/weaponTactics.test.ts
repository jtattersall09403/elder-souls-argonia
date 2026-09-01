import { describe, expect, it } from "vitest";

import { shieldById, weaponById } from "../equipment/arsenal";
import { selectEnemyIntent, scoreEnemyIntents, type EnemyAiContext } from "./enemyAi";
import { loadoutTactics, weaponTactics } from "./weaponTactics";

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

describe("blocking is the off hand's business", () => {
  // Reported: the shield warden "tries to parry a lot but always gets it wrong
  // and never seems to try to block". It did not know it had a shield —
  // `loadoutTactics` read the main hand and discarded the off hand entirely.
  it("rates a sword and board far better at blocking than the same sword alone", () => {
    const sword = weaponById("steel-sword");
    const alone = loadoutTactics({ mainHand: sword, offHand: null });
    const withShield = loadoutTactics({ mainHand: sword, offHand: shieldById("steel-shield") });
    expect(withShield.guarding).toBeGreaterThan(alone.guarding + 0.25);
    expect(alone.guarding).toBeLessThan(0.5);
    expect(withShield.guarding).toBeGreaterThan(0.55);
    // And nothing else about how it fights changed: reach and cadence are
    // still the sword's.
    expect(withShield.engageRange).toBe(alone.engageRange);
    expect(withShield.aggression).toBe(alone.aggression);
  });

  it("has a shield warden choose to block a light attack, and dodge a heavy", () => {
    const context = {
      distance: 1.6,
      healthRatio: 1,
      stamina: 100,
      estus: 3,
      personality: 0.5,
      playerPhase: "windup" as const,
      playerAction: "light1" as const,
      playerRecovering: false,
      tactics: loadoutTactics({
        mainHand: weaponById("steel-sword"),
        offHand: shieldById("steel-shield"),
      }),
    };
    const light = scoreEnemyIntents(context);
    const best = light.reduce((a, b) => (b.score > a.score ? b : a));
    expect(best.intent).toBe("guard");

    const heavy = scoreEnemyIntents({ ...context, playerAction: "heavy" });
    const bestHeavy = heavy.reduce((a, b) => (b.score > a.score ? b : a));
    expect(bestHeavy.intent).toBe("dodge");
  });

  it("leaves a dagger preferring to parry, having nothing worth blocking with", () => {
    const scores = scoreEnemyIntents({
      distance: 1.2,
      healthRatio: 1,
      stamina: 100,
      estus: 3,
      personality: 0.5,
      playerPhase: "windup",
      playerAction: "light1",
      playerRecovering: false,
      tactics: loadoutTactics({ mainHand: weaponById("steel-dagger"), offHand: null }),
    });
    const guard = scores.find((entry) => entry.intent === "guard")!.score;
    const parry = scores.find((entry) => entry.intent === "parry")!.score;
    expect(parry).toBeGreaterThan(guard);
  });
});
