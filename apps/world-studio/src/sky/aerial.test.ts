import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  AERIAL_VARYING_VERTEX,
  applyAerialPerspective,
  createAerialUniforms,
} from "./aerial";

describe("the aerial varying's placement branches (decision 0082 round 2)", () => {
  it("transforms by instanceMatrix AND by batchingMatrix", () => {
    expect(AERIAL_VARYING_VERTEX).toContain("#ifdef USE_INSTANCING");
    expect(AERIAL_VARYING_VERTEX).toContain("instanceMatrix * esWp");
    expect(AERIAL_VARYING_VERTEX).toContain("#elif defined(USE_BATCHING)");
    expect(AERIAL_VARYING_VERTEX).toContain("batchingMatrix * esWp");
  });

  it("injects both branches into a patched material's vertex shader", () => {
    const material = new THREE.MeshStandardMaterial();
    applyAerialPerspective(material, createAerialUniforms());
    const shader = {
      uniforms: {},
      vertexShader: "#include <common>\nvoid main(){\n#include <worldpos_vertex>\n}",
      fragmentShader: "#include <common>\n#include <tonemapping_fragment>",
    };
    material.onBeforeCompile(
      shader as unknown as THREE.WebGLProgramParametersWithUniforms,
      null as unknown as THREE.WebGLRenderer,
    );
    expect(shader.vertexShader).toContain("#ifdef USE_INSTANCING");
    expect(shader.vertexShader).toContain("#elif defined(USE_BATCHING)");
    expect(shader.vertexShader).toContain("batchingMatrix");
  });

  it("appends its cache key and wraps only once", () => {
    const material = new THREE.MeshStandardMaterial();
    applyAerialPerspective(material, createAerialUniforms());
    applyAerialPerspective(material, createAerialUniforms());
    const key = material.customProgramCacheKey();
    // Appended (three's default key is the onBeforeCompile source, which the
    // other patches also contribute to), and appended once.
    expect(key.endsWith("|es-aerial")).toBe(true);
    expect(key.split("|es-aerial").length - 1).toBe(1);
    expect(key.length).toBeGreaterThan("|es-aerial".length);
  });
});
