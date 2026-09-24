/**
 * The shipped bundle is the gate (16h item 3 and item 5).
 *
 * `apps/world-studio/public/province/settlements.json` is read once as a
 * fixture: every placement the published kit manifests describe is put through
 * the runtime's own `Matrix4` and compared with the corners the export wrote
 * for it. Before the rotation sign was fixed this failed on 691 of the 733
 * settlement pieces (audit §5), with a median heading error of 92.7°.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { placementTransform } from "./anchoring";
import { ladderLevelAt, settlementLadder } from "./lod";
import { cellRungs } from "../vegetation/cellBuild";
import { BAYER4_THRESHOLDS, lodFadeFactors, lodPixelKept } from "../fx/lodFade";
import type { SettlementBundle, SettlementPlacement } from "./types";

const ROOT = resolve(import.meta.dirname, "../../../..");
const read = (path: string) => JSON.parse(readFileSync(resolve(ROOT, path), "utf8"));

const bundle: SettlementBundle = read("apps/world-studio/public/province/settlements.json");

interface KitAsset { id: string; sizeM?: [number, number, number];
  originOffsetM?: [number, number, number]; }
const kits = new Map<string, Map<string, KitAsset>>(
  Object.keys(bundle.kits).map((id) => [id, new Map(
    (read(`apps/world-studio/public/kits/${id}.kit.json`).assets as KitAsset[])
      .map((asset) => [asset.id, asset]),
  )]),
);

/**
 * THE EXPORT'S OWN RULE, kept here as the oracle
 * (`export_settlement_bundle._bounds_footprint`): the measured LOD0 bounds
 * around the pivot, rotated with the compile convention
 * `wx = cx + x·cosθ − z·sinθ; wz = cz + x·sinθ + z·cosθ`.
 */
function exportedCorners(asset: KitAsset, placement: SettlementPlacement): [number, number][] {
  const [sx, sy] = asset.sizeM!;
  const [ox, oy] = asset.originOffsetM!;
  const scale = placement.scale;
  const x0 = -ox * scale; const z0 = -oy * scale;
  const x1 = (sx - ox) * scale; const z1 = (sy - oy) * scale;
  const t = THREE.MathUtils.degToRad(placement.yawDeg);
  const c = Math.cos(t); const s = Math.sin(t);
  return ([[x0, z0], [x1, z0], [x1, z1], [x0, z1]] as [number, number][]).map(([x, z]) =>
    [placement.positionM[0] + x * c - z * s, placement.positionM[2] + x * s + z * c]);
}

/** The same four plan corners through the runtime's own final transform. */
function runtimeCorners(asset: KitAsset, placement: SettlementPlacement): [number, number][] {
  const [sx, sy] = asset.sizeM!;
  const [ox, oy] = asset.originOffsetM!;
  const matrix = placementTransform(placement, 0);
  return ([[-ox, -oy], [sx - ox, -oy], [sx - ox, sy - oy], [-ox, sy - oy]] as [number, number][])
    .map(([x, z]) => {
      const point = new THREE.Vector3(x, 0, z).applyMatrix4(matrix);
      return [point.x, point.z] as [number, number];
    });
}

const measured = bundle.placements
  .map((placement) => ({ placement, asset: kits.get(placement.kit)?.get(placement.assetId) }))
  .filter((row): row is { placement: SettlementPlacement; asset: KitAsset } =>
    !!row.asset?.sizeM && !!row.asset?.originOffsetM);

describe("the shipped bundle through the runtime transform", () => {
  it("puts every settlement piece's LOD0 corners where the export put them", () => {
    const settlement = measured.filter((row) => row.placement.kind !== "route-structure");
    const mismatched = settlement.filter(({ asset, placement }) => {
      const want = exportedCorners(asset, placement);
      const got = runtimeCorners(asset, placement);
      return want.some((corner, i) =>
        Math.hypot(corner[0] - got[i][0], corner[1] - got[i][1]) > 0.05);
    });
    expect({ settlementPieces: settlement.length, mismatched: mismatched.length })
      .toEqual({ settlementPieces: settlement.length, mismatched: 0 });
  });

  it("puts every route structure's corners there too", () => {
    const routes = measured.filter((row) => row.placement.kind === "route-structure");
    const mismatched = routes.filter(({ asset, placement }) => {
      const want = exportedCorners(asset, placement);
      const got = runtimeCorners(asset, placement);
      return want.some((corner, i) =>
        Math.hypot(corner[0] - got[i][0], corner[1] - got[i][1]) > 0.05);
    });
    expect(mismatched.length).toBe(0);
    // Invariants, never a copied count: the bundle ships places, and every
    // place ships pieces.
    expect(bundle.settlements.length).toBeGreaterThan(0);
    for (const settlement of bundle.settlements) {
      expect(settlement.placementIds.length, settlement.id).toBeGreaterThan(0);
    }
  });

  it("keeps exactly one copy per pixel on every settlement ladder (0073)", () => {
    const ladders = new Map<string, ReturnType<typeof settlementLadder>>();
    for (const { asset, placement } of measured) {
      const diagonal = Math.hypot(asset.sizeM![0], asset.sizeM![1]) * placement.scale;
      const maxDraw = placement.kind === "dressing" ? 350
        : placement.kind === "route-structure" ? 2500 : 5000;
      const key = `${placement.kit}|${placement.assetId}|${maxDraw}|${diagonal.toFixed(2)}`;
      if (!ladders.has(key)) {
        ladders.set(key, settlementLadder(diagonal, 3, bundle.lod, maxDraw));
      }
    }
    expect(ladders.size).toBeGreaterThan(0);
    for (const [key, ladder] of ladders) {
      // A building never vanishes inside its loaded ring: `vanishes` is false,
      // so the last rung stays open and every distance keeps exactly one copy.
      const rungs = cellRungs(ladder, false);
      expect(rungs.length, key).toBe(ladder.length);
      for (let step = 0; step <= 200; step++) {
        const d = (5200 * step) / 200;
        for (const bayer of BAYER4_THRESHOLDS) {
          const kept = rungs.filter((rung) => lodPixelKept(lodFadeFactors(rung.band, d), bayer));
          expect(kept.length, `${key} d=${d}`).toBe(1);
        }
      }
      // Hard steps only, and one kit level per rung.
      expect(ladder.map((rung) => rung.level))
        .toEqual([...new Set(ladder.map((rung) => rung.level))]);
      expect(ladderLevelAt(ladder, 0)).toBe(ladder[0].level);
    }
  });
});
