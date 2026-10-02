import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createKitPieceMaterial, createKitSharedUniforms, ensureKitVertexColours } from "./WaterfallKitMaterial";
import type { KitShapeRole } from "./WaterfallKit";

const role = { kind: "sheet", match: "foam", scroll: [0, 0.1], emissive: 1, alpha: 1,
  softDepthM: 0.5, upness: 0.5 } as unknown as KitShapeRole;

describe("WaterfallKitMaterial vertex colour", () => {
  it("reads COLOR_1 into the tone and COLOR_2.r into the alpha", () => {
    const m = createKitPieceMaterial(role, null, null, createKitSharedUniforms(), () => {});
    expect(m.vertexShader).toMatch(/attribute vec4 color_1;/);
    expect(m.vertexShader).toMatch(/attribute vec4 color_2;/);
    expect(m.fragmentShader).toMatch(/tone \*= vTint;/);
    expect(m.fragmentShader).toMatch(/vVertA \* vInst\.w/);
    // one program for every shape: no define per attribute presence
    expect(m.defines).toEqual({});
    expect(m.customProgramCacheKey()).toBe("es-waterfall-kit");
  });

  it("fills an absent layer with ones and keeps a present one", () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(9), 3));
    const tint = new THREE.BufferAttribute(new Float32Array(12).fill(0.2), 4);
    g.setAttribute("color_1", tint);
    ensureKitVertexColours(g);
    expect(g.getAttribute("color_1")).toBe(tint);
    const a = g.getAttribute("color_2");
    expect(a.count).toBe(3);
    expect(Array.from(a.array as Float32Array).every((v) => v === 1)).toBe(true);
  });
});
