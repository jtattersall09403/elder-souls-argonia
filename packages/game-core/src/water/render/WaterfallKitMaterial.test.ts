import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { readFileSync } from "node:fs";
import { createKitPieceMaterial, createKitSharedUniforms, ensureKitVertexColours, KIT_VERTEX_COLOUR_ATTRIBUTES } from "./WaterfallKitMaterial";
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

  // perf10 F37b: the PUBLISHED kit the studio loads keeps the edge alpha the shader reads: COLOR_1/COLOR_2
  // (GLTFLoader: color_1/color_2), uncompressed, and COLOR_2 reaches 0 on the sheet edges.
  it("the published kit GLB carries COLOR_2 edge alpha under the names the shader reads", () => {
    const b = readFileSync(new URL("../../../../../apps/world-studio/public/kits/waterfall-fx-v1.glb", import.meta.url));
    const n = b.readUInt32LE(12);
    const j = JSON.parse(b.subarray(20, 20 + n).toString("utf8"));
    const bin = b.subarray(20 + n + 8);
    expect(j.extensionsUsed ?? []).not.toContain("EXT_meshopt_compression");
    let sheets = 0;
    for (const m of j.meshes) for (const p of m.primitives) {
      for (const a of Object.keys(p.attributes).filter((k) => /^COLOR_[12]$/.test(k))) {
        expect(KIT_VERTEX_COLOUR_ATTRIBUTES).toContain(a.toLowerCase());
      }
      if (p.attributes.COLOR_2 == null) continue;
      const ac = j.accessors[p.attributes.COLOR_2], bv = j.bufferViews[ac.bufferView];
      expect(ac.componentType).toBe(5123);
      const at = (bv.byteOffset ?? 0) + (ac.byteOffset ?? 0), st = bv.byteStride ?? 8;
      let min = 1;
      for (let i = 0; i < ac.count; i++) min = Math.min(min, bin.readUInt16LE(at + i * st) / 65535);
      if (min < 0.01) sheets++;
    }
    // 59 of the 65 shapes carry COLOR_2; 57 feather to 0 (two rapids foam pieces bottom out near 0.2)
    expect(sheets).toBeGreaterThanOrEqual(50);
  });
});
