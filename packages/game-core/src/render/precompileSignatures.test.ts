import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { parseRenderSignatures, signatureDummies } from "./precompileSignatures";
import { createSettlementMaterialUniforms } from "../settlement/materials";
import { vertexLayoutKey } from "../settlement/lod";
import { SHADOW_CASTER_LAYER } from "./shadowCasters";
import type { RenderSignature } from "./renderSignatures";

const sig = (over: Partial<RenderSignature["material"]> = {}): RenderSignature => ({
  attributes: [
    { name: "color_1", itemSize: 4, componentType: 5121, normalized: true },
    { name: "normal", itemSize: 3, componentType: 5120, normalized: true },
    { name: "position", itemSize: 3, componentType: 5126, normalized: false },
    { name: "uv", itemSize: 2, componentType: 5126, normalized: false },
  ],
  indexed: true, skinning: false, kits: ["k"],
  material: { kind: "standard", maps: ["map"], alphaTest: false, transparent: false, doubleSided: false, vertexColors: false, decal: false, additive: false, water: false, ...over },
});

describe("signature dummies go through the kit and settlement paths", () => {
  it("node materials, merged shaded layout with the ground line, caster flags as the layer sets them", () => {
    const { group, dispose } = signatureDummies([sig(), sig({ additive: true }), sig({ decal: true })], createSettlementMaterialUniforms());
    const meshes = group.children as THREE.Mesh[];
    expect(meshes).toHaveLength(4); // the additive card compiles both flame kinds
    for (const m of meshes) {
      expect((m.material as { isNodeMaterial?: boolean }).isNodeMaterial).toBe(true);
      expect(vertexLayoutKey(m.geometry)).toBe("i|normal:Float32Array:3:0,position:Float32Array:3:0,uv:Float32Array:2:0");
      expect(m.geometry.getAttribute("esSettlementGroundY")).toBeTruthy();
    }
    expect(meshes[0].layers.isEnabled(SHADOW_CASTER_LAYER)).toBe(true);
    expect(meshes[1].layers.isEnabled(SHADOW_CASTER_LAYER)).toBe(false); // additive: no shadow
    expect(meshes[3].renderOrder).toBe(1); // decal
    dispose();
    expect(group.children).toHaveLength(0);
  });

  it("refuses another schemaVersion", () => {
    expect(() => parseRenderSignatures({ schemaVersion: 2, signatures: [] })).toThrow(/schemaVersion/);
  });
});
