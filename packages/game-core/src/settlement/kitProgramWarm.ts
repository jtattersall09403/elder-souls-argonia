/**
 * Link every kit shader program at boot, before any part arrives (perf10
 * c14: the settlement build linked 19 programs AFTER the last mesh fetch,
 * 3.3 s of the scene-complete time on the RTX 3070).
 *
 * `public/kits/program-classes.json` (pipeline/program_classes.py, re-baked
 * by every kit refresh) lists the distinct program-deciding descriptors of
 * every published part: alpha mode, side, texture slots, extensions, the
 * runtime extras, the vertex layout. Each row's material is made by the SAME
 * factory the kit loader uses (three's GLTFLoader `loadMaterial` and
 * `assignFinalMaterial`, from a glTF stub of the row's material with 1x1
 * placeholder textures in its slots), on a one-triangle geometry with the
 * row's attributes, then given the settlement draw preparation
 * (`prepareSettlementColour`, `applySettlementSurface`) in every glow kind
 * the row can draw with. The meshes link through the layer's
 * DrawTargetLinker (the lit preparer's CSM and fixture-light patches, the
 * drawn target, `runFirstUse`), so each program's cache key is the real
 * draw's. The geometry and textures are freed after the link; the warm
 * materials are held until `release` (the layer's unmount), since three
 * destroys a program when the last material using it is disposed.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { DrawTargetLinker } from "../render/drawTargetLinker";
import {
  cloneSettlementMaterial, isSettlementGlowMaterial, prepareSettlementMaterial, SETTLEMENT_GROUND_ATTRIBUTE,
  type SettlementGlow, type SettlementMaterialUniforms,
} from "./materials";

export const PROGRAM_CLASSES_PATH = "kits/program-classes.json";
export const PROGRAM_CLASSES_SCHEMA_VERSION = 1;

/** One row of program-classes.json (program_classes.py `descriptor`). */
export interface KitProgramClass {
  family: "kit" | "vegetation";
  alphaMode: "OPAQUE" | "MASK" | "BLEND";
  doubleSided: boolean;
  /** three's slot names (`map`, `emissiveMap`, ...), `slot@n` for UV set n. */
  slots: string[];
  extensions: string[];
  extras: Record<string, unknown>;
  /** COLOR_0 width: 0 none, 3 colours, 4 colours with alpha. */
  color: 0 | 3 | 4;
  uvs: number[];
  normal: boolean;
  tangent: boolean;
  uses: number;
}

export function parseKitProgramClasses(raw: unknown): KitProgramClass[] {
  const doc = raw as { schemaVersion?: unknown; classes?: unknown };
  if (doc?.schemaVersion !== PROGRAM_CLASSES_SCHEMA_VERSION || !Array.isArray(doc.classes)) {
    throw new Error(`${PROGRAM_CLASSES_PATH}: schemaVersion ${String(doc?.schemaVersion)}, expected ${PROGRAM_CLASSES_SCHEMA_VERSION}`);
  }
  return doc.classes as KitProgramClass[];
}

const GLTF_SLOT: Record<string, string> = {
  map: "baseColorTexture", metalnessMap: "metallicRoughnessTexture", normalMap: "normalTexture",
  aoMap: "occlusionTexture", emissiveMap: "emissiveTexture",
};
const SRGB_SLOTS = new Set(["map", "emissiveMap"]);

/** The glTF material a row describes, its textures left out (placed after load). */
function stubMaterial(row: KitProgramClass): Record<string, unknown> {
  return {
    alphaMode: row.alphaMode, doubleSided: row.doubleSided,
    pbrMetallicRoughness: {},
    ...(row.extensions.length ? { extensions: Object.fromEntries(row.extensions.map((e) => [e, {}])) } : {}),
    ...(Object.keys(row.extras).length ? { extras: row.extras } : {}),
  };
}

function placeholder(slot: string, channel: number): THREE.Texture {
  const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  texture.colorSpace = SRGB_SLOTS.has(slot) ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.channel = channel;
  texture.needsUpdate = true;
  return texture;
}

/** A one-triangle geometry with the row's vertex layout (the attributes three's key reads) and the settlement ground line. */
export function warmGeometry(row: KitProgramClass): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const attr = (size: number) => new THREE.Float32BufferAttribute(new Float32Array(3 * size), size);
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0.01, 0, 0, 0, 0.01, 0], 3));
  if (row.normal) geometry.setAttribute("normal", attr(3));
  for (const n of row.uvs) geometry.setAttribute(n === 0 ? "uv" : `uv${n}`, attr(2));
  if (row.color) geometry.setAttribute("color", attr(row.color));
  if (row.tangent) geometry.setAttribute("tangent", attr(4));
  geometry.setAttribute(SETTLEMENT_GROUND_ATTRIBUTE, attr(1));
  return geometry;
}

/**
 * Each row's material as the kit loader makes it: GLTFLoader's own
 * `loadMaterial` from the row's glTF stub, placeholder textures in the
 * row's slots (as `assignTexture` sets them), then `assignFinalMaterial` on
 * a mesh with the row's attributes (vertex colours, flat shading).
 */
export async function loadWarmMeshes(rows: readonly KitProgramClass[]): Promise<THREE.Mesh[]> {
  const json = { asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [] }], materials: rows.map(stubMaterial) };
  const gltf = await new GLTFLoader().parseAsync(JSON.stringify(json), "");
  const { parser } = gltf;
  return Promise.all(rows.map(async (row, i) => {
    const material = await parser.getDependency("material", i) as THREE.MeshStandardMaterial;
    for (const entry of row.slots) {
      const [slot, uv] = entry.split("@");
      if (!GLTF_SLOT[slot]) continue;
      const texture = placeholder(slot, uv ? Number(uv) : 0);
      (material as unknown as Record<string, THREE.Texture>)[slot] = texture;
      if (slot === "metalnessMap") material.roughnessMap = texture;
    }
    material.needsUpdate = true;
    const mesh = new THREE.Mesh(warmGeometry(row), material);
    parser.assignFinalMaterial(mesh);
    return mesh;
  }));
}

/**
 * The preparation of one settlement draw material, as the layer's build
 * runs it per bucket: the scene's material patch, then
 * `prepareSettlementMaterial` (decal, additive card, still water, surface
 * features). Returns the draw flags.
 */
export function prepareSettlementColour(material: THREE.Material, uniforms: SettlementMaterialUniforms,
  glow: SettlementGlow, flame: boolean, materialPatch?: (material: THREE.Material) => void,
): { castShadow: boolean; renderOrder: number } {
  materialPatch?.(material);
  return prepareSettlementMaterial(material, uniforms, glow, flame);
}

/** The glow kinds a row's material can be drawn with (SettlementLayer's bucket rule). */
export function warmGlowKinds(material: THREE.Material): SettlementGlow[] {
  const kinds: SettlementGlow[] = [isSettlementGlowMaterial(material)];
  // a flame card (the manifest's own flame materials) is an additive card
  if (material.userData.additive === true) kinds.push("flame", "lamp-flame");
  // a lantern shell is an emissive part the manifest names
  if (isSettlementGlowMaterial(material)) kinds.push("lamp-shell");
  return kinds;
}

/** The settlement-family meshes to link, each material in each glow kind. */
export async function settlementWarmMeshes(rows: readonly KitProgramClass[], uniforms: SettlementMaterialUniforms,
  materialPatch?: (material: THREE.Material) => void): Promise<THREE.Mesh[]> {
  const loaded = await loadWarmMeshes(rows.filter((row) => row.family === "kit"));
  const out: THREE.Mesh[] = [];
  for (const mesh of loaded) {
    const base = mesh.material as THREE.Material;
    for (const glow of warmGlowKinds(base)) {
      const material = cloneSettlementMaterial(base);
      const flame = glow === "flame" || glow === "lamp-flame";
      prepareSettlementColour(material, uniforms, glow, flame, materialPatch);
      out.push(new THREE.Mesh(mesh.geometry, material));
    }
    base.dispose();
  }
  return out;
}

/** The proof numbers the GPU lane reads (`__STUDIO_GPU_MS__`). */
export interface KitProgramWarmReport {
  classes: number;
  /** Programs the warm added to three's cache. */
  programsWarmed: number;
  /** three's program cache keys when the warm finished. */
  keys: ReadonlySet<string>;
  ms: number;
  /** Cache keys of programs first linked after the warm finished (read live). */
  linkedAfter(): string[];
}

type ProgramInfo = { cacheKey: string };
/** The renderer's program cache keys (WebGPURenderer's info lists none: an empty set). */
export function programKeys(gl: { info: unknown }): Set<string> {
  return new Set(((gl.info as unknown as { programs?: ProgramInfo[] }).programs ?? []).map((p) => p.cacheKey));
}

/**
 * Fetch the list, build the meshes, link them through `linker` once its
 * scene pass is seen (the drawn target is then known), free their geometry
 * and textures. Resolves with the report and `release` (disposes the held
 * materials); null when aborted.
 */
export async function warmKitPrograms(options: {
  baseUrl: string; gl: { info: unknown }; linker: DrawTargetLinker; camera: THREE.Camera;
  uniforms: SettlementMaterialUniforms; materialPatch?: (material: THREE.Material) => void;
  /** Resolves once the layer-0 pass is observed (or its wait ran out). */
  observed: () => Promise<void>; signal?: AbortSignal; fetchFn?: typeof fetch;
}): Promise<{ report: KitProgramWarmReport; release: () => void } | null> {
  const start = performance.now();
  const response = await (options.fetchFn ?? fetch)(`${options.baseUrl}${PROGRAM_CLASSES_PATH}`, { signal: options.signal });
  if (!response.ok) throw new Error(`${PROGRAM_CLASSES_PATH}: HTTP ${response.status}`);
  const rows = parseKitProgramClasses(await response.json());
  const meshes = await settlementWarmMeshes(rows, options.uniforms, options.materialPatch);
  await options.observed();
  if (options.signal?.aborted) { freeWarm(meshes); releaseWarm(meshes); return null; }
  const before = programKeys(options.gl);
  const group = new THREE.Group();
  for (const mesh of meshes) group.add(mesh);
  try {
    await options.linker.compileAsync(group, options.camera);
  } finally {
    freeWarm(meshes);
  }
  const keys = programKeys(options.gl);
  let programsWarmed = 0;
  for (const key of keys) if (!before.has(key)) programsWarmed += 1;
  return {
    report: {
      classes: rows.length, programsWarmed, keys, ms: Math.round(performance.now() - start),
      linkedAfter: () => [...programKeys(options.gl)].filter((key) => !keys.has(key)),
    },
    release: () => releaseWarm(meshes),
  };
}

/** Free the placeholder geometry and textures; the materials keep their programs alive. */
function freeWarm(meshes: readonly THREE.Mesh[]): void {
  const geometries = new Set<THREE.BufferGeometry>();
  for (const mesh of meshes) {
    geometries.add(mesh.geometry);
    const material = mesh.material as THREE.MeshStandardMaterial;
    for (const slot of Object.keys(GLTF_SLOT)) (material as unknown as Record<string, THREE.Texture | null>)[slot]?.dispose();
  }
  for (const geometry of geometries) geometry.dispose();
}

/** Dispose the held warm materials (their programs go when no draw uses them). */
function releaseWarm(meshes: readonly THREE.Mesh[]): void {
  for (const mesh of meshes) (mesh.material as THREE.Material).dispose();
}
