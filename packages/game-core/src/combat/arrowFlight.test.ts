import { describe, expect, it } from "vitest";

import { defineArrow } from "../equipment/arrows";
import { AIR_DENSITY, dragDeceleration } from "./ballistics";
import {
  ARROW_SHAFT_LENGTH_METERS,
  aerodynamicDrag,
  arrowMassSplit,
  dragLeverMeters,
  impactObliquity,
} from "./arrowFlight";

const arrow = defineArrow("iron-war-arrow", "war", "iron", "a", "b").physics;

describe("drag in flight", () => {
  it("agrees with the offline trajectory model", () => {
    // The in-game force and the tested integrator must be the same physics, or
    // a shot that lands at 250 m in a test lands somewhere else in the game.
    const velocity = { x: 40, y: 12, z: -20 };
    const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
    const force = aerodynamicDrag(velocity, arrow);
    const magnitude = Math.hypot(force.x, force.y, force.z);
    expect(magnitude / arrow.massKg).toBeCloseTo(dragDeceleration(speed, arrow), 6);
  });

  it("opposes motion exactly", () => {
    const velocity = { x: 30, y: 0, z: 40 };
    const force = aerodynamicDrag(velocity, arrow);
    const speed = Math.hypot(velocity.x, velocity.z);
    const magnitude = Math.hypot(force.x, force.z);
    // Antiparallel: the unit vectors are exact negatives.
    expect(force.x / magnitude).toBeCloseTo(-velocity.x / speed, 9);
    expect(force.z / magnitude).toBeCloseTo(-velocity.z / speed, 9);
  });

  it("grows with the square of speed", () => {
    const slow = aerodynamicDrag({ x: 10, y: 0, z: 0 }, arrow);
    const fast = aerodynamicDrag({ x: 20, y: 0, z: 0 }, arrow);
    expect(Math.abs(fast.x) / Math.abs(slow.x)).toBeCloseTo(4, 6);
  });

  it("is nothing at rest", () => {
    expect(aerodynamicDrag({ x: 0, y: 0, z: 0 }, arrow)).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("thins out with the air", () => {
    const sealevel = aerodynamicDrag({ x: 50, y: 0, z: 0 }, arrow, AIR_DENSITY);
    const thin = aerodynamicDrag({ x: 50, y: 0, z: 0 }, arrow, AIR_DENSITY * 0.5);
    expect(Math.abs(thin.x)).toBeCloseTo(Math.abs(sealevel.x) / 2, 6);
  });
});

describe("weathercocking", () => {
  it("puts the drag lever behind the centre of mass, always", () => {
    expect(dragLeverMeters(arrow)).toBeGreaterThan(0);
  });

  it("gives a more forward-weighted shaft a longer lever", () => {
    const nose = { ...arrow, forwardOfCentre: 0.25 };
    expect(dragLeverMeters(nose)).toBeGreaterThan(dragLeverMeters(arrow));
  });
});

describe("impact angle", () => {
  const centre = { x: 0, y: 0, z: 0 };

  it("is zero for a square hit", () => {
    // Flying along -x into the near face.
    expect(impactObliquity({ x: -10, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, centre)).toBeCloseTo(0, 6);
  });

  it("is a right angle for a shot skimming past the surface", () => {
    expect(impactObliquity({ x: 0, y: 0, z: -10 }, { x: 1, y: 0, z: 0 }, centre))
      .toBeCloseTo(Math.PI / 2, 6);
  });

  it("reads a glancing shoulder hit as oblique", () => {
    const oblique = impactObliquity({ x: -10, y: 0, z: -10 }, { x: 1, y: 0, z: 0 }, centre);
    expect(oblique).toBeCloseTo(Math.PI / 4, 6);
  });

  it("reads a hit whose reported position is already past the surface as square", () => {
    // Rapier reports a sensor overlap a step late, so a fast shaft's origin is
    // beyond the capsule by the time this is asked. Measuring approach angle
    // rather than a surface normal is what stops that reading as a 180 degree
    // glance and silently absorbing every arrow in the game.
    const overshot = impactObliquity({ x: 0, y: 0, z: -44 }, { x: 0, y: 0, z: -0.3 }, centre);
    expect(overshot).toBeCloseTo(0, 6);
  });

  it("is zero when there is nothing to measure", () => {
    expect(impactObliquity({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, centre)).toBe(0);
    expect(impactObliquity({ x: -10, y: 0, z: 0 }, centre, centre)).toBe(0);
  });
});

describe("how the mass is split between shaft and head", () => {
  it("keeps the total mass exactly", () => {
    const split = arrowMassSplit(arrow);
    expect(split.shaftMassKg + split.headMassKg).toBeCloseTo(arrow.massKg, 9);
  });

  it("puts the centre of mass where the arrow says it is", () => {
    const split = arrowMassSplit(arrow);
    const centreOfMass = (split.headMassKg * split.headOffsetMeters) / arrow.massKg;
    expect(centreOfMass).toBeCloseTo(arrow.forwardOfCentre * ARROW_SHAFT_LENGTH_METERS, 6);
  });

  it("spreads the shaft over the arrow's real length, not a stub", () => {
    // The whole point: a body whose mass sits in a 12 cm box has an order of
    // magnitude too little inertia and tumbles under its own drag torque.
    expect(arrowMassSplit(arrow).shaftHalfLengthMeters)
      .toBeCloseTo(ARROW_SHAFT_LENGTH_METERS / 2, 9);
  });

  it("gives a more forward-weighted shaft a heavier head", () => {
    const nose = { ...arrow, forwardOfCentre: 0.24 };
    expect(arrowMassSplit(nose).headMassKg).toBeGreaterThan(arrowMassSplit(arrow).headMassKg);
  });

  it("never puts every gram in the head", () => {
    const absurd = { ...arrow, forwardOfCentre: 0.9 };
    expect(arrowMassSplit(absurd).shaftMassKg).toBeGreaterThan(0);
  });
});
