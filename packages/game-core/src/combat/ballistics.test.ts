import { describe, expect, it } from "vitest";

import { defineArrow } from "../equipment/arrows";
import { WEAPON_CLASSES } from "../equipment/weaponClasses";
import type { RangedStats } from "../equipment/types";
import { shotCycleSeconds } from "../equipment/types";
import {
  bowEfficiency,
  integrateTrajectory,
  kineticEnergyJoules,
  launchSpeed,
  optimalLaunchAngle,
  resolveArrowImpact,
  storedEnergyJoules,
} from "./ballistics";

/**
 * These are calibration tests, not regression tests.
 *
 * Each one pins the model to a measured real-world number, so a future change
 * to the maths has to stay honest about heavy warbows, arrow drag and range
 * rather than merely reproducing whatever this file happened to compute first.
 * Sources: docs/research/archery-ballistics.md.
 */

const WARBOW = WEAPON_CLASSES.warbow.ranged as RangedStats;
const LONGBOW = WEAPON_CLASSES.longbow.ranged as RangedStats;
const SHORTBOW = WEAPON_CLASSES.shortbow.ranged as RangedStats;

const warShaft = defineArrow("iron-war-arrow", "war", "iron", "a", "b").physics;
const flightShaft = defineArrow("iron-flight-arrow", "flight", "iron", "a", "b").physics;

describe("stored energy", () => {
  it("is the textbook half of peak force times power stroke, on a straight limb", () => {
    // 150 lbf over a 0.60 m power stroke.
    expect(storedEnergyJoules(WARBOW, 1)).toBeCloseTo(0.5 * 667 * 0.6, 2);
  });

  it("falls off with the square of a partial draw", () => {
    const full = storedEnergyJoules(WARBOW, 1);
    expect(storedEnergyJoules(WARBOW, 0.5)).toBeCloseTo(full * 0.25, 5);
    expect(storedEnergyJoules(WARBOW, 0.75)).toBeCloseTo(full * 0.5625, 5);
  });

  it("stores more in a recurve than a straight limb of the same peak weight", () => {
    const recurve = { ...WARBOW, drawCurve: "recurve" as const };
    expect(storedEnergyJoules(recurve, 1)).toBeGreaterThan(storedEnergyJoules(WARBOW, 1) * 1.1);
  });
});

describe("the 150 lb warbow anchor", () => {
  it("throws a 96 g war shaft at about 53 m/s for about 135 J", () => {
    const speed = launchSpeed(WARBOW, warShaft, 1);
    expect(speed).toBeGreaterThan(51);
    expect(speed).toBeLessThan(55);
    const energy = kineticEnergyJoules(warShaft.massKg, speed);
    expect(energy).toBeGreaterThan(125);
    expect(energy).toBeLessThan(145);
  });

  it("carries that shot about 250 m at its best angle", () => {
    const speed = launchSpeed(WARBOW, warShaft, 1);
    const angle = optimalLaunchAngle(speed, warShaft);
    const shot = integrateTrajectory(speed, angle, warShaft);
    expect(shot.rangeMeters).toBeGreaterThan(225);
    expect(shot.rangeMeters).toBeLessThan(275);
    // Well short of the 285 m a vacuum would give: drag is doing real work.
    expect(shot.rangeMeters).toBeLessThan((speed * speed) / 9.81);
  });

  it("puts the best angle below 45 degrees, because of drag", () => {
    const speed = launchSpeed(WARBOW, warShaft, 1);
    expect(optimalLaunchAngle(speed, warShaft)).toBeLessThan(Math.PI / 4);
  });
});

describe("arrow mass", () => {
  it("makes a light arrow faster but lower-energy on the same bow", () => {
    const lightSpeed = launchSpeed(WARBOW, flightShaft, 1);
    const heavySpeed = launchSpeed(WARBOW, warShaft, 1);
    expect(lightSpeed).toBeGreaterThan(heavySpeed);
    expect(kineticEnergyJoules(flightShaft.massKg, lightSpeed))
      .toBeLessThan(kineticEnergyJoules(warShaft.massKg, heavySpeed));
  });

  it("makes a heavier arrow take a larger share of the stored energy", () => {
    expect(bowEfficiency(WARBOW, warShaft)).toBeGreaterThan(bowEfficiency(WARBOW, flightShaft));
    expect(bowEfficiency(WARBOW, warShaft)).toBeCloseTo(0.675, 2);
  });

  it("sends the light arrow further, despite arriving with less", () => {
    const light = launchSpeed(WARBOW, flightShaft, 1);
    const heavy = launchSpeed(WARBOW, warShaft, 1);
    const lightShot = integrateTrajectory(light, optimalLaunchAngle(light, flightShaft), flightShaft);
    const heavyShot = integrateTrajectory(heavy, optimalLaunchAngle(heavy, warShaft), warShaft);
    expect(lightShot.rangeMeters).toBeGreaterThan(heavyShot.rangeMeters);
  });
});

describe("bow archetypes", () => {
  it("launches each class's own arrow band in a plausible range", () => {
    for (const [bow, shaft] of [[SHORTBOW, flightShaft], [LONGBOW, warShaft], [WARBOW, warShaft]] as const) {
      const speed = launchSpeed(bow, shaft, 1);
      expect(speed).toBeGreaterThan(30);
      expect(speed).toBeLessThan(75);
    }
  });

  it("keeps each class's shot cycle inside its historical cadence", () => {
    // Nock, draw and follow through: a hunting bow is a few seconds, a heavy
    // warbow is most of ten.
    expect(shotCycleSeconds(SHORTBOW)).toBeGreaterThanOrEqual(2.5);
    expect(shotCycleSeconds(SHORTBOW)).toBeLessThanOrEqual(4);
    expect(shotCycleSeconds(LONGBOW)).toBeGreaterThanOrEqual(4);
    expect(shotCycleSeconds(LONGBOW)).toBeLessThanOrEqual(6);
    expect(shotCycleSeconds(WARBOW)).toBeGreaterThanOrEqual(6);
    expect(shotCycleSeconds(WARBOW)).toBeLessThanOrEqual(8);
  });

  it("orders the classes by the energy they deliver", () => {
    const energy = (bow: RangedStats) =>
      kineticEnergyJoules(warShaft.massKg, launchSpeed(bow, warShaft, 1));
    expect(energy(SHORTBOW)).toBeLessThan(energy(LONGBOW));
    expect(energy(LONGBOW)).toBeLessThan(energy(WARBOW));
  });
});

describe("impact", () => {
  const speed = launchSpeed(WARBOW, warShaft, 1);

  it("hurts less at distance because the arrow is slower, not because of a falloff rule", () => {
    // A lofted shot from shoulder height, so there is a long shot to compare
    // a short one against.
    const shot = integrateTrajectory(speed, 0.2, warShaft, {
      sampleEvery: 0.02,
      launchHeightMeters: 1.6,
    });
    const near = shot.samples.find((sample) => sample.x > 10);
    const far = shot.samples.find((sample) => sample.x > 90);
    expect(near && far).toBeTruthy();
    const unarmoured = { armourRating: 0 };
    const nearHit = resolveArrowImpact(warShaft, near!.speed, unarmoured);
    const farHit = resolveArrowImpact(warShaft, far!.speed, unarmoured);
    expect(farHit.damage).toBeLessThan(nearHit.damage);
    expect(farHit.damage).toBeGreaterThan(nearHit.damage * 0.55);
  });

  it("is heavy but not instantly lethal on an unarmoured target", () => {
    const hit = resolveArrowImpact(warShaft, speed, { armourRating: 0 });
    expect(hit.damage).toBeGreaterThan(45);
    expect(hit.damage).toBeLessThan(90);
  });

  it("sheds energy on a glancing hit", () => {
    const square = resolveArrowImpact(warShaft, speed, { armourRating: 0 });
    const glancing = resolveArrowImpact(warShaft, speed, {
      armourRating: 0,
      obliquityRad: 1.2,
    });
    expect(glancing.damage).toBeLessThan(square.damage * 0.45);
  });

  it("lets a bodkin through armour that stops a broadhead", () => {
    const broadhead = defineArrow("iron-hunting-arrow", "hunting", "iron", "a", "b").physics;
    const plate = { armourRating: 34 };
    expect(resolveArrowImpact(warShaft, speed, plate).penetrated).toBe(true);
    expect(resolveArrowImpact(broadhead, speed, plate).penetrated).toBe(false);
  });

  it("reverses that ranking with no armour in the way", () => {
    const broadhead = defineArrow("iron-hunting-arrow", "hunting", "iron", "a", "b").physics;
    const bare = { armourRating: 0 };
    const broadheadSpeed = launchSpeed(WARBOW, broadhead, 1);
    expect(resolveArrowImpact(broadhead, broadheadSpeed, bare).damage)
      .toBeGreaterThan(resolveArrowImpact(warShaft, speed, bare).damage);
  });

  it("still hurts through armour it cannot defeat, on the same curve a sword meets", () => {
    const stopped = resolveArrowImpact(warShaft, speed, { armourRating: 400 });
    expect(stopped.penetrated).toBe(false);
    expect(stopped.damage).toBeGreaterThan(0);
    expect(stopped.damage).toBeLessThan(20);
    // Armour reduces an arrow; it never makes one irrelevant.
    expect(resolveArrowImpact(warShaft, speed, { armourRating: 50 }).damage)
      .toBeGreaterThan(resolveArrowImpact(warShaft, speed, { armourRating: 400 }).damage);
  });

  it("makes a harder head defeat armour a soft one does not", () => {
    const soft = { ...warShaft, headHardness: 0.7 };
    const hard = { ...warShaft, headHardness: 1.3 };
    const mail = { armourRating: 45 };
    expect(resolveArrowImpact(soft, speed, mail).penetrated).toBe(false);
    expect(resolveArrowImpact(hard, speed, mail).penetrated).toBe(true);
  });
});

describe("partial draws", () => {
  it("are weaker without any separate rule saying so", () => {
    const full = launchSpeed(WARBOW, warShaft, 1);
    const half = launchSpeed(WARBOW, warShaft, 0.5);
    expect(half).toBeCloseTo(full * 0.5, 5);
    const fullHit = resolveArrowImpact(warShaft, full, { armourRating: 0 });
    const halfHit = resolveArrowImpact(warShaft, half, { armourRating: 0 });
    expect(halfHit.damage).toBeCloseTo(fullHit.damage * 0.25, 4);
  });
});
