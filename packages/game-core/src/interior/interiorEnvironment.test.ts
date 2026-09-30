import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { InteriorEnvironment, InteriorFogNode, interiorFogProfile, type InteriorRenderer } from "./interiorEnvironment";
import { uniform } from "three/tsl";
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

  it("draws the cell's volumetric fog node inside, with the cell's fog, and puts the sky's back", () => {
    const scene = new THREE.Scene();
    const skyFog = { isNode: true };
    (scene as unknown as { fogNode: unknown }).fogNode = skyFog;
    const interior = {
      group: new THREE.Group(), fog: new THREE.Fog(0x336699, 2, 40), background: new THREE.Color(0),
    } as unknown as LoadedInterior;
    const v = { near: uniform(0.5), far: uniform(400), on: uniform(1), sampleIntegrated: () => uniform(new THREE.Vector4(0, 0, 0, 1)) };
    const fog = new InteriorFogNode(v as never);
    const env = new InteriorEnvironment(scene, renderer(), interior, fog);
    expect((scene as unknown as { fogNode: unknown }).fogNode).toBe(fog.node);
    env.frame();
    env.restore();
    expect((scene as unknown as { fogNode: unknown }).fogNode).toBe(skyFog);
  });
  it("profiles damp cells with floor mist and lit cells with dust", () => {
    const cell = (template: string) => ({ bundle: { lighting: { template }, arrivalMarker: { positionM: [0, 2, 0] } } }) as never;
    expect(interiorFogProfile(cell("CaveLightingTemplate"), 10)).toMatchObject({ floorY: 12, floorMistDensity: 0.35 });
    expect(interiorFogProfile(cell("SolitudeInteriors"), 0)).toMatchObject({ floorMistDensity: 0, dustDensity: 0.01 });
  });
});
