import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { InteriorEnvironment, InteriorFogNode, floorMistGain, interiorFogProfile, type InteriorRenderer } from "./interiorEnvironment";
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
  it("profiles a cell from its schema-2 row: mist from the record, dust by band, medium and dry when absent", () => {
    const cell = (cellId: string) => ({ bundle: { cellId, arrivalMarker: { positionM: [0, 2, 0] } } }) as never;
    const row = (dust: "low" | "medium" | "high", floorMist: { topM: number; density: number } | null) =>
      ({ apertures: [], kind: "k", volumeClass: "medium" as const, humid: false, dust, floorMist });
    const record = { schemaVersion: 2 as const, cells: {
      Cave: row("medium", { topM: 1.3, density: 0.4 }), Mill: row("high", null), Hut: row("low", { topM: 0.25, density: 0.08 }) } };
    expect(interiorFogProfile(cell("Cave"), 10, null, "high", record)).toMatchObject(
      { floorY: 12, floorMistTopM: 1.3, floorMistDensity: 0.4, dustDensity: DUST_DENSITY.medium });
    expect(interiorFogProfile(cell("Mill"), 0, null, "high", record)).toMatchObject({ floorMistDensity: 0, dustDensity: DUST_DENSITY.high });
    expect(interiorFogProfile(cell("Hut"), 0, null, "high", record)).toMatchObject({ floorMistTopM: 0.25, floorMistDensity: 0.08 });
    expect(interiorFogProfile(cell("Unknown"), 0, null, "high", record)).toMatchObject({ floorMistDensity: 0, dustDensity: DUST_DENSITY.medium });
    // the low (mobile) tier draws no floor mist; dust stays
    expect(interiorFogProfile(cell("Cave"), 0, null, "low", record)).toMatchObject({ floorMistTopM: 0, floorMistDensity: 0, dustDensity: DUST_DENSITY.medium });
    // written into the host's object
    const out = { floorY: 0, floorMistTopM: 0, floorMistDensity: 0, dustDensity: 0 };
    expect(interiorFogProfile(cell("Cave"), 0, null, "high", record, out)).toBe(out);
  });

  it("thickens the floor mist at dawn and in the wet season", () => {
    const at = (minuteOfDay: number, wetSeason: number) => floorMistGain({ minuteOfDay, sunriseMin: 360, wetSeason });
    expect(at(360, 0.5)).toBeCloseTo(1.6, 5);
    expect(at(780, 0.5)).toBeCloseTo(1, 3);
    expect(at(360, 1)).toBeGreaterThan(at(360, 0));
    expect(at(1430, 0.5)).toBeLessThan(at(400, 0.5));
    expect(floorMistGain(null)).toBe(1);
  });
});
