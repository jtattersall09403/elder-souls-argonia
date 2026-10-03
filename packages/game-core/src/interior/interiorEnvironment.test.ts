import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  INTERIOR_EXPOSURE_MAX, InteriorEnvironment, InteriorFogNode, interiorAmbientMean, interiorExposure, interiorFogProfile,
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
