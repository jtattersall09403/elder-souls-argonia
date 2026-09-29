import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createAerialUniforms } from "./aerial";
import { createCloudUniforms } from "./cloudField";
import {
  createMoonMaterial,
  createSkyDome,
  createStarLayer,
  createSunCascades,
  inverseAcesFilmic,
} from "./skyObjects";

/** three's TSL ACESFilmicToneMapping (nodes/display/ToneMappingFunctions.js,
 * the one WebGPURenderer runs), on the CPU. Its fit denominator is
 * x·(0.983729·(x + 0.432951)) + 0.238081 — not the classic GLSL chunk's. */
function aces(c: [number, number, number], exposure: number): [number, number, number] {
  const v = new THREE.Vector3(...c).multiplyScalar(exposure / 0.6);
  const inM = new THREE.Matrix3().set(0.59719, 0.076, 0.0284, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const outM = new THREE.Matrix3().set(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  v.applyMatrix3(inM);
  const fit = (x: number) => (x * (x + 0.0245786) - 0.000090537) / (x * (0.983729 * (x + 0.432951)) + 0.238081);
  v.set(fit(v.x), fit(v.y), fit(v.z)).applyMatrix3(outM);
  return [v.x, v.y, v.z];
}

describe("display-referred moons under the frame's ACES", () => {
  it("inverse ACES round-trips display values at day and night exposures", () => {
    for (const exposure of [1e-4, 0.02, 1.3]) {
      for (const d of [[0.68, 0.4, 0.3], [0.005, 0.005, 0.006], [0.3, 0.33, 0.36]] as [number, number, number][]) {
        const back = aces(inverseAcesFilmic(d, exposure), exposure);
        for (let i = 0; i < 3; i++) expect(back[i]).toBeCloseTo(d[i], 4);
      }
    }
  });
});

describe("sky objects fill the right node slots", () => {
  it("the dome keeps SkyMesh's Preetham and is never hazed twice", () => {
    const dome = createSkyDome(100, createAerialUniforms(), createCloudUniforms());
    expect(dome.sky.material.fog).toBe(false);
    expect(dome.sky.material.colorNode).not.toBeNull();
    expect(dome.sky.cloudCoverage.value).toBe(0);
  });

  it("stars are instanced quads with a position and size node", () => {
    const layer = createStarLayer("stars", { size: new Float32Array(3).fill(2), lum: new Float32Array(3) }, createCloudUniforms());
    expect(layer.mesh.count).toBe(3);
    const m = layer.mesh.material as unknown as { positionNode: unknown; sizeNode: unknown; blending: number; fog: boolean };
    expect(m.positionNode).toBeTruthy();
    expect(m.sizeNode).toBeTruthy();
    expect(m.blending).toBe(THREE.AdditiveBlending);
    expect(m.fog).toBe(false);
  });

  it("moons write depth, add, and skip the fog", () => {
    const { material } = createMoonMaterial(new THREE.Color(1, 0.5, 0.4));
    expect(material.depthWrite).toBe(true);
    expect(material.blending).toBe(THREE.AdditiveBlending);
    expect(material.fog).toBe(false);
  });

  it("the sun's shadow is a CSMShadowNode with the old arrangement", () => {
    const { sun, csm } = createSunCascades({ cascades: 3, maxFar: 6000, shadowMapSize: 2048 });
    expect(sun.shadow.shadowNode).toBe(csm);
    expect(csm.cascades).toBe(3);
    expect(csm.maxFar).toBe(6000);
    expect(csm.mode).toBe("practical");
    expect(csm.fade).toBe(true);
    expect(sun.shadow.bias).toBe(-6e-5);
    expect(sun.shadow.normalBias).toBe(0.05);
    expect(sun.shadow.mapSize.x).toBe(2048);
  });
});
