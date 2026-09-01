import { describe, expect, it } from "vitest";
import { clipConfig } from "../anim/animationManifest";
import { attackDuration } from "../combat/weapon";
import { MOVESETS } from "./movesets";
import { WEAPON_CLASSES, resolveMoveset, resolveWeaponAnimations, scaleAttack, scaleMoveset } from "./weaponClasses";
import type { AttackId, AttackSpec } from "./types";

/**
 * The contract between an attack's timing and the clip that performs it.
 *
 * A contact window is authored as a *fraction of a clip* — "the blade is
 * cutting from 0.41 to 0.48 of this animation" — and then stored as seconds of
 * wind-up, active and recovery. The weapon class scales those seconds. So the
 * clip has to be played at the same scale, or the hitbox and the visible blade
 * come apart by the whole of the class's `speedScale`.
 *
 * That is not hypothetical: it shipped. A dagger (`speedScale` 0.72) opened its
 * contact window 28% early, which put it inside the wind-up, and a mace (1.12)
 * opened it 12% late, which put its second heavy's window in the recovery.
 * Both were reported from playtesting in exactly those words.
 *
 * These tests hold the fix in place from both ends: the factor is carried, and
 * dividing the scaled timing back by it returns the authored clip timing.
 */

const MELEE_ATTACKS: AttackId[] = ["light1", "light2", "light3", "heavy", "heavy2"];

/** Where in the *clip* an attack's hitbox opens and closes, as a fraction. */
function clipFractions(spec: AttackSpec) {
  const scale = spec.timeScale ?? 1;
  const total = attackDuration(spec as never) / scale;
  return { open: spec.windup / scale / total, close: (spec.windup + spec.active) / scale / total };
}

describe("attack timing against the clip that performs it", () => {
  it("carries the class speed factor onto every scaled attack", () => {
    for (const profile of Object.values(WEAPON_CLASSES)) {
      const moveset = resolveMoveset(profile);
      const reference = WEAPON_CLASSES[moveset.speedReference].speedScale;
      for (const id of MELEE_ATTACKS) {
        const scaled = scaleAttack(moveset.attacks[id], profile, moveset);
        expect(scaled.timeScale, `${profile.id} ${id}`)
          .toBeCloseTo(profile.speedScale / reference, 6);
      }
    }
  });

  it("puts every weapon's hitbox at the same point of the clip as the unscaled one", () => {
    // The invariant that makes the whole arsenal correct from one measurement
    // per clip. A dagger and a warhammer swinging the same animation must cut
    // over the same *part* of it; only how long that takes differs.
    for (const profile of Object.values(WEAPON_CLASSES)) {
      const moveset = resolveMoveset(profile);
      for (const id of MELEE_ATTACKS) {
        const authored = moveset.attacks[id];
        const scaled = scaleAttack(authored, profile, moveset);
        const a = clipFractions(authored);
        const b = clipFractions(scaled);
        expect(b.open, `${profile.id} ${id} opens`).toBeCloseTo(a.open, 6);
        expect(b.close, `${profile.id} ${id} closes`).toBeCloseTo(a.close, 6);
      }
    }
  });

  it("deals every critical's damage inside its own contact window", () => {
    // A critical has two clocks that have to agree: the profile's
    // `damageProgress`, a fraction of the action, and the attack spec's
    // wind-up/active split, which is what drives the hitbox. They came apart on
    // the two-handed backstab, which swapped in the execution clip but kept the
    // one-handed *paired* clip's 3.17 s timing for a 1.13 s performance — so
    // the swing was over before the contact window opened.
    for (const profile of Object.values(WEAPON_CLASSES)) {
      const moveset = resolveMoveset(profile);
      const animations = resolveWeaponAnimations(profile, moveset);
      const attacks = scaleMoveset(moveset.attacks, profile, moveset);
      for (const [id, pair] of [["riposte", animations.riposte], ["backstab", animations.backstab]] as const) {
        const spec = attacks[id];
        const total = spec.windup + spec.active + spec.recovery;
        const label = `${profile.id} ${id}`;
        expect(pair.damageProgress, label).toBeGreaterThanOrEqual(spec.windup / total - 1e-6);
        expect(pair.damageProgress, label).toBeLessThanOrEqual((spec.windup + spec.active) / total + 1e-6);
        expect(pair.releaseProgress, label).toBeGreaterThan(pair.damageProgress);
      }
    }
  });

  it("plays a swinging class's backstab with its own light attack", () => {
    // An axe has no point, so it cannot perform a thrust execution from behind.
    for (const profile of Object.values(WEAPON_CLASSES)) {
      if (profile.criticalStyle !== "swing") continue;
      const moveset = resolveMoveset(profile);
      const animations = resolveWeaponAnimations(profile, moveset);
      expect(animations.backstab.attackerAction, profile.id)
        .toBe(moveset.attacks.light1.animation);
      // Behind, and the victim reacts to a blow in the back rather than to
      // being turned around and run through.
      expect(animations.backstab.relativeFacing, profile.id).toBe(0);
      expect(animations.backstab.victimAction, profile.id).toBe("BACKSTABBED_FORWARD");
    }
  });

  it("keeps the wind-up inside the clip it is a fraction of", () => {
    // A guard against the other way this can be got wrong: a hand-written
    // window that runs past the end of its own animation. Every moveset's
    // authored action is its clip, so the contact must close inside it.
    for (const moveset of Object.values(MOVESETS)) {
      if (moveset.id === "bow") continue;
      for (const id of MELEE_ATTACKS) {
        const spec = moveset.attacks[id];
        const clip = clipConfig(spec.animation).sourceDuration;
        if (clip == null) continue;
        expect(spec.windup + spec.active, `${moveset.id} ${id}`).toBeLessThanOrEqual(clip + 1e-6);
      }
    }
  });
});
