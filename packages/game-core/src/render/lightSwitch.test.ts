import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { applyCascadeRota, setShadowShown } from "./lightSwitch";

function sunWithCascades(n: number) {
  const sun = new THREE.DirectionalLight();
  const lights = Array.from({ length: n }, () => new THREE.DirectionalLight());
  (sun.shadow as unknown as { shadowNode: unknown }).shadowNode = { lights };
  return { sun, lights };
}

describe("applyCascadeRota", () => {
  it("updates cascade 0 every frame, 1 every 2nd, 2 every 4th, never two slow ones together", () => {
    const { sun, lights } = sunWithCascades(3);
    const updates = [0, 0, 0];
    for (let f = 0; f < 8; f++) {
      setShadowShown(sun, true);
      lights.forEach((l) => { l.shadow.needsUpdate = false; });
      applyCascadeRota(sun, f, [1, 2, 4]);
      lights.forEach((l, i) => { if (l.shadow.autoUpdate || l.shadow.needsUpdate) updates[i]++; });
      expect(lights[1].shadow.needsUpdate && lights[2].shadow.needsUpdate).toBe(false);
    }
    expect(updates).toEqual([8, 4, 2]);
  });
  it("leaves a hidden shadow stopped", () => {
    const { sun, lights } = sunWithCascades(3);
    setShadowShown(sun, false);
    for (let f = 0; f < 4; f++) applyCascadeRota(sun, f, [1, 2, 4]);
    expect(lights.some((l) => l.shadow.autoUpdate || l.shadow.needsUpdate)).toBe(false);
  });
});
