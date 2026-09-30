import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { applyLanternShell, FIXTURE_LIGHT_RGB, isLanternShellMaterial, LANTERN_SHELL_GAIN, lanternShellEmissive } from "./fixtureGlow";
import { applySettlementSurface } from "./materials";

const flagged = (flags: string) => {
  const m = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
  m.userData.pyn_shader = { Shader_Flags_1: flags };
  return m;
};
const lantern = { light: { fixtureKind: "lantern" } };

describe("lantern shell", () => {
  it("is an OWN_EMIT material on a lantern piece only", () => {
    const own = flagged("SPECULAR | RECEIVE_SHADOWS | OWN_EMIT | ZBUFFER_TEST");
    expect(isLanternShellMaterial(own, lantern)).toBe(true);
    expect(isLanternShellMaterial(own, { light: { fixtureKind: "brazier" } })).toBe(false);
    expect(isLanternShellMaterial(own, undefined)).toBe(false);
    expect(isLanternShellMaterial(flagged("SPECULAR | CAST_SHADOWS"), lantern)).toBe(false);
    expect(isLanternShellMaterial(new THREE.MeshStandardMaterial(), lantern)).toBe(false);
  });

  it("glows the fixture colour x gain, modulated by its own diffuse", () => {
    const want = new THREE.Color().setRGB(FIXTURE_LIGHT_RGB[0] / 255, FIXTURE_LIGHT_RGB[1] / 255,
      FIXTURE_LIGHT_RGB[2] / 255, THREE.SRGBColorSpace).multiplyScalar(LANTERN_SHELL_GAIN);
    const m = flagged("OWN_EMIT");
    applyLanternShell(m);
    expect(m.emissive.r).toBeCloseTo(want.r, 6);
    expect(m.emissive.b).toBeCloseTo(want.b, 6);
    expect(m.emissive.r).toBeGreaterThan(m.emissive.g);
    expect(m.emissiveMap).toBe(m.map);
    expect(lanternShellEmissive(2).r).toBeCloseTo(want.r * 2 / LANTERN_SHELL_GAIN, 6);
  });

  it("is keyed by its glow kind on the lamp clock, patched before the first draw", () => {
    const m = flagged("OWN_EMIT");
    const uniforms = { esSettlementRain: { value: 0 }, esSettlementNight: { value: 1 } };
    applySettlementSurface(m, uniforms, "lamp-shell");
    expect(m.emissiveMap).toBe(m.map);
    const shader = {
      uniforms: {} as Record<string, unknown>,
      vertexShader: "#include <common>\n#include <begin_vertex>",
      fragmentShader: "#include <common>\n#include <emissivemap_fragment>",
    };
    m.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    expect(shader.fragmentShader).toContain("totalEmissiveRadiance *= esSettlementNight;");
    expect(m.customProgramCacheKey()).toMatch(/\|4\|colour$/);
  });
});
