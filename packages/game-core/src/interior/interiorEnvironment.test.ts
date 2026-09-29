import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { InteriorEnvironment, type InteriorRenderer } from "./interiorEnvironment";
import type { LoadedInterior } from "./interiorLoader";

function renderer(): InteriorRenderer {
  const clear = new THREE.Color(0.2, 0.3, 0.4);
  return {
    toneMappingExposure: 1.4,
    getClearColor: (t) => t.copy(clear),
    getClearAlpha: () => 1,
    setClearColor: (c) => { clear.copy(c); },
  };
}

describe("interior environment and the sky's fog node", () => {
  it("lifts scene.fogNode inside so the cell's fog draws, and puts it back", () => {
    const scene = new THREE.Scene();
    const skyFog = { isNode: true };
    (scene as unknown as { fogNode: unknown }).fogNode = skyFog;
    const interior = {
      group: new THREE.Group(),
      fog: new THREE.Fog(0x101010, 1, 30),
      background: new THREE.Color(0x101010),
    } as unknown as LoadedInterior;
    const env = new InteriorEnvironment(scene, renderer(), interior);
    expect((scene as unknown as { fogNode: unknown }).fogNode).toBeNull();
    expect(scene.fog).toBe(interior.fog);
    env.restore();
    expect((scene as unknown as { fogNode: unknown }).fogNode).toBe(skyFog);
  });
});
