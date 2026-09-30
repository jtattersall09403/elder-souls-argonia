/**
 * A kit's PARTS folder (16k walk 4): beside every published kit GLB,
 * `kits/<kit>/parts/` holds one GLB per asset (its LOD0 meshes and
 * materials, textures by URI into `parts/tex/<sha16>.ktx2`, each texture one
 * file per kit) and `index.json` mapping asset ids to files. Written by
 * `tooling/asset-pipeline/pipeline/kit_parts.mjs` from the published GLB.
 * The interior loader fetches only the parts its cell names; the settlement
 * layer keeps loading whole kits.
 */
import type { InteriorKitRef } from "./bundle";
import type { InteriorFireRow } from "../fx/fire/interiorFires";

/** 2: the index carries `fires` (walk 6), so the interior loader never fetches the kit manifest. */
export const KIT_PARTS_SCHEMA_VERSION = 2;

export interface KitPartRow {
  /** The part GLB, relative to the parts folder. */
  file: string;
  bytes: number;
  vertices: number;
  triangles: number;
  /** sha16 names of the `tex/` files the part references. */
  textures: string[];
}

export interface KitPartsIndex {
  schemaVersion: typeof KIT_PARTS_SCHEMA_VERSION;
  kit: string;
  /** The whole published GLB the parts were cut from. */
  source: { bytes: number; sha256: string };
  assets: Record<string, KitPartRow>;
  /** The split assets that burn in an interior, their kit manifest rows reduced to the anchor fields. */
  fires: Record<string, InteriorFireRow>;
}

/** The parts folder of a kit, from the bundle's own GLB path (`<kit>.glb` -> `<kit>/parts/` beside it). */
export function kitPartsDir(ref: InteriorKitRef): string {
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
  if (!x!.assets || typeof x!.assets !== "object") fail("no assets map");
  if (!x!.fires || typeof x!.fires !== "object") fail("no fires map");
  for (const [id, row] of Object.entries(x!.assets!)) {
    if (typeof row?.file !== "string" || !row.file.endsWith(".glb")) fail(`${id}: no part file`);
  }
  return x as KitPartsIndex;
}
