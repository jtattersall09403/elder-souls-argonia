import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { compassDirection } from "@elder-souls/game-core/interior/doors";
import { parseSpawnYaw, spawnHeadingRad } from "./spawnFacing";

describe("spawn facing", () => {
  it("parses ?yaw= and keeps north without it", () => {
    expect(parseSpawnYaw(null)).toBeNull();
    expect(parseSpawnYaw("")).toBeNull();
    expect(parseSpawnYaw("abc")).toBeNull();
    expect(parseSpawnYaw("135")).toBe(135);
    expect(spawnHeadingRad(null)).toBeCloseTo(Math.PI, 9);
  });
  it("turns the body's +z onto the compass bearing (the doors' compassDirection)", () => {
    for (const yaw of [0, 45, 90, 180, 270, 333]) {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spawnHeadingRad(yaw));
      const z = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      const d = compassDirection(yaw);
      expect(z.x).toBeCloseTo(d.x, 6);
      expect(z.z).toBeCloseTo(d.z, 6);
    }
  });
});
