import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  applyLodFade,
  createLodFadeUniforms,
  lodEmissions,
  reapplyLodFade,
  LOD_BAND_M,
  LOD_OVERLAP_M,
} from "./lodFade";

const RINGS = [60, 140, 260];
const MAX_DRAW = 700;

describe("lodEmissions", () => {
  it("emits one copy well away from any boundary", () => {
    const emissions = lodEmissions(100, RINGS, MAX_DRAW);
    expect(emissions).toHaveLength(1);
    expect(emissions[0].level).toBe(1);
    expect(emissions[0].band).toEqual([60, 140, LOD_BAND_M, LOD_BAND_M]);
  });

  it("level 0 never fades in (dIn 0 reads as already visible)", () => {
    const [only] = lodEmissions(5, RINGS, MAX_DRAW);
    expect(only.level).toBe(0);
    expect(only.band[0]).toBe(0);
  });

  it("emits two complementary copies inside the overlap below a ring", () => {
    const emissions = lodEmissions(140 - LOD_OVERLAP_M + 1, RINGS, MAX_DRAW);
    expect(emissions.map((e) => e.level).sort()).toEqual([1, 2]);
    const inner = emissions.find((e) => e.level === 1)!;
    const outer = emissions.find((e) => e.level === 2)!;
    // The inner copy fades OUT across exactly the ring the outer fades IN
    // across, with the same half-width: complementary smoothsteps.
    expect(inner.band[1]).toBe(140);
    expect(outer.band[0]).toBe(140);
    expect(inner.band[3]).toBe(outer.band[2]);
  });

  it("emits two copies inside the overlap above a ring", () => {
    const emissions = lodEmissions(60 + LOD_OVERLAP_M - 1, RINGS, MAX_DRAW);
    expect(emissions.map((e) => e.level).sort()).toEqual([0, 1]);
  });

  it("the last level fades out at the draw distance, wider", () => {
    const [last] = lodEmissions(400, RINGS, MAX_DRAW);
    expect(last.level).toBe(3);
    expect(last.band[1]).toBe(MAX_DRAW);
    expect(last.band[3]).toBe(8);
  });

  it("never emits a level outside the chain", () => {
    for (let d = 0; d <= MAX_DRAW; d += 3) {
      for (const emission of lodEmissions(d, RINGS, MAX_DRAW)) {
        expect(emission.level).toBeGreaterThanOrEqual(0);
        expect(emission.level).toBeLessThanOrEqual(RINGS.length);
      }
    }
  });
});

describe("applyLodFade", () => {
  const compile = (material: THREE.Material) => {
    const shader = {
      uniforms: {} as Record<string, unknown>,
      vertexShader: "void main() {\n#include <begin_vertex>\n}",
      fragmentShader: "void main() {\n#include <alphatest_fragment>\n}",
    };
    material.onBeforeCompile(
      shader as unknown as THREE.WebGLProgramParametersWithUniforms,
      null as unknown as THREE.WebGLRenderer,
    );
    return shader;
  };

  it("injects the band into the vertex shader and the discard before any texture fetch", () => {
    const material = new THREE.MeshStandardMaterial();
    const uniforms = createLodFadeUniforms();
    applyLodFade(material, uniforms);
    const shader = compile(material);
    expect(shader.vertexShader).toContain("esLodBand");
    // A fully faded copy is collapsed to zero-area triangles, not just
    // discarded per fragment.
    expect(shader.vertexShader).toContain("transformed = vec3(0.0)");
    expect(shader.uniforms.esLodViewPos).toBe(uniforms.esLodViewPos);
    // FIRST statement in main(): a rejected fragment must not sample a map.
    const main = shader.fragmentShader.indexOf("void main() {");
    const discard = shader.fragmentShader.indexOf("discard");
    const alphaTest = shader.fragmentShader.indexOf("#include <alphatest_fragment>");
    expect(discard).toBeGreaterThan(main);
    expect(discard).toBeLessThan(alphaTest);
    expect(
      shader.fragmentShader
        .slice(main + "void main() {".length, shader.fragmentShader.indexOf("if (vEsLod"))
        .trim(),
    ).toBe("");
  });

  it("never patches twice, and survives an onBeforeCompile overwrite", () => {
    const material = new THREE.MeshStandardMaterial();
    const uniforms = createLodFadeUniforms();
    applyLodFade(material, uniforms);
    applyLodFade(material, uniforms);
    material.onBeforeCompile = () => undefined; // what CSM does
    reapplyLodFade(material);
    const shader = compile(material);
    expect(shader.vertexShader.match(/varying float vEsLod/g)).toHaveLength(1);
    expect(material.customProgramCacheKey()).toContain("|es-lod");
  });

  it("is a no-op on a material it never touched", () => {
    const material = new THREE.MeshStandardMaterial();
    const before = material.onBeforeCompile;
    reapplyLodFade(material);
    expect(material.onBeforeCompile).toBe(before);
  });
});
