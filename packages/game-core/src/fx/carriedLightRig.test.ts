import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { CarriedLightRig } from "./carriedLightRig";
import type { LightSourceSpec } from "./carriedLight";

const TORCH: LightSourceSpec = {
  id: "torch", colour: [1, 0.6, 0.3], radiusMetres: 6, burnSeconds: 240,
  flicker: { frequency: 1, intensityAmplitude: 0.2, movementMetres: 0.05 }, extinguishedBy: ["submerged"],
};

/** What three.js counts into NUM_POINT_LIGHTS: visible point lights in the graph. */
function pointLights(scene: THREE.Scene): number {
  let n = 0;
  scene.traverseVisible((o) => { if ((o as THREE.PointLight).isPointLight) n++; });
  return n;
}

describe("CarriedLightRig", () => {
  it("keeps the point-light count constant through lit, doused, put away and no torch", () => {
    const scene = new THREE.Scene();
    const hand = new THREE.Group(); scene.add(hand);
    const torch = new THREE.Group(); const flame = new THREE.Object3D(); flame.name = "AttachLight"; torch.add(flame);
    const rig = new CarriedLightRig(scene, 6);
    const counts: number[] = [pointLights(scene)];
    const frames: [THREE.Object3D | null, LightSourceSpec | null, number][] = [
      [null, null, 0],          // nothing held yet
      [torch, TORCH, 1],        // torch drawn and lit (night)
      [torch, TORCH, 0],        // doused
      [null, TORCH, 0],         // put away
      [torch, null, 0],         // the loadout's off-hand is no longer a light
      [torch, TORCH, 0.5],      // lit again
    ];
    for (const [item, spec, level] of frames) {
      if (item && !item.parent) hand.add(item);
      rig.update(item, spec, level, 1);
      counts.push(pointLights(scene));
    }
    expect(new Set(counts)).toEqual(new Set([1]));
    expect(rig.light.parent).toBe(flame);
    expect(rig.light.intensity).toBeCloseTo(3);
    rig.update(null, null, 0, 1);
    expect(rig.light.parent).toBe(scene);
    expect(rig.light.intensity).toBe(0);
    rig.dispose();
  });
});
