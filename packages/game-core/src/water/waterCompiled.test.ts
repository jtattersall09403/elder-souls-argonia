import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from "vitest";
import { ChannelRibbonSampler } from "./channelRibbons";
import type { WaterMeta } from "./waterData";
import { SparseHeightOverlay, type SparseHeightOverlayData } from "../terrain/chunkStore";
import { PackedCrossSections } from './packedCrossSections';
import { NativeWaterGround } from './nativeWaterGround';
import { validateNativeWaterGroundMeta } from './nativeWaterGroundLoader';
import { validateSeasonalRibbon } from './waterStage';

// Test the shipped artifacts, not another implementation of the compiler.
const assets = process.env.WATER_COMPILED_ASSETS
  ? pathToFileURL(`${resolve(process.env.WATER_COMPILED_ASSETS)}/`)
  : new URL("../../../../apps/world-studio/public/province/water/v2/", import.meta.url);
const meta: WaterMeta = JSON.parse(readFileSync(new URL("water-meta.json", assets), "utf8"));
if (meta.crossSections) {
  const binary = readFileSync(new URL(meta.crossSections.file, assets));
  if (meta.crossSections.sha256 && createHash('sha256').update(binary).digest('hex') !== meta.crossSections.sha256) {
    throw new Error('Compiled water sidecar checksum mismatch');
  }
  new PackedCrossSections(meta.crossSections, binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength), meta.ribbons ?? []);
}
let nativeGround: NativeWaterGround | undefined;
if (meta.nativeGround) {
  validateNativeWaterGroundMeta(meta.nativeGround);
  const compressed = readFileSync(new URL(meta.nativeGround.file, assets));
  if (compressed.byteLength !== meta.nativeGround.downloadBytes) throw new Error('Compiled native terrain download size mismatch');
  const binary = gunzipSync(compressed, { maxOutputLength: meta.nativeGround.bytes });
  if (binary.byteLength !== meta.nativeGround.bytes || createHash('sha256').update(binary).digest('hex') !== meta.nativeGround.sha256) {
    throw new Error('Compiled native terrain water authority checksum mismatch');
  }
  nativeGround = new NativeWaterGround(binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength));
}
const overlay: SparseHeightOverlayData =
  JSON.parse(readFileSync(new URL("water-bed-overlay.json", assets), "utf8"));

describe("shipped water topology", () => {
  it("has flat standing pools and no unhandled drainage gaps", () => {
    expect(meta.terrainMismatches).toEqual([]);
    expect(meta.stats?.terrainMismatchReachCount).toBe(0);
    expect(meta.stats?.standingPoolCount).toBeGreaterThan(0);
    expect(meta.stats?.standingPoolMaxLevelRangeM).toBe(0);
    expect(meta.stats?.nativeAscendingSegmentCount).toBe(0);
    if (meta.surface.nativeChannelCoverage) {
      expect(meta.stats?.immutableRetainingBoundViolationCount, 'Native repairs must preserve every original retaining support').toBe(0);
    }
  });
  it("contains downstream, wetted ribbons and finite cascade endpoints attached to real bodies", () => {
    expect(meta.schemaVersion).toBe(2);
    expect(meta.ribbons!.length).toBeGreaterThan(0);
    const bodies = new Map(meta.bodies!.map(body => [body.index, body.id]));
    expect(bodies.size).toBe(meta.bodies!.length);
    const ids = new Set<string>();
    for (const ribbon of meta.ribbons!) {
      validateSeasonalRibbon(ribbon, meta.stageRange);
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
        // Permanent reaches retain their base-depth guard; explicitly
        // seasonal records have already passed the wet-peak check above.
        if (!ribbon.baseMayBeDry) expect(point.y - point.groundM!, label).toBeGreaterThanOrEqual(-0.001);
        if (point.crossSection) {
          const section = point.crossSection;
          const centre = section.findIndex(s => s.offsetM === 0);
          expect(centre, label).toBeGreaterThanOrEqual(0);
          expect(section[centre].groundM, label).toBeCloseTo(point.groundM!, 3);
          let previousOffset = -Infinity;
          for (const station of section) {
            // Direct guards preserve exhaustive checks without millions of
            // matcher allocations on the native cross-section export.
            if (![station.offsetM, station.groundM, station.accessOffsetM].every(Number.isFinite)
              || station.offsetM <= previousOffset || station.accessOffsetM + 0.0001 < station.groundM - point.y) {
              throw new Error(`${label}: invalid ground/access or unordered cross-section offset ${station.offsetM}`);
            }
            previousOffset = station.offsetM;
          }
          // Lower ground beyond a bank cannot become an isolated flooded
          // pocket: each outward ray retains its highest access barrier.
          for (let j = centre + 1; j < section.length; j++) if (section[j].accessOffsetM + 0.0001 < section[j - 1].accessOffsetM) throw new Error(`${label}: outward access barrier descends`);
          for (let j = centre - 1; j >= 0; j--) if (section[j].accessOffsetM + 0.0001 < section[j + 1].accessOffsetM) throw new Error(`${label}: outward access barrier descends`);
        }
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
    const sampler = new ChannelRibbonSampler(meta.ribbons!, 32, nativeGround);
    let tested = 0, floodClassifications = 0, baseWet = 0, expandedWet = 0, terrainProbes = 0;
    // Stream records through the gate too; don't allocate the entire expanded
    // province's seasonal geometry merely to verify its local triangles.
    for (const record of meta.ribbons!) {
    // Native atlas rendering preserves the authored water plane and samples
    // the exact terrain field per fragment; it does not ship the diagnostic
    // millions-of-triangles native ground tessellation.
    const mesh = sampler.meshDataFor([record], { refineGround: !nativeGround });
    const queryStride = Math.max(1, Math.ceil(mesh.positions.length / 9 / 8));
    for (let i = 0; i < mesh.positions.length; i += 9) {
      const p = mesh.positions;
      const area = (p[i + 3] - p[i]) * (p[i + 8] - p[i + 2])
        - (p[i + 6] - p[i]) * (p[i + 5] - p[i + 2]);
      if (Math.abs(area) < 0.000001) continue;
      const x = (p[i] + p[i + 3] + p[i + 6]) / 3;
      const z = (p[i + 2] + p[i + 5] + p[i + 8]) / 3;
      const renderedHeight = (p[i + 1] + p[i + 4] + p[i + 7]) / 3;
      const nativeBed = nativeGround?.sample(x, z);
      if (nativeGround) {
        if (nativeGround.cellKeyAt(x, z) === null) continue; // renderer rejects the same outside-province domain
        if (nativeBed === null || !Number.isFinite(nativeBed)) throw new Error(`${record.id}: native ground misses render centroid ${x},${z}`);
        for (const corner of [0, 3, 6]) {
          const ground = nativeGround.sample(p[i + corner], p[i + corner + 2]);
          // Authored outer envelopes can lie outside the province; the GPU
          // rejects that domain. Inside-domain missing coverage is an error.
          if (nativeGround.cellKeyAt(p[i + corner], p[i + corner + 2]) !== null && ground === null) {
            throw new Error(`${record.id}: missing native ground at render vertex`);
          }
        }
        terrainProbes++;
        const denseRepro = Math.abs(x - 2370) < 150 && Math.abs(z - 190) < 150;
        if (i / 9 % queryStride !== 0 && !denseRepro) continue;
      }
      const sample = sampler.sample(x, z);
      expect(sample, `triangle ${i / 9} at ${x},${z}`).not.toBeNull();
      // Float32 GPU positions differ slightly from compiler decimal doubles.
      expect(sample!.height + 0.002, `triangle ${i / 9}`).toBeGreaterThanOrEqual(renderedHeight);
      if (!record.points.some(point => point.crossSection)) {
        expect(sample!.height - sample!.groundHeight!, `triangle ${i / 9}`).toBeGreaterThanOrEqual(-0.001);
      } else if (sample!.ribbonId === record.id && Math.abs(sample!.height - renderedHeight) < 0.0001) {
        const j = i / 3;
        const ground = nativeBed ?? (mesh.groundHeights[j] + mesh.groundHeights[j + 1] + mesh.groundHeights[j + 2]) / 3;
        const access = (mesh.floodAccessOffsets[j] + mesh.floodAccessOffsets[j + 1] + mesh.floodAccessOffsets[j + 2]) / 3;
        // These are the actual interpolated attributes used by the shader,
        // compared with independently selected CPU triangles and stage gates.
        // Seasonal margins MAY be dry at base; they must not float then.
        for (const stage of [-0.28, 0, 1.4]) {
          if (Math.abs(renderedHeight + stage - ground - 0.004) < 0.0002 || Math.abs(stage - access) < 0.0002) continue;
          const renderedWet = renderedHeight + stage - ground > 0.004 && stage >= access;
          const cpuWet = sample!.height + stage - sample!.groundHeight! > 0.004
            && stage >= (sample!.floodAccessOffsetM ?? -1e6);
          expect(cpuWet, `${record.id} triangle ${i / 9} stage ${stage}`).toBe(renderedWet);
          if (stage === 0 && renderedWet) baseWet++;
          if (stage === 1.4 && renderedWet) expandedWet++;
          floodClassifications++;
        }
      }
      tested++;
    }
    }
    expect(tested).toBeGreaterThan(meta.ribbons!.length);
    if (nativeGround) expect(terrainProbes).toBeGreaterThan(tested);
    if (meta.ribbons!.some(record => record.points.some(point => point.crossSection))) {
      expect(floodClassifications).toBeGreaterThan(tested);
      expect(baseWet).toBeGreaterThan(meta.ribbons!.length);
      expect(expandedWet).toBeGreaterThan(baseWet);
    }
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
