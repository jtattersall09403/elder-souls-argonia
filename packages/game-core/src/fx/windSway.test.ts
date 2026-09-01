import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  applyWindSway,
  createWindUniforms,
  reapplyWindSway,
  updateWindSway,
  windStiffness,
  WIND_REFERENCE_TRUNK_RADIUS_M,
  WIND_STIFFNESS_RANGE,
  WIND_TUNE_ATTRIBUTE,
} from "./windSway";

/** A minimal stand-in for the object three.js passes to onBeforeCompile. */
function shaderStub() {
  return {
    uniforms: {} as Record<string, unknown>,
    vertexShader: "void main() {\n#include <begin_vertex>\n}",
    fragmentShader: "",
  };
}

function compile(material: THREE.Material) {
  const shader = shaderStub();
  material.onBeforeCompile(
    shader as unknown as THREE.WebGLProgramParametersWithUniforms,
    undefined as unknown as THREE.WebGLRenderer,
  );
  return shader;
}

describe("wind sway shader patch", () => {
  it("injects the displacement and binds the shared uniforms", () => {
    const material = new THREE.MeshStandardMaterial();
    const uniforms = createWindUniforms();
    applyWindSway(material, uniforms);
    const shader = compile(material);
    expect(shader.vertexShader).toContain("esWindVec");
    expect(shader.uniforms.esWindTime).toBe(uniforms.esWindTime);
  });

  it("survives an onBeforeCompile overwrite via reapplyWindSway — CSM does", () => {
    // exactly this (plain assignment, no chaining), and round 5 shipped with
    // every tree motionless because the wind hook was wiped ~1 s after load.
    const material = new THREE.MeshStandardMaterial();
    const uniforms = createWindUniforms();
    applyWindSway(material, uniforms);
    let csmRan = false;
    material.onBeforeCompile = () => { csmRan = true; };
    reapplyWindSway(material);
    const shader = compile(material);
    expect(csmRan).toBe(true); // the newcomer still runs first
    expect(shader.vertexShader).toContain("esWindVec");
  });

  it("never injects twice, however many times it is applied", () => {
    const material = new THREE.MeshStandardMaterial();
    const uniforms = createWindUniforms();
    applyWindSway(material, uniforms);
    applyWindSway(material, uniforms);
    reapplyWindSway(material);
    reapplyWindSway(material);
    const shader = compile(material);
    expect(shader.vertexShader.match(/esWindPhase\(/g)?.length ?? 0)
      .toBeLessThanOrEqual(2); // declaration + one call site, one injection
  });

  it("ignores materials wind never touched", () => {
    const material = new THREE.MeshStandardMaterial();
    const before = material.onBeforeCompile;
    reapplyWindSway(material);
    expect(material.onBeforeCompile).toBe(before);
  });

  it("keys the program cache so a patched material cannot share a program", () => {
    const patched = new THREE.MeshStandardMaterial();
    const plain = new THREE.MeshStandardMaterial();
    applyWindSway(patched, createWindUniforms());
    expect(patched.customProgramCacheKey()).toContain("es-wind");
    expect(plain.customProgramCacheKey()).not.toContain("es-wind");
  });

  it("takes absolute time, so two callers per frame do not double the clock", () => {
    const uniforms = createWindUniforms();
    const wind = { windDirXZ: [1, 0] as const, windSpeedMS: 10, gustiness: 0.5 };
    updateWindSway(uniforms, 4.2, wind);
    updateWindSway(uniforms, 4.2, wind);
    expect(uniforms.esWindTime.value).toBe(4.2);
    expect(uniforms.esWindVec.value.x).toBeCloseTo(0.9);
  });

  it("declares the per-instance tune attribute only under instancing", () => {
    const material = new THREE.MeshStandardMaterial();
    applyWindSway(material, createWindUniforms());
    const shader = compile(material);
    expect(shader.vertexShader).toContain(`attribute vec2 ${WIND_TUNE_ATTRIBUTE}`);
    // Guarded, because the non-instanced path has no such attribute to bind.
    const declaration = shader.vertexShader.indexOf(
      `attribute vec2 ${WIND_TUNE_ATTRIBUTE}`);
    const guard = shader.vertexShader.lastIndexOf("#ifdef USE_INSTANCING",
                                                  declaration);
    expect(guard).toBeGreaterThan(-1);
  });

  it("measures height from the GROUND LINE, not the buried pivot", () => {
    // Terrain species are sunk deliberately; weighting from the pivot left the
    // trunk already displaced where it meets the soil (owner round 6:
    // "trunks look like they're swaying at their base").
    const material = new THREE.MeshStandardMaterial();
    applyWindSway(material, createWindUniforms());
    const shader = compile(material);
    expect(shader.vertexShader).toContain("esHeight = max(0.0, esRawHeight - esSink)");
  });

  it("scales sway by the trunk's width, both ways off the reference", () => {
    expect(windStiffness(WIND_REFERENCE_TRUNK_RADIUS_M)).toBeCloseTo(1, 5);
    const [floor, ceiling] = WIND_STIFFNESS_RANGE;
    // A buttressed giant barely stirs; a slender trunk keeps the calibrated
    // amplitude and is never pushed ABOVE it (owner round 7: palms swayed
    // too much once thin trunks were allowed a multiplier over 1).
    expect(windStiffness(1.6)).toBe(floor);
    expect(windStiffness(0.05)).toBe(ceiling);
    expect(ceiling).toBe(1);
    // A 0.26 m palm trunk — the case the owner called out — must not exceed
    // the baseline it was tuned at.
    expect(windStiffness(0.26)).toBe(1);
    // Monotonic in between, and strictly decreasing with width.
    expect(windStiffness(0.25)).toBeGreaterThan(windStiffness(0.45));
    expect(windStiffness(0.45)).toBeLessThan(1);
  });

  it("reads the trunk width AT INSTANCE SCALE", () => {
    // The same species placed at x2 has a trunk twice as thick, so it must
    // sway less than its unscaled neighbour, not the same amount.
    expect(windStiffness(0.3, 2)).toBeLessThan(windStiffness(0.3, 1));
    expect(windStiffness(0.3, 2)).toBeCloseTo(windStiffness(0.6, 1), 6);
  });

  it("treats a species with no trunk capsule as neutral", () => {
    expect(windStiffness(0)).toBe(1);
    expect(windStiffness(Number.NaN)).toBe(1);
  });
});
