import { describe, expect, it } from "vitest";
import { InputController } from "../io/input";
import { inputToIntent } from "../combat/intent";
import { MANIFEST_STATES, clipPlaybackDuration } from "../anim/animationManifest";
import { ENEMY_GUARD_TACTICAL_DURATION } from "../combat/enemyGuard";
import { ACTION_DURATIONS } from "../combat/tuning";
import { CHARACTER_CAPSULE_RADIUS } from "../physics/characterPhysics";
import { DEFAULT_ENEMY_ARCHETYPE } from "../actors/enemyArchetypes";
import {
  COMBAT_TUNING,
  STRAIGHT_SWORD,
  criticalVictimDeathPlayback,
  criticalVictimRecoveryPlayback,
} from "../combat/weapon";
import expectations from "./visualScenarioExpectations.json";
import exclusions from "./visualAnimationExclusions.json";
import {
  FOCUSED_LIGHT_1_CONTACT_TIME,
  VISUAL_SCENARIOS,
  VisualScenarioDriver,
  visualScenarioFromSearch,
} from "./visualScenarios";

describe("visual scenario input driver", () => {
  it("publishes an exact frame zero when the fixed capture clock finishes warm-up", () => {
    const input = new InputController();
    const driver = new VisualScenarioDriver(VISUAL_SCENARIOS.roll);
    for (let frame = 0; frame < 15; frame += 1) driver.apply(1 / 30, input);
    expect(driver.ready).toBe(true);
    expect(driver.elapsed).toBe(0);
    driver.apply(1 / 30, input);
    expect(driver.elapsed).toBeCloseTo(1 / 30);
  });

  it("routes scripted controls through the real input edge detector", () => {
    const input = new InputController();
    const driver = new VisualScenarioDriver(VISUAL_SCENARIOS.backstab);
    driver.apply(VISUAL_SCENARIOS.backstab.warmup + 0.5, input);
    input.update();
    expect(inputToIntent(input).lightPressed).toBe(false);
    driver.apply(0.06, input);
    input.update();
    expect(inputToIntent(input).lightPressed).toBe(true);
    driver.apply(0.02, input);
    input.update();
    expect(inputToIntent(input).lightPressed).toBe(false);
  });

  it("keeps scenario selection explicit and rejects unknown query values", () => {
    expect(visualScenarioFromSearch("?scenario=riposte")?.id).toBe("riposte");
    expect(visualScenarioFromSearch("?scenario=unknown")).toBeNull();
  });

  it("releases deterministic enemy choices only when due and only once", () => {
    const input = new InputController();
    const driver = new VisualScenarioDriver(VISUAL_SCENARIOS["hit-reactions"]);
    driver.apply(VISUAL_SCENARIOS["hit-reactions"].warmup + 0.2, input);
    expect(driver.takeEnemyCue()).toBeNull();
    driver.apply(0.06, input);
    expect(driver.takeEnemyCue()).toEqual({
      intent: "lightCombo",
      attack: "light1",
      comboRemaining: 0,
      side: undefined,
    });
    expect(driver.takeEnemyCue()).toBeNull();
    driver.apply(2.5, input);
    expect(driver.takeEnemyCue()).toEqual({
      intent: "heavy",
      attack: "heavy",
      comboRemaining: undefined,
      side: undefined,
    });
    expect(driver.takeEnemyCue()).toBeNull();
  });

  it("returns to guard after one block and finishes a second block after release", () => {
    const scenario = VISUAL_SCENARIOS["guard-defense"];
    const guardInput = scenario.cues.find((cue) => cue.actions?.includes("guard"));
    const attacks = scenario.enemyCues?.filter((cue) => cue.intent === "lightCombo") ?? [];
    const latestAttack = attacks.at(-1);
    const attack = STRAIGHT_SWORD.attacks.light1;
    const guardHitDuration = clipPlaybackDuration("GUARD_HIT_B");

    expect(guardInput).toBeDefined();
    expect(latestAttack).toBeDefined();
    expect(guardHitDuration).not.toBeNull();
    if (!guardInput || !latestAttack || guardHitDuration === null) return;

    // Release occurs after the second impact but before its authored reaction
    // completes. The runtime must defer exit through guardHitUntil.
    const latestImpact = latestAttack.at + attack.windup + attack.active;
    expect(guardInput.to).toBeGreaterThan(latestImpact);
    expect(guardInput.to).toBeLessThan(latestImpact + guardHitDuration);
    expect(scenario.duration - (latestImpact + guardHitDuration)).toBeGreaterThan(0.3);
  });

  it("centres focused real attacks inside the enemy guard and parry windows", () => {
    const blockScenario = VISUAL_SCENARIOS["enemy-block"];
    const parryScenario = VISUAL_SCENARIOS["enemy-parry"];
    const blockInput = blockScenario.cues.find((cue) => cue.actions?.includes("light"));
    const parryInput = parryScenario.cues.find((cue) => cue.actions?.includes("light"));
    const guardCue = blockScenario.enemyCues?.find((cue) => cue.intent === "guard");
    const parryCue = parryScenario.enemyCues?.find((cue) => cue.intent === "parry");
    const attack = STRAIGHT_SWORD.attacks.light1;

    expect(blockInput).toBeDefined();
    expect(parryInput).toBeDefined();
    expect(guardCue).toBeDefined();
    expect(parryCue).toBeDefined();
    if (!blockInput || !parryInput || !guardCue || !parryCue) return;

    const firstActiveEnd = blockInput.from + attack.windup + attack.active;
    const guardExpiry = guardCue.at + ENEMY_GUARD_TACTICAL_DURATION;
    expect(guardExpiry - firstActiveEnd).toBeGreaterThan(0.1);

    const renderedContact = parryInput.from + FOCUSED_LIGHT_1_CONTACT_TIME;
    const parryActiveStart = parryCue.at + COMBAT_TUNING.parryActiveStart;
    const parryActiveEnd = parryCue.at + COMBAT_TUNING.parryActiveEnd;
    // The forward shield must arm early enough to meet the approaching blade,
    // while its later body-contact callback retains at least one fixed-step
    // margin before the authored parry window closes.
    expect(renderedContact - parryActiveStart).toBeGreaterThan(0.09);
    expect(parryActiveEnd - renderedContact).toBeGreaterThan(1 / 60);

    const guardBreakDuration = ACTION_DURATIONS.guardBreak;
    expect(guardBreakDuration).toBeDefined();
    if (guardBreakDuration === undefined) return;
    expect(parryScenario.duration - renderedContact - guardBreakDuration).toBeGreaterThan(0.3);
  });

  it("keeps enemy production branches in short, independently reviewable scenes", () => {
    const expectedIntents = {
      "enemy-light-combo": ["lightCombo"],
      "enemy-heavy-attack": ["heavy"],
      "enemy-approach": ["approach"],
      "enemy-evasion": ["strafe", "strafe", "dodge", "backstep"],
      "enemy-utility": ["heal", "guard", "parry"],
    } as const;

    for (const [id, intents] of Object.entries(expectedIntents)) {
      const scenario = VISUAL_SCENARIOS[id as keyof typeof expectedIntents];
      expect(scenario.duration, `${id} should stay readable at normal speed`).toBeLessThan(7);
      expect(scenario.enemyCues?.map((cue) => cue.intent)).toEqual([...intents]);
    }
  });

  it("drives a real approach from WALK through the run threshold while changing bearing", () => {
    const scenario = VISUAL_SCENARIOS["enemy-approach"];
    const initialDistance = Math.hypot(
      scenario.player.position[0] - scenario.enemy.position[0],
      scenario.player.position[2] - scenario.enemy.position[2],
    );
    const retreatCues = scenario.cues.filter((cue) => (cue.move?.[1] ?? 0) < 0);
    const targetYaw = Math.atan2(
      scenario.player.position[0] - scenario.enemy.position[0],
      scenario.player.position[2] - scenario.enemy.position[2],
    );
    const yawDelta = Math.abs(Math.atan2(
      Math.sin(targetYaw - scenario.enemy.yaw),
      Math.cos(targetYaw - scenario.enemy.yaw),
    ));

    expect(initialDistance).toBeLessThan(DEFAULT_ENEMY_ARCHETYPE.locomotion.runAboveDistance);
    expect(retreatCues.length).toBeGreaterThanOrEqual(2);
    expect(retreatCues.some((cue) => Math.abs(cue.move?.[0] ?? 0) > 0.1)).toBe(true);
    expect(yawDelta).toBeGreaterThan(Math.PI / 6);
  });

  it("starts focused contact scenes with readable torso separation", () => {
    for (const id of ["guard-break", "enemy-block", "enemy-parry", "enemy-light-combo", "enemy-heavy-attack"] as const) {
      const scenario = VISUAL_SCENARIOS[id];
      const initialDistance = Math.hypot(
        scenario.player.position[0] - scenario.enemy.position[0],
        scenario.player.position[2] - scenario.enemy.position[2],
      );
      // 1.1 rather than the 1.7 of the lunge era: the guard clips' planar
      // origin was recentred (round 6) and the sword's light attack registers
      // on the honestly placed guard at 1.2 m (measured; not at 1.54 or 1.74),
      // so the guard scenes start there. Both torsos are still fully readable.
      expect(initialDistance, id).toBeGreaterThan(1.1);
      // Never accept a threshold below what the navigation capsules physically
      // allow: at hard contact the two actors are as close as the simulation
      // can put them, and anything under that would stop rejecting anything.
      expect(expectations[id].actorSeparation?.minDistanceMeters, id)
        .toBeGreaterThanOrEqual(CHARACTER_CAPSULE_RADIUS * 2);
    }
  });

  it("covers every runtime semantic animation or records why it is unreachable", () => {
    const covered = new Set(Object.values(expectations).flatMap((expected) => [
      ...expected.playerAnimations,
      ...expected.enemyAnimations,
    ]));
    const excluded = new Set(Object.keys(exclusions));
    const missing = MANIFEST_STATES.filter((state) => !covered.has(state) && !excluded.has(state));
    const staleExclusions = [...excluded].filter((state) => !MANIFEST_STATES.includes(state as typeof MANIFEST_STATES[number]));

    expect(missing).toEqual([]);
    expect(staleExclusions).toEqual([]);
  });

  it("keeps action-only evidence selections inside each scenario's observed contract", () => {
    for (const [scenario, expected] of Object.entries(expectations)) {
      const evidence = (expected.evidenceAnimations ?? {}) as {
        player?: string[];
        enemy?: string[];
      };
      for (const animation of evidence.player ?? []) {
        expect(expected.playerAnimations, `${scenario} player evidence ${animation}`).toContain(animation);
      }
      for (const animation of evidence.enemy ?? []) {
        expect(expected.enemyAnimations, `${scenario} enemy evidence ${animation}`).toContain(animation);
      }
      expect(
        [...(evidence.player ?? []), ...(evidence.enemy ?? [])].length,
        `${scenario} must publish action-only review evidence`,
      ).toBeGreaterThan(0);
    }
  });

  it("records both criticals through their complete semantic victim recovery", () => {
    for (const type of ["riposte", "backstab"] as const) {
      const scenario = VISUAL_SCENARIOS[type];
      const attack = STRAIGHT_SWORD.attacks[type];
      const profile = STRAIGHT_SWORD.animations[type];
      const recovery = criticalVictimRecoveryPlayback(profile);
      const outcome = (attack.windup + attack.active + attack.recovery) * profile.victimOutcomeProgress;
      const inputCue = scenario.cues.find((cue) => cue.actions?.includes("light"));
      expect(inputCue, `${type} is missing its real light-attack input`).toBeDefined();
      if (!inputCue) throw new Error(`${type} is missing its real light-attack input`);
      const inputTime = inputCue.from;
      const reactionStart = (attack.windup + attack.active + attack.recovery)
        * profile.victimActionStartProgress;
      const reactionClockAtOutcome = profile.victimActionStartAt
        + Math.max(0, outcome - reactionStart);
      const recoveryClockAtOutcome = recovery.action === profile.victimAction
        ? reactionClockAtOutcome
        : recovery.startAt;
      const returnToReady = inputTime
        + outcome
        + (recovery.endAt - recoveryClockAtOutcome)
        + DEFAULT_ENEMY_ARCHETYPE.stateDurations.recover;

      expect(scenario.duration, `${type} recording cuts off before ready`).toBeGreaterThan(returnToReady);
      expect(expectations[type].enemyAnimations).toContain(recovery.action);
      expect(expectations[type].enemyActions).toContain("criticalRecovery");
      expect(expectations[type].enemyActions).toContain("recover");
    }
    expect(criticalVictimRecoveryPlayback(STRAIGHT_SWORD.animations.riposte).action)
      .toBe("RIPOSTED_HIT1");
    expect(criticalVictimRecoveryPlayback(STRAIGHT_SWORD.animations.backstab).action)
      .toBe("BACKSTABBED");
  });

  it("records a deterministic lethal riposte through a held prone pose", () => {
    const scenario = VISUAL_SCENARIOS["riposte-lethal"];
    const attack = STRAIGHT_SWORD.attacks.riposte;
    const profile = STRAIGHT_SWORD.animations.riposte;
    const death = criticalVictimDeathPlayback(profile);
    const outcome = (attack.windup + attack.active + attack.recovery) * profile.victimOutcomeProgress;
    const requiredEnd = scenario.cues[0].from + outcome + (death.endAt - death.startAt) + 1;

    expect(scenario.enemy.health).toBeLessThanOrEqual(attack.damage);
    expect(scenario.duration).toBeGreaterThan(requiredEnd);
    expect(expectations["riposte-lethal"].enemyAnimations).toContain("CRITICAL_DEATH");
    expect(expectations["riposte-lethal"].requiredAnimationRuns.enemy)
      .toEqual(["GUARD_BREAK", "CRITICAL_DEATH"]);
    expect(expectations["riposte-lethal"].enemyAnimations).not.toContain("RIPOSTED_HIT1");
    expect(expectations["riposte-lethal"].enemyAnimations).not.toContain("DEATH");
    expect(expectations["riposte-lethal"].enemyAnimations).not.toContain("SWORD_IDLE");
  });

  it("records a deterministic lethal backstab through its distinct paired handoff", () => {
    const scenario = VISUAL_SCENARIOS["backstab-lethal"];
    const attack = STRAIGHT_SWORD.attacks.backstab;
    const profile = STRAIGHT_SWORD.animations.backstab;
    const death = criticalVictimDeathPlayback(profile);
    const outcome = (attack.windup + attack.active + attack.recovery) * profile.victimOutcomeProgress;
    const requiredEnd = scenario.cues[0].from + outcome + (death.endAt - death.startAt) + 1;

    expect(scenario.enemy.health).toBeLessThanOrEqual(attack.damage);
    expect(scenario.duration).toBeGreaterThan(requiredEnd);
    expect(expectations["backstab-lethal"].requiredAnimationRuns.enemy)
      .toEqual(["SWORD_IDLE", "BACKSTABBED", "CRITICAL_DEATH"]);
  });
});
