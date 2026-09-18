import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  applyCylindricalBillboard,
  billboardRightVector,
  reapplyCylindricalBillboard,
} from "./billboardQuad";
import { applyLodFade, createLodFadeUniforms } from "./lodFade";

describe("billboardRightVector", () => {
  it("is perpendicular to the view direction and unit length", () => {
    for (const [vx, vz] of [[1, 0], [0, 1], [-3, 4], [7, -2]] as const) {
      const [rx, rz] = billboardRightVector(vx, vz);
      expect(Math.hypot(rx, rz)).toBeCloseTo(1, 6);
      expect(rx * vx + rz * vz).toBeCloseTo(0, 6);
    }
  });

  it("turns with the viewer: a viewer to the north gives a west-east card", () => {
    const north = billboardRightVector(0, -10);
    expect(north[0]).toBeCloseTo(-1, 6);
    expect(north[1]).toBeCloseTo(0, 6);
    const south = billboardRightVector(0, 10);
    expect(south[0]).toBeCloseTo(1, 6);
    expect(south[1]).toBeCloseTo(0, 6);
  });

  it("falls back to world +X when the viewer is directly overhead", () => {
    expect(billboardRightVector(0, 0)).toEqual([1, 0]);
  });
});

function compile(material: THREE.Material): { vertexShader: string; uniforms: Record<string, unknown> } {
  const shader = {
    vertexShader: "void main() {\n#include <begin_vertex>\n}",
    fragmentShader: "void main() {\n}",
    uniforms: {} as Record<string, unknown>,
  };
  material.onBeforeCompile(shader as never, null as never);
  return shader;
}

describe("applyCylindricalBillboard", () => {
  it("injects once and binds the shared view uniform", () => {
    const uniforms = createLodFadeUniforms();
    const material = new THREE.MeshStandardMaterial();
    applyCylindricalBillboard(material, uniforms);
    applyCylindricalBillboard(material, uniforms); // idempotent
    const shader = compile(material);
    expect(shader.vertexShader.split("esBillboardRight(vec2 v)").length - 1).toBe(1);
    expect(shader.vertexShader.split("uniform vec3 esLodViewPos;").length - 1).toBe(1);
    expect(shader.uniforms.esLodViewPos).toBe(uniforms.esLodViewPos);
    expect(material.customProgramCacheKey()).toContain("|es-bbq");
  });

  it("declares the view uniform once when the LOD fade is installed too", () => {
    const uniforms = createLodFadeUniforms();
    const material = new THREE.MeshStandardMaterial();
    applyLodFade(material, uniforms);
    applyCylindricalBillboard(material, uniforms);
    const shader = compile(material);
    expect(shader.vertexShader.split("uniform vec3 esLodViewPos;").length - 1).toBe(1);
    // Both injections are present: the fade must survive the billboard patch.
    expect(shader.vertexShader).toContain("vEsLod");
    expect(shader.vertexShader).toContain("esBillboardRight");
  });

  it("re-installs after an overwrite, and is a no-op otherwise", () => {
    const uniforms = createLodFadeUniforms();
    const material = new THREE.MeshStandardMaterial();
    applyCylindricalBillboard(material, uniforms);
    const installed = material.onBeforeCompile;
    reapplyCylindricalBillboard(material);
    expect(material.onBeforeCompile).toBe(installed);
    material.onBeforeCompile = () => undefined; // what csm.setupMaterial does
    reapplyCylindricalBillboard(material);
    expect(compile(material).vertexShader).toContain("esBillboardRight");
  });

  it("ignores materials it never patched", () => {
    const material = new THREE.MeshStandardMaterial();
    const before = material.onBeforeCompile;
    reapplyCylindricalBillboard(material);
    expect(material.onBeforeCompile).toBe(before);
  });
});
