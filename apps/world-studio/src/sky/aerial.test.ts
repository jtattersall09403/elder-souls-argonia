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

describe("the shared aerial block (perf10 f29)", () => {
  const fakeShader = () => ({
    uniforms: {} as Record<string, unknown>,
    vertexShader: "#include <common>\n#include <worldpos_vertex>",
    fragmentShader: "#include <common>\n#include <alphatest_fragment>\n#include <tonemapping_fragment>",
  });
  const compile = (m: THREE.Material) =>
    (m.onBeforeCompile as unknown as (s: unknown, r: unknown) => void)(fakeShader(), {});
  const groups = (m: THREE.Material) =>
    (m as THREE.Material & { uniformsGroups?: THREE.UniformsGroup[] }).uniformsGroups ?? [];

  it("binds the one shared block on a clone at compile time", () => {
    const u = createAerialUniforms();
    const std = new THREE.MeshStandardMaterial();
    const sh = new THREE.ShaderMaterial({ uniforms: {}, vertexShader: "", fragmentShader: "" });
    applyAerialPerspective(std, u);
    applyAerialPerspective(sh, u);
    for (const original of [std, sh]) {
      const clone = original.clone();
      clone.onBeforeCompile = original.onBeforeCompile;
      compile(clone);
      const g = groups(clone);
      expect(g.includes(u.block)).toBe(true);
      expect(g.filter((x) => (x as { name?: string }).name === "EsAerial")).toEqual([u.block]);
    }
  });

  it("replaces a cloned EsAerial group and keeps other groups", () => {
    const u = createAerialUniforms();
    const sh = new THREE.ShaderMaterial({ uniforms: {}, vertexShader: "", fragmentShader: "" });
    const other = new THREE.UniformsGroup();
    other.setName("Other");
    const stale = new THREE.UniformsGroup();
    stale.setName("EsAerial");
    sh.uniformsGroups = [stale, other];
    applyAerialPerspective(sh, u);
    compile(sh);
    expect(groups(sh)).toContain(u.block);
    expect(groups(sh)).toContain(other);
    expect(groups(sh)).not.toContain(stale);
  });

  it("lays the block out on std140 offsets matching the GLSL text order (144 B)", () => {
    const wide = new Set(["uWhiteout"]);
    const v3 = new Set(["uSunDirW", "uHazeSunLight", "uHazeAmbient", "uBetaR", "uFogLum", "uFogSunLum", "uEsFogCam"]);
    const spec = (n: string): [number, number] =>
      wide.has(n) ? [16, 16] : v3.has(n) ? [16, 12] : n === "uWhiteoutDrift" ? [8, 8] : [4, 4];
    let off = 0;
    const offsets: Record<string, number> = {};
    for (const name of AERIAL_BLOCK_MEMBERS) {
      const [align, bytes] = spec(name);
      off = Math.ceil(off / align) * align;
      offsets[name] = off;
      off += bytes;
    }
    expect(Math.ceil(off / 16) * 16).toBe(144);
    const body = /uniform EsAerial \{([^}]*)\}/.exec(AERIAL_PARS_GLSL)![1];
    const decls = [...body.matchAll(/(vec4|vec3|vec2|float)\s+(\w+);/g)];
    expect(decls.map((m) => m[2])).toEqual([...AERIAL_BLOCK_MEMBERS]);
    let o = 0;
    for (const m of decls) {
      const [a, b] = m[1] === "vec4" ? [16, 16] : m[1] === "vec3" ? [16, 12] : m[1] === "vec2" ? [8, 8] : [4, 4];
      o = Math.ceil(o / a) * a;
      expect(offsets[m[2]]).toBe(o);
      o += b;
    }
  });
});
