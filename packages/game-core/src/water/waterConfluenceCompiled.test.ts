/** Opt-in bounded final-artifact gate; see CONFLUENCE_GATE.md. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { expect, it, vi } from 'vitest';
import { MeshBasicMaterial, type Mesh } from 'three';
import { WaterData, type WaterMeta } from './waterData';
import { WaterWorld } from './waterWorld';
import { PackedCrossSections } from './packedCrossSections';
import { NativeWaterGround } from './nativeWaterGround';
import { InlandWaterTiles } from './render/InlandWaterTiles';
import { validateWaterMeta } from './render/loadWaterAssets';
import { standingEdgeStageUnion, type OwnershipEdgeProbe } from './compiledConfluenceProbes';

const enabled = !!process.env.WATER_CONFLUENCE_EDGE_PROBES;
const full = process.env.WATER_CONFLUENCE_FULL === '1';
it.skipIf(!enabled)('matches final rendered confluences and rejects standing water hidden under dry native ownership', () => {
  const folder = resolve(process.env.WATER_COMPILED_ASSETS!);
  const read = (file: string) => readFileSync(resolve(folder, file));
  const meta: WaterMeta = JSON.parse(read('water-meta.json').toString());
  validateWaterMeta(meta);
  if (!meta.crossSections || !meta.nativeGround || !meta.surface.nativeChannelCoverage) throw Error('Final packed/native-ground ownership bundle required');
  const packed = read(meta.crossSections.file);
  if (!meta.crossSections.sha256 || createHash('sha256').update(packed).digest('hex') !== meta.crossSections.sha256) throw Error('Packed profiles hash mismatch/missing');
  new PackedCrossSections(meta.crossSections, packed.buffer.slice(packed.byteOffset, packed.byteOffset + packed.byteLength), meta.ribbons!);
  const compressed = read(meta.nativeGround.file), raw = gunzipSync(compressed);
  if (compressed.byteLength !== meta.nativeGround.downloadBytes || raw.byteLength !== meta.nativeGround.bytes
    || createHash('sha256').update(raw).digest('hex') !== meta.nativeGround.sha256) throw Error('Native terrain hash/size mismatch');
  for (const [file, hash] of [[meta.surface.bedOverlayFile!, meta.nativeGround.bedOverlaySha256],
    [meta.surface.terrainTopologyFile!, meta.nativeGround.topologySha256]]) {
    if (createHash('sha256').update(read(file)).digest('hex') !== hash) throw Error(`Native terrain stale against ${file}`);
  }
  const ground = new NativeWaterGround(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
  // Reuse the compiler's installed Pillow decoder; no browser, generated
  // files, PNG reimplementation, or production-global mocks are needed.
  const png = (file: string, size: number) => {
    const bytes = execFileSync(process.env.WATER_AUDIT_PYTHON ?? 'python3', ['-c',
      'from PIL import Image; import sys; im=Image.open(sys.argv[1]).convert("RGBA"); assert im.size==(int(sys.argv[2]),)*2; sys.stdout.buffer.write(im.tobytes())',
      resolve(folder, file), String(size)], { maxBuffer: size * size * 4 + 1024 });
    return new Uint8ClampedArray(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  };
  const sm = meta.surface, count = sm.size ** 2;
  const surfaceBytes = png(sm.file, sm.size), shoreBytes = png(sm.shoreFile!, sm.size);
  const surface = new Float32Array(count), depth = new Float32Array(count), shore = new Float32Array(count), season = new Float32Array(count), tannin = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const p = i * 4;
    surface[i] = sm.minM + (surfaceBytes[p] * 256 + surfaceBytes[p + 1]) / 65535 * (sm.maxM - sm.minM);
    depth[i] = surfaceBytes[p + 2] * .1 + sm.depthMinM!;
    shore[i] = shoreBytes[p] / 255 * sm.shoreMaxM!; season[i] = shoreBytes[p + 1] / 255; tannin[i] = shoreBytes[p + 2] / 255;
  }
  const flood = JSON.parse(readFileSync(resolve(process.env.WATER_COMPILED_FLOOD_STATES!), 'utf8'));
  const amplitudes = flood.floodBasins?.[0] ?? flood.basins?.[0] ?? flood;
  // The shipped flood file is a single record; reject unrelated schemas.
  const tidalAmplitudeM = amplitudes.tidalAmplitudeM, seasonalAmplitudeM = amplitudes.seasonalAmplitudeM;
  if (![tidalAmplitudeM, seasonalAmplitudeM].every(v => Number.isFinite(v) && v >= 0)) throw Error('Explicit preserved flood amplitudes required');
  const data = new WaterData(meta, surface, depth, png(meta.flow.file, meta.flow.size), png(meta.klass.file, meta.klass.size),
    shore, season, png(sm.supportFile!, sm.size), png(meta.klass.characterFile!, meta.klass.size), tannin, png(sm.accessFile!, sm.size), ground,
    tidalAmplitudeM + seasonalAmplitudeM);
  const world = new WaterWorld(data, { tidalAmplitudeM, seasonalAmplitudeM, seasonScalar: () => 0, groundHeight: (x, z) => ground.sample(x, z) });
  const stages = [{ tide: 0, season: 0 }, ...[-1, 1].flatMap(sign => [-.2, 1].map(s => ({ tide: sign * tidalAmplitudeM, season: s * seasonalAmplitudeM })))];
  const levelSpy = vi.spyOn(world, 'levelOffsets');
  const key = (x: number, z: number) => `${x.toFixed(4)},${z.toFixed(4)}`;
  const junctions = new Map<string, { x: number; z: number; neighbours: Set<string> }>();
  const bounds = meta.ribbons!.map(record => {
    for (let i = 1; i < record.points.length; i++) for (const [a, b] of [[record.points[i - 1], record.points[i]], [record.points[i], record.points[i - 1]]]) {
      const id = key(a.x, a.z), node = junctions.get(id) ?? { x: a.x, z: a.z, neighbours: new Set<string>() };
      node.neighbours.add(key(b.x, b.z)); junctions.set(id, node);
    }
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const p of record.points) {
      const radius = Math.max(Math.abs(p.crossSectionMinOffsetM ?? -p.halfWidthM * 2), Math.abs(p.crossSectionMaxOffsetM ?? p.halfWidthM * 2));
      minX = Math.min(minX, p.x - radius); maxX = Math.max(maxX, p.x + radius); minZ = Math.min(minZ, p.z - radius); maxZ = Math.max(maxZ, p.z + radius);
    }
    return { record, minX, minZ, maxX, maxZ };
  });
  const spread = <T,>(items: T[], n: number) => Array.from({ length: Math.min(n, items.length) }, (_, i) => items[Math.floor(i * items.length / Math.min(n, items.length))]);
  const joins = spread([...junctions.values()].filter(j => j.neighbours.size >= 3).sort((a, b) => a.z - b.z || a.x - b.x), full ? Infinity : 3);
  expect(joins.length).toBeGreaterThanOrEqual(3);
  const probeFile: { schemaVersion: number; selection: string; waterMetaSha256: string; cases: OwnershipEdgeProbe[] } = JSON.parse(readFileSync(process.env.WATER_CONFLUENCE_EDGE_PROBES!, 'utf8'));
  if (probeFile.schemaVersion !== 2 || probeFile.selection !== 'all-owner-edges'
    || probeFile.waterMetaSha256 !== createHash('sha256').update(read('water-meta.json')).digest('hex')) {
    throw Error('Regenerate matching owner probes with --all-owner-edges; base-only/stale probes cannot certify seasonal coverage');
  }
  const union = standingEdgeStageUnion(probeFile.cases, data, (x, z) => ground.sample(x, z), stages)
    .sort((a, b) => a.edge.outside[1] - b.edge.outside[1] || a.edge.outside[0] - b.edge.outside[0]);
  const newlyWet = union.filter(e => !(e.stageMask & 1));
  // A small pass samples both categories explicitly; evenly spreading the
  // combined list could accidentally omit every seasonal-only boundary.
  const selectedEdges = full ? union : [...spread(union.filter(e => e.stageMask & 1), 3), ...spread(newlyWet, 3)];
  const edges = selectedEdges.map(e => e.edge);
  expect(edges.length, 'Need native-to-standing owner-edge probes, not just native/native edges').toBeGreaterThanOrEqual(3);
  const probes = joins.flatMap(j => [0, .25, 1, 2].flatMap(radius => Array.from({ length: radius ? 8 : 1 }, (_, i) => ({
    x: j.x + Math.cos(i * Math.PI / 4) * radius, z: j.z + Math.sin(i * Math.PI / 4) * radius, label: `degree${j.neighbours.size}:${key(j.x, j.z)}` }))));
  for (const e of edges) for (const [x, z] of [e.inside, e.outside]) probes.push({ x, z, label: `${e.id}:${e.point}` });
  const material = new MeshBasicMaterial(), inland = new InlandWaterTiles(data, false, { stage: { tidalAmplitudeM, seasonalAmplitudeM } });
  // Exercise the production generator one local tile at a time, without
  // admitting a province view or waiting on animation-frame scheduling.
  const builder = inland as unknown as { build(tx: number, tz: number, step: number, material: MeshBasicMaterial): Generator<void, Mesh> };
  const meshCache = new Map<string, ReturnType<typeof data.ribbons.meshDataFor>>();
  const facesAt = (x: number, z: number) => {
    const result: { height: number; access: number; tide: number; season: number; owner: number }[] = [];
    for (const b of bounds) {
      if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
      let mesh = meshCache.get(b.record.id);
      if (!mesh) { mesh = data.ribbons.meshDataFor([b.record], { refineGround: false }); meshCache.set(b.record.id, mesh); if (meshCache.size > 32) meshCache.delete(meshCache.keys().next().value!); }
      const p = mesh.positions;
      for (let i = 0; i < p.length; i += 9) {
        const w = weights(x, z, p[i], p[i + 2], p[i + 3], p[i + 5], p[i + 6], p[i + 8]);
        if (!w) continue;
        const j = i / 3, lerp = (a: ArrayLike<number>, start: number, stride: number) => w.reduce((v, weight, k) => v + weight * a[start + k * stride], 0);
        result.push({ height: lerp(p, i + 1, 3), access: lerp(mesh.floodAccessOffsets, j, 1), tide: lerp(mesh.levelResponses, j * 3, 3),
          season: lerp(mesh.levelResponses, j * 3 + 1, 3), owner: mesh.bodyIndices[j] });
      }
    }
    return result;
  };
  const failures: string[] = [];
  let checked = 0, standing = 0, nearThreshold = 0, fallingDomainsExcluded = 0, marineDomainsExcluded = 0;
  try {
    const groups = new Map<string, typeof probes>();
    for (const p of probes) { const id = `${Math.floor(p.x / (64 * sm.metresPerPixel))},${Math.floor(p.z / (64 * sm.metresPerPixel))}`; groups.set(id, [...(groups.get(id) ?? []), p]); }
    for (const [tile, points] of groups) for (const lod of [1, 16]) {
      const [tx, tz] = tile.split(',').map(Number), build = builder.build(tx, tz, lod, material);
      let next = build.next(); while (!next.done) next = build.next();
      const geometry = next.value.geometry, p = geometry.getAttribute('position'), index = geometry.index!;
      try { for (const point of points) {
        const { x, z } = point;
        // This gate is deliberately about banked confluences; mixed curtain
        // records need a per-face sheet discriminator and have separate tests.
        if (bounds.some(b => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ && b.record.points.some(p => p.fallingToNext))) {
          fallingDomainsExcluded++; continue;
        }
        const bed = ground.sample(x, z);
        if (bed === null) throw Error(`Missing final native bed at ${point.label} ${x},${z}`);
        const faces = facesAt(x, z), raster = data.boundaryAt(x, z, undefined, false);
        // Marine coverage comes from a separate surface renderer. Treating
        // the absence of an inland tile there as a hole is not an independent
        // ocean oracle; keep these cases explicit for the marine gate.
        const rasterClass = data.rasterClassAt(x, z);
        if (raster.supported && (rasterClass === 1 || rasterClass === 2)) {
          marineDomainsExcluded++; continue;
        }
        let rasterCovered = false;
        for (let i = 0; i < index.count && !rasterCovered; i += 3) {
          const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
          rasterCovered = !!weights(x, z, p.getX(a), p.getZ(a), p.getX(b), p.getZ(b), p.getX(c), p.getZ(c));
        }
        for (const stage of stages) {
          levelSpy.mockReturnValue(stage);
          const wetFaces = faces.filter(f => f.access <= stage.tide * f.tide + stage.season * f.season + .001
            && f.height + stage.tide * f.tide + stage.season * f.season - bed > .004);
          const rasterOffset = stage.tide * raster.tideResponse + stage.season * raster.seasonResponse;
          const rasterWet = raster.supported && rasterOffset + .001 >= (raster.floodAccessOffsetM ?? -Infinity) && raster.surfaceBase + rasterOffset - bed > .004;
          const rendered = wetFaces.map(f => f.height + stage.tide * f.tide + stage.season * f.season);
          if (rasterCovered && rasterWet) rendered.push(raster.surfaceBase + rasterOffset);
          const query = world.sampleBoundary(x, z, 0), label = `${point.label} ${x},${z} LOD${lod} tide${stage.tide} season${stage.season}`;
          // Count threshold-near cases, but do not waive their classification.
          const threshold = faces.some(f => Math.min(Math.abs(f.access - stage.tide * f.tide - stage.season * f.season - .001),
            Math.abs(f.height + stage.tide * f.tide + stage.season * f.season - bed - .004)) < .0002);
          if (threshold) nearThreshold++;
          if (!!query.waterBodyId !== !!rendered.length || (rendered.length && Math.abs(query.surfaceHeight - Math.max(...rendered)) > .002)) failures.push(`${label}: query/render disagreement`);
          if (rasterWet) {
            standing++;
            if (!rendered.length) failures.push(`${label}: wet standing owner removed by dry native footprint`);
            else if (Math.max(...rendered) < raster.surfaceBase + rasterOffset - .002) failures.push(`${label}: native handoff leaves standing plane below its level`);
          }
          checked++;
        }
      } } finally { geometry.dispose(); }
    }
  } finally { material.dispose(); inland.dispose(); levelSpy.mockRestore(); }
  console.info(JSON.stringify({ gate: 'compiled-confluence', full, joins: joins.length, standingEdges: edges.length,
    potentialOwnerEdges: probeFile.cases.length, standingStageUnion: union.length, newlyWetStandingEdges: newlyWet.length,
    selectedNewlyWetEdges: selectedEdges.filter(e => !(e.stageMask & 1)).length,
    checked, standing, nearThreshold, fallingDomainsExcluded, marineDomainsExcluded, failures: failures.slice(0, 20) }));
  expect(checked).toBeGreaterThan(100); expect(standing).toBeGreaterThan(0);
  expect(failures).toEqual([]);
}, full ? 180_000 : 30_000);

function weights(x: number, z: number, ax: number, az: number, bx: number, bz: number, cx: number, cz: number): number[] | null {
  const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
  if (Math.abs(d) < 1e-10) return null;
  const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
  const v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d, w = 1 - u - v;
  return Math.min(u, v, w) >= -1e-7 ? [u, v, w] : null;
}
