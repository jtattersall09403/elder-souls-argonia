import { describe, expect, it } from "vitest";

import { defineArrow } from "../equipment/arrows";
import {
  ARROW_SHAFT_LENGTH_METERS,
  arrowMassSplit,
  flightAttitude,
  impactObliquity,
} from "./arrowFlight";

const arrow = defineArrow("iron-war-arrow", "war", "iron", "a", "b").physics;

describe("flight attitude", () => {
  it("points the shaft along its velocity", () => {
    const attitude = flightAttitude({ x: 0, y: -3, z: 4 });
    expect(attitude).not.toBeNull();
    expect(attitude!.x).toBeCloseTo(0, 9);
    expect(attitude!.y).toBeCloseTo(-0.6, 9);
    expect(attitude!.z).toBeCloseTo(0.8, 9);
  });

  it("keeps the last attitude rather than inventing one at rest", () => {
    expect(flightAttitude({ x: 0, y: 0, z: 0 })).toBeNull();
    expect(flightAttitude({ x: 0.01, y: 0, z: 0 })).toBeNull();
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
