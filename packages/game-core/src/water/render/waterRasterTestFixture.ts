import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { WaterData, type WaterMeta } from "../waterData";

/** Test-only decoder for the compiler's RGB8, non-interlaced data PNGs.
 * Reads bytes as data; no browser, canvas or image ingestion is involved. */
function rgbPng(path: URL): Uint8ClampedArray {
  const png = readFileSync(path);
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
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

export function productionWaterData(): WaterData {
  const base = new URL("../../../../../apps/world-studio/public/province/water/v2/", import.meta.url);
  const meta: WaterMeta = JSON.parse(readFileSync(new URL("water-meta.json", base), "utf8"));
  const surface = rgbPng(new URL(meta.surface.file, base));
  const shore = rgbPng(new URL(meta.surface.shoreFile!, base));
  const heights = new Float32Array(meta.surface.size ** 2), depth = new Float32Array(heights.length);
  const season = new Float32Array(heights.length);
  for (let i = 0; i < heights.length; i++) {
    heights[i] = meta.surface.minM + (surface[i * 4] * 256 + surface[i * 4 + 1]) / 65535 * (meta.surface.maxM - meta.surface.minM);
    depth[i] = surface[i * 4 + 2] * 0.1 + (meta.surface.depthMinM ?? 0);
    season[i] = shore[i * 4 + 1] / 255;
  }
  return new WaterData(meta, heights, depth, new Uint8ClampedArray(meta.flow.size ** 2 * 4),
    rgbPng(new URL(meta.klass.file, base)), undefined, season,
    rgbPng(new URL(meta.surface.supportFile!, base)), undefined, undefined,
    meta.surface.accessFile ? rgbPng(new URL(meta.surface.accessFile, base)) : undefined);
}
