import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { InteriorEnvironment, InteriorFogNode, interiorFogProfile, type InteriorRenderer } from "./interiorEnvironment";
import { DUST_DENSITY } from "../air/volumetrics/windowApertures";
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
  it("profiles a cell from its interior light row: damp gets floor mist, dust by band, medium when absent", () => {
    const cell = (cellId: string) => ({ bundle: { cellId, arrivalMarker: { positionM: [0, 2, 0] } } }) as never;
    const row = (dust: "low" | "medium" | "high", floorMist: boolean) => ({ apertures: [], kind: "k", dust, floorMist });
    const record = { schemaVersion: 1 as const, cells: { Cave: row("medium", true), Mill: row("high", false), Hut: row("low", false) } };
    expect(interiorFogProfile(cell("Cave"), 10, record)).toMatchObject({ floorY: 12, floorMistDensity: 0.35, dustDensity: DUST_DENSITY.medium });
    expect(interiorFogProfile(cell("Mill"), 0, record)).toMatchObject({ floorMistDensity: 0, dustDensity: DUST_DENSITY.high });
    expect(interiorFogProfile(cell("Hut"), 0, record).dustDensity).toBeLessThan(interiorFogProfile(cell("Mill"), 0, record).dustDensity);
    expect(interiorFogProfile(cell("Unknown"), 0, record)).toMatchObject({ floorMistDensity: 0, dustDensity: DUST_DENSITY.medium });
  });
});
