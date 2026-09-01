import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  applyWindSway,
  createWindUniforms,
  reapplyWindSway,
  updateWindSway,
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
});
