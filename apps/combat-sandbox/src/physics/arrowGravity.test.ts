import RAPIER from "@dimforge/rapier3d-compat";
import { describe, expect, it } from "vitest";

import { arrowMassSplit } from "@elder-souls/game-core/combat/arrowFlight";
import { defineArrow } from "@elder-souls/game-core/equipment/arrows";

/**
 * An arrow body exactly as `Arrows.tsx` builds it — two mass-carrying cuboid
 * colliders, rotation locked, CCD on — falls at g.
 *
 * Owner report (round 8): arrows "gently floating rather than behaving as
 * you would expect with real gravity". This pins the solver side of that:
 * mass split, locked rotation and collider masses must not touch the fall.
 * Anything left is drag (`aerodynamicDrag`), which is a separate, calibrated
 * term.
 */
describe("an arrow body under the solver's gravity", () => {
  it("falls at 9.81 m/s² with the colliders Arrows.tsx gives it", async () => {
    await RAPIER.init();
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.timestep = 1 / 60;
    const arrow = defineArrow("iron-war-arrow", "war", "iron", "a", "b").physics;
    const split = arrowMassSplit(arrow);
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 10, 0).setCcdEnabled(true).lockRotations().setCanSleep(false),
    );
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.005, 0.005, split.shaftHalfLengthMeters).setMass(split.shaftMassKg), body);
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.009, 0.009, 0.025).setTranslation(0, 0, split.headOffsetMeters).setMass(split.headMassKg), body);
    body.setLinvel({ x: 0, y: 0, z: 50 }, true);
    expect(body.mass()).toBeCloseTo(arrow.massKg, 6);
    for (let step = 0; step < 60; step += 1) world.step();
    const t = 1;
    const expectedDrop = 0.5 * 9.81 * t * t;
    const drop = 10 - body.translation().y;
    // Semi-implicit Euler over 60 steps lands within a step's worth of g.
    expect(drop).toBeGreaterThan(expectedDrop * 0.97);
    expect(drop).toBeLessThan(expectedDrop * 1.03);
    expect(body.linvel().y).toBeCloseTo(-9.81, 0);
  });
});
