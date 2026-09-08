import RAPIER from "@dimforge/rapier3d-compat";
import { describe, expect, it } from "vitest";

import { advanceArrowVelocity, DEFAULT_ARROW_GRAVITY_SCALE } from "./arrowFlight";
import { integrateTrajectory } from "./ballistics";
import { defineArrow } from "../equipment/arrows";

/** The production centred sensor body: collisions do not alter free flight. */
describe("an arrow body under explicit ballistics acceleration", () => {
  it.each([1, DEFAULT_ARROW_GRAVITY_SCALE])("falls at the selected %sx gravity with the production sensor collider", async gravityScale => {
    await RAPIER.init();
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.timestep = 1 / 60;
    const arrow = { ...defineArrow("iron-war-arrow", "war", "iron", "a", "b").physics, dragCoefficient: 0 };

    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 20, 0).setGravityScale(0).setCcdEnabled(true).lockRotations().setCanSleep(false),
    );
    world.createCollider(RAPIER.ColliderDesc.ball(0.005).setMass(arrow.massKg).setSensor(true), body);
    body.setLinvel({ x: 0, y: 0, z: 50 }, true);
    expect(body.mass()).toBeCloseTo(arrow.massKg, 6);
    for (let step = 0; step < 60; step += 1) {
      body.setLinvel(advanceArrowVelocity(body.linvel(), arrow, gravityScale, world.timestep), true);
      world.step();
    }
    const t = 1;
    const expectedDrop = 0.5 * 9.81 * gravityScale * t * t;
    const drop = 20 - body.translation().y;
    // Semi-implicit Euler over 60 steps lands within a step's worth of g.
    expect(drop).toBeGreaterThan(expectedDrop * 0.97);
    expect(drop).toBeLessThan(expectedDrop * 1.03);
    expect(body.linvel().y).toBeCloseTo(-9.81 * gravityScale, 0);
    world.free();
  });

  // At reference gravity, the shared drag model matches the calibrated arc.
  it("tracks the offline trajectory when driven the way the scene drives it", async () => {
    await RAPIER.init();
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.timestep = 1 / 60;
    const arrow = defineArrow("iron-war-arrow", "war", "iron", "a", "b").physics;

    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 0, 0).setGravityScale(0).setCcdEnabled(true).lockRotations().setCanSleep(false),
    );
    world.createCollider(RAPIER.ColliderDesc.ball(0.005).setMass(arrow.massKg).setSensor(true), body);

    const speed = 45;
    const angle = Math.PI / 6;
    body.setLinvel({ x: 0, y: speed * Math.sin(angle), z: speed * Math.cos(angle) }, true);
    const seconds = 2;
    for (let step = 0; step < seconds * 60; step += 1) {
      body.setLinvel(advanceArrowVelocity(body.linvel(), arrow, 1, world.timestep), true);
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
    world.free();
  });

});


it("a low-power arrow cannot receive an impulse from an actor navigation capsule", async () => {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = 1 / 60;
  const actor = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 1, 0));
  world.createCollider(RAPIER.ColliderDesc.capsule(.6, .4), actor);
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 1, 0).lockRotations());
  world.createCollider(RAPIER.ColliderDesc.ball(.005).setMass(.097).setSensor(true), body);
  body.setLinvel({ x: 0, y: 5, z: .5 }, true);
  for (let i = 0; i < 60; i++) world.step();
  expect(body.linvel().y).toBeCloseTo(5 - 9.81, 2);
  expect(body.linvel().z).toBeCloseTo(.5, 4);
  // Up ~1.27 m, back near launch height after a second, already falling fast.
  expect(body.translation().y).toBeCloseTo(1.095, 1);
  world.free();
});
