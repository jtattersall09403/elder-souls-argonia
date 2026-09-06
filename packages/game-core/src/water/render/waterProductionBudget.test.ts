import { describe, expect, it } from "vitest";
import { MeshBasicMaterial, PerspectiveCamera } from "three";
import { InlandWaterTiles } from "./InlandWaterTiles";
import { WaterRibbonTiles } from "./WaterRibbonTiles";
import { productionWaterData } from "./waterRasterTestFixture";
import { WaterGeometryCamera, waterGeometryBytes } from "./waterStreaming";
import { readFileSync } from "node:fs";

describe("shipped water geometry budget", () => {
  it.each([false, true])("retains complete far coverage without exhausting resident budgets (low=%s)", (low) => {
    const data = productionWaterData(), material = new MeshBasicMaterial();
    const stage = JSON.parse(readFileSync(new URL("../../../../../apps/world-studio/public/province/refined/flood-states.json", import.meta.url), "utf8")).basins[0];
    const tiles = new InlandWaterTiles(data, low, { stage }), ribbons = new WaterRibbonTiles(data, low);
    const camera = new PerspectiveCamera(60, 16 / 9, 0.1, 10000);
    camera.position.set(2370, low ? 1000 : 416, 190); camera.lookAt(2700, 280, 1000); camera.updateMatrixWorld();
    const view = new WaterGeometryCamera().update(camera, 1080);
    try {
      for (let frame = 0; frame < 10000; frame++) {
        tiles.update(view.position.x, view.position.z, material, 1, view);
        ribbons.update(view, material);
        expect(tiles.diagnostics.builtLastUpdate).toBeLessThanOrEqual(2);
        expect(ribbons.diagnostics.builtLastUpdate).toBeLessThanOrEqual(2);
        expect(ribbons.diagnostics.recordsBuiltLastUpdate).toBeLessThanOrEqual(8);
        if (!tiles.diagnostics.pendingTiles && !ribbons.diagnostics.pendingPatches) break;
      }
      const visible = [...tiles.meshes, ...ribbons.meshes].filter(mesh => {
        mesh.updateMatrixWorld(); return mesh.visible && (mesh.geometry.index?.count ?? 0) > 0 && view.frustum!.intersectsObject(mesh);
      });
      if (process.env.WATER_BUDGET_REPORT) console.info(JSON.stringify({ inland: tiles.diagnostics, ribbons: ribbons.diagnostics,
        // Water uses one front/back-face material pass, never both at once;
        // it receives shadows but does not cast into the CSM passes.
        submittedSurfaceDraws: visible.length,
        submittedSurfaceTriangles: visible.reduce((sum, mesh) => sum + mesh.geometry.index!.count / 3, 0),
        submittedSurfaceGeometryBytes: visible.reduce((sum, mesh) => sum + waterGeometryBytes(mesh.geometry), 0) }));
      expect(tiles.diagnostics.pendingTiles).toBe(0);
      expect(ribbons.diagnostics.pendingPatches).toBe(0);
      expect(tiles.diagnostics.budgetFailures).toBe(0);
      expect(ribbons.diagnostics.budgetFailures).toBe(0);
      expect(tiles.diagnostics.residentTriangles).toBeLessThanOrEqual(1000000);
      expect(tiles.diagnostics.residentGeometryBytes).toBeLessThanOrEqual((low ? 64 : 96) * 1024 * 1024);
      expect(ribbons.diagnostics.residentTriangles).toBeLessThanOrEqual(1048576);
      expect(ribbons.diagnostics.residentGeometryBytes).toBeLessThanOrEqual(64 * 1024 * 1024);
    } finally { tiles.dispose(); ribbons.dispose(); material.dispose(); }
  }, 30000);
});
