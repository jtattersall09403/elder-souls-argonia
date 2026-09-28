/**
 * Every published place loads the way the runtime loads it, headless (decision
 * 0052 addendum 2026-09-28). The settlement layer's refusals that can be
 * decided from files alone are run here over every bundle the index names, so
 * a bundle or kit the layer would refuse fails `npm test` (and the preflight
 * gate `bundle-load`) instead of emptying the deployed places.
 *
 * Covered (the runtime throw each stands for):
 *   - index schema (settlementIndex.ts `unsupported settlement index schema`);
 *   - per bundle, through `loadSettlementBundle` itself: schema and collision
 *     frame (`unsupported settlement schema`, `… collision frame`);
 *   - every kit a bundle lists: glb and manifest on disk (`kit manifest HTTP`,
 *     `settlement kit … failed`), manifest parsed by `kitAssetMetaFromManifest`
 *     (`has no assets list`, `has no id`, `duplicate asset id`);
 *   - every placement: its kit listed (`references missing kit`), its asset row
 *     in the manifest, its collision frame (`untagged/old collision frame`),
 *     its LOD tier count from the GLB's own node tree (`missing a three-tier
 *     LOD chain`; the longest side still comes from the manifest `sizeM`);
 *   - effect textures: the flame manifest (`flameManifestPath`) and, where a
 *     bundle places smoke, the smoke kit's row, each through
 *     `effectTextureFile`, and the file on disk (`settlement flame/smoke
 *     texture failed`).
 * Not decidable from files (GPU or decoded-mesh checks, backstopped by the
 * export gates in export_settlement_bundle.py): LOD0 index buffers, absolute
 * triangle floors per decoded tier, bound texture sizes, far-tier merges,
 * colour/depth material pairs.
 */
import { closeSync, existsSync, openSync, readFileSync, readSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { kitAssetMetaFromManifest } from "./kit";
import { requiredLodTiers } from "./lod";
import { FLAME_TEXTURE_ASSET_ID } from "./lighting";
import { flameManifestPath, loadSettlementBundle } from "./SettlementLayer";
import { SettlementBundleSource, type SettlementIndex } from "./settlementIndex";
import { effectTextureFile, isSmokeColumnPlacement, SMOKE_COLUMN_ASSET_ID } from "./smokeColumn";
import { SETTLEMENT_COLLISION_FRAME } from "./types";

// ES_BUNDLE_LOAD_PUBLIC points the gate at a copy (to make it fail on purpose).
const PUBLIC = process.env.ES_BUNDLE_LOAD_PUBLIC
  ?? resolve(import.meta.dirname, "../../../../apps/world-studio/public");
const readJson = (rel: string): unknown => JSON.parse(readFileSync(resolve(PUBLIC, rel.replace(/^\//, "")), "utf8"));
const onDisk = (rel: string) => existsSync(resolve(PUBLIC, rel.replace(/^\//, "")));
const INDEX = "province/settlements/index.json";
const index = readJson(INDEX) as SettlementIndex;
const entries = [...index.places, ...(index.routes ?? [])];

/** A source over the disk that sees only `entry`, so each bundle is judged alone. */
function sourceFor(entry: SettlementIndex["places"][number]): SettlementBundleSource {
  return new SettlementBundleSource("", async (url) => {
    const rel = url.replace(/^\//, "");
    if (rel === INDEX) return { ...index, places: index.places.filter((e) => e === entry),
      routes: (index.routes ?? []).filter((e) => e === entry) };
    return readJson(rel);
  });
}

interface ManifestAsset { id: string; sizeM?: number[]; lodRatios?: number[] }
const manifestCache = new Map<string, { raw: unknown; assets: Map<string, ManifestAsset> }>();
function manifest(rel: string) {
  let got = manifestCache.get(rel);
  if (!got) {
    const raw = readJson(rel);
    kitAssetMetaFromManifest(raw, rel);   // the runtime's own parse: throws as the layer would
    const assets = new Map(((raw as { assets: ManifestAsset[] }).assets).map((a) => [a.id, a]));
    got = { raw, assets };
    manifestCache.set(rel, got);
  }
  return got;
}

/**
 * LOD level count per asset as the runtime's `buildArchitectureKit` sees it:
 * each scene root carrying `extras.assetId`, levels = highest mesh-node
 * `extras.lod` + 1 (absent = 0). Read from the GLB's JSON chunk alone (the
 * manifest's `lodRatios` disagreed with the GLB for one asset on 2026-09-28,
 * so the gate reads what the layer reads).
 */
const glbCache = new Map<string, Map<string, number>>();
function glbLevels(rel: string): Map<string, number> {
  let got = glbCache.get(rel);
  if (got) return got;
  const fd = openSync(resolve(PUBLIC, rel.replace(/^\//, "")), "r");
  const head = Buffer.alloc(20);
  readSync(fd, head, 0, 20, 0);
  const json = Buffer.alloc(head.readUInt32LE(12));
  readSync(fd, json, 0, json.length, 20);
  closeSync(fd);
  type Node = { mesh?: number; children?: number[]; extras?: { assetId?: unknown; lod?: unknown } };
  const gltf = JSON.parse(json.toString("utf8")) as { scene?: number; scenes: { nodes: number[] }[]; nodes: Node[] };
  got = new Map();
  for (const rootIndex of gltf.scenes[gltf.scene ?? 0].nodes) {
    const id = gltf.nodes[rootIndex].extras?.assetId;
    if (typeof id !== "string") continue;
    let top = -1;
    const walk = (i: number) => {
      const node = gltf.nodes[i];
      if (node.mesh !== undefined) top = Math.max(top, typeof node.extras?.lod === "number" ? node.extras.lod : 0);
      node.children?.forEach(walk);
    };
    walk(rootIndex);
    got.set(id, top + 1);
  }
  glbCache.set(rel, got);
  return got;
}

/** The effect texture a manifest names for `assetId`, resolved as the layer resolves it. */
function effectFile(manifestRel: string, assetId: string): string {
  const file = effectTextureFile(readJson(manifestRel), assetId, manifestRel);
  return `${manifestRel.replace(/[^/]*$/, "")}${file}`;
}

describe("published place bundles load headless", () => {
  it("the index is the schema the runtime reads and names at least one bundle", async () => {
    await expect(new SettlementBundleSource("", async (u) => readJson(u)).index()).resolves.toBeTruthy();
    expect(entries.length).toBeGreaterThan(0);
  });

  it.each(entries.map((e) => [e.id, e] as const))("%s", async (_id, entry) => {
    const bundle = await loadSettlementBundle(sourceFor(entry), null);
    const failures: string[] = [];
    for (const [id, kit] of Object.entries(bundle.kits)) {
      if (!onDisk(kit.glb)) failures.push(`kit ${id}: glb ${kit.glb} missing`);
      if (!onDisk(kit.manifest)) { failures.push(`kit ${id}: manifest ${kit.manifest} missing`); continue; }
      try { manifest(kit.manifest); } catch (e) { failures.push(`kit ${id}: ${(e as Error).message}`); }
    }
    for (const p of bundle.placements) {
      if (p.collision.kind !== "none" && p.collision.frame !== SETTLEMENT_COLLISION_FRAME) {
        failures.push(`${p.id}: untagged/old collision frame refused`);
      }
      const kit = bundle.kits[p.kit];
      if (!kit) { failures.push(`${p.id}: settlement bundle references missing kit ${p.kit}`); continue; }
      if (isSmokeColumnPlacement(p) || !manifestCache.has(kit.manifest)) continue;
      const asset = manifest(kit.manifest).assets.get(p.assetId);
      if (!asset) { failures.push(`${p.id}: ${p.kit} manifest has no asset ${p.assetId}`); continue; }
      const tiers = onDisk(kit.glb) ? glbLevels(kit.glb).get(p.assetId) ?? 0 : 0;
      const need = requiredLodTiers({ longestSideM: Math.max(...(asset.sizeM ?? [Infinity])) * p.scale, kind: p.kind });
      if (tiers < need) failures.push(`${p.id}: ${p.kit}/${p.assetId} has ${tiers} LOD tiers in its GLB, needs ${need}`);
    }
    if (bundle.placements.length) {
      try {
        const flame = effectFile(flameManifestPath(bundle.kits), FLAME_TEXTURE_ASSET_ID);
        if (!onDisk(flame)) failures.push(`flame texture ${flame} missing`);
      } catch (e) { failures.push(`flame: ${(e as Error).message}`); }
    }
    const smoke = bundle.placements.find(isSmokeColumnPlacement);
    if (smoke) {
      const kit = bundle.kits[smoke.kit];
      if (!kit) failures.push(`settlement effect ${smoke.id} names missing kit ${smoke.kit}`);
      else {
        try {
          const file = effectFile(kit.manifest, SMOKE_COLUMN_ASSET_ID);
          if (!onDisk(file)) failures.push(`smoke texture ${file} missing`);
        } catch (e) { failures.push(`smoke: ${(e as Error).message}`); }
      }
    }
    expect(failures).toEqual([]);
  });
});
