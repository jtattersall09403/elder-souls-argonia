/**
 * Settlement draws on the PUBLISHED Greenspring bundle (perf10 c9 F39,
 * standard 14): the shipped place and its shipped kits (meshopt geometry,
 * KTX2 textures stood in by empty textures carrying the kit's own image
 * records) go through the layer's own bucket-to-batch step at the perf spot.
 * The instanced path drew one object per (asset, part, chunk) bucket: 267
 * here, which fails the bound below.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { addToBatch, drawBatchKey, drawCellOf, settlementChunkKey, type DrawBatch } from "./SettlementLayer";
import { buildArchitectureKit, kitAssetMetaFromManifest } from "./kit";
import { mergeTransformedParts } from "./lod";
import { placementTransform } from "./anchoring";
import { settlementMeshDrawFlags } from "./materials";
import { SettlementMaterialIdentities, settlementMaterialIdentity } from "./materialIdentity";
import { isFlameCardMaterial } from "../fx/fire/flameAnchors";
import type { SettlementBundle } from "./types";

const ROOT = resolve(import.meta.dirname, "../../../..");
const PUBLIC = resolve(ROOT, "apps/world-studio/public");
const bundle = JSON.parse(readFileSync(resolve(PUBLIC,
  "province/settlements/place.hist-heartland.greenspring.json"), "utf8")) as SettlementBundle;
/** The perf spot (perf-diag20 D2): x=4.7789 km, z=1.9 km. */
const FOCUS = { x: 4778.9, z: 1900 };

(globalThis as { self?: unknown }).self ??= globalThis;
const ktx2Stub = {
  load(_url: string, onLoad: (t: THREE.Texture) => void) { onLoad(new THREE.CompressedTexture([], 4, 4)); },
  detectSupport() { return this; },
  dispose() { /* nothing */ },
};
async function loadKit(glb: string): Promise<GLTF> {
  const bytes = readFileSync(resolve(PUBLIC, glb));
  await MeshoptDecoder.ready;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).setKTX2Loader(ktx2Stub as never);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Promise((done, fail) => loader.parse(buffer as ArrayBuffer, "", done, fail));
}

describe("Greenspring settlement draws (published bundle)", () => {
  it("draws one object per material identity per cell, every triangle kept, bounds over every piece", async () => {
    const used = new Set(bundle.placements.map((p) => p.kit));
    const kits = new Map<string, ReturnType<typeof buildArchitectureKit>>();
    const metas = new Map<string, ReturnType<typeof kitAssetMetaFromManifest>>();
    for (const id of used) {
      const kit = bundle.kits[id];
      kits.set(id, buildArchitectureKit(await loadKit(kit.glb)));
      metas.set(id, kitAssetMetaFromManifest(JSON.parse(readFileSync(resolve(PUBLIC, kit.manifest), "utf8")), kit.manifest));
    }
    const identities = new SettlementMaterialIdentities();
    const buckets = new Set<string>();
    const identityCells = new Set<string>();
    const batches = new Map<string, DrawBatch>();
    const pieceBoxes = new Map<string, THREE.Box3>();
    let triangles = 0;
    for (const placement of bundle.placements) {
      const asset = kits.get(placement.kit)?.get(placement.assetId);
      if (!asset) continue;
      const meta = metas.get(placement.kit)?.get(placement.assetId);
      const transform = placementTransform(placement, placement.positionM[1]);
      const chunk = settlementChunkKey(placement.positionM[0], placement.positionM[2]);
      const cell = drawCellOf(chunk, FOCUS);
      asset.levels[0].forEach((part, partIndex) => {
        if (isFlameCardMaterial(meta, part.material.name)) return;
        buckets.add(`${placement.kit}|${placement.assetId}|0|${partIndex}|${chunk}`);
        const material = identities.of(part.material);
        identityCells.add(`${settlementMaterialIdentity(part.material) ?? part.material.uuid}|${cell}`);
        const flags = settlementMeshDrawFlags(material);
        const key = drawBatchKey(material, part.geometry, cell, flags);
        const matrix = transform.clone().multiply(part.localMatrix);
        addToBatch(batches, key, {
          material, drawFlags: flags, far: false, signature: placement.id,
          entry: { geometry: part.geometry, transforms: [matrix], groundLinesM: [0] },
        });
        // the piece's own vertices, placed: the batch's bounds must equal their union
        const box = pieceBoxes.get(key) ?? new THREE.Box3();
        const position = part.geometry.getAttribute("position");
        const point = new THREE.Vector3();
        for (let i = 0; i < position.count; i += 1) box.expandByPoint(point.fromBufferAttribute(position, i).applyMatrix4(matrix));
        pieceBoxes.set(key, box);
        triangles += part.triangles;
      });
    }
    let mergedTriangles = 0; let vertices = 0;
    for (const [key, batch] of batches) {
      const merged = mergeTransformedParts(batch.entries)!;
      mergedTriangles += (merged.index ? merged.index.count : merged.getAttribute("position").count) / 3;
      vertices += merged.getAttribute("position").count;
      merged.computeBoundingBox();
      const want = pieceBoxes.get(key)!;
      for (const axis of ["x", "y", "z"] as const) {
        expect(merged.boundingBox!.min[axis]).toBeLessThanOrEqual(want.min[axis] + 0.05);
        expect(merged.boundingBox!.max[axis]).toBeGreaterThanOrEqual(want.max[axis] - 0.05);
        expect(merged.boundingBox!.min[axis]).toBeGreaterThanOrEqual(want.min[axis] - 0.05);
        expect(merged.boundingBox!.max[axis]).toBeLessThanOrEqual(want.max[axis] + 0.05);
      }
      merged.dispose();
    }
    console.info(`greenspring LOD0: buckets ${buckets.size}, draw objects ${batches.size}, `
      + `identity cells ${identityCells.size}, materials ${identities.size}, tris ${triangles}, merged verts ${vertices}`);
    expect(batches.size).toBeLessThanOrEqual(identityCells.size);
    // the per-bucket instanced path fails this
    expect(buckets.size).toBeGreaterThan(identityCells.size);
    expect(batches.size).toBeLessThan(buckets.size * 0.6);
    expect(mergedTriangles).toBe(triangles);
  }, 120_000);
});
