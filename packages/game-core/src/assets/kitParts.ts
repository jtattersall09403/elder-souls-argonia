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

/** 3: rows carry every LOD tier (`lods`), textures live in the shared `kits/tex/` pool, `exterior` marks a whole-kit split (0120). */
export const KIT_PARTS_SCHEMA_VERSION = 3;

/** A kit row of a published bundle: its id and its whole-GLB path, whose stem names the parts folder. */
export interface KitPartsRef { id: string; glb: string }

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
  /** True when every asset of the kit is split, so exteriors draw from parts; false: only interior-drawn assets. */
  exterior: boolean;
  /** The whole published GLB the parts were cut from. */
  source: { bytes: number; sha256: string };
  assets: Record<string, KitPartRow>;
  /** The split assets that burn in an interior, their kit manifest rows reduced to the anchor fields. */
  fires: Record<string, InteriorFireRow>;
}

/** The parts folder of a kit, from the bundle's own GLB path (`<kit>.glb` -> `<kit>/parts/` beside it). */
export function kitPartsDir(ref: KitPartsRef): string {
  if (!ref.glb.endsWith(".glb")) throw new Error(`kit ${ref.id}: glb path ${ref.glb} does not end in .glb`);
  return `${ref.glb.slice(0, -".glb".length)}/parts/`;
}

/** Validate a fetched parts index; a wrong schema or kit is a named error. */
export function parseKitPartsIndex(raw: unknown, kitId: string, source: string): KitPartsIndex {
  const fail = (why: string): never => { throw new Error(`kit parts index ${source}: ${why}`); };
  const x = raw as Partial<KitPartsIndex> | null;
  if (!x || typeof x !== "object") fail("not an object");
  if (x!.schemaVersion !== KIT_PARTS_SCHEMA_VERSION) fail(`unsupported schemaVersion ${String(x!.schemaVersion)}`);
  if (x!.kit !== kitId) fail(`is for kit ${String(x!.kit)}, not ${kitId}`);
  if (typeof x!.exterior !== "boolean") fail("no exterior flag");
  if (!x!.assets || typeof x!.assets !== "object") fail("no assets map");
  if (!x!.fires || typeof x!.fires !== "object") fail("no fires map");
  for (const [id, row] of Object.entries(x!.assets!)) {
    if (typeof row?.file !== "string" || !row.file.endsWith(".glb")) fail(`${id}: no part file`);
    if (!Array.isArray(row.lods) || !row.lods.length) fail(`${id}: no lods`);
  }
  return x as KitPartsIndex;
}
