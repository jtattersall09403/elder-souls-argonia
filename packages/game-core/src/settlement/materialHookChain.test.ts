import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { FixtureLightField } from "../render/fixtureLights";
import { applySettlementSurface, SETTLEMENT_GROUND_ATTRIBUTE } from "./materials";

/** What three hands onBeforeCompile for a MeshStandardMaterial. */
function compile(material: THREE.Material): { vertex: string; fragment: string } {
  const shader = {
    uniforms: {} as Record<string, THREE.IUniform>,
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
    defines: {},
  } as unknown as THREE.WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  return { vertex: shader.vertexShader, fragment: shader.fragmentShader };
}
const count = (text: string, needle: string) => text.split(needle).length - 1;

describe("settlement surface + fixture lights hook chain (review 2026-09-30)", () => {
  const uniforms = { esSettlementRain: { value: 0 }, esSettlementNight: { value: 0 }, esSettlementExposureInv: { value: 1 } };

  it("a settlement rebuild twice declares each patch once and never re-wraps", () => {
    const field = new FixtureLightField();
    const m = new THREE.MeshStandardMaterial();
    // build 1, then build 2 and 3: the settlement layer, then the lit preparer
    applySettlementSurface(m, uniforms, "flame"); field.install(m);
    const hook = m.onBeforeCompile;
    const version = m.version;
    for (let i = 0; i < 2; i++) { applySettlementSurface(m, uniforms, "flame"); field.install(m); }
    expect(m.onBeforeCompile).toBe(hook);
    expect(m.version).toBe(version); // no relink per rebuild
    const { vertex, fragment } = compile(m);
    expect(count(vertex, `attribute float ${SETTLEMENT_GROUND_ATTRIBUTE};`)).toBe(1);
    expect(count(fragment, "uniform float esSettlementRain;")).toBe(1);
    expect(count(fragment, "uniform highp sampler2D esFxData;")).toBe(1);
  });

  it("a glow change relinks with the new patch and no second wrap", () => {
    const m = new THREE.MeshStandardMaterial();
    applySettlementSurface(m, uniforms, "flame");
    const hook = m.onBeforeCompile;
    const key = m.customProgramCacheKey();
    applySettlementSurface(m, uniforms, "lamp-flame");
    expect(m.onBeforeCompile).toBe(hook);
    expect(m.customProgramCacheKey()).not.toBe(key);
    const { fragment } = compile(m);
    expect(count(fragment, "uniform float esSettlementRain;")).toBe(1);
    expect(fragment).toContain("* esSettlementNight, diffuseColor.a)"); // lamp-flame strength
  });

  it("clones with different glow patches get different program keys", () => {
    const field = new FixtureLightField();
    const base = new THREE.MeshStandardMaterial();
    applySettlementSurface(base, uniforms, "flame"); field.install(base);
    const lamp = base.clone(); // materialVariant
    applySettlementSurface(lamp, uniforms, "lamp-flame"); field.install(lamp);
    const other = base.clone();
    applySettlementSurface(other, uniforms, "flame"); field.install(other);
    expect(lamp.customProgramCacheKey()).not.toBe(base.customProgramCacheKey());
    expect(other.customProgramCacheKey()).toBe(base.customProgramCacheKey());
    expect(lamp.customProgramCacheKey()).toContain("es-fixture-lights-v1");
    expect(count(compile(lamp).fragment, "uniform highp sampler2D esFxData;")).toBe(1);
  });
});
