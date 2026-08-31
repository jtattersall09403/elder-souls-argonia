import { describe, expect, it } from "vitest";

import {
  MIN_HIT_RADIUS_METERS,
  PARRY_VOLUME_MARGIN_METERS,
  boxFromSizeMeters,
  hitCapsuleFor,
  parryCapsuleFor,
} from "./hitVolume";
import { ARSENAL_WEAPONS } from "./../equipment/arsenal";

/**
 * The point of these is the property the old hard-coded capsule broke: a
 * weapon's combat volume has to be *that weapon's*. A single test that one
 * sword measures correctly would not have caught a warhammer swinging a sword's
 * hitbox, so the assertions are over the whole arsenal.
 */

describe("hitCapsuleFor", () => {
  it("spans the object it was measured from", () => {
    const capsule = hitCapsuleFor({ width: 0.12, height: 0.03, length: 1, minZ: 0 });
    const near = capsule.centerOffset - capsule.halfLength - capsule.radius;
    const far = capsule.centerOffset + capsule.halfLength + capsule.radius;
    expect(near).toBeCloseTo(0, 6);
    expect(far).toBeCloseTo(1, 6);
  });

  it("centres on the object even when its origin is not its centre", () => {
    // A shield: origin at the boss, mesh straddling it.
    const capsule = hitCapsuleFor({ width: 0.55, height: 0.16, length: 0.62, minZ: -0.373 });
    expect(capsule.centerOffset).toBeCloseTo(-0.063, 3);
  });

  it("never goes thinner than the physics step can sample", () => {
    // A blade really is a few millimetres across; a sensor that thin misses.
    const capsule = hitCapsuleFor({ width: 0.004, height: 0.004, length: 0.9, minZ: 0 });
    expect(capsule.radius).toBe(MIN_HIT_RADIUS_METERS);
  });

  it("degrades to a sphere rather than a negative capsule on a stubby object", () => {
    const capsule = hitCapsuleFor({ width: 0.5, height: 0.5, length: 0.1, minZ: -0.05 });
    expect(capsule.halfLength).toBe(0);
    expect(capsule.radius).toBeGreaterThan(0);
  });
});

describe("parryCapsuleFor", () => {
  it("is the same volume, grown", () => {
    const box = { width: 0.12, height: 0.03, length: 1, minZ: 0 } as const;
    const swing = hitCapsuleFor(box);
    const parry = parryCapsuleFor(box);
    expect(parry.centerOffset).toBeCloseTo(swing.centerOffset, 6);
    expect(parry.radius).toBeCloseTo(swing.radius + PARRY_VOLUME_MARGIN_METERS, 6);
    expect(parry.radius).toBeGreaterThan(swing.radius);
  });
});

describe("the arsenal's volumes", () => {
  const weapons = Object.values(ARSENAL_WEAPONS);

  it("gives every weapon a volume built from its own measured mesh", () => {
    for (const weapon of weapons) {
      const capsule = hitCapsuleFor(boxFromSizeMeters(weapon.visual.sizeMeters));
      const reach = capsule.centerOffset + capsule.halfLength + capsule.radius;
      expect(reach, weapon.id).toBeGreaterThan(0.2);
      expect(reach, weapon.id).toBeLessThan(3);
    }
  });

  it("makes a two-hander's volume genuinely longer than a dagger's", () => {
    // The defect this whole module exists for: one capsule for all of them.
    const dagger = weapons.find((w) => w.id === "iron-dagger");
    const greatsword = weapons.find((w) => w.classId === "greatsword");
    expect(dagger).toBeDefined();
    expect(greatsword).toBeDefined();
    const daggerSpan = hitCapsuleFor(boxFromSizeMeters(dagger!.visual.sizeMeters));
    const greatswordSpan = hitCapsuleFor(boxFromSizeMeters(greatsword!.visual.sizeMeters));
    expect(greatswordSpan.halfLength).toBeGreaterThan(daggerSpan.halfLength * 1.5);
  });
});
