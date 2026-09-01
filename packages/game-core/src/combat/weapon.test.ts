import { describe, expect, it } from "vitest";
import { clipConfig, clipPlaybackDuration } from "../anim/animationManifest";
import { ACTION_DURATIONS } from "./tuning";
import { ONE_HANDED_ANIMATIONS } from "../equipment/movesets/oneHanded";
import { GREATAXE_ANIMATIONS, GREATSWORD_ANIMATIONS } from "../equipment/movesets/twoHanded";
import { ARSENAL_WEAPONS } from "../equipment/arsenal";
import { SHIELD_ANIMATIONS } from "../equipment/movesets/shield";
import {
  COMBAT_TUNING,
  attackDuration,
  CRITICAL_ATTACK_DAMAGE,
  CRITICAL_DAMAGE_MULTIPLIER,
  STRAIGHT_SWORD,
  comboEntryTime,
  comboCrossFadeDuration,
  comboQueueOpen,
  comboQueueOpenTime,
  comboSuccessorStartTime,
  comboTransitionTime,
  criticalVictimDeathPlayback,
  criticalVictimPlaybackAt,
  criticalVictimRecoveryPlayback,
  getComboSuccessor,
  hitReactionForAttack,
  isBackstabPosition,
  isParryActive,
  isRollInvulnerable,
  isWeaponHitboxActive,
  phaseAt,
} from "./weapon";

describe("straight sword moveset", () => {
  it("advances through deterministic attack phases", () => {
    const attack = STRAIGHT_SWORD.attacks.light1;
    expect(phaseAt(0.1, attack)).toBe("windup");
    expect(phaseAt(attack.windup + 0.01, attack)).toBe("active");
    expect(phaseAt(attack.windup + attack.active + 0.01, attack)).toBe("recovery");
    expect(phaseAt(10, attack)).toBe("none");
  });

  it("keeps the heavy hitbox around its measured blade sweep, not its whole clip", () => {
    const { heavy, light1 } = STRAIGHT_SWORD.attacks;
    const heavyTotal = heavy.windup + heavy.active + heavy.recovery;
    // Measured contact on the corrected-grip production rig is source
    // 0.633-0.700s; the window brackets it by one and a half physics steps.
    expect(isWeaponHitboxActive(0.633, heavy)).toBe(true);
    expect(isWeaponHitboxActive(0.7, heavy)).toBe(true);
    expect(isWeaponHitboxActive(heavy.windup - 0.01, heavy)).toBe(false);
    expect(isWeaponHitboxActive(heavy.windup + heavy.active + 0.01, heavy)).toBe(false);
    expect(isWeaponHitboxActive(light1.windup + light1.active + 0.01, light1)).toBe(false);
    // Total commitment, chain branch point and damage are all unchanged.
    expect(heavyTotal).toBeCloseTo(1.35, 5);
    expect(comboTransitionTime(heavy)).toBeCloseTo(0.98, 4);
  });

  it("has finite roll and parry windows", () => {
    expect(isRollInvulnerable(COMBAT_TUNING.rollIFrameStart)).toBe(true);
    expect(isRollInvulnerable(COMBAT_TUNING.rollIFrameEnd + 0.01)).toBe(false);
    expect(isParryActive(COMBAT_TUNING.parryActiveStart + 0.01)).toBe(true);
    expect(isParryActive(COMBAT_TUNING.parryActiveEnd + 0.01)).toBe(false);
    expect(COMBAT_TUNING.parryDuration).toBe(1.1);
    expect(COMBAT_TUNING.parryDuration).toBeGreaterThan(COMBAT_TUNING.parryActiveEnd);
  });

  it("accepts a chain input during the visible swing, not only after contact", () => {
    // The regression the measured two-handed windows introduced. A greatsword's
    // opening swing connects at 0.61 of its clip, and the input buffer used to
    // open at the contact wind-up — so a press made through the whole first
    // half of a visible swing was ignored, and only one made after the blade had
    // landed counted. The branch point is untouched, so the cadence is the same.
    const greatsword = Object.values(ARSENAL_WEAPONS).find((w) => w.classId === "greatsword")!;
    const swing = greatsword.attacks.light1;
    const duration = attackDuration(swing);
    expect(comboQueueOpenTime(swing)).toBeLessThan(swing.windup);
    expect(comboQueueOpenTime(swing)).toBeLessThan(duration * 0.35);
    expect(comboQueueOpen(duration * 0.3, 0, swing)).toBe(true);
    // And a one-handed swing is untouched: no override, so still the wind-up.
    expect(comboQueueOpenTime(STRAIGHT_SWORD.attacks.light1))
      .toBe(STRAIGHT_SWORD.attacks.light1.windup);
  });

  it("catches with the family's own window, not one shared constant", () => {
    // The defect: a tower shield and a greatsword caught over the same slice of
    // two quite different animations. Each family now carries the window its
    // own clip measured, and `isParryActive` has to honour it.
    const sword = ONE_HANDED_ANIMATIONS.parry;
    const twoHander = GREATSWORD_ANIMATIONS.parry;
    expect(twoHander.active.duration).toBeLessThan(sword.active.duration);
    // The windows do not merely differ in length, they sit at different points
    // on the clock: a one-handed catch is over well before a greatsword's has
    // opened, because a greatsword spends 0.23 s just raising the blade. So
    // each has to reject the other's moment.
    const swordCatch = sword.active.start + sword.active.duration / 2;
    const twoHanderCatch = twoHander.active.start + twoHander.active.duration / 2;
    expect(isParryActive(swordCatch, sword)).toBe(true);
    expect(isParryActive(swordCatch, twoHander)).toBe(false);
    expect(isParryActive(twoHanderCatch, twoHander)).toBe(true);
    expect(isParryActive(twoHanderCatch, sword)).toBe(false);
  });

  it("opens every family's catch after its own raise clip has played", () => {
    // The reported defect: shield, greatsword and battleaxe all caught during
    // the wind-up and were inert through the actual parry. The raise is a clip
    // of its own, so this is checkable rather than a matter of opinion — a
    // catch window that opens before the raise ends is catching with a guard
    // that is not up yet.
    const families = [
      { parry: GREATSWORD_ANIMATIONS.parry, label: "greatsword" },
      { parry: GREATAXE_ANIMATIONS.parry, label: "battleaxe" },
      { parry: SHIELD_ANIMATIONS.parry, label: "shield" },
    ];
    for (const { parry, label } of families) {
      const raise = clipConfig(parry.intro).sourceDuration ?? 0;
      expect(raise, label).toBeGreaterThan(0);
      expect(parry.active.start, label).toBeGreaterThanOrEqual(raise);
    }
  });

  it("opens every family's parry where its clip actually starts moving", () => {
    for (const profile of [ONE_HANDED_ANIMATIONS.parry, GREATSWORD_ANIMATIONS.parry, SHIELD_ANIMATIONS.parry]) {
      expect(isParryActive(profile.active.start - 0.01, profile)).toBe(false);
      expect(isParryActive(profile.active.start + 0.01, profile)).toBe(true);
      // Inside the action it belongs to, always.
      expect(profile.active.start + profile.active.duration)
        .toBeLessThan(COMBAT_TUNING.parryDuration);
    }
  });

  it("keeps heavier attacks slower, stronger, and more expensive", () => {
    const { light1, heavy } = STRAIGHT_SWORD.attacks;
    expect(heavy.damage).toBeGreaterThan(light1.damage);
    expect(heavy.stamina).toBeGreaterThan(light1.stamina);
    expect(heavy.windup).toBeGreaterThan(light1.windup);
  });

  it("defines complete stamina-limited light and heavy chains", () => {
    const { light1, light2, light3, heavy, heavy2 } = STRAIGHT_SWORD.attacks;
    expect([light1.animation, light2.animation, light3.animation]).toEqual(["LIGHT_1", "LIGHT_2", "LIGHT_3"]);
    expect([heavy.animation, heavy2.animation]).toEqual(["HEAVY", "HEAVY_2"]);
    expect(light1.stamina + light2.stamina + light3.stamina).toBe(72);
    expect(light1.stamina + light2.stamina + light3.stamina).toBeLessThanOrEqual(COMBAT_TUNING.maxStamina);
    expect(heavy.stamina + heavy2.stamina).toBe(93);
  });

  it("queues during a swing, then starts each complete successor after that swing", () => {
    const { light1, light2, light3 } = STRAIGHT_SWORD.attacks;
    expect(getComboSuccessor(light1, "light", STRAIGHT_SWORD)).toBe(light2);
    expect(getComboSuccessor(light2, "light", STRAIGHT_SWORD)).toBe(light3);
    expect(getComboSuccessor(light3, "light", STRAIGHT_SWORD)).toBeNull();

    const phaseSequence = [
      phaseAt(0, light1),
      phaseAt(light1.windup + 0.01, light1),
      phaseAt(comboEntryTime(light2), light2),
      phaseAt(light2.windup + 0.01, light2),
      phaseAt(comboEntryTime(light3), light3),
      phaseAt(light3.windup + 0.01, light3),
      phaseAt(comboTransitionTime(light3) + 0.01, light3),
    ];
    expect(phaseSequence).toEqual(["windup", "active", "windup", "active", "windup", "active", "recovery"]);
    // The chain branches well after the blade stops cutting, so the frame
    // before the branch is recovery — and input is still accepted there.
    expect(phaseAt(comboTransitionTime(light1) - 0.001, light1)).toBe("recovery");
    expect(comboQueueOpen(comboTransitionTime(light1) - 0.001, comboTransitionTime(light1) - 0.02, light1)).toBe(true);
    expect(comboEntryTime(light2)).toBe(0);
    expect(phaseAt(comboEntryTime(light2), light2)).toBe("windup");
  });

  it("brackets each light swing's measured contact and nothing else", () => {
    // Source-time contact intervals measured on the production GLB.
    const measured = {
      light1: [0.475, 0.617],
      light2: [0.45, 0.55],
      light3: [0.658, 0.983],
    } as const;
    for (const [id, [start, end]] of Object.entries(measured) as [
      "light1" | "light2" | "light3", readonly [number, number],
    ][]) {
      const attack = STRAIGHT_SWORD.attacks[id];
      expect(isWeaponHitboxActive(start, attack), `${id} misses contact start`).toBe(true);
      expect(isWeaponHitboxActive(end, attack), `${id} misses contact end`).toBe(true);
      // Neither the wind-up nor the follow-through may connect.
      expect(isWeaponHitboxActive(0, attack)).toBe(false);
      expect(isWeaponHitboxActive(attackDuration(attack) - 0.01, attack)).toBe(false);
      expect(isWeaponHitboxActive(comboTransitionTime(attack), attack)).toBe(false);
    }
  });

  it("keeps every contact window a minority of its action, and branches later", () => {
    for (const attack of Object.values(STRAIGHT_SWORD.attacks)) {
      const total = attackDuration(attack);
      expect(attack.active / total, `${attack.id} is live for most of its action`)
        .toBeLessThan(0.45);
      expect(attack.active, `${attack.id} has no contact window`).toBeGreaterThan(0.1);
      // The chain always branches at or after the blade stops cutting.
      expect(comboTransitionTime(attack)).toBeGreaterThanOrEqual(attack.windup + attack.active - 1e-9);
      expect(comboTransitionTime(attack)).toBeLessThanOrEqual(total);
    }
  });

  it("accepts queue input only during the current swing and carries frame overshoot", () => {
    const attack = STRAIGHT_SWORD.attacks.light1;
    const transition = comboTransitionTime(attack);
    expect(comboQueueOpen(attack.windup - 0.001, attack.windup - 0.01, attack)).toBe(false);
    expect(comboQueueOpen(attack.windup, attack.windup - 0.01, attack)).toBe(true);
    expect(comboQueueOpen(transition - 0.001, transition - 0.01, attack)).toBe(true);
    expect(comboQueueOpen(transition + 0.002, transition - 0.001, attack)).toBe(true);
    expect(comboQueueOpen(transition + 0.004, transition + 0.002, attack)).toBe(false);
    // A hit-stop-sized combat step grants only the frame that crossed the boundary.
    expect(comboQueueOpen(transition + 0.0008, transition - 0.0008, attack)).toBe(true);
    expect(comboQueueOpen(transition + 0.0016, transition + 0.0008, attack)).toBe(false);
    expect(comboSuccessorStartTime(transition + 0.012, attack)).toBeCloseTo(0.012);
  });

  it("supports the heavy successor and rejects unrelated combo inputs", () => {
    const { light1, heavy, heavy2 } = STRAIGHT_SWORD.attacks;
    expect(getComboSuccessor(heavy, "heavy", STRAIGHT_SWORD)).toBe(heavy2);
    expect(comboEntryTime(heavy2)).toBe(0);
    expect(getComboSuccessor(light1, "heavy", STRAIGHT_SWORD)).toBeNull();
    expect(getComboSuccessor(heavy, "light", STRAIGHT_SWORD)).toBeNull();
    expect(getComboSuccessor(heavy2, "heavy", STRAIGHT_SWORD)).toBeNull();
    expect(comboCrossFadeDuration(heavy, heavy2)).toBe(0.24);
    expect(comboCrossFadeDuration(light1, heavy2)).toBeNull();
  });

  it("sets backstab and riposte to exactly twice the opening light damage", () => {
    const { light1, backstab, riposte } = STRAIGHT_SWORD.attacks;
    expect(CRITICAL_DAMAGE_MULTIPLIER).toBe(2);
    expect(CRITICAL_ATTACK_DAMAGE).toBe(light1.damage * CRITICAL_DAMAGE_MULTIPLIER);
    expect(backstab.damage).toBe(light1.damage * 2);
    expect(riposte.damage).toBe(light1.damage * 2);
  });

  it("synchronizes critical profiles to their authored clips and victim sides", () => {
    const { riposte, backstab } = STRAIGHT_SWORD.attacks;
    const riposteConfig = clipConfig("RIPOSTE");
    const ripostedConfig = clipConfig("RIPOSTED_HIT1");

    expect(STRAIGHT_SWORD.animations.riposte.victimAction).toBe("RIPOSTED_HIT1");
    expect(STRAIGHT_SWORD.animations.backstab.victimAction).toBe("BACKSTABBED");
    expect(riposte.windup + riposte.active + riposte.recovery)
      .toBeCloseTo(clipPlaybackDuration("RIPOSTE") ?? 0, 4);
    expect(backstab.windup + backstab.active + backstab.recovery)
      .toBeCloseTo(clipConfig("BACKSTAB").sourceDuration ?? 0, 4);
    expect(riposteConfig.playbackStartTime).toBeCloseTo(0.1667, 4);
    expect(riposteConfig.playbackEndTime).toBeCloseTo(1.3, 4);
    expect(riposteConfig.crossFadeDuration).toBeCloseTo(0.18, 4);
    expect(riposteConfig.crossFadeOutDuration).toBeCloseTo(0.24, 4);
    // Measured reach of the authored lunge on the corrected-grip rig.
    expect(STRAIGHT_SWORD.animations.riposte.startingSeparation).toBeCloseTo(0.9, 3);
    expect(riposte.windup).toBeCloseTo(0.4, 4);
    expect(riposte.windup + riposte.active + riposte.recovery)
      .toBeCloseTo(1.1333, 4);
    expect(STRAIGHT_SWORD.animations.riposte.damageProgress)
      .toBeCloseTo(0.4 / 1.1333, 4);
    expect(STRAIGHT_SWORD.animations.riposte.victimActionStartProgress)
      .toBeCloseTo(STRAIGHT_SWORD.animations.riposte.damageProgress, 5);
    expect(STRAIGHT_SWORD.animations.riposte.releaseProgress)
      .toBeCloseTo(0.5333 / 1.1333, 4);
    expect(riposteConfig.provenance).toContain("CQC02");
    expect(riposteConfig.provenance).toContain("source 0.1667–1.3s");
    expect(STRAIGHT_SWORD.animations.backstab.startingSeparation).toBeCloseTo(0.861, 3);
    expect(STRAIGHT_SWORD.animations.riposte.victimOutcomeProgress)
      .toBeCloseTo(STRAIGHT_SWORD.animations.riposte.damageProgress, 5);
    expect(ripostedConfig.sourceDuration).toBeCloseTo(2, 4);
    expect(ripostedConfig.playbackStartTime).toBeCloseTo(0.1333, 4);
    expect(ripostedConfig.playbackEndTime).toBeNull();
    expect(ripostedConfig.crossFadeDuration).toBeCloseTo(0.08, 4);
    expect(ripostedConfig.crossFadeOutDuration).toBeCloseTo(0.2, 4);
    expect(STRAIGHT_SWORD.animations.backstab.victimOutcomeProgress)
      .toBeGreaterThan(STRAIGHT_SWORD.animations.backstab.releaseProgress);
    expect(clipConfig("BACKSTAB").provenance).toContain("unprefixed attacker");
    expect(clipConfig("BACKSTABBED").provenance).toContain("2_-prefixed victim");
    expect(ripostedConfig.provenance).toContain("(6141037) sword hit1");
    expect(clipConfig("CRITICAL_KNOCKDOWN").provenance).toContain("(6254014) Knockdown");
    expect(clipConfig("CRITICAL_DEATH").provenance).toContain("1.9s stable prone pose");
    expect(clipConfig("CRITICAL_DEATH").playbackEndTime).toBe(1.9);
  });

  it("holds a riposte victim vulnerable until contact, then starts a fresh reaction clock", () => {
    const attack = STRAIGHT_SWORD.attacks.riposte;
    const profile = STRAIGHT_SWORD.animations.riposte;
    const duration = attack.windup + attack.active + attack.recovery;
    const reactionStart = duration * profile.victimActionStartProgress;

    expect(reactionStart).toBeCloseTo(0.4, 4);

    expect(criticalVictimPlaybackAt(reactionStart - 0.001, attack, profile)).toEqual({
      phase: "leadIn",
      action: "GUARD_BREAK",
      startAt: 0.55,
    });
    expect(criticalVictimPlaybackAt(reactionStart, attack, profile)).toEqual({
      phase: "reaction",
      action: "RIPOSTED_HIT1",
      startAt: 0,
    });
    expect(criticalVictimPlaybackAt(reactionStart + 1 / 30, attack, profile)).toEqual({
      phase: "reaction",
      action: "RIPOSTED_HIT1",
      startAt: expect.closeTo(1 / 30, 5),
    });
  });

  it("continues each nonlethal critical in its semantically paired victim source", () => {
    const riposteAttack = STRAIGHT_SWORD.attacks.riposte;
    const riposteProfile = STRAIGHT_SWORD.animations.riposte;
    const riposteDuration = riposteAttack.windup + riposteAttack.active + riposteAttack.recovery;
    const riposteRelease = riposteDuration * riposteProfile.releaseProgress;
    const riposteAtRelease = criticalVictimPlaybackAt(riposteRelease, riposteAttack, riposteProfile);
    const riposteRecovery = criticalVictimRecoveryPlayback(riposteProfile);
    const riposteDeath = criticalVictimDeathPlayback(riposteProfile);
    expect(riposteDuration * riposteProfile.victimOutcomeProgress).toBeCloseTo(0.4, 4);
    expect(riposteRelease).toBeCloseTo(0.5333, 4);
    expect(riposteAtRelease.action).toBe("RIPOSTED_HIT1");
    expect(riposteAtRelease.startAt).toBeCloseTo(0.1333, 4);
    expect(riposteRecovery).toEqual({
      action: "RIPOSTED_HIT1",
      startAt: 0,
      crossFadeDuration: undefined,
      endAt: expect.closeTo(1.8667, 4),
    });
    expect(riposteDeath).toEqual({
      action: "CRITICAL_DEATH",
      startAt: 0.5667,
      crossFadeDuration: 0.1,
      endAt: expect.closeTo(1.9, 4),
    });

    const backstabAttack = STRAIGHT_SWORD.attacks.backstab;
    const backstabProfile = STRAIGHT_SWORD.animations.backstab;
    const backstabDuration = backstabAttack.windup + backstabAttack.active + backstabAttack.recovery;
    const backstabRelease = backstabDuration * backstabProfile.releaseProgress;
    const backstabOutcome = backstabDuration * backstabProfile.victimOutcomeProgress;
    const pairedAtRelease = criticalVictimPlaybackAt(backstabRelease, backstabAttack, backstabProfile);
    const pairedAtOutcome = criticalVictimPlaybackAt(backstabOutcome, backstabAttack, backstabProfile);
    const backstabRecovery = criticalVictimRecoveryPlayback(backstabProfile);
    const backstabDeath = criticalVictimDeathPlayback(backstabProfile);
    expect(pairedAtRelease).toEqual({
      phase: "reaction",
      action: "BACKSTABBED",
      startAt: expect.closeTo(2.2, 4),
    });
    expect(backstabRecovery).toEqual({
      action: "BACKSTABBED",
      startAt: 2.9,
      crossFadeDuration: undefined,
      endAt: expect.closeTo(3.1667, 4),
    });
    expect(backstabDeath).toEqual({
      action: "CRITICAL_DEATH",
      startAt: 0,
      crossFadeDuration: 0.55,
      endAt: expect.closeTo(1.9, 4),
    });
    expect(pairedAtOutcome).toEqual({
      phase: "reaction",
      action: "BACKSTABBED",
      startAt: expect.closeTo(2.9, 4),
    });
    // Alignment releases before the attacker's authored follow-through ends,
    // but only the victim changes action; the attacker keeps its full clock.
    expect(backstabRelease).toBeLessThan(backstabDuration);
    expect(backstabOutcome).toBeCloseTo(2.9, 3);
    expect(backstabOutcome).toBeGreaterThan(backstabRelease);
    expect(backstabOutcome).toBeLessThan(backstabDuration);
    expect([riposteRecovery.action, backstabRecovery.action]).not.toContain("DEATH");
    expect([riposteRecovery.action, backstabRecovery.action]).not.toContain("GET_UP");
  });

  it("holds lethal criticals at the shared authored prone out-point", () => {
    for (const profile of [STRAIGHT_SWORD.animations.riposte, STRAIGHT_SWORD.animations.backstab]) {
      const death = criticalVictimDeathPlayback(profile);
      expect(death.action).toBe("CRITICAL_DEATH");
      expect(death.endAt).toBeCloseTo(1.9, 4);
      expect(death.startAt).toBeLessThan(1.5);
      expect(death.endAt).toBeGreaterThan(death.startAt);
      expect(death.action).not.toBe("DEATH");
    }
  });

  it("starts both backstab roles together from the approved paired source", () => {
    const attack = STRAIGHT_SWORD.attacks.backstab;
    const profile = STRAIGHT_SWORD.animations.backstab;
    expect(criticalVictimPlaybackAt(0, attack, profile)).toEqual({
      phase: "reaction",
      action: "BACKSTABBED",
      startAt: 0,
    });
  });

  it("maps both heavy attacks to Hit_Head's dedicated reaction state", () => {
    const { light1, heavy, heavy2 } = STRAIGHT_SWORD.attacks;
    expect(hitReactionForAttack(light1)).toEqual({ action: "hit", animation: "HIT" });
    expect(hitReactionForAttack(heavy)).toEqual({ action: "hitHeavy", animation: "HIT_HEAVY" });
    expect(hitReactionForAttack(heavy2)).toEqual({ action: "hitHeavy", animation: "HIT_HEAVY" });
  });

  it("fits short utility and reaction clips to their unchanged gameplay windows", () => {
    for (const [action, animation] of [
      ["heal", "HEAL"],
      ["hit", "HIT"],
      ["hitHeavy", "HIT_HEAVY"],
      ["recoil", "RECOIL"],
    ] as const) {
      const config = clipConfig(animation);
      expect(config.sourceDuration).not.toBeNull();
      expect((config.sourceDuration ?? 0) / config.playbackRate)
        .toBeCloseTo(ACTION_DURATIONS[action] ?? 0, 3);
    }
  });

  it("recognises a close rear approach and rejects front or distant attacks", () => {
    const facingNorth = { x: 0, z: 1 };
    expect(isBackstabPosition(facingNorth, { x: 0.1, z: -1 }, 1.2)).toBe(true);
    expect(isBackstabPosition(facingNorth, { x: 0, z: 1 }, 1.2)).toBe(false);
    expect(isBackstabPosition(facingNorth, { x: 0, z: -1 }, 2.2)).toBe(false);
  });
});
