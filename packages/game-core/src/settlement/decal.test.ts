/**
 * 16h check-in 3 §3: a kit material whose glTF record carries
 * `extras: { decal: true }` (the NIF DECAL / DYNAMIC_DECAL shader flags)
 * draws with a depth bias after its parent and casts no shadow.
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { buildArchitectureKit } from "./kit";
import {
  applySettlementDecal, isSettlementDecalMaterial, SETTLEMENT_DECAL_RENDER_ORDER,
  settlementMeshDrawFlags,
} from "./materials";

/** A two-material kit fixture as a GLB (embedded buffer, no fetch): one
 * wall asset, its skirting band and the coplanar grime overlay, as build_kit
 * exports them. */
function fixtureGlb(): ArrayBuffer {
  const bin = new Uint8Array(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer);
  const primitive = (material: number) => ({ attributes: { POSITION: 0 }, material });
  let json = JSON.stringify({
    asset: { version: "2.0" },
    buffers: [{ byteLength: bin.byteLength }],
    bufferViews: [{ buffer: 0, byteLength: bin.byteLength }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3",
      min: [0, 0, 0], max: [1, 1, 0] }],
    materials: [
      { name: "ImpWall06" },
      { name: "ImpDirt01", alphaMode: "MASK", alphaCutoff: 0.42, extras: { decal: true } },
    ],
    meshes: [{ primitives: [primitive(0)] }, { primitives: [primitive(1)] }],
    nodes: [
      { name: "impfreewall01", extras: { assetId: "impfreewall01" }, children: [1, 2] },
      { mesh: 0, extras: { lod: 0 } },
      { mesh: 1, extras: { lod: 0 } },
    ],
    scenes: [{ nodes: [0] }],
    scene: 0,
  });
  while (json.length % 4) json += " ";
  const text = new TextEncoder().encode(json);
  const total = 12 + 8 + text.byteLength + 8 + bin.byteLength;
  const out = new DataView(new ArrayBuffer(total));
  const bytes = new Uint8Array(out.buffer);
  out.setUint32(0, 0x46546c67, true); out.setUint32(4, 2, true); out.setUint32(8, total, true);
  out.setUint32(12, text.byteLength, true); out.setUint32(16, 0x4e4f534a, true);
  bytes.set(text, 20);
  const binAt = 20 + text.byteLength;
  out.setUint32(binAt, bin.byteLength, true); out.setUint32(binAt + 4, 0x004e4942, true);
  bytes.set(bin, binAt + 8);
  return out.buffer;
}

async function loadKit() {
  const gltf = await new GLTFLoader().parseAsync(fixtureGlb(), "") as GLTF;
  return buildArchitectureKit(gltf).get("impfreewall01")!.levels[0].map((part) => part.material);
}

describe("settlement decal materials", () => {
  it("reads the decal flag off the kit's glTF material record", async () => {
    const [band, grime] = await loadKit();
    expect(isSettlementDecalMaterial(band)).toBe(false);
    expect(isSettlementDecalMaterial(grime)).toBe(true);
  });

  it("biases the decal towards the camera, stops its depth writes and orders it after its parent", async () => {
    const [band, grime] = await loadKit();
    expect(applySettlementDecal(band)).toBe(false);
    expect(band.polygonOffset).toBe(false);
    expect(band.depthWrite).toBe(true);
    expect(settlementMeshDrawFlags(band)).toEqual({ castShadow: true, renderOrder: 0 });

    expect(applySettlementDecal(grime)).toBe(true);
    expect(grime.polygonOffset).toBe(true);
    expect(grime.polygonOffsetFactor).toBe(-1);
    expect(grime.polygonOffsetUnits).toBe(-1);
    expect(grime.depthWrite).toBe(false);
    expect(settlementMeshDrawFlags(grime)).toEqual({
      castShadow: false, renderOrder: SETTLEMENT_DECAL_RENDER_ORDER,
    });
    expect(SETTLEMENT_DECAL_RENDER_ORDER).toBeGreaterThan(settlementMeshDrawFlags(band).renderOrder);
    expect(grime).toBeInstanceOf(THREE.MeshStandardMaterial);
  });
});
