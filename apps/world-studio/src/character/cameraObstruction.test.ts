import { beforeAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import {
  CAMERA_BLOCKING_GROUPS, CAMERA_PIVOT_QUERY_GROUPS, CAMERA_QUERY_GROUPS, TERRAIN_HEIGHTFIELD_GROUPS,
} from "@elder-souls/game-core/camera/cameraCollision";
import { FOLLOW_CAMERA, FollowCamera } from "@elder-souls/game-core/camera/followCamera";
import { playerOpacityForArm } from "@elder-souls/game-core/camera/cameraCollision";
import { rapierCameraObstruction } from "./cameraObstruction";

// Walk 2 D3: a pivot ball that STARTS inside a lintel or eave must stop the
// arm at once; with the starting-overlap check off the sweep ignored it and
// the arm passed through the shell.
describe("studio camera obstruction (Rapier ball cast)", () => {
  let world: RAPIER.World;
  let cast: ReturnType<typeof rapierCameraObstruction>;
  beforeAll(async () => {
    await RAPIER.init();
    world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 2, 0));
    // A 0.2 m thick wall (z −0.1..0.1), 4 m high, 6 m wide: a mud-hut side.
    world.createCollider(RAPIER.ColliderDesc.cuboid(3, 2, 0.1).setCollisionGroups(CAMERA_BLOCKING_GROUPS), body);
    world.step();
    cast = rapierCameraObstruction({ world, rapier: RAPIER } as unknown as Parameters<typeof rapierCameraObstruction>[0]);
  });

  it("a ball that starts inside the wall, past its middle, hits at 0 instead of sweeping out behind it", () => {
    // The player hugs the wall's far face: the pivot ball's centre is inside it.
    const pivot = new THREE.Vector3(0, 2.05, 0.05);
    const orbit = new THREE.Vector3(0, 4, 5.45);
    expect(cast(pivot, orbit, FOLLOW_CAMERA.collisionRadius, FOLLOW_CAMERA.pivotRadius)).toBe(0);
  });

  it("a clear arm returns null", () => {
    expect(cast(new THREE.Vector3(0, 1, 10), new THREE.Vector3(0, 1, 15), FOLLOW_CAMERA.collisionRadius,
      FOLLOW_CAMERA.pivotRadius)).toBeNull();
  });

  // Planner ruling on RB rec 1: the start overlap is the capsule's own ball
  // (0.3 m) at the pivot; the 0.42 m camera ball sweeps ignoring where it starts.
  it("a player whose capsule touches the wall keeps a long arm pointing away from it, and is not faded out", () => {
    // Wall face at z = 0.1; the capsule (radius 0.3) touches it from +z.
    // Body centre 1.2 m up: the pivot (2.08 m) is mid-wall, its 0.42 m ball 0.115 m inside it.
    const body = new THREE.Vector3(0, 1.2, 0.1 + FOLLOW_CAMERA.pivotRadius + 0.005);
    const camera = new FollowCamera();
    camera.setObstruction(cast);
    camera.reset(body, Math.PI); // yaw 2π: the camera sits on +z, the arm points away from the wall
    for (let i = 0; i < 120; i++) camera.update({ x: 0, y: 0 }, body, 1 / 60);
    expect(camera.arm).toBeGreaterThan(FOLLOW_CAMERA.minArm + 1);
    expect(playerOpacityForArm(camera.arm)).toBeGreaterThan(0);
  });

  // perf10 Q1: the pivot test skips terrain heightfields (brute-force ball
  // projection, ~4 ms a frame); the sweep still stops on them.
  it("the pivot test skips a terrain heightfield, the sweep still hits it", () => {
    const n = 33; const heights = new Float32Array(n * n).fill(0.5);
    const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -100, 0));
    world.createCollider(RAPIER.ColliderDesc.heightfield(n - 1, n - 1, heights, { x: 40, y: 2, z: 40 })
      .setCollisionGroups(TERRAIN_HEIGHTFIELD_GROUPS), ground);
    world.step();
    const ball = new RAPIER.Ball(FOLLOW_CAMERA.pivotRadius);
    // Ground surface at y = −99; a pivot centred 0.1 m under it.
    const inGround = { x: 0, y: -99.1, z: 0 };
    expect(world.intersectionWithShape(inGround, { x: 0, y: 0, z: 0, w: 1 }, ball, undefined, CAMERA_PIVOT_QUERY_GROUPS)).toBeNull();
    expect(world.intersectionWithShape(inGround, { x: 0, y: 0, z: 0, w: 1 }, ball, undefined, CAMERA_QUERY_GROUPS)).not.toBeNull();
    const hit = cast(new THREE.Vector3(0, -97, 0), new THREE.Vector3(0, -102, 0), FOLLOW_CAMERA.collisionRadius,
      FOLLOW_CAMERA.pivotRadius);
    expect(hit).not.toBeNull();
    expect(hit!).toBeGreaterThan(0);
  });

  it("a lintel just above the head still catches the start overlap", () => {
    // A 0.3 m lintel whose underside is 0.2 m above the pivot, 4 m clear of the wall.
    const lintel = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 12.4, 10));
    world.createCollider(RAPIER.ColliderDesc.cuboid(1, 0.15, 1).setCollisionGroups(CAMERA_BLOCKING_GROUPS), lintel);
    world.step();
    const pivot = new THREE.Vector3(0, 12.05, 10);
    const orbit = new THREE.Vector3(0, 14, 15.4);
    expect(cast(pivot, orbit, FOLLOW_CAMERA.collisionRadius, FOLLOW_CAMERA.pivotRadius)).toBe(0);
  });
});
