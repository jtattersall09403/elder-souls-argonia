import { describe, expect, it, vi } from "vitest";
import { MeshBasicMaterial, Vector3 } from "three";
import { WaterData, type WaterMeta } from "../waterData";
import { InlandWaterTiles } from "./InlandWaterTiles";
import { subtractRibbonFootprints } from "./ribbonFootprint";
import type { ChannelRibbonRecord } from "../channelRibbons";
import { inlandEffectiveStep } from "./inlandWaterLod";

function poolData(size: number, ribbons: ChannelRibbonRecord[] = [],
  heightAt: (x: number, z: number) => number = () => 5,
  depthAt: (x: number, z: number) => number = () => 2): WaterData {
  const grid = { size, metresPerPixel: 1, gridOriginM: 0, file: "" };
  const meta: WaterMeta = { bodies: [...new Set([1, ...ribbons.map(ribbon => ribbon.bodyIndex)])]
    .map(index => ({ index, id: index === 1 ? "water.test.pool" : `water.test.ribbon-${index}` })), ribbons,
    surface: { ...grid, minM: 0, maxM: 10, buryM: 3 }, flow: { ...grid, flowMax: 3, shoreMaxM: 160 },
    klass: { ...grid, classes: ["none", "coast", "estuary", "river", "lake"] } };
  const klass = new Uint8ClampedArray(size * size * 4), support = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < klass.length; i += 4) { klass[i] = 4; support[i] = 255; support[i + 2] = 1; }
  const heights = new Float32Array(size * size), depths = new Float32Array(size * size);
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    heights[z * size + x] = heightAt(x, z); depths[z * size + x] = depthAt(x, z);
  }
  return new WaterData(meta, heights, depths,
    new Uint8ClampedArray(size * size * 4), klass, undefined, undefined, support);
}

const polygonArea = (points: readonly { x: number; z: number }[]) => Math.abs(points.reduce((sum, p, i) => {
  const next = points[(i + 1) % points.length];
  return sum + p.x * next.z - next.x * p.z;
}, 0)) / 2;

function settle(tiles: InlandWaterTiles, x: number, z: number, material: MeshBasicMaterial) {
  for (let frame = 0; frame < 4096; frame++) {
    tiles.update(x, z, material);
    expect(tiles.diagnostics.builtLastUpdate).toBeLessThanOrEqual(2);
    if (!tiles.diagnostics.pendingTiles) break;
  }
  expect(tiles.diagnostics.pendingTiles).toBe(0);
  expect(tiles.diagnostics.budgetFailures).toBe(0);
}

describe("inland geometry isolation and draw budget", () => {
  it("never renders native-owned R128 proxies, while preserving adjacent R255 standing water", () => {
    const size = 66, grid = { size, metresPerPixel: 1, gridOriginM: 0, file: "" };
    const meta: WaterMeta = { bodies: [{ index: 1, id: "water.test.connected" }],
      surface: { ...grid, minM: 0, maxM: 10, buryM: 3, nativeChannelCoverage: true },
      flow: { ...grid, flowMax: 3, shoreMaxM: 160 }, klass: { ...grid, classes: ["none", "coast", "estuary", "river", "lake"] } };
    const support = new Uint8ClampedArray(size * size * 4), klass = new Uint8ClampedArray(size * size * 4);
    for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
      const i = (z * size + x) * 4;
      support[i] = x < 32 ? 255 : 128; support[i + 2] = 1; klass[i] = 4;
    }
    const data = new WaterData(meta, new Float32Array(size * size).fill(5), new Float32Array(size * size).fill(2),
      new Uint8ClampedArray(size * size * 4), klass, undefined, undefined, support);
    expect(data.boundaryAt(40, 20, undefined, false).supported).toBe(false);
    const tiles = new InlandWaterTiles(data), material = new MeshBasicMaterial();
    try {
      settle(tiles, 32, 32, material);
      expect(tiles.diagnostics.residentTriangles).toBeGreaterThan(0);
      for (const mesh of tiles.meshes) {
        const positions = mesh.geometry.getAttribute("position");
        for (let i = 0; i < positions.count; i++) expect(positions.getX(i)).toBeLessThan(32);
      }
      expect(data.ribbons.cacheStats.builds).toBe(0);
    } finally { tiles.dispose(); material.dispose(); }
  });

  it("never bridges neighbouring body IDs and batches all populated tiles into one mesh", () => {
    const size = 130;
    const grid = { size, metresPerPixel: 1, gridOriginM: 0, file: "" };
    const meta: WaterMeta = { bodies: [{ index: 1, id: "water.test.west" }, { index: 2, id: "water.test.east" }],
      surface: { ...grid, minM: 0, maxM: 10, buryM: 3 },
      flow: { ...grid, flowMax: 3, shoreMaxM: 160 },
      klass: { ...grid, classes: ["none", "coast", "estuary", "river"] } };
    const klass = new Uint8ClampedArray(size * size * 4);
    const support = new Uint8ClampedArray(size * size * 4);
    for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
      const i = (z * size + x) * 4;
      klass[i] = 3; support[i] = 255; support[i + 2] = x < 65 ? 1 : 2;
    }
    const data = new WaterData(meta, new Float32Array(size * size).fill(5),
      new Float32Array(size * size).fill(2), new Uint8ClampedArray(size * size * 4), klass,
      undefined, undefined, support);
    const tiles = new InlandWaterTiles(data);
    const material = new MeshBasicMaterial();
    try {
      // Nine tiles need three bounded upload frames.
      settle(tiles, 64, 64, material);
      expect(tiles.group.children).toHaveLength(1);
      expect(tiles.meshes).toHaveLength(1);
      const geometry = tiles.meshes[0].geometry;
      expect(geometry.groups).toHaveLength(0);
      expect(geometry.index!.count).toBeGreaterThan(1000);
      const position = geometry.getAttribute("position");
      const seen = new Set<number>();
      for (let i = 0; i < geometry.index!.count; i += 3) {
        const body = [0, 1, 2].map(corner => {
          const vertex = geometry.index!.getX(i + corner);
          return data.sample(position.getX(vertex), position.getZ(vertex)).bodyIndex;
        });
        expect(new Set(body).size, `triangle ${i / 3}`).toBe(1);
        seen.add(body[0]);
      }
      expect(seen).toEqual(new Set([1, 2]));
    } finally { tiles.dispose(); material.dispose(); }
  });

  it("subtracts exactly the native ribbon footprint without cutting its surrounding pool", () => {
    const data = poolData(64, [{ id: "water-ribbon.test", bodyIndex: 2, riverBand: 1,
      points: [{ x: 30.2, y: 4, z: 10, halfWidthM: 0.3, groundM: 3 },
        { x: 30.2, y: 4, z: 50, halfWidthM: 0.3, groundM: 3 }] }]);
    const tiles = new InlandWaterTiles(data), material = new MeshBasicMaterial();
    try {
      tiles.update(30, 30, material);
      expect(data.sample(30, 20).waterBodyId).toBe("water.test.ribbon-2");
      const geometry = tiles.meshes[0].geometry, positions = geometry.getAttribute("position");
      let area = 0;
      for (let i = 0; i < geometry.index!.count; i += 3) {
        const points = [0, 1, 2].map(corner => {
          const vertex = geometry.index!.getX(i + corner);
          return { x: positions.getX(vertex), z: positions.getZ(vertex) };
        });
        const triangleArea = polygonArea(points);
        if (triangleArea < 1e-7) continue;
        expect(data.ribbons.sample(points.reduce((n, p) => n + p.x, 0) / 3,
          points.reduce((n, p) => n + p.z, 0) / 3)).toBeNull();
        area += triangleArea;
      }
      // Last grid edge at64 is outside WaterData's domain, hence the final
      // row/column is intentionally excluded by body isolation.
      expect(area).toBeCloseTo(63 * 63 - 0.6 * 40, 3);
      expect(tiles.meshes).toHaveLength(1);
    } finally { tiles.dispose(); material.dispose(); }
  });

  it("handles intersecting native sheets as a union, retaining all non-overlapped area", () => {
    const triangle = [{ x: 0, z: 0 }, { x: 0, z: 10 }, { x: 10, z: 0 }];
    const cut = { a: { x: 1, y: 0, z: 1 }, b: { x: 1, y: 0, z: 3 }, c: { x: 3, y: 0, z: 1 } };
    const retained = subtractRibbonFootprints(triangle, [cut, cut]);
    expect(retained.reduce((sum, polygon) => sum + polygonArea(polygon), 0)).toBeCloseTo(48, 8);
  });

  it("refines same-body stepped pools and narrow wet features but preserves true planar slopes", () => {
    const stepped = poolData(66, [], x => x < 29 ? 5 : 8, x => x >= 20 && x < 25 ? -3 : 2);
    expect(inlandEffectiveStep(stepped, 0, 0, 16)).toBe(1);
    const narrow = poolData(66, [], () => 5, x => x === 29 ? 2 : -3);
    expect(inlandEffectiveStep(narrow, 0, 0, 16)).toBe(1);
    const planar = poolData(66, [], (x, z) => 5 + x * 0.1 + z * 0.03);
    expect(inlandEffectiveStep(planar, 0, 0, 16)).toBe(16);
  });

  it("covers distant inland water, stitches native LOD edges, and retains pending replacements", () => {
    const tiles = new InlandWaterTiles(poolData(641)), material = new MeshBasicMaterial();
    try {
      settle(tiles, 0, 0, material);
      const occupied = () => {
        const byTile = new Map<string, Set<string>>();
        for (const mesh of tiles.meshes) {
        const geometry = mesh.geometry, position = geometry.getAttribute("position");
        for (let i = 0; i < geometry.index!.count; i += 3) {
          const points = [0, 1, 2].map(corner => {
            const vertex = geometry.index!.getX(i + corner);
            return { x: position.getX(vertex), z: position.getZ(vertex) };
          });
          const key = `${Math.floor(points.reduce((sum, p) => sum + p.x, 0) / 3 / 64)},${Math.floor(points.reduce((sum, p) => sum + p.z, 0) / 3 / 64)}`;
          let seen = byTile.get(key);
          if (!seen) { seen = new Set(); byTile.set(key, seen); }
          for (const point of points) seen.add(`${point.x},${point.z}`);
        }
        }
        return byTile;
      };
      const before = occupied();
      expect(before.has("9,9")).toBe(true); // Beyond the previous radius7 cutoff.
      // x=128 joins near step1 tile1 to step2 tile2; both must have
      // every native vertex on the same edge, not just coarse endpoints.
      for (let z = 0; z <= 64; z++) {
        expect(before.get("1,0")!.has(`128,${z}`), `left edge z=${z}`).toBe(true);
        expect(before.get("2,0")!.has(`128,${z}`), `right edge z=${z}`).toBe(true);
      }
      tiles.update(64 * 9, 64 * 9, material);
      expect([...occupied().keys()].sort()).toEqual([...before.keys()].sort());
      expect(tiles.meshes).toHaveLength(9);
    } finally { tiles.dispose(); material.dispose(); }
  });

  it("bounds province batches for culling and updates scaled wave-padded bounds without resampling", () => {
    const data = poolData(2017, [], (x, z) => 10 + x * 0.01 + z * 0.02);
    // Production spacing exercises GPU Float32 positions at kilometre-scale
    // coordinates rather than relying on exactly representable unit grids.
    for (const grid of [data.meta.surface, data.meta.flow, data.meta.klass]) grid.metresPerPixel = 3.65568;
    const tiles = new InlandWaterTiles(data), material = new MeshBasicMaterial();
    try {
      settle(tiles, 0, 0, material);
      expect(tiles.meshes).toHaveLength(64);
      expect(tiles.group.children).toHaveLength(64);
      const heightQuery = vi.spyOn(data, "surfaceBase");
      tiles.update(0, 0, material, 2);
      expect(heightQuery).not.toHaveBeenCalled();
      heightQuery.mockRestore();
      let boundsValid = true, reachedFarEdge = false;
      const point = new Vector3();
      for (const mesh of tiles.meshes) {
        expect(mesh.frustumCulled).toBe(true);
        expect(mesh.material).toBe(material);
        const geometry = mesh.geometry, position = geometry.getAttribute("position");
        const box = geometry.boundingBox!, sphere = geometry.boundingSphere!;
        expect(geometry.groups).toHaveLength(0);
        for (let i = 0; i < position.count; i++) {
          const x = position.getX(i), z = position.getZ(i), height = data.surfaceBase(x, z);
          for (const pad of [-8, 8]) {
            point.set(x, (height + pad) * 2, z);
            boundsValid &&= box.containsPoint(point) && sphere.distanceToPoint(point) <= 0.00001;
          }
          reachedFarEdge ||= x >= 2016 * 3.65568 && z >= 2016 * 3.65568;
        }
      }
      expect(boundsValid).toBe(true);
      expect(reachedFarEdge).toBe(true);
    } finally { tiles.dispose(); material.dispose(); }
  }, 20000);
});
