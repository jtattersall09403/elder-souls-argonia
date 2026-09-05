import RAPIER from "@dimforge/rapier3d-compat";
import { describe, expect, it } from "vitest";

import { aerodynamicDrag, arrowMassSplit } from "./arrowFlight";
import { integrateTrajectory } from "./ballistics";
import { defineArrow } from "../equipment/arrows";

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

  /**
   * The flight the owner actually sees, against the arc the research solves.
   *
   * A headless probe of the shipped build
   * (`apps/combat-sandbox/scripts/probe-arrow-flight.mjs`) measured a live
   * arrow at 9.83 m/s² of fall and a drag deceleration within 5% of this
   * integrator, which is what answered the round-8 report that arrows "float
   * down like a balloon". This is that probe's finding in a unit test: build
   * the body the way `Arrows.tsx` does, drive it the way `Arrows.tsx` does
   * (reset forces, add `aerodynamicDrag`, once per step), and it must track
   * the offline arc. Anything that quietly divorces the two — a collider mass
   * that stops being applied, damping arriving from somewhere, drag added on
   * top of itself — fails here rather than in a playtest.
   */
  it("tracks the offline trajectory when driven the way the scene drives it", async () => {
    await RAPIER.init();
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.timestep = 1 / 60;
    const arrow = defineArrow("iron-war-arrow", "war", "iron", "a", "b").physics;
    const split = arrowMassSplit(arrow);
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 0, 0).setCcdEnabled(true).lockRotations().setCanSleep(false),
    );
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.005, 0.005, split.shaftHalfLengthMeters).setMass(split.shaftMassKg), body);
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.009, 0.009, 0.025).setTranslation(0, 0, split.headOffsetMeters).setMass(split.headMassKg), body);

    const speed = 45;
    const angle = Math.PI / 6;
    body.setLinvel({ x: 0, y: speed * Math.sin(angle), z: speed * Math.cos(angle) }, true);
    const seconds = 2;
    for (let step = 0; step < seconds * 60; step += 1) {
      const velocity = body.linvel();
      const drag = aerodynamicDrag(velocity, arrow);
      body.resetForces(true);
      body.addForce(drag, true);
      world.step();
    }
    const solved = integrateTrajectory(speed, angle, arrow, {
      stepSeconds: 1 / 60, sampleEvery: 1 / 60, maxSeconds: seconds + 0.1,
    });
    const reference = solved.samples.reduce((best, sample) =>
      Math.abs(sample.time - seconds) < Math.abs(best.time - seconds) ? sample : best);
    expect(body.translation().y).toBeCloseTo(reference.y, 0);
    expect(body.translation().z).toBeCloseTo(reference.x, 0);
    // The speed left is what damage at impact is resolved from, so it is as
    // load-bearing as the shape of the arc.
    const velocity = body.linvel();
    expect(Math.hypot(velocity.x, velocity.y, velocity.z)).toBeCloseTo(reference.speed, 0);
  });
});
