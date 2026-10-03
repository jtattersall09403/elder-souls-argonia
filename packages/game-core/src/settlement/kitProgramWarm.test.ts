/**
 * The boot program warm (kitProgramWarm.ts) is worth something only if each
 * warm material links the SAME program as the real draw. The real material
 * here is the shipped part GLB through GLTFLoader (meshopt geometry, KTX2
 * textures stood in, as greenspringDraws.test.ts does) given the layer's
 * draw preparation; the warm one is built from the baked class list
 * (pipeline/program_classes.py run on the published kits). No WebGL in
 * node, so the comparison is three's program-deciding parameters
 * (WebGLPrograms.getParameters' material and geometry inputs), the
 * surface glow kind and the node features the preparation marked.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { cloneSettlementMaterial, isSettlementGlowMaterial, settlementSurfaceOf, type SettlementMaterialUniforms } from "./materials";
import {
  parseKitProgramClasses, prepareSettlementColour, settlementWarmMeshes, warmGlowKinds,
} from "./kitProgramWarm";

const ROOT = resolve(import.meta.dirname, "../../../..");
const PUBLIC = resolve(ROOT, "apps/world-studio/public");
/** Kits that between them draw every settlement material kind: alpha
 * mask, blend, double sided, decal, additive flame cards, emissive windows,
 * still water, vertex colours with and without alpha. */
const KITS = ["camp-v1", "settlement-imperial-v1", "works-v1"];

(globalThis as { self?: unknown }).self ??= globalThis;
const ktx2Stub = {
  load(_url: string, onLoad: (t: THREE.Texture) => void) { onLoad(new THREE.CompressedTexture([], 4, 4)); },
  detectSupport() { return this; },
  dispose() { /* nothing */ },
};
async function loadPart(path: string): Promise<GLTF> {
  const bytes = readFileSync(path);
  await MeshoptDecoder.ready;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).setKTX2Loader(ktx2Stub as never);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Promise((done, fail) => loader.parse(buffer as ArrayBuffer, "", done, fail));
}

const uniforms: SettlementMaterialUniforms = {
  esSettlementRain: { value: 0 }, esSettlementNight: { value: 0 }, esSettlementExposureInv: { value: 1 },
};
const SLOTS = ["map", "emissiveMap", "normalMap", "aoMap", "roughnessMap", "metalnessMap", "alphaMap", "envMap"] as const;

/** What three's program key reads from a mesh's material and geometry. */
function programSignature(mesh: THREE.Mesh): string {
  const m = mesh.material as THREE.MeshStandardMaterial;
  const attrs = mesh.geometry.attributes;
  const slots = SLOTS.map((s) => {
    const t = (m as unknown as Record<string, THREE.Texture | null>)[s];
    return t ? `${s}@${t.channel}` : "";
  }).filter(Boolean);
  return JSON.stringify({
    type: m.type, side: m.side, alphaTest: m.alphaTest > 0, transparent: m.transparent,
    alphaToCoverage: m.alphaToCoverage, premultipliedAlpha: m.premultipliedAlpha,
    vertexColors: m.vertexColors, vertexAlphas: m.vertexColors && attrs.color?.itemSize === 4,
    flatShading: m.flatShading, fog: m.fog, dithering: m.dithering, toneMapped: m.toneMapped,
    slots, uv1: Boolean(attrs.uv1), uv2: Boolean(attrs.uv2), tangent: Boolean(attrs.tangent),
    surface: settlementSurfaceOf(m)?.glowMaterial ?? null,
    features: Object.keys(m.userData).filter((k) => k.startsWith("esNode_")).sort(),
  });
}

/** The real draw: the layer's preparation in the glow kind its bucket gets. */
function realSignatures(gltf: GLTF): string[] {
  const out: string[] = [];
  gltf.scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const material = cloneSettlementMaterial(mesh.material as THREE.Material);
    const flame = material.userData.additive === true;
    prepareSettlementColour(material, uniforms, flame ? "flame" : isSettlementGlowMaterial(material), flame);
    out.push(programSignature(new THREE.Mesh(mesh.geometry, material)));
  });
  return out;
}

describe("kit program warm", () => {
  it("builds the program of every real settlement draw from the baked class list", async () => {
    const text = execFileSync("python3", ["-c",
      "from pipeline.program_classes import bake, render; print(render(bake()), end='')"],
    { cwd: resolve(ROOT, "tooling/asset-pipeline"), encoding: "utf8" });
    const rows = parseKitProgramClasses(JSON.parse(text));
    const warm = new Set((await settlementWarmMeshes(rows, uniforms)).map(programSignature));
    const missing = new Set<string>();
    let draws = 0;
    for (const kit of KITS) {
      const dir = resolve(PUBLIC, "kits", kit, "parts");
      const index = JSON.parse(readFileSync(resolve(dir, "index.json"), "utf8")) as { assets: Record<string, { file: string }> };
      for (const row of Object.values(index.assets)) {
        for (const signature of realSignatures(await loadPart(resolve(dir, row.file)))) {
          draws += 1;
          if (!warm.has(signature)) missing.add(signature);
        }
      }
    }
    expect(draws).toBeGreaterThan(100);
    expect([...missing]).toEqual([]);
  }, 60_000);

  it("warms the flame and lantern-shell kinds a card or an emissive part can draw with", () => {
    const card = new THREE.MeshStandardMaterial();
    card.userData.additive = true;
    expect(warmGlowKinds(card)).toEqual([false, "flame", "lamp-flame"]);
    const lit = new THREE.MeshStandardMaterial({ emissiveMap: new THREE.Texture() });
    expect(warmGlowKinds(lit)).toEqual([true, "lamp-shell"]);
  });

  it("refuses a list of another schema", () => {
    expect(() => parseKitProgramClasses({ schemaVersion: 2, classes: [] })).toThrow(/schemaVersion 2/);
  });
});
