/**
 * The shipped bundle resolves through the runtime's own resolver (16h round 4).
 *
 * The layer builds every placement in draw range in one pass, and ONE throw
 * fails the whole layer closed (no buildings, the magenta sentinel at the
 * player). So every placement in the published bundle must resolve against
 * the published kit manifests, with the same anchor-class rule the layer uses.
 * Flat ground stands in for terrain: only the record contract is under test.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createPlacementResolver } from "./anchoring";
import { kitAssetMetaFromManifest, kitAssetMetaOf } from "./kit";
import type { SettlementBundle, SettlementKitAssetMeta } from "./types";

const ROOT = resolve(import.meta.dirname, "../../../..");
const PUBLIC = resolve(ROOT, "apps/world-studio/public");
const bundle: SettlementBundle = JSON.parse(
  readFileSync(resolve(PUBLIC, "province/settlements.json"), "utf8"));
const manifests = new Map<string, Map<string, SettlementKitAssetMeta>>(
  Object.entries(bundle.kits).map(([id, kit]) => [id, kitAssetMetaFromManifest(
    JSON.parse(readFileSync(resolve(PUBLIC, kit.manifest.replace(/^\//, "")), "utf8")), id)]),
);

describe("published settlement bundle", () => {
  it("every placement resolves through the runtime resolver", () => {
    const resolvePlaced = createPlacementResolver(bundle.placements,
      (p) => kitAssetMetaOf(manifests, p), () => 0);
    const failures: string[] = [];
    for (const placement of bundle.placements) {
      try {
        if (!resolvePlaced(placement)) failures.push(`${placement.id}: unresolved`);
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
    }
    expect(failures).toEqual([]);
  });

  // The two record defects that failed the whole layer from the proving
  // ground on 2026-09-23 (the 1118-placement bundle): the gate must catch both.
  it("fails on a mount cycle and on a water record whose asset has no waterline", () => {
    const [a, b] = bundle.placements;
    const cyclic = [{ ...a, id: "t.a", parentPlacementId: "t.b", mountOffsetM: [0, 0, 0] as [number, number, number] },
      { ...b, id: "t.b", parentPlacementId: "t.a", mountOffsetM: [0, 0, 0] as [number, number, number] }];
    const meta = (): SettlementKitAssetMeta => ({ anchorClass: "ground" });
    expect(() => createPlacementResolver(cyclic, meta, () => 0)(cyclic[0]))
      .toThrow(/mount cycle: t\.a -> t\.b -> t\.a/);
    const water = { ...a, id: "t.w", anchorClass: "water" as const, waterLevelM: 1,
      parentPlacementId: undefined };
    expect(() => createPlacementResolver([water], meta, () => 0)(water))
      .toThrow(/t\.w: .* has no designedWaterlineM/);
  });
});
