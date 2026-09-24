import { describe, expect, it } from "vitest";
import { scoreEnemyIntents, selectEnemyIntent, type EnemyAiContext } from "./enemyAi";

const base: EnemyAiContext = {
  distance: 2.1,
  healthRatio: 1,
  stamina: 100,
  estus: 1,
  playerAction: "idle",
  playerPhase: "none",
  playerRecovering: false,
  personality: 0.5,
};

describe("enemy utility AI", () => {
  it("prefers a dodge against a nearby heavy windup", () => {
    expect(selectEnemyIntent({ ...base, playerAction: "heavy", playerPhase: "windup" }, 0.5)).toBe("dodge");
  });

  it("reads dual wield's power attacks as heavies and its off-hand light as a light (decision 0091)", () => {
    for (const playerAction of ["offPower", "dualPower"] as const) {
      expect(scoreEnemyIntents({ ...base, playerAction, playerPhase: "windup" }))
        .toEqual(scoreEnemyIntents({ ...base, playerAction: "heavy", playerPhase: "windup" }));
    }
    expect(scoreEnemyIntents({ ...base, playerAction: "offLight", playerPhase: "windup" }))
      .toEqual(scoreEnemyIntents({ ...base, playerAction: "light1", playerPhase: "windup" }));
  });

  it("can heal when hurt and safely separated", () => {
    expect(selectEnemyIntent({ ...base, distance: 4, healthRatio: 0.18 }, 0.5)).toBe("heal");
  });

  it("removes stamina-expensive choices when exhausted", () => {
    const scores = scoreEnemyIntents({ ...base, stamina: 5, playerAction: "light1", playerPhase: "windup" });
    expect(scores.filter(({ intent }) => ["lightCombo", "heavy", "parry", "dodge", "backstep"].includes(intent)).every(({ score }) => score === 0)).toBe(true);
  });

  it("gives different personalities different scores in an identical situation", () => {
    const a = scoreEnemyIntents({ ...base, personality: 0.12 });
    const b = scoreEnemyIntents({ ...base, personality: 0.87 });
    expect(a).not.toEqual(b);
  });

  it("is deterministic for a given personality", () => {
    const a = scoreEnemyIntents({ ...base, personality: 0.33 });
    const b = scoreEnemyIntents({ ...base, personality: 0.33 });
    expect(a).toEqual(b);
  });
});

it("reacts to the equipped incoming attack's reach instead of assuming a sword", () => {
  const at = { ...base, distance: 2, playerAction: "heavy" as const, playerPhase: "windup" as const };
  const dodge = (reach: number) => scoreEnemyIntents({ ...at, playerAttackReach: reach }).find(s => s.intent === "dodge")!.score;
  expect(dodge(.8)).toBeLessThan(dodge(2.5));
});
