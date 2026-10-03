import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { FOLLOW_CAMERA, FollowCamera, type CameraObstructionQuery } from "./followCamera";
import {
  CAMERA_BLOCKING_GROUPS, CAMERA_PIVOT_QUERY_GROUPS, CAMERA_QUERY_GROUPS, CAMERA_TRANSPARENT_GROUPS,
  TERRAIN_HEIGHTFIELD_GROUPS, PLAYER_FADE_START_SURFACE_M, distanceToCapsuleSurface,
  playerOpacityForSurfaceDistance,
} from "./cameraCollision";
import { CHARACTER_CAPSULE_HALF_HEIGHT, CHARACTER_CAPSULE_RADIUS } from "../physics/characterPhysics";

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
  it("the ball covers the near plane's corners, and the shortest arm keeps that clearance (walk 2 D3)", () => {
    // The studio's camera: near 0.3 m (CharacterMode), 16:9 at the follow camera's fov.
    const near = 0.3;
    const halfH = near * Math.tan(THREE.MathUtils.degToRad(FOLLOW_CAMERA.fieldOfView / 2));
    const corner = Math.hypot(near, halfH, halfH * 16 / 9);
    expect(corner).toBeCloseTo(0.405, 3);
    expect(FOLLOW_CAMERA.collisionRadius).toBeGreaterThanOrEqual(corner);
    expect(FOLLOW_CAMERA.minArm).toBeGreaterThanOrEqual(FOLLOW_CAMERA.collisionRadius);
  });

  it("is the plain orbit when no query is injected", () => {
    const camera = new FollowCamera();
    camera.reset(player, Math.PI); // yaw 2π: the camera sits on +z
    settled(camera);
    expect(camera.arm).toBeCloseTo(FOLLOW_CAMERA.distance, 2);
  });

  it("pulls in at once when a wall is between the player and the camera", () => {
    let wall: number | null = null;
    const camera = new FollowCamera();
    camera.setObstruction((f, t, r, p) => wallAt(wall)(f, t, r, p));
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
    camera.setObstruction((f, t, r, p) => wallAt(wall)(f, t, r, p));
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

// 16h check-in 3 §1: the view pitch must not depend on arm length.
function viewPitchDeg(camera: FollowCamera): number {
  const cam = new THREE.PerspectiveCamera();
  camera.applyTo(cam);
  cam.updateMatrixWorld();
  const dir = cam.getWorldDirection(new THREE.Vector3());
  return THREE.MathUtils.radToDeg(Math.asin(-dir.y));
}

describe("follow camera view pitch under obstruction", () => {
  for (const pitch of [0.34, 0.06]) {
    it(`holds the view pitch while a wall sweeps the arm 5.8 m -> minArm (pitch ${pitch})`, () => {
      let hit: number | null = null;
      const camera = new FollowCamera({ initialPitch: pitch });
      camera.setObstruction(() => hit);
      camera.reset(player, Math.PI);
      settled(camera);
      const clear = viewPitchDeg(camera);
      const seen: number[] = [];
      for (let d = 5.8; d >= 0.25 - 1e-9; d -= 0.05) {
        hit = d;
        camera.update(still, player, 1 / 60);
        seen.push(viewPitchDeg(camera));
      }
      expect(camera.arm).toBeCloseTo(FOLLOW_CAMERA.minArm, 5);
      expect(Math.max(...seen) - Math.min(...seen)).toBeLessThan(0.5);
      expect(Math.abs(seen[0] - clear)).toBeLessThan(0.5);
    });
  }

  it("matches the old look-at-point pitch when nothing obstructs", () => {
    for (const pitch of [-0.8, 0, 0.06, 0.34, 0.7]) {
      const camera = new FollowCamera({ initialPitch: pitch });
      camera.reset(player, Math.PI);
      settled(camera);
      // Old behaviour: camera at the orbit, looking at the player + lookHeightOffset (+ sky rise).
      const posPitch = Math.max(pitch, FOLLOW_CAMERA.minPosPitch);
      const rise = Math.tan(Math.min(Math.max(0, posPitch - pitch), 1.35)) * FOLLOW_CAMERA.distance * 1.5;
      const old = new THREE.PerspectiveCamera();
      old.position.copy(camera.position);
      old.lookAt(new THREE.Vector3(0, FOLLOW_CAMERA.lookHeightOffset + rise, 0));
      old.updateMatrixWorld();
      const dir = old.getWorldDirection(new THREE.Vector3());
      const oldDeg = THREE.MathUtils.radToDeg(Math.asin(-dir.y));
      expect(Math.abs(viewPitchDeg(camera) - oldDeg)).toBeLessThan(0.5);
    }
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
  it("the pivot test sees settlement and the default but not terrain or vegetation; terrain still collides", () => {
    expect(passes(CAMERA_PIVOT_QUERY_GROUPS, CAMERA_BLOCKING_GROUPS)).toBe(true);
    expect(passes(CAMERA_PIVOT_QUERY_GROUPS, 0xffffffff)).toBe(true);
    expect(passes(CAMERA_PIVOT_QUERY_GROUPS, TERRAIN_HEIGHTFIELD_GROUPS)).toBe(false);
    expect(passes(CAMERA_PIVOT_QUERY_GROUPS, CAMERA_TRANSPARENT_GROUPS)).toBe(false);
    expect(passes(CAMERA_QUERY_GROUPS, TERRAIN_HEIGHTFIELD_GROUPS)).toBe(true);
    expect(passes(0xffffffff, TERRAIN_HEIGHTFIELD_GROUPS)).toBe(true);
  });
  // vol10 diag6 C1: the fade is the camera's distance to the body capsule, not the arm.
  it("fades the player only when the camera is about to enter the body capsule", () => {
    const fade = (x: number, y: number, z: number) => playerOpacityForSurfaceDistance(distanceToCapsuleSurface(
      x, y, z, 0, 0, 0, CHARACTER_CAPSULE_HALF_HEIGHT, CHARACTER_CAPSULE_RADIUS));
    // beside the chest, beyond the start: opaque
    expect(fade(CHARACTER_CAPSULE_RADIUS + PLAYER_FADE_START_SURFACE_M + 0.01, 0.2, 0)).toBe(1);
    // over the head at the pivot height (2.05 m over the feet) with a short arm: opaque (the old arm fade gave 0.133)
    expect(fade(0, CHARACTER_CAPSULE_HALF_HEIGHT + CHARACTER_CAPSULE_RADIUS + 0.4, 0.3)).toBe(1);
    // halfway into the fade band beside the hips
    expect(fade(CHARACTER_CAPSULE_RADIUS + PLAYER_FADE_START_SURFACE_M / 2, -0.3, 0)).toBeCloseTo(0.5, 5);
    // at or inside the body: gone
    expect(fade(CHARACTER_CAPSULE_RADIUS, 0, 0)).toBe(0);
    expect(fade(0, 0, 0)).toBe(0);
  });
});

// Planner ruling on walk 2 RB rec 1: the starting overlap is tested with a
// ball of the capsule's radius at the pivot, the arm is swept with the
// camera's ball ignoring where it starts.
describe("follow camera against a wall the player hugs", () => {
  it("tests the start overlap with the capsule's radius, never the camera ball's", () => {
    expect(FOLLOW_CAMERA.pivotRadius).toBe(CHARACTER_CAPSULE_RADIUS);
    const seen: number[] = [];
    const camera = new FollowCamera();
    camera.setObstruction((_f, _t, _r, pivotRadius) => { seen.push(pivotRadius); return null; });
    camera.reset(player, Math.PI);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((r) => r === CHARACTER_CAPSULE_RADIUS)).toBe(true);
  });
});

// vol10 diag6 C1: a cell ceiling 3.2 m over the feet met the rising arm and
// collapsed it onto the head; the arm now slides along under the ceiling.
describe("follow camera under a low ceiling", () => {
  // body centre at 1.17 m (feet 0): the pivot is 2.05 m over the feet
  const body = new THREE.Vector3(0, 1.17, 0);
  const ceilingAt = (ceilingY: number): CameraObstructionQuery => (from, to, radius) => {
    const limit = ceilingY - radius;
    if (to.y <= limit) return null;
    const dy = to.y - from.y;
    const t = (limit - from.y) / dy;
    return t <= 0 ? 0 : t * from.distanceTo(to);
  };
  it("keeps its distance by lowering the camera instead of pulling it onto the head", () => {
    const camera = new FollowCamera();
    camera.setObstruction(ceilingAt(3.2));
    camera.reset(body, Math.PI);
    camera.pitch = FOLLOW_CAMERA.maxPitch; // looking down from above: the arm rises steeply
    for (let i = 0; i < 240; i++) camera.update({ x: 0, y: 0 }, body, 1 / 60);
    expect(camera.position.y).toBeLessThanOrEqual(3.2 - FOLLOW_CAMERA.collisionRadius + 1e-6);
    expect(camera.arm).toBeGreaterThan(3);
  });
  it("a wall behind the player still pulls the arm in (no lowering through it)", () => {
    const camera = new FollowCamera();
    camera.setObstruction(wallAt(1.5));
    camera.reset(body, Math.PI);
    for (let i = 0; i < 120; i++) camera.update({ x: 0, y: 0 }, body, 1 / 60);
    expect(camera.position.z).toBeLessThanOrEqual(1.5 - FOLLOW_CAMERA.collisionRadius + 1e-6);
  });
});
