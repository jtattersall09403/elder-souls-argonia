/**
 * An additive effect card's gain is its NIF shape's emissive multiple, carried
 * as the glTF material extra `gain` (build_kit apply_additive_gains, 16k walk 4
 * FIRE rec 2): fxfirewithembers01's flame cards 1.6, the campfire's Glow:2 2.5.
 */
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { additiveGain, applySettlementSurface, flameOutputLine } from "./materials";

const uniforms = () => ({ esSettlementRain: { value: 0 }, esSettlementNight: { value: 1 }, esSettlementExposureInv: { value: 1 } });

describe("additive card gain", () => {
  it("reads the material extra `gain`, else the pre-format-3 default", () => {
    const card = new THREE.MeshStandardMaterial();
    card.userData = { additive: true, gain: 1.6 };
    expect(additiveGain(card)).toBe(1.6);
    expect(additiveGain(new THREE.MeshStandardMaterial())).toBe(1.5);
  });

  it("the card's output line multiplies by its own gain", () => {
    expect(flameOutputLine("flame")).toContain("diffuseColor.rgb * esSettlementFlameGain *");
    expect(flameOutputLine(false)).toBe("");
  });

  it("two cards with different gains share one program; the gain is a uniform", () => {
    const a = new THREE.MeshStandardMaterial(); a.userData = { additive: true, gain: 1.6 };
    const b = new THREE.MeshStandardMaterial(); b.userData = { additive: true, gain: 2.5 };
    const shared = uniforms();
    applySettlementSurface(a, shared, "flame");
    applySettlementSurface(b, shared, "flame");
    expect(a.customProgramCacheKey()).toBe(b.customProgramCacheKey());
    const shader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: "#include <common>\n#include <begin_vertex>",
      fragmentShader: "#include <common>\n#include <opaque_fragment>" } as unknown as THREE.WebGLProgramParametersWithUniforms;
    b.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.uniforms.esSettlementFlameGain.value).toBe(2.5);
  });

  it("re-applying the same surface relinks nothing; a new glow kind relinks once, without stacking", () => {
    const m = new THREE.MeshStandardMaterial(); m.userData = { additive: true, gain: 1.6 };
    const shared = uniforms();
    applySettlementSurface(m, shared, "flame");
    const version = m.version;
    const hook = m.onBeforeCompile;
    applySettlementSurface(m, shared, "flame");
    expect(m.version).toBe(version);
    expect(m.onBeforeCompile).toBe(hook);
    applySettlementSurface(m, shared, "lamp-flame");
    expect(m.version).toBe(version + 1);
    const shader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: "#include <common>\n#include <begin_vertex>",
      fragmentShader: "#include <common>\n#include <opaque_fragment>" } as unknown as THREE.WebGLProgramParametersWithUniforms;
    m.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.fragmentShader.match(/uniform float esSettlementFlameGain/g)).toHaveLength(1);
    expect(shader.fragmentShader).not.toContain("0.50 + 0.50");
  });
});
