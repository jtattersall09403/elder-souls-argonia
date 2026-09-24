import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { FOLLOW_CAMERA, FollowCamera, type CameraObstructionQuery } from "./followCamera";
import {
  CAMERA_BLOCKING_GROUPS, CAMERA_QUERY_GROUPS, CAMERA_TRANSPARENT_GROUPS, playerOpacityForArm,
} from "./cameraCollision";

// 16h check-in 2 item 3: the arm collides with an injected world query.
// A wall is a plane at z = wallZ: the ball stops `radius` short of it.
const wallAt = (wallZ: number | null): CameraObstructionQuery => (from, to, radius) => {
  if (wallZ === null || to.z <= wallZ - radius) return null;
  const dz = to.z - from.z;
  if (dz <= 0) return null;
  const t = (wallZ - radius - from.z) / dz;
  return t <= 0 ? 0 : t * from.distanceTo(to);
};

const still = { x: 0, y: 0 };
const player = new THREE.Vector3(0, 0, 0);

function settled(camera: FollowCamera, frames = 240, input = still) {
  for (let i = 0; i < frames; i++) camera.update(input, player, 1 / 60);
}

describe("follow camera collision", () => {
  it("is the plain orbit when no query is injected", () => {
    const camera = new FollowCamera();
    camera.reset(player, Math.PI); // yaw 2π: the camera sits on +z
    settled(camera);
    expect(camera.arm).toBeCloseTo(FOLLOW_CAMERA.distance, 2);
  });

  it("pulls in at once when a wall is between the player and the camera", () => {
    let wall: number | null = null;
    const camera = new FollowCamera();
    camera.setObstruction((f, t, r) => wallAt(wall)(f, t, r));
    camera.reset(player, Math.PI);
    settled(camera);
    expect(camera.arm).toBeCloseTo(FOLLOW_CAMERA.distance, 2);
    wall = 2;
    camera.update(still, player, 1 / 60); // ONE frame: no easing on the way in
    expect(camera.position.z).toBeLessThanOrEqual(2 - FOLLOW_CAMERA.collisionRadius + 1e-6);
    expect(camera.arm).toBeLessThan(2.2);
  });

  it("returns gradually, and only while the player gives input", () => {
    let wall: number | null = 2;
    const camera = new FollowCamera();
    camera.setObstruction((f, t, r) => wallAt(wall)(f, t, r));
    camera.reset(player, Math.PI);
    settled(camera);
    const pulled = camera.arm;
    wall = null;
    settled(camera, 120); // clear, but no input: stays in
    expect(camera.arm).toBeCloseTo(pulled, 5);
    camera.update({ x: 0, y: 0.5 }, player, 1 / 60); // input: one step out
    expect(camera.arm).toBeGreaterThan(pulled);
    expect(camera.arm - pulled).toBeLessThanOrEqual(FOLLOW_CAMERA.returnRate / 60 + 1e-6);
    settled(camera, 600, { x: 0.3, y: 0 });
    expect(camera.arm).toBeCloseTo(FOLLOW_CAMERA.distance, 1);
  });
});

describe("camera collision groups", () => {
  // Rapier's pair test: (a.memberships & b.filter) && (b.memberships & a.filter).
  const passes = (query: number, collider: number) =>
    ((query >>> 16) & (collider & 0xffff)) !== 0 && ((collider >>> 16) & (query & 0xffff)) !== 0;
  it("blocks on settlement/terrain and the default, never on vegetation", () => {
    expect(passes(CAMERA_QUERY_GROUPS, CAMERA_BLOCKING_GROUPS)).toBe(true);
    expect(passes(CAMERA_QUERY_GROUPS, 0xffffffff)).toBe(true);
    expect(passes(CAMERA_QUERY_GROUPS, CAMERA_TRANSPARENT_GROUPS)).toBe(false);
    // vegetation still collides with the player (default groups)
    expect(passes(0xffffffff, CAMERA_TRANSPARENT_GROUPS)).toBe(true);
  });
  it("fades the player between 1.2 m and 0.5 m of arm", () => {
    expect(playerOpacityForArm(5.8)).toBe(1);
    expect(playerOpacityForArm(1.2)).toBe(1);
    expect(playerOpacityForArm(0.85)).toBeCloseTo(0.5, 5);
    expect(playerOpacityForArm(0.5)).toBe(0);
  });
});
