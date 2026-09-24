/**
 * Kit manifests are keyed by each asset's own `id` (the published
 * `assets` is a list). Before this, the runtime keyed the list by array index
 * ("0", "1", …) and every settlement placement resolved to no metadata.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { kitAssetMetaFromManifest, kitAssetMetaOf } from "./kit";

const ROOT = resolve(import.meta.dirname, "../../../..");
const KIT = "htbm-hut-int";
const manifest = JSON.parse(
  readFileSync(resolve(ROOT, `apps/world-studio/public/kits/${KIT}.kit.json`), "utf8"));

describe("kit manifest asset metadata", () => {
  const meta = kitAssetMetaFromManifest(manifest, KIT);
  const first = manifest.assets[0] as {
    id: string; anchorClass: string; designedSinkM: { p50: number };
  };

  it("keys every asset by its id, never by list index", () => {
    expect(meta.size).toBe(manifest.assets.length);
    expect(meta.has("0")).toBe(false);
  });

  it("resolves a placement's kit and asset id to its anchor class and designed sink", () => {
    const found = kitAssetMetaOf(new Map([[KIT, meta]]), { kit: KIT, assetId: first.id });
    expect(found?.anchorClass).toBe(first.anchorClass);
    expect(found?.designedSinkM?.p50).toBe(first.designedSinkM.p50);
    expect(typeof found?.designedSinkM?.p50).toBe("number");
  });

  it("refuses a manifest whose assets are not a list of id'd entries", () => {
    expect(() => kitAssetMetaFromManifest({ assets: { a: {} } }, "x")).toThrow(/assets list/);
    expect(() => kitAssetMetaFromManifest({ assets: [{}] }, "x")).toThrow(/no id/);
  });
});
