import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildChannelRibbonMeshData, ChannelRibbonSampler } from "./channelRibbons";
import type { WaterMeta } from "./waterData";
import { SparseHeightOverlay, type SparseHeightOverlayData } from "../terrain/chunkStore";

// Test the shipped artifacts, not another implementation of the compiler.
const assets = new URL("../../../../apps/world-studio/public/province/water/v2/", import.meta.url);
const meta: WaterMeta = JSON.parse(readFileSync(new URL("water-meta.json", assets), "utf8"));
const overlay: SparseHeightOverlayData =
  JSON.parse(readFileSync(new URL("water-bed-overlay.json", assets), "utf8"));

describe("shipped water topology", () => {
  it("has flat standing pools and no unhandled drainage gaps", () => {
    expect(meta.terrainMismatches).toEqual([]);
    expect(meta.stats?.terrainMismatchReachCount).toBe(0);
    expect(meta.stats?.standingPoolCount).toBeGreaterThan(0);
    expect(meta.stats?.standingPoolMaxLevelRangeM).toBe(0);
    expect(meta.stats?.nativeAscendingSegmentCount).toBe(0);
  });
  it("contains downstream, wetted ribbons and finite cascade endpoints attached to real bodies", () => {
    expect(meta.schemaVersion).toBe(2);
    expect(meta.ribbons!.length).toBeGreaterThan(0);
    const bodies = new Map(meta.bodies!.map(body => [body.index, body.id]));
    expect(bodies.size).toBe(meta.bodies!.length);
    const ids = new Set<string>();
    for (const ribbon of meta.ribbons!) {
      expect(ids.has(ribbon.id), ribbon.id).toBe(false);
      ids.add(ribbon.id);
      expect(bodies.get(ribbon.bodyIndex), ribbon.id).toMatch(/^water\./);
      expect(ribbon.points.length, ribbon.id).toBeGreaterThanOrEqual(2);
      for (const [i, point] of ribbon.points.entries()) {
        const label = `${ribbon.id} point ${i}`;
        for (const value of [point.x, point.y, point.z, point.halfWidthM, point.groundM]) {
          expect(Number.isFinite(value), label).toBe(true);
        }
        expect(point.halfWidthM, label).toBeGreaterThan(0);
        // Ground may be below sea level; its water depth must not be negative.
        expect(point.y - point.groundM!, label).toBeGreaterThanOrEqual(-0.001);
        if (i) expect(point.y - ribbon.points[i - 1].y, label).toBeLessThanOrEqual(0.0002);
      }
    }
    for (const cascade of meta.cascades ?? []) {
      expect(ids.has(cascade.id), cascade.id).toBe(false);
      ids.add(cascade.id);
      expect(bodies.get(cascade.bodyIndex), cascade.id).toMatch(/^water\./);
      for (const value of [...Object.values(cascade.lip), ...Object.values(cascade.plunge),
        ...Object.values(cascade.direction), cascade.widthM, cascade.dropM]) {
        expect(Number.isFinite(value), cascade.id).toBe(true);
      }
      expect(cascade.widthM, cascade.id).toBeGreaterThan(0);
      expect(cascade.dropM, cascade.id).toBeGreaterThan(0);
      expect(cascade.lip.y - cascade.plunge.y, cascade.id).toBeCloseTo(cascade.dropM, 3);
      expect(Math.hypot(cascade.direction.x, cascade.direction.z), cascade.id).toBeCloseTo(1, 3);
    }
  });

  it("queries the visible topmost rendered triangle at every reach, including intersections", () => {
    const sampler = new ChannelRibbonSampler(meta.ribbons!);
    const mesh = buildChannelRibbonMeshData(meta.ribbons!);
    let tested = 0;
    for (let i = 0; i < mesh.positions.length; i += 9) {
      const p = mesh.positions;
      const area = (p[i + 3] - p[i]) * (p[i + 8] - p[i + 2])
        - (p[i + 6] - p[i]) * (p[i + 5] - p[i + 2]);
      if (Math.abs(area) < 0.000001) continue;
      const x = (p[i] + p[i + 3] + p[i + 6]) / 3;
      const z = (p[i + 2] + p[i + 5] + p[i + 8]) / 3;
      const renderedHeight = (p[i + 1] + p[i + 4] + p[i + 7]) / 3;
      const sample = sampler.sample(x, z);
      expect(sample, `triangle ${i / 9} at ${x},${z}`).not.toBeNull();
      // Float32 GPU positions differ slightly from compiler decimal doubles.
      expect(sample!.height + 0.002, `triangle ${i / 9}`).toBeGreaterThanOrEqual(renderedHeight);
      expect(sample!.height - sample!.groundHeight!, `triangle ${i / 9}`).toBeGreaterThanOrEqual(-0.001);
      tested++;
    }
    expect(tested).toBeGreaterThan(meta.ribbons!.length);
  });

  it("ships a bounded, reversible native-bed overlay with auditable original heights", () => {
    expect(overlay.schemaVersion).toBe(1);
    expect(overlay.gridSize).toBe(4033);
    expect(overlay.metresPerPixel).toBeCloseTo(1.82784, 8);
    // Validate the consumer contract too: a global 5 m cap is never sufficient.
    expect(() => new SparseHeightOverlay(overlay)).not.toThrow();
    const exceptions = new Set(overlay.exceptionIndices ?? []);
    const routineCap = overlay.routineMaxLoweringM ?? overlay.maxLoweringM ?? 1;
    expect(routineCap).toBeLessThanOrEqual(3);
    const approvedCells = new Set(["124,348", "125,349", "126,350", "128,1092"]);
    const cells = overlay.exceptionCells ?? [];
    expect(new Set(cells.map(cell => cell.join(","))).size).toBe(cells.length);
    for (const cell of cells) expect(approvedCells.has(cell.join(","))).toBe(true);
    if (exceptions.size) expect(cells.length).toBeGreaterThan(0);
    let previous = -1, maximumLowering = 0;
    for (const [index, height, originalHeight] of overlay.changes) {
      expect(Number.isInteger(index)).toBe(true);
      expect(index).toBeGreaterThan(previous);
      expect(index).toBeLessThan(overlay.gridSize ** 2);
      expect(Number.isFinite(height) && Number.isFinite(originalHeight)).toBe(true);
      const originalDelta = originalHeight - height;
      expect(originalDelta).toBeGreaterThan(0);
      expect(originalDelta).toBeLessThanOrEqual((exceptions.has(index) ? 5 : routineCap) + 0.00001);
      if (exceptions.has(index)) {
        const row = Math.floor(index / overlay.gridSize), column = index % overlay.gridSize;
        // A coarse cell centre is native (3r+1,3c+1). The approved local
        // reach, lateral stations, <=2-vertex route search and bilinear
        // corners fit within eight native vertices of that centre.
        expect(cells.some(([r, c]) => Math.max(Math.abs(row - (3 * r + 1)),
          Math.abs(column - (3 * c + 1))) <= 8), `exception native vertex ${index}`).toBe(true);
      }
      maximumLowering = Math.max(maximumLowering, originalDelta);
      previous = index;
    }
    expect(meta.stats?.repairedNativeBedSampleCount).toBe(overlay.changes.length);
    expect(meta.stats?.maximumBedLoweringM).toBeCloseTo(maximumLowering, 5);
  });
});
