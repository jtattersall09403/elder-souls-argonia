import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  INTERIOR_EXPOSURE_MAX, InteriorEnvironment, InteriorFogNode, floorMistGain, interiorAmbientMean, interiorExposure, interiorFogProfile,
  type InteriorRenderer,
} from "./interiorEnvironment";
import { DUST_DENSITY } from "../air/volumetrics/windowApertures";
import { uniform } from "three/tsl";
import { INTERIOR_AMBIENT_SCALE, type LoadedInterior } from "./interiorLoader";
import type { InteriorBundle } from "./bundle";

const cubeOf = (v: number) => {
  const c: [number, number, number] = [v, v, v];
  return { px: c, nx: c, py: c, ny: c, pz: c, nz: c };
};
const bundleAt = (mean: number) => ({
  ambient: { colorRGB: [255, 255, 255], intensity: 1 },
  lighting: { ambientCube: cubeOf(mean / INTERIOR_AMBIENT_SCALE) },
}) as unknown as InteriorBundle;

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
      bundle: bundleAt(0.2), group: new THREE.Group(),
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
      bundle: bundleAt(0.2), group: new THREE.Group(), fog: new THREE.Fog(0x336699, 2, 40), background: new THREE.Color(0),
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

describe("interior auto-exposure (perf10 c12 A)", () => {
  it("a vanilla-dark hut (mean 0.04) is drawn at 4, a bright cell (0.5) at 1, and the clamp holds", () => {
    expect(interiorAmbientMean(bundleAt(0.04))).toBeCloseTo(0.04, 6);
    expect(interiorExposure(0.04)).toBeCloseTo(4, 6);
    expect(interiorExposure(0.5)).toBe(1);
    expect(interiorExposure(0.001)).toBe(INTERIOR_EXPOSURE_MAX);
    expect(interiorExposure(0)).toBe(INTERIOR_EXPOSURE_MAX);
  });

  it("eases from the outside exposure to the cell's over ~0.5 s and restores the outside value", () => {
    const clear = { color: new THREE.Color(), alpha: 0 };
    const gl = {
      toneMappingExposure: 22,
      getClearColor: (t: THREE.Color) => t.copy(clear.color),
      getClearAlpha: () => clear.alpha,
      setClearColor: (c: THREE.Color, a = 1) => { clear.color.copy(c); clear.alpha = a; },
    };
    const cell = {
      bundle: bundleAt(0.04), group: new THREE.Group(), fog: new THREE.Fog(0, 1, 2), background: new THREE.Color(),
    } as unknown as LoadedInterior;
    const inside = new InteriorEnvironment(new THREE.Scene(), gl, cell);
    expect(gl.toneMappingExposure).toBe(INTERIOR_EXPOSURE_MAX); // 22 clamped: no pop past the max
    inside.frame(0.1);
    expect(gl.toneMappingExposure).toBeGreaterThan(4);
    expect(gl.toneMappingExposure).toBeLessThan(INTERIOR_EXPOSURE_MAX);
    for (let i = 0; i < 4; i++) inside.frame(0.1);
    expect(gl.toneMappingExposure).toBeLessThan(4.15); // 0.5 s: within 5 % of the step
    inside.restore();
    expect(gl.toneMappingExposure).toBe(22);
  });
});
