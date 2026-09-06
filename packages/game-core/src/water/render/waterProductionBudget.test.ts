import { describe, expect, it } from "vitest";
import { MeshBasicMaterial } from "three";
import { InlandWaterTiles } from "./InlandWaterTiles";
import { WaterRibbonTiles } from "./WaterRibbonTiles";
import { productionWaterData } from "./waterRasterTestFixture";
import type { WaterGeometryView } from "./waterStreaming";
import { readFileSync } from "node:fs";

describe("shipped water geometry budget", () => {
  it.each([false, true])("retains complete far coverage without exhausting resident budgets (low=%s)", (low) => {
    const data = productionWaterData(), material = new MeshBasicMaterial();
    const stage = JSON.parse(readFileSync(new URL("../../../../../apps/world-studio/public/province/refined/flood-states.json", import.meta.url), "utf8")).basins[0];
    const tiles = new InlandWaterTiles(data, low, { stage }), ribbons = new WaterRibbonTiles(data, low);
    const view: WaterGeometryView = { position: { x: 380, y: 290, z: 1440 }, pixelsPerRadian: 600, farM: 30000 };
    try {
      for (let frame = 0; frame < 2048; frame++) {
        tiles.update(view.position.x, view.position.z, material, 1, view);
        ribbons.update(view, material);
        expect(tiles.diagnostics.builtLastUpdate).toBeLessThanOrEqual(2);
        expect(ribbons.diagnostics.builtLastUpdate).toBeLessThanOrEqual(2);
        if (!tiles.diagnostics.pendingTiles && !ribbons.diagnostics.pendingPatches) break;
      }
      if (process.env.WATER_BUDGET_REPORT) console.info(JSON.stringify({ inland: tiles.diagnostics, ribbons: ribbons.diagnostics }));
      expect(tiles.diagnostics.pendingTiles).toBe(0);
      expect(ribbons.diagnostics.pendingPatches).toBe(0);
      expect(tiles.diagnostics.budgetFailures).toBe(0);
      expect(ribbons.diagnostics.budgetFailures).toBe(0);
      expect(tiles.diagnostics.residentTriangles).toBeLessThanOrEqual(1000000);
      expect(tiles.diagnostics.residentGeometryBytes).toBeLessThanOrEqual((low ? 48 : 96) * 1024 * 1024);
      expect(ribbons.diagnostics.residentTriangles).toBeLessThanOrEqual(low ? 131072 : 262144);
      expect(ribbons.diagnostics.residentGeometryBytes).toBeLessThanOrEqual((low ? 16 : 32) * 1024 * 1024);
    } finally { tiles.dispose(); ribbons.dispose(); material.dispose(); }
  }, 30000);
});
