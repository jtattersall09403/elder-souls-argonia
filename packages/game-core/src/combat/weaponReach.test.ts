import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { capsulePlanarReach } from "./weaponReach";

describe("measured capsule reach", () => {
  it("includes the actual weapon volume and an attack's travel", () => {
    const a = new Vector3(0, 1, .5), b = new Vector3(0, 1, 1);
    expect(capsulePlanarReach(a,b,.05)).toBeCloseTo(1.05);
    a.z += .3; b.z += .3;
    expect(capsulePlanarReach(a,b,.05)).toBeCloseTo(1.35);
    b.z += .5;
    expect(capsulePlanarReach(a,b,.05)).toBeCloseTo(1.85);
  });
  it("does not count height as extra reach and is invariant under actor yaw", () => {
    const a = new Vector3(.4, 20, .3), b = new Vector3(.8, 20, .6);
    expect(capsulePlanarReach(a,b,.1)).toBeCloseTo(1.1);
    for (const p of [a,b]) p.applyAxisAngle(new Vector3(0,1,0),1.2);
    expect(capsulePlanarReach(a,b,.1)).toBeCloseTo(1.1);
  });
});
