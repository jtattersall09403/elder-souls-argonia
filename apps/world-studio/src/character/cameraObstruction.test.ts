import { beforeAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { CAMERA_BLOCKING_GROUPS } from "@elder-souls/game-core/camera/cameraCollision";
import { FOLLOW_CAMERA } from "@elder-souls/game-core/camera/followCamera";
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
    expect(cast(pivot, orbit, FOLLOW_CAMERA.collisionRadius)).toBe(0);
  });

  it("a clear arm returns null", () => {
    expect(cast(new THREE.Vector3(0, 1, 10), new THREE.Vector3(0, 1, 15), FOLLOW_CAMERA.collisionRadius)).toBeNull();
  });
});
