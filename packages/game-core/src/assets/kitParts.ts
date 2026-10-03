/**
 * A kit's PARTS (decision 0120): `kits/<kit>/parts/` holds one GLB per asset
 * (its root node and every LOD tier, materials, textures by URI into the
 * province-wide pool `kits/tex/<sha16>.ktx2`, one file per distinct texture
 * across all kits) and `index.json` mapping asset ids to files. Written by
 * `tooling/asset-pipeline/pipeline/kit_parts.mjs` at publish. The interior
 * loader and the settlement layer both fetch one part per (kit, asset) they
 * draw; a part GLB reads through `buildArchitectureKit` exactly like the
 * whole kit.
 */
import type { InteriorFireRow } from "../fx/fire/interiorFires";

/** 4: every kit ships only as parts, a part for every manifest asset; `source` is the raw build, `packed` the gltfpack GLB (0120). */
export const KIT_PARTS_SCHEMA_VERSION = 4;

/** A kit row of a published bundle: its id, its parts index path and its manifest path. */
export interface KitPartsRef { id: string; parts: string; manifest: string }

export interface KitPartLod { lod: number; vertices: number; triangles: number }

export interface KitPartRow {
  /** The part GLB, relative to the parts folder. */
  file: string;
  bytes: number;
  /** LOD0 counts. */
  vertices: number;
  triangles: number;
  /** Every tier the part holds, by `lod`. */
  lods: KitPartLod[];
  /** sha16 names of the pool files the part references. */
  textures: string[];
}

export interface KitPartsIndex {
  schemaVersion: typeof KIT_PARTS_SCHEMA_VERSION;
  kit: string;
  /** The raw build the parts were packed from. */
  source: { bytes: number; sha256: string };
  /** The gltfpack GLB the parts were cut from (never published). */
  packed: { bytes: number; sha256: string };
  assets: Record<string, KitPartRow>;
  /** The split assets that burn in an interior, their kit manifest rows reduced to the anchor fields. */
  fires: Record<string, InteriorFireRow>;
}

/** The parts folder of a kit: the directory of the bundle row's `parts` index path, with a trailing slash. */
export function kitPartsDir(ref: KitPartsRef): string {
  if (!ref.parts.endsWith("/index.json")) throw new Error(`kit ${ref.id}: parts path ${ref.parts} does not end in /index.json`);
  return ref.parts.slice(0, -"index.json".length);
}

/** Validate a fetched parts index; a wrong schema or kit is a named error. */
export function parseKitPartsIndex(raw: unknown, kitId: string, source: string): KitPartsIndex {
  const fail = (why: string): never => { throw new Error(`kit parts index ${source}: ${why}`); };
  const x = raw as Partial<KitPartsIndex> | null;
  if (!x || typeof x !== "object") fail("not an object");
  if (x!.schemaVersion !== KIT_PARTS_SCHEMA_VERSION) fail(`unsupported schemaVersion ${String(x!.schemaVersion)}`);
  if (x!.kit !== kitId) fail(`is for kit ${String(x!.kit)}, not ${kitId}`);
  if (!x!.assets || typeof x!.assets !== "object") fail("no assets map");
  if (!x!.fires || typeof x!.fires !== "object") fail("no fires map");
  for (const [id, row] of Object.entries(x!.assets!)) {
    if (typeof row?.file !== "string" || !row.file.endsWith(".glb")) fail(`${id}: no part file`);
    // Empty `lods`: a meshless asset (a plugin's trigger or dummy marker, e.g.
    // interior-farmhouse-v1 dummymace01); its part is the bare root node.
    if (!Array.isArray(row.lods)) fail(`${id}: no lods list`);
  }
  return x as KitPartsIndex;
}
