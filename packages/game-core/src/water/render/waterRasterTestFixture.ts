import { RasterCutouts } from "../rasterCutouts";
import { readFileSync } from "node:fs";
import { inflateSync, gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { WaterData, type WaterMeta } from "../waterData";
import { PackedCrossSections } from "../packedCrossSections";
import { NativeWaterGround } from "../nativeWaterGround";
import { validateWaterMeta } from "./loadWaterAssets";

/** Test-only decoder for the compiler's RGB8, non-interlaced data PNGs.
 * Reads bytes as data; no browser, canvas or image ingestion is involved. */
function rgbPng(path: URL, expectedSize: number): Uint8ClampedArray {
  const png = readFileSync(path);
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  if (width !== expectedSize || height !== expectedSize) throw new Error('Water fixture raster dimensions disagree with metadata');
  if (png[24] !== 8 || png[25] !== 2 || png[28] !== 0) throw new Error("Expected compiler RGB8 PNG");
  const chunks: Buffer[] = [];
  for (let offset = 8; offset < png.length;) {
    const size = png.readUInt32BE(offset), type = png.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT") chunks.push(png.subarray(offset + 8, offset + 8 + size));
    offset += size + 12;
  }
  const compressed = inflateSync(Buffer.concat(chunks));
  const rowBytes = width * 3, decoded = new Uint8Array(rowBytes * height);
  for (let row = 0; row < height; row++) {
    const kind = compressed[row * (rowBytes + 1)];
    for (let col = 0; col < rowBytes; col++) {
      const i = row * rowBytes + col, left = col >= 3 ? decoded[i - 3] : 0;
      const above = row ? decoded[i - rowBytes] : 0, diagonal = row && col >= 3 ? decoded[i - rowBytes - 3] : 0;
      let predictor = 0;
      if (kind === 1) predictor = left;
      else if (kind === 2) predictor = above;
      else if (kind === 3) predictor = Math.floor((left + above) / 2);
      else if (kind === 4) {
        const p = left + above - diagonal, a = Math.abs(p - left), b = Math.abs(p - above), c = Math.abs(p - diagonal);
        predictor = a <= b && a <= c ? left : b <= c ? above : diagonal;
      } else if (kind !== 0) throw new Error("Unknown PNG row filter");
      decoded[i] = compressed[row * (rowBytes + 1) + col + 1] + predictor;
    }
  }
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = decoded[i * 3]; rgba[i * 4 + 1] = decoded[i * 3 + 1]; rgba[i * 4 + 2] = decoded[i * 3 + 2]; rgba[i * 4 + 3] = 255;
  }
  return rgba;
}

export function productionWaterData(base = new URL("../../../../../apps/world-studio/public/province/water/v2/", import.meta.url),
  province = new URL('../../', base)): WaterData {
  const meta: WaterMeta = JSON.parse(readFileSync(new URL("water-meta.json", base), "utf8"));
  validateWaterMeta(meta);
  const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
  let rasterCutouts: RasterCutouts | undefined;
  if (meta.rasterCutouts) {
    const descriptor = meta.rasterCutouts;
    if (hash(Buffer.from(JSON.stringify(meta.ribbons ?? []))) !== descriptor.sourceRibbonsSha256
      || descriptor.crossSectionsSha256 !== meta.crossSections?.sha256
      || descriptor.gridSize !== meta.surface.size || descriptor.metresPerPixel !== meta.surface.metresPerPixel)
      throw new Error('Raster cutout fixture source mismatch');
    const compressed = readFileSync(new URL(descriptor.file, base));
    if (compressed.byteLength !== descriptor.downloadBytes) throw new Error('Raster cutout fixture download mismatch');
    const bytes = gunzipSync(compressed, { maxOutputLength: descriptor.bytes });
    if (hash(bytes) !== descriptor.sha256) throw new Error('Raster cutout fixture integrity mismatch');
    rasterCutouts = new RasterCutouts(descriptor, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  }
  if (meta.crossSections) {
    const packed = readFileSync(new URL(meta.crossSections.file, base));
    if (meta.crossSections.sha256 && hash(packed) !== meta.crossSections.sha256) throw new Error('Packed water section fixture integrity mismatch');
    new PackedCrossSections(meta.crossSections, packed.buffer.slice(packed.byteOffset, packed.byteOffset + packed.byteLength), meta.ribbons ?? []);
  }
  let nativeGround: NativeWaterGround | undefined;
  if (meta.nativeGround) {
    const descriptor = meta.nativeGround, compressed = readFileSync(new URL(descriptor.file, base));
    if (compressed.byteLength !== descriptor.downloadBytes) throw new Error('Native water fixture download byte mismatch');
    const bytes = gunzipSync(compressed, { maxOutputLength: descriptor.bytes });
    if (bytes.byteLength !== descriptor.bytes || hash(bytes) !== descriptor.sha256) throw new Error('Native water fixture integrity mismatch');
    const sources = [
      [new URL('chunks/chunks-web-manifest.json', province), descriptor.nativeManifestSha256],
      [new URL(meta.surface.bedOverlayFile!, base), descriptor.bedOverlaySha256],
      [new URL(meta.surface.terrainTopologyFile!, base), descriptor.topologySha256],
    ] as const;
    for (const [path, expected] of sources) if (hash(readFileSync(path)) !== expected) throw new Error('Native water fixture source bundle mismatch');
    nativeGround = new NativeWaterGround(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  }
  const surface = rgbPng(new URL(meta.surface.file, base), meta.surface.size);
  const shore = rgbPng(new URL(meta.surface.shoreFile!, base), meta.surface.size);
  const heights = new Float32Array(meta.surface.size ** 2), depth = new Float32Array(heights.length);
  const season = new Float32Array(heights.length), shoreDistance = new Float32Array(heights.length), tannin = new Float32Array(heights.length);
  for (let i = 0; i < heights.length; i++) {
    heights[i] = meta.surface.minM + (surface[i * 4] * 256 + surface[i * 4 + 1]) / 65535 * (meta.surface.maxM - meta.surface.minM);
    depth[i] = surface[i * 4 + 2] * 0.1 + (meta.surface.depthMinM ?? 0);
    season[i] = shore[i * 4 + 1] / 255;
    shoreDistance[i] = shore[i * 4] / 255 * meta.surface.shoreMaxM!;
    tannin[i] = shore[i * 4 + 2] / 255;
  }
  const basin = JSON.parse(readFileSync(new URL('refined/flood-states.json', province), 'utf8')).basins[0];
  return new WaterData(meta, heights, depth, rgbPng(new URL(meta.flow.file, base), meta.flow.size),
    rgbPng(new URL(meta.klass.file, base), meta.klass.size), shoreDistance, season,
    rgbPng(new URL(meta.surface.supportFile!, base), meta.surface.size),
    rgbPng(new URL(meta.klass.characterFile!, base), meta.klass.size), tannin,
    meta.surface.accessFile ? rgbPng(new URL(meta.surface.accessFile, base), meta.surface.size) : undefined,
    nativeGround, basin.tidalAmplitudeM + basin.seasonalAmplitudeM, rasterCutouts);
}
