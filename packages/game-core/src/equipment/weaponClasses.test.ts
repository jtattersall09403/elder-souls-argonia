import { describe, expect, it } from "vitest";
import { clipConfig } from "../anim/animationManifest";
import { WEAPON_CLASSES, classPoiseDamage, resolveMoveset } from "./weaponClasses";
import { MOVESETS } from "./movesets";
import type { AttackId } from "./types";

/**
 * Every weapon class answers the same questions.
 *
 * A class added without a poise value, an effects list or a registered moveset
 * is not a compile error — the poise table is typed on `WeaponClass` so that
 * one is caught, but the moveset id and the effects list are not — and the
 * symptom is a weapon that swings with nothing behind it. This is the cheap
 * gate that makes adding a class complete or red.
 */
describe("the weapon class table", () => {
  it("gives every class a poise value, an effects list and a registered moveset", () => {
    for (const profile of Object.values(WEAPON_CLASSES)) {
      expect(classPoiseDamage(profile), `${profile.id} poise`).toBeGreaterThan(0);
      expect(Array.isArray(profile.effects), `${profile.id} effects`).toBe(true);
      expect(MOVESETS[profile.moveset], `${profile.id} moveset`).toBeDefined();
      expect(MOVESETS[profile.moveset].id).toBe(profile.moveset);
    }
  });

  it("resolves a built moveset for every class", () => {
    for (const profile of Object.values(WEAPON_CLASSES)) {
      expect(resolveMoveset(profile).attacks.light1.animation, profile.id).toBeTruthy();
    }
  });
});

/**
 * The measured contact windows round-trip through the stored seconds.
 *
 * The polearm and one-handed-variant sets are authored exactly as the vanilla
 * ones are: a measured clip fraction per swing, stored as wind-up/active/
 * recovery seconds of that clip. These are the measurements restated
 * independently (`scripts/measure-contact-windows.mjs`), so a mis-keyed contact
 * table or a clip whose duration changed under the timing shows up here rather
 * than as a hitbox that opens in the wind-up.
 */
const MEASURED: Record<string, Record<AttackId | string, [number, number]>> = {
  pike: {
    light1: [0.310, 0.387], light2: [0.310, 0.387], light3: [0.628, 0.722],
    heavy: [0.337, 0.444], heavy2: [0.316, 0.444],
  },
  halberd: {
    light1: [0.383, 0.480], light2: [0.310, 0.387], light3: [0.441, 0.553],
    heavy: [0.531, 0.628], heavy2: [0.480, 0.565],
  },
  quarterstaff: {
    light1: [0.343, 0.419], light2: [0.339, 0.403], light3: [0.615, 0.722],
    heavy: [0.397, 0.510], heavy2: [0.490, 0.687],
  },
  rapier: {
    light1: [0.256, 0.425], light2: [0.331, 0.400], light3: [0.240, 0.353],
    heavy: [0.451, 0.569], heavy2: [0.464, 0.571],
  },
  claw: {
    light1: [0.394, 0.500], light2: [0.406, 0.500],
    // Unmeasured lunge; carries the one-handed LIGHT_3 window (see blades.ts).
    light3: [0.476, 0.774],
    heavy: [0.458, 0.528], heavy2: [0.419, 0.475],
  },
};

/** The tolerance both new sets add either side of the measured contact. */
const MARGIN = 0.04;

describe("the sourced movesets' contact windows", () => {
  for (const [movesetId, windows] of Object.entries(MEASURED)) {
    it(`puts the ${movesetId} hitbox where the clip was measured`, () => {
      const moveset = MOVESETS[movesetId as keyof typeof MOVESETS];
      for (const [id, [start, end]] of Object.entries(windows)) {
        const spec = moveset.attacks[id as AttackId];
        const clip = clipConfig(spec.animation).sourceDuration ?? 0;
        expect(clip, `${movesetId} ${id} clip`).toBeGreaterThan(0);
        expect(spec.windup / clip, `${movesetId} ${id} opens`)
          .toBeCloseTo(Math.max(0, start - MARGIN), 6);
        expect((spec.windup + spec.active) / clip, `${movesetId} ${id} closes`)
          .toBeCloseTo(end + MARGIN, 6);
      }
    });
  }
});
