import { describe, expect, it } from "vitest";

import { defineArrow } from "../equipment/arrows";
import { AIR_DENSITY, dragDeceleration } from "./ballistics";
import {
  ARROW_SHAFT_LENGTH_METERS,
  aerodynamicDrag,
  aerodynamicPitchDamping,
  aerodynamicRestoringTorque,
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

describe("rotational damping", () => {
  it("opposes the tumble", () => {
    const torque = aerodynamicPitchDamping(
      { x: 0, y: 3, z: 0 },
      { x: 0, y: 0, z: 50 },
      { x: 0, y: 0, z: 1 },
      arrow,
    );
    expect(torque.y).toBeLessThan(0);
    expect(torque.x).toBeCloseTo(0, 12);
    expect(torque.z).toBeCloseTo(0, 12);
  });

  it("leaves spin about the shaft alone", () => {
    // Helical fletching deliberately induces roll. Damping it would be
    // modelling the opposite of what the vanes are for.
    const torque = aerodynamicPitchDamping(
      { x: 0, y: 0, z: 12 },
      { x: 0, y: 0, z: 50 },
      { x: 0, y: 0, z: 1 },
      arrow,
    );
    expect(Math.hypot(torque.x, torque.y, torque.z)).toBeCloseTo(0, 12);
  });

  it("fades with airspeed, so a stalled shaft is not held rigid", () => {
    const fast = aerodynamicPitchDamping({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 60 }, { x: 0, y: 0, z: 1 }, arrow);
    const slow = aerodynamicPitchDamping({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 6 }, { x: 0, y: 0, z: 1 }, arrow);
    expect(Math.abs(fast.x) / Math.abs(slow.x)).toBeCloseTo(10, 6);
  });

  it("settles a disturbed shaft instead of ringing", () => {
    // The reported defect, as a number. Restoring torque alone is an undamped
    // spring: a shaft knocked off its path oscillates about it forever, which
    // on screen is a tumble. Integrate the real planar yaw both ways and
    // require the damped one to have visibly given up its wobble.
    const speed = 45;
    const inertia = (arrow.massKg * ARROW_SHAFT_LENGTH_METERS ** 2) / 12;

    const swing = (damped: boolean) => {
      let angle = 0.35;
      let rate = 0;
      let peak = 0;
      const step = 1 / 600;
      for (let i = 0; i < 900; i += 1) {
        const forward = { x: 0, y: Math.sin(angle), z: Math.cos(angle) };
        const velocity = { x: 0, y: 0, z: speed };
        let torque = aerodynamicRestoringTorque(velocity, forward, arrow).x;
        if (damped) {
          torque += aerodynamicPitchDamping({ x: rate, y: 0, z: 0 }, velocity, forward, arrow).x;
        }
        // A positive turn about +X reduces the nose-up angle.
        rate += (torque / inertia) * step;
        angle -= rate * step;
        if (i > 600) peak = Math.max(peak, Math.abs(angle));
      }
      return peak;
    };

    const undamped = swing(false);
    const damped = swing(true);
    expect(undamped).toBeGreaterThan(0.1);
    expect(damped).toBeLessThan(undamped * 0.5);
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

describe("rotational damping", () => {
  it("opposes the tumble", () => {
    const torque = aerodynamicPitchDamping(
      { x: 0, y: 3, z: 0 },
      { x: 0, y: 0, z: 50 },
      { x: 0, y: 0, z: 1 },
      arrow,
    );
    expect(torque.y).toBeLessThan(0);
    expect(torque.x).toBeCloseTo(0, 12);
    expect(torque.z).toBeCloseTo(0, 12);
  });

  it("leaves spin about the shaft alone", () => {
    // Helical fletching deliberately induces roll. Damping it would be
    // modelling the opposite of what the vanes are for.
    const torque = aerodynamicPitchDamping(
      { x: 0, y: 0, z: 12 },
      { x: 0, y: 0, z: 50 },
      { x: 0, y: 0, z: 1 },
      arrow,
    );
    expect(Math.hypot(torque.x, torque.y, torque.z)).toBeCloseTo(0, 12);
  });

  it("fades with airspeed, so a stalled shaft is not held rigid", () => {
    const fast = aerodynamicPitchDamping({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 60 }, { x: 0, y: 0, z: 1 }, arrow);
    const slow = aerodynamicPitchDamping({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 6 }, { x: 0, y: 0, z: 1 }, arrow);
    expect(Math.abs(fast.x) / Math.abs(slow.x)).toBeCloseTo(10, 6);
  });

  it("settles a disturbed shaft instead of ringing", () => {
    // The reported defect, as a number. Restoring torque alone is an undamped
    // spring: a shaft knocked off its path oscillates about it forever, which
    // on screen is a tumble. Integrate a planar yaw oscillation both ways and
    // require the damped one to have visibly given up its wobble.
    const speed = 45;
    const lever = dragLeverMeters(arrow, ARROW_SHAFT_LENGTH_METERS);
    // Inertia of a thin rod of the arrow's mass about its centre.
    const inertia = (arrow.massKg * ARROW_SHAFT_LENGTH_METERS ** 2) / 12;
    const dragMagnitude = Math.hypot(...Object.values(
      aerodynamicDrag({ x: 0, y: 0, z: speed }, arrow),
    ) as [number, number, number]);

    const swing = (damped: boolean) => {
      let angle = 0.35;
      let rate = 0;
      let peak = 0;
      const step = 1 / 600;
      for (let i = 0; i < 900; i += 1) {
        // Restoring: the air pushes at the centre of pressure, behind the mass.
        let torque = -dragMagnitude * lever * Math.sin(angle);
        if (damped) {
          torque += aerodynamicPitchDamping(
            { x: 0, y: rate, z: 0 },
            { x: 0, y: 0, z: speed },
            { x: 0, y: 0, z: 1 },
            arrow,
          ).y;
        }
        rate += (torque / inertia) * step;
        angle += rate * step;
        if (i > 600) peak = Math.max(peak, Math.abs(angle));
      }
      return peak;
    };

    const undamped = swing(false);
    const damped = swing(true);
    expect(undamped).toBeGreaterThan(0.3);
    expect(damped).toBeLessThan(undamped * 0.5);
  });
});

describe("the restoring torque", () => {
  it("turns the shaft toward its flight path", () => {
    // Nose pitched up, travelling level: the torque must pitch it back down.
    const forward = { x: 0, y: Math.sin(0.3), z: Math.cos(0.3) };
    const torque = aerodynamicRestoringTorque({ x: 0, y: 0, z: 50 }, forward, arrow);
    // A positive turn about +X carries +Y round to +Z: nose down onto the path.
    expect(torque.x).toBeGreaterThan(0);
    expect(Math.abs(torque.y)).toBeLessThan(1e-12);
    expect(Math.abs(torque.z)).toBeLessThan(1e-12);
  });

  it("is nothing when the shaft is already on its path", () => {
    const torque = aerodynamicRestoringTorque({ x: 0, y: 0, z: 50 }, { x: 0, y: 0, z: 1 }, arrow);
    expect(Math.hypot(torque.x, torque.y, torque.z)).toBeCloseTo(0, 12);
  });

  it("is nothing at rest, so an arrow at the top of its arc is free to flip", () => {
    const torque = aerodynamicRestoringTorque({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, arrow);
    expect(torque).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("is stiff enough to follow a real trajectory", () => {
    // The defect, as a number. A shot arcs over at roughly g/v radians per
    // second; if the shaft's own natural period is slower than the arc it is
    // trying to follow, it lags, drifts off axis and reads as a tumble. The old
    // frontal-area model gave a period near two seconds. A real arrow's is a
    // fraction of a second, and that is what has to hold here.
    const speed = 45;
    const lever = dragLeverMeters(arrow, ARROW_SHAFT_LENGTH_METERS);
    const inertia = (arrow.massKg * ARROW_SHAFT_LENGTH_METERS ** 2) / 12;
    // Small-angle stiffness: torque per radian of yaw.
    const yaw = 1e-4;
    const forward = { x: 0, y: Math.sin(yaw), z: Math.cos(yaw) };
    const torque = aerodynamicRestoringTorque({ x: 0, y: 0, z: speed }, forward, arrow);
    const stiffness = Math.hypot(torque.x, torque.y, torque.z) / yaw;
    const period = 2 * Math.PI / Math.sqrt(stiffness / inertia);
    expect(period).toBeLessThan(0.4);
    expect(lever).toBeGreaterThan(0);
  });
});
