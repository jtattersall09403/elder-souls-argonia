/**
 * Render signatures: every distinct (vertex layout, material flags) a
 * published kit draws with, read from the GLB's JSON chunk alone (no
 * geometry or texture decode). The dist build bakes them into
 * `public/render-signatures.json` (scripts/bake-render-signatures.mjs) and
 * the boot precompiles one dummy draw per signature while the kits are still
 * fetching (precompileSignatures.ts; decision 0108 §2: a material is ready
 * before its first draw).
 *
 * Only what changes a pipeline or a node program is recorded: attribute
 * names, item size, component type and normalisation; whether the draw is
 * indexed; the material class (standard or unlit), which texture slots are
 * filled (presence, never content), alpha test on, blending on, double
 * sided, vertex colours, skinning, and the kit build's extras that change
 * the settlement graph (decal, additive, still water).
 *
 * No imports: the bake script runs this file under node's type stripping.
 */
export const RENDER_SIGNATURES_SCHEMA_VERSION = 1;

/** Kits drawn by the vegetation and groundcover layers' own instanced materials, not the settlement path. */
export const NON_SETTLEMENT_KITS: readonly string[] = ["flora-province-v1", "groundcover-province-v1"];

export interface SignatureAttribute {
  name: string;
  itemSize: number;
  /** glTF componentType (5120 i8, 5121 u8, 5122 i16, 5123 u16, 5125 u32, 5126 f32). */
  componentType: number;
  normalized: boolean;
}

export type SignatureMap = "map" | "normalMap" | "emissiveMap" | "metalRoughMap" | "aoMap";

export interface SignatureMaterial {
  kind: "standard" | "unlit";
  maps: SignatureMap[];
  alphaTest: boolean;
  transparent: boolean;
  doubleSided: boolean;
  vertexColors: boolean;
  decal: boolean;
  additive: boolean;
  water: boolean;
}

export interface RenderSignature {
  attributes: SignatureAttribute[];
  indexed: boolean;
  skinning: boolean;
  material: SignatureMaterial;
  /** Kit ids drawing with it. */
  kits: string[];
}

export interface RenderSignatures {
  schemaVersion: typeof RENDER_SIGNATURES_SCHEMA_VERSION;
  signatures: RenderSignature[];
}

interface GltfAccessor { componentType: number; type: string; normalized?: boolean }
interface GltfMaterial {
  pbrMetallicRoughness?: { baseColorTexture?: unknown; metallicRoughnessTexture?: unknown };
  normalTexture?: unknown; emissiveTexture?: unknown; occlusionTexture?: unknown;
  alphaMode?: string; doubleSided?: boolean;
  extensions?: Record<string, unknown>;
  extras?: { decal?: boolean; additive?: boolean; water?: boolean };
}
export interface GltfJson {
  accessors?: GltfAccessor[];
  materials?: GltfMaterial[];
  meshes?: { primitives: { attributes: Record<string, number>; indices?: number; material?: number; mode?: number }[] }[];
}

const ITEM_SIZE: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

/** three's GLTFLoader attribute names (GLTFLoader ATTRIBUTES). */
const THREE_NAME: Record<string, string> = {
  POSITION: "position", NORMAL: "normal", TANGENT: "tangent", TEXCOORD_0: "uv", TEXCOORD_1: "uv1",
  TEXCOORD_2: "uv2", TEXCOORD_3: "uv3", COLOR_0: "color", WEIGHTS_0: "skinWeight", JOINTS_0: "skinIndex",
};

/** The GLB's JSON chunk (the first chunk; the binary chunk is never read). */
export function glbJson(bytes: Uint8Array): GltfJson {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error("not a GLB (magic)");
  const length = view.getUint32(12, true);
  if (view.getUint32(16, true) !== 0x4e4f534a) throw new Error("GLB first chunk is not JSON");
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length))) as GltfJson;
}

function materialOf(m: GltfMaterial | undefined): SignatureMaterial {
  const pbr = m?.pbrMetallicRoughness;
  const maps: SignatureMap[] = [];
  if (pbr?.baseColorTexture) maps.push("map");
  if (m?.normalTexture) maps.push("normalMap");
  if (m?.emissiveTexture) maps.push("emissiveMap");
  if (pbr?.metallicRoughnessTexture) maps.push("metalRoughMap");
  if (m?.occlusionTexture) maps.push("aoMap");
  return {
    kind: m?.extensions?.KHR_materials_unlit ? "unlit" : "standard",
    maps,
    alphaTest: m?.alphaMode === "MASK",
    transparent: m?.alphaMode === "BLEND",
    doubleSided: m?.doubleSided === true,
    vertexColors: false,
    decal: m?.extras?.decal === true,
    additive: m?.extras?.additive === true,
    water: m?.extras?.water === true,
  };
}

/** One kit's distinct signatures (triangle primitives only), in first-seen order. */
export function kitSignatures(json: GltfJson, kit: string): RenderSignature[] {
  const out = new Map<string, RenderSignature>();
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives) {
      if (prim.mode !== undefined && prim.mode !== 4) continue;
      const attributes: SignatureAttribute[] = Object.entries(prim.attributes).map(([gltfName, index]) => {
        const a = json.accessors![index];
        return { name: THREE_NAME[gltfName] ?? gltfName.toLowerCase(), itemSize: ITEM_SIZE[a.type] ?? 1, componentType: a.componentType, normalized: a.normalized === true };
      }).sort((a, b) => a.name.localeCompare(b.name));
      const material = materialOf(prim.material === undefined ? undefined : json.materials?.[prim.material]);
      material.vertexColors = "COLOR_0" in prim.attributes;
      const sig: RenderSignature = { attributes, indexed: prim.indices !== undefined, skinning: "JOINTS_0" in prim.attributes, material, kits: [kit] };
      const key = signatureKey(sig);
      if (!out.has(key)) out.set(key, sig);
    }
  }
  return [...out.values()];
}

/** Identity of a signature (everything but its kits). */
export function signatureKey(sig: Omit<RenderSignature, "kits">): string {
  return JSON.stringify([sig.attributes, sig.indexed, sig.skinning, sig.material]);
}

/** Merge per-kit signatures into the baked file (kits sorted; signatures by key: deterministic). */
export function mergeSignatures(perKit: readonly RenderSignature[][]): RenderSignatures {
  const all = new Map<string, RenderSignature>();
  for (const list of perKit) for (const sig of list) {
    const key = signatureKey(sig);
    const have = all.get(key);
    if (have) { for (const k of sig.kits) if (!have.kits.includes(k)) have.kits.push(k); }
    else all.set(key, { ...sig, kits: [...sig.kits] });
  }
  const signatures = [...all.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, s]) => ({ ...s, kits: s.kits.sort() }));
  return { schemaVersion: RENDER_SIGNATURES_SCHEMA_VERSION, signatures };
}

/** Kit signatures the baked file lacks (keys): the staleness check. */
export function missingSignatures(baked: RenderSignatures, kitSigs: readonly RenderSignature[]): string[] {
  const have = new Set(baked.signatures.map(signatureKey));
  return kitSigs.map(signatureKey).filter((k) => !have.has(k));
}
