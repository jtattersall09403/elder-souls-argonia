import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { compassDirection } from "@elder-souls/game-core/interior/doors";
import { FollowCamera } from "@elder-souls/game-core/camera/followCamera";
import { EcctrlAdapter } from "./EcctrlAdapter";

/** Compass bearing (0 north = -z, 90 east = +x) of a planar direction. */
const compassOf = (x: number, z: number) => ((THREE.MathUtils.radToDeg(Math.atan2(x, -z)) % 360) + 360) % 360;

// vol10 diag3 Q1: `?yaw=b` faces the body along compassDirection(b) (InteriorDoors, doorTransition.place),
// the teleport reset reads the body's heading (CharacterMode headingOf) and puts the camera behind it.
describe("facing chain: compass -> faceDirection -> body heading -> follow camera", () => {
  for (const b of [0, 90, 129, 180, 270]) {
    it(`?yaw=${b} gives a camera looking along compass ${b}`, () => {
      const rot = { x: 0, y: 0, z: 0, w: 1 };
      const body = { setAngvel: () => undefined, setRotation: (q: typeof rot) => Object.assign(rot, q) };
      const handle = { body, setForwardDir: () => undefined, setLockForward: () => undefined };
      const adapter = new EcctrlAdapter({ current: handle } as never);
      const d = compassDirection(b);
      adapter.faceDirection(new THREE.Vector3(d.x, 0, d.z), false);
      const q = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      expect(compassOf(fwd.x, fwd.z)).toBeCloseTo(b % 360, 4);
      const cam = new FollowCamera();
      const player = new THREE.Vector3(10, 0, 20);
      cam.reset(player, Math.atan2(fwd.x, fwd.z));
      const look = player.clone().sub(cam.position);
      const got = compassOf(look.x, look.z);
      expect(Math.min(Math.abs(got - b), 360 - Math.abs(got - b))).toBeLessThan(1e-3);
    });
  }
});
