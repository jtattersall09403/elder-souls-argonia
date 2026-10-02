import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  AERIAL_BLOCK_MEMBERS,
  AERIAL_PARS_GLSL,
  AERIAL_VARYING_VERTEX,
  applyAerialPerspective,
  createAerialUniforms,
} from "./aerial";

describe("the aerial varying's placement branch (decision 0082 round 2)", () => {
  it("transforms by instanceMatrix", () => {
    expect(AERIAL_VARYING_VERTEX).toContain("#ifdef USE_INSTANCING");
    expect(AERIAL_VARYING_VERTEX).toContain("instanceMatrix * esWp");
  });

  it("injects the branch into a patched material's vertex shader", () => {
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
    expect(shader.vertexShader).toContain("instanceMatrix");
  });

  it("carries the per-frame set in one std140 block, the rasters as uniforms (perf10 f27)", () => {
    const u = createAerialUniforms();
    // block order = the GLSL block's member order (std140 offsets)
    expect((u.block as unknown as { name: string }).name).toBe("EsAerial");
    expect(u.block.uniforms).toEqual(AERIAL_BLOCK_MEMBERS.map((n) => u[n]));
    const glsl = AERIAL_PARS_GLSL.slice(AERIAL_PARS_GLSL.indexOf("uniform EsAerial"), AERIAL_PARS_GLSL.indexOf("};"));
    expect([...glsl.matchAll(/(\w+);/g)].map((m) => m[1])).toEqual([...AERIAL_BLOCK_MEMBERS]);
    const material = new THREE.MeshStandardMaterial();
    applyAerialPerspective(material, u);
    expect((material as unknown as { uniformsGroups: unknown[] }).uniformsGroups).toEqual([u.block]);
    const shader = { uniforms: {} as Record<string, unknown>, vertexShader: "", fragmentShader: "" };
    material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, null as unknown as THREE.WebGLRenderer);
    expect(Object.keys(shader.uniforms).sort()).toEqual(["uClimateAir", "uClimateVis", "uClimateWeather"]);
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
