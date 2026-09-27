import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import {
  CHARACTER_BODY_CENTER_HEIGHT, CHARACTER_CAPSULE_HALF_HEIGHT, CHARACTER_CAPSULE_RADIUS, CHARACTER_DAMPING_C,
  CHARACTER_FLOAT_HEIGHT, CHARACTER_RAY_HIT_FORGIVENESS, CHARACTER_RAY_RADIUS, CHARACTER_SPRING_K,
  FALLING_GRAVITY_SCALE, JUMP_GRAVITY_SCALE,
} from "./characterPhysics";
import { PLAYER_WALK_SPEED } from "../io/input";

/**
 * Walk 2 D5: the character steps a knee-high ledge (0.45 m) without a jump
 * and is stopped by a 0.7 m one. Ecctrl runs only under React Three Fiber,
 * so this drives a Rapier body with ecctrl 2.0.1's own per-frame rules
 * (dist/src-*.js: `floatCharacter` shape-cast grounding, `applyFloatingForce`,
 * `applyDynamicGravity`, `moveCharacter` with the slope-in-front tilt) and
 * PlayerBody's parameters. Rotations are locked, as PlayerBody locks them.
 */
const DT = 1 / 60;
const SLOPE_MAX = Math.PI / 2.5;     // ecctrl default; PlayerBody keeps it
const ACC_DELTA_TIME = 0.16;          // PlayerBody accDeltaTime
const SLIDE_GRIP = 0.5;               // ecctrl default slideGripFactor
const AIR_DRAG = 0.06;                // PlayerBody airDragFactor
const RAY_LENGTH = CHARACTER_CAPSULE_RADIUS + 1; // ecctrl default

type Walk = { x: number; feetY: number; stepped: boolean };

function walkInto(ledgeHeightM: number, seconds = 4): Walk {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(20, 0.5, 20), ground);
  // The ledge: its near face at x = 1.5, 30 m deep (the walk ends on it), 6 m wide.
  const ledge = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(16.5, ledgeHeightM / 2, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(15, ledgeHeightM / 2, 3), ledge);
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(0, CHARACTER_BODY_CENTER_HEIGHT, 0).lockRotations().setGravityScale(JUMP_GRAVITY_SCALE));
  world.createCollider(RAPIER.ColliderDesc.capsule(CHARACTER_CAPSULE_HALF_HEIGHT, CHARACTER_CAPSULE_RADIUS), body);
  const ball = new RAPIER.Ball(CHARACTER_RAY_RADIUS);
  const up = new THREE.Vector3(0, 1, 0);
  const input = new THREE.Vector3(1, 0, 0);
  const normal = new THREE.Vector3();
  const moving = new THREE.Vector3();
  const cross = new THREE.Vector3().crossVectors(input, up);
  let maxX = 0;
  for (let i = 0; i < seconds / DT; i++) {
    const p = body.translation();
    const v = body.linvel();
    const mass = body.mass();
    // floatCharacter, groundDetection "shapeCast"
    const hit = world.castShape({ x: p.x, y: p.y - CHARACTER_CAPSULE_HALF_HEIGHT, z: p.z }, body.rotation(),
      { x: 0, y: -1, z: 0 }, ball, 0, RAY_LENGTH, false, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined, undefined, body);
    let onGround = false;
    let slopeInFront = 0;
    if (hit) {
      normal.set(hit.normal1.x, hit.normal1.y, hit.normal1.z);
      if (normal.angleTo(up) < SLOPE_MAX) {
        const floatDist = CHARACTER_RAY_RADIUS + CHARACTER_FLOAT_HEIGHT;
        onGround = hit.time_of_impact < floatDist + CHARACTER_RAY_HIT_FORGIVENESS;
        if (onGround) {
          // applyFloatingForce
          const force = CHARACTER_SPRING_K * (floatDist - hit.time_of_impact) - CHARACTER_DAMPING_C * v.y;
          body.applyImpulse({ x: 0, y: force * DT, z: 0 }, true);
          // slopeDetect
          slopeInFront = -Math.asin(THREE.MathUtils.clamp(normal.dot(input), -1, 1));
        }
      }
    }
    // applyDynamicGravity
    body.setGravityScale(onGround ? 0 : v.y < 0 ? FALLING_GRAVITY_SCALE : JUMP_GRAVITY_SCALE, true);
    // moveCharacter (flat input, no platform, friction 0.5 on the default collider)
    moving.copy(input).applyAxisAngle(cross, slopeInFront);
    const grip = onGround ? THREE.MathUtils.clamp((0.5 + SLIDE_GRIP) * 0.5, 0, 1) : AIR_DRAG;
    const k = mass * ACC_DELTA_TIME * grip;
    body.applyImpulse({
      x: (moving.x * PLAYER_WALK_SPEED - v.x) * k,
      y: moving.y * PLAYER_WALK_SPEED * k,
      z: (moving.z * PLAYER_WALK_SPEED - v.z) * k,
    }, true);
    world.step();
    maxX = Math.max(maxX, body.translation().x);
  }
  const end = body.translation();
  const feetY = end.y - CHARACTER_BODY_CENTER_HEIGHT;
  world.free();
  return { x: maxX, feetY, stepped: maxX > 2 && feetY > ledgeHeightM - 0.05 };
}

describe("auto-step (walk 2 D5)", () => {
  beforeAll(async () => { await RAPIER.init(); });

  it("the standing capsule spans 0.45–1.89 m over the feet", () => {
    const bottom = CHARACTER_BODY_CENTER_HEIGHT - CHARACTER_CAPSULE_HALF_HEIGHT - CHARACTER_CAPSULE_RADIUS;
    const top = CHARACTER_BODY_CENTER_HEIGHT + CHARACTER_CAPSULE_HALF_HEIGHT + CHARACTER_CAPSULE_RADIUS;
    expect(bottom).toBeCloseTo(0.45, 6);
    expect(top).toBeCloseTo(1.89, 6);
  });

  it("walks over a 0.45 m ledge without a jump", () => {
    const walk = walkInto(0.45);
    expect(walk.stepped, JSON.stringify(walk)).toBe(true);
  });

  it("is stopped by a 0.7 m ledge", () => {
    const walk = walkInto(0.7);
    expect(walk.x, JSON.stringify(walk)).toBeLessThan(1.5);
    expect(walk.feetY).toBeLessThan(0.1);
  });
});
