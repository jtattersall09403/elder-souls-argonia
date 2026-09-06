import { describe, expect, it, vi } from "vitest";
import { Box3, MeshBasicMaterial, PerspectiveCamera, Vector3 } from "three";
import { WaterData, type WaterMeta } from "../waterData";
import type { ChannelRibbonRecord } from "../channelRibbons";
import { inlandAdaptiveLeaves } from "./inlandAdaptiveLeaves";
import { InlandWaterTiles } from "./InlandWaterTiles";
import { WaterRibbonTiles } from "./WaterRibbonTiles";
import { WaterGeometryCamera, waterPatchErrorM, type WaterGeometryView } from "./waterStreaming";
import { ribbonRenderLod } from "./ribbonRenderLod";
import { inlandPotentiallyWet } from "./inlandAdaptiveLeaves";

function fixture(size = 130, ribbons: ChannelRibbonRecord[] = [], heightAt: (x: number, z: number) => number = () => 5) {
  const grid = { size, metresPerPixel: 1, gridOriginM: 0, file: "" };
  const meta: WaterMeta = { ribbons, bodies: [{ index: 1, id: "water.test.pool" }],
    surface: { ...grid, minM: 0, maxM: 20, buryM: 3 }, flow: { ...grid, flowMax: 3, shoreMaxM: 160 },
    klass: { ...grid, classes: ["none", "coast", "estuary", "river", "lake"] } };
  const klass = new Uint8ClampedArray(size * size * 4), support = new Uint8ClampedArray(size * size * 4);
  const heights = new Float32Array(size * size);
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const i = z * size + x;
    heights[i] = heightAt(x, z); klass[i * 4] = 4; support[i * 4] = 255; support[i * 4 + 2] = 1;
  }
  return new WaterData(meta, heights, new Float32Array(size * size).fill(2), new Uint8ClampedArray(size * size * 4), klass,
    undefined, undefined, support);
}

describe("bounded water geometry streaming", () => {
  it("finishes stricter inland work while the camera keeps moving and turning", () => {
    const data = fixture(64), tiles = new InlandWaterTiles(data, false, { buildBudgetMs: .1 });
    const material = new MeshBasicMaterial(), camera = new PerspectiveCamera(60, 1, .1, 1000);
    const views = new WaterGeometryCamera();
    const query = vi.spyOn(data, 'boundaryAt');
    let clock = 0;
    const timer = vi.spyOn(performance, 'now').mockImplementation(() => clock += .002);
    try {
      for (let frame = 0; frame < 4096; frame++) {
        // Turn every frame, with tiny changes to the error/subpixel request;
        // never invalidate an already stricter native near-tile build.
        const angle = frame * .17;
        camera.position.set(32 + Math.sin(angle), 10 + frame * .0001, 32 + Math.cos(angle));
        camera.lookAt(32 + Math.sin(angle) * 40, 5, 32 + Math.cos(angle) * 40); camera.updateMatrixWorld();
        tiles.update(camera.position.x, camera.position.z, material, 1, views.update(camera, 800));
        if (frame === 0) {
          expect(query.mock.calls.length).toBeLessThan(4225); // Native sampling itself is split.
          expect(tiles.meshes).toHaveLength(0);
        }
        expect(tiles.diagnostics.buildWorkMs).toBeLessThan(.13);
        if (!tiles.diagnostics.pendingTiles) break;
      }
      expect(tiles.diagnostics.pendingTiles).toBe(0);
      expect(tiles.diagnostics.cancelledBuilds).toBe(0);
      expect(tiles.meshes).toHaveLength(1);
      const prior = tiles.meshes[0].geometry, dispose = vi.spyOn(prior, 'dispose');
      // A replacement that becomes obsolete releases its generator without
      // releasing the still-visible completed draw buffer.
      tiles.update(4000, 4000, material);
      expect(dispose).not.toHaveBeenCalled();
      tiles.update(32, 32, material);
      expect(tiles.diagnostics.cancelledBuilds).toBeGreaterThan(0);
      expect(tiles.meshes[0].geometry).toBe(prior);
      expect(dispose).not.toHaveBeenCalled();
    } finally { timer.mockRestore(); query.mockRestore(); tiles.dispose(); material.dispose(); }
  });
  it("preserves authored maximum stages without generating unreachable dry mountain fringe", () => {
    const sample = { supported: true, waterBodyId: "water.test.pool", surfaceBase: 5, depthProxy: -0.5, tideResponse: 0, seasonResponse: 0 };
    const stage = { tidalAmplitudeM: 0.5, seasonalAmplitudeM: 1.4 };
    expect(inlandPotentiallyWet(sample, stage)).toBe(false);
    expect(inlandPotentiallyWet({ ...sample, seasonResponse: 1 }, stage)).toBe(true);
    expect(inlandPotentiallyWet({ ...sample, depthProxy: -0.4, tideResponse: 1 }, stage)).toBe(true);
  });

  it("simplifies only far cross-sections, preserving footprint and flat-bank waterlines", () => {
    const section = Array.from({ length: 21 }, (_, i) => ({ offsetM: i - 10,
      groundM: 3 + Math.abs(i - 10) * 0.2, accessOffsetM: -1 }));
    const record: ChannelRibbonRecord = { id: "water.test.lod", bodyIndex: 1, riverBand: 1,
      points: [{ x: 0, y: 5, z: 0, groundM: 3, halfWidthM: 2, crossSection: section },
        { x: 0, y: 4, z: 20, groundM: 2, halfWidthM: 2, crossSection: section }] };
    expect(ribbonRenderLod(record, 0)).toBe(record);
    const far = ribbonRenderLod(record, 0.5);
    expect(far.points[0].crossSection).toHaveLength(3);
    expect(far.points[0].crossSection![0]).toBe(section[0]);
    expect(far.points[0].crossSection!.at(-1)).toBe(section.at(-1));
    expect(far.points.map(p => [p.x, p.y, p.z])).toEqual(record.points.map(p => [p.x, p.y, p.z]));
    const flat = { ...record, points: record.points.map(p => ({ ...p,
      crossSection: section.map((s, i) => ({ ...s, groundM: 4.999 + (i === 10 ? 0.002 : 0) })) })) };
    // A 2mm bank ridge can separate broad water at this level; preserve it
    // even though its vertical error alone would be smaller than one pixel.
    expect(ribbonRenderLod(flat, 0.5).points[0].crossSection!.some(s => s.groundM > 5)).toBe(true);
    const planar = { ...record, points: record.points.map(p => ({ ...p,
      crossSection: section.map(s => ({ ...s, groundM: 2 + s.offsetM * 0.1 })) })) };
    // Even a mathematically redundant centre remains a required hydraulic
    // split station for the shared cross-section compiler.
    expect(ribbonRenderLod(planar, 2).points[0].crossSection!.map(s => s.offsetM)).toEqual([-10, 0, 10]);
  });

  it("uses a subpixel distant error budget while refining only offending native cells", () => {
    const data = fixture(66, [], (x, z) => 5 + (x === 29 && z === 29 ? 0.3 : 0));
    const near = inlandAdaptiveLeaves(data, 0, 0, 16, 0.04);
    const far = inlandAdaptiveLeaves(data, 0, 0, 16, 1);
    expect(near.some(leaf => leaf.step === 1)).toBe(true);
    expect(near.length).toBeLessThan(100);
    expect(far).toHaveLength(16);
    expect(near.reduce((sum, leaf) => sum + leaf.step ** 2, 0)).toBe(64 ** 2);
    const bounds = new Box3(new Vector3(0, 0, 0), new Vector3(64, 10, 64));
    const view: WaterGeometryView = { position: { x: 2064, y: 5, z: 32 }, pixelsPerRadian: 500, farM: 30000 };
    expect(waterPatchErrorM(bounds, view, 2)).toBe(1);
  });

  it("bounds uploads and resident geometry, retains broad far water and disposes replaced detail", () => {
    const data = fixture(), material = new MeshBasicMaterial();
    const tiles = new InlandWaterTiles(data, false, { maxTriangles: 100000, maxGeometryBytes: 12 * 1024 * 1024, buildsPerUpdate: 1 });
    const near: WaterGeometryView = { position: { x: 64, y: 10, z: 64 }, pixelsPerRadian: 600, farM: 30000 };
    try {
      for (let i = 0; i < 2048 && (i === 0 || tiles.diagnostics.pendingTiles); i++) {
        tiles.update(64, 64, material, 1, near);
        expect(tiles.diagnostics.builtLastUpdate).toBeLessThanOrEqual(1);
        expect(tiles.diagnostics.residentTriangles).toBeLessThanOrEqual(100000);
        expect(tiles.diagnostics.residentGeometryBytes).toBeLessThanOrEqual(12 * 1024 * 1024);
      }
      expect(tiles.diagnostics.residentTiles).toBe(9);
      expect(tiles.diagnostics.budgetFailures).toBe(0);
      const originalGeometry = tiles.meshes[0].geometry;
      const disposed = vi.spyOn(originalGeometry, "dispose");
      const far: WaterGeometryView = { position: { x: 4000, y: 1000, z: 4000 }, pixelsPerRadian: 600, farM: 30000 };
      for (let i = 0; i < 2048 && (i === 0 || tiles.diagnostics.pendingTiles); i++) tiles.update(4000, 4000, material, 1, far);
      expect(disposed).toHaveBeenCalled();
      expect(tiles.diagnostics.residentTiles).toBe(9);
      expect(tiles.diagnostics.residentTriangles).toBeLessThan(10000);
      expect(tiles.diagnostics.budgetFailures).toBe(0);
      expect(tiles.meshes.some(mesh => (mesh.geometry.index?.count ?? 0) > 0)).toBe(true);
      tiles.dispose();
      expect(tiles.diagnostics.residentGeometryBytes).toBe(0);
    } finally { tiles.dispose(); material.dispose(); }
  });

  it("streams native ribbons by spatial patch without centroid queries and keeps their full3D flow", () => {
    const records: ChannelRibbonRecord[] = Array.from({ length: 8 }, (_, i) => ({
      id: `water-ribbon.test-${i}`, bodyIndex: 1, riverBand: 1,
      points: [{ x: 10 + i * 300, y: 8, z: 10, halfWidthM: 2, groundM: 6 },
        { x: 10 + i * 300, y: 5, z: 20, halfWidthM: 2, groundM: 3 }],
    }));
    const data = fixture(66, records), material = new MeshBasicMaterial();
    const query = vi.spyOn(data.ribbons, "sample").mockImplementation(() => { throw new Error("redundant centroid query"); });
    const ribbons = new WaterRibbonTiles(data);
    const view: WaterGeometryView = { position: { x: 0, y: 10, z: 0 }, pixelsPerRadian: 600, farM: 30000 };
    try {
      for (let i = 0; i < 8; i++) { ribbons.update(view, material, 2); expect(ribbons.diagnostics.builtLastUpdate).toBeLessThanOrEqual(2); }
      expect(ribbons.diagnostics.residentPatches).toBe(8);
      expect(ribbons.diagnostics.budgetFailures).toBe(0);
      expect(query).not.toHaveBeenCalled();
      for (const mesh of ribbons.meshes) {
        expect(mesh.frustumCulled).toBe(true);
        expect(mesh.geometry.getAttribute("waterFlowY").getX(0)).toBeLessThan(0);
        expect(mesh.geometry.getAttribute("waterAccessOffset")).toBeDefined();
        expect(mesh.geometry.boundingBox!.max.y).toBeGreaterThanOrEqual(32);
      }
      ribbons.dispose(); expect(ribbons.diagnostics.residentGeometryBytes).toBe(0);
    } finally { query.mockRestore(); ribbons.dispose(); material.dispose(); }
  });

  it("does not construct an off-camera province and releases outgoing inland source and draw buffers", () => {
    const data = fixture(514), tiles = new InlandWaterTiles(data), material = new MeshBasicMaterial();
    const camera = new PerspectiveCamera(45, 1, 0.1, 100), views = new WaterGeometryCamera();
    camera.position.set(32, 8, 32); camera.lookAt(32, 5, 80); camera.updateMatrixWorld();
    const near = views.update(camera, 800);
    try {
      for (let frame = 0; frame < 100 && (frame === 0 || tiles.diagnostics.pendingTiles); frame++) tiles.update(32, 32, material, 1, near);
      expect(tiles.diagnostics.residentTiles).toBeLessThan(20); // Not the whole81-tile fixture.
      const old = tiles.meshes.map(mesh => vi.spyOn(mesh.geometry, 'dispose'));
      camera.position.set(490, 8, 490); camera.lookAt(490, 5, 450); camera.updateMatrixWorld();
      const moved = views.update(camera, 800);
      for (let frame = 0; frame < 100 && (frame === 0 || tiles.diagnostics.pendingTiles); frame++) tiles.update(490, 490, material, 1, moved);
      expect(old.every(dispose => dispose.mock.calls.length > 0)).toBe(true);
      expect(tiles.diagnostics.residentTiles).toBeLessThan(25);
      expect(tiles.diagnostics.budgetFailures).toBe(0);
      expect(tiles.meshes.some(mesh => mesh.geometry.getAttribute('position').getX(0) > 250)).toBe(true);
    } finally { tiles.dispose(); material.dispose(); }
  });

  it("does not build the unseen province and evicts outgoing ribbon patches before admitting a new region", () => {
    const records: ChannelRibbonRecord[] = Array.from({ length: 12 }, (_, i) => ({
      id: `water-ribbon.eviction-${i}`, bodyIndex: 1, riverBand: 1,
      points: [{ x: 10 + i * 600, y: 8, z: 10, halfWidthM: 2, groundM: 6 },
        { x: 10 + i * 600, y: 5, z: 20, halfWidthM: 2, groundM: 3 }],
    }));
    const data = fixture(66, records), material = new MeshBasicMaterial(), ribbons = new WaterRibbonTiles(data, true, 4, 4096);
    const view: WaterGeometryView = { position: { x: 0, y: 10, z: 0 }, pixelsPerRadian: 600, farM: 100 };
    try {
      for (let frame = 0; frame < 20; frame++) ribbons.update(view, material);
      expect(ribbons.diagnostics.residentPatches).toBe(1);
      expect(ribbons.diagnostics.pendingPatches).toBe(0);
      const original = ribbons.meshes[0].geometry, dispose = vi.spyOn(original, 'dispose');
      const moved: WaterGeometryView = { ...view, position: { x: 6600, y: 10, z: 0 } };
      for (let frame = 0; frame < 20; frame++) ribbons.update(moved, material);
      expect(dispose).toHaveBeenCalledOnce();
      expect(ribbons.diagnostics.residentPatches).toBe(1);
      expect(ribbons.diagnostics.budgetFailures).toBe(0);
      expect(ribbons.meshes[0].geometry.getAttribute('position').getX(0)).toBeGreaterThan(6500);
    } finally { ribbons.dispose(); material.dispose(); }
  });

  it("bounds record admission and keeps the previous LOD until the entire replacement is ready", () => {
    const records: ChannelRibbonRecord[] = Array.from({ length: 24 }, (_, i) => ({ id: `water-ribbon.incremental-${i}`, bodyIndex: 1, riverBand: 1,
      points: [{ x: 10 + i * 2, y: 8, z: 10, halfWidthM: 1, groundM: 6 }, { x: 10 + i * 2, y: 5, z: 20, halfWidthM: 1, groundM: 3 }] }));
    const data = fixture(66, records), material = new MeshBasicMaterial(), ribbons = new WaterRibbonTiles(data);
    const view: WaterGeometryView = { position: { x: 0, y: 10, z: 0 }, pixelsPerRadian: 600, farM: 30000 };
    const build = vi.spyOn(data.ribbons, 'meshDataFor');
    try {
      for (let frame = 0; frame < 30 && (frame === 0 || ribbons.diagnostics.pendingPatches); frame++) {
        const before = build.mock.calls.length; ribbons.update(view, material);
        expect(build.mock.calls.length - before).toBeLessThanOrEqual(8);
      }
      expect(ribbons.meshes).toHaveLength(1);
      const previous = ribbons.meshes[0].geometry, dispose = vi.spyOn(previous, 'dispose');
      const distant = { ...view, position: { x: 1800, y: 10, z: 0 } };
      ribbons.update(distant, material);
      expect(ribbons.meshes[0].geometry).toBe(previous); expect(dispose).not.toHaveBeenCalled();
      for (let frame = 0; frame < 30 && ribbons.diagnostics.pendingPatches; frame++) ribbons.update(distant, material);
      expect(dispose).toHaveBeenCalledOnce(); expect(ribbons.meshes[0].geometry).not.toBe(previous);
      expect(ribbons.diagnostics.admissionBytes).toBe(0); expect(ribbons.diagnostics.budgetFailures).toBe(0);
    } finally { build.mockRestore(); ribbons.dispose(); material.dispose(); }
  });
});
