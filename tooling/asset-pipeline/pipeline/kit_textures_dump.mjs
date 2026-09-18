#!/usr/bin/env node
/**
 * Dump every texture a kit GLB carries, keyed by the material and slot that
 * uses it, so the source (PNG) and the compressed (KTX2) build of the same
 * kit can be compared texel for texel by `pipeline/texture_quality.py`.
 *
 *   node kit_textures_dump.mjs <kit.glb> <out-dir>
 *
 * Writes `<out-dir>/index.json` plus one file per image: the PNG bytes as
 * shipped for a PNG image, or the top mip transcoded to RGBA8 (`.rgba`, row
 * major, width*height*4 bytes) for a KTX2 image. KTX2 is decoded with the
 * same Basis Universal transcoder the runtime uses (three.js's copy), so
 * what the metric sees is what the GPU is handed.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const [, , glbPath, outDir] = process.argv;
if (!glbPath || !outDir) {
  console.error("usage: kit_textures_dump.mjs <kit.glb> <out-dir>");
  process.exit(2);
}

function parseGlb(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${glbPath}: not a GLB`);
  let off = 12;
  let json = null;
  let bin = null;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    const chunk = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString("utf8"));
    else if (type === 0x004e4942) bin = chunk;
    off += 8 + len;
  }
  return { json, bin };
}

const SLOTS = [
  ["baseColor", (m) => m.pbrMetallicRoughness?.baseColorTexture],
  ["metallicRoughness", (m) => m.pbrMetallicRoughness?.metallicRoughnessTexture],
  ["normal", (m) => m.normalTexture],
  ["occlusion", (m) => m.occlusionTexture],
  ["emissive", (m) => m.emissiveTexture],
];

const { json, bin } = parseGlb(readFileSync(resolve(glbPath)));
mkdirSync(resolve(outDir), { recursive: true });

const imageBytes = (image) => {
  const bv = json.bufferViews[image.bufferView];
  return bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength);
};

const slots = [];
const wanted = new Set();
for (const material of json.materials ?? []) {
  for (const [slot, pick] of SLOTS) {
    const ref = pick(material);
    if (!ref) continue;
    const texture = json.textures[ref.index];
    const source = texture.extensions?.KHR_texture_basisu?.source ?? texture.source;
    slots.push({ material: material.name ?? "", slot, image: source,
      alphaMode: material.alphaMode ?? "OPAQUE" });
    wanted.add(source);
  }
}

let basis = null;
async function transcoder() {
  if (basis) return basis;
  // three ships the transcoder as a UMD script inside an ESM package, so a
  // plain import yields no exports; evaluate it under a CommonJS shim.
  const file = require.resolve("three/examples/jsm/libs/basis/basis_transcoder.js");
  const shim = { exports: {} };
  new Function("module", "exports", "require", "__dirname", readFileSync(file, "utf8"))(
    shim, shim.exports, require, resolve(file, ".."));
  const factory = shim.exports;
  basis = await factory();
  basis.initializeBasis();
  return basis;
}

const images = [];
for (const index of [...wanted].sort((a, b) => a - b)) {
  const image = json.images[index];
  const bytes = imageBytes(image);
  if (image.mimeType === "image/png" || image.mimeType === "image/jpeg") {
    const ext = image.mimeType === "image/png" ? "png" : "jpg";
    const file = `${index}.${ext}`;
    writeFileSync(join(outDir, file), bytes);
    images.push({ index, file, encoding: ext, bytes: bytes.length, name: image.name ?? "" });
    continue;
  }
  if (image.mimeType !== "image/ktx2") throw new Error(`image ${index}: unsupported ${image.mimeType}`);
  const m = await transcoder();
  const ktx = new m.KTX2File(new Uint8Array(bytes));
  if (!ktx.isValid()) throw new Error(`image ${index}: invalid KTX2`);
  const width = ktx.getWidth();
  const height = ktx.getHeight();
  const format = m.transcoder_texture_format.cTFRGBA32.value;
  if (!ktx.startTranscoding()) throw new Error(`image ${index}: startTranscoding failed`);
  const size = ktx.getImageTranscodedSizeInBytes(0, 0, 0, format);
  const dst = new Uint8Array(size);
  if (!ktx.transcodeImage(dst, 0, 0, 0, format, 0, -1, -1)) throw new Error(`image ${index}: transcode failed`);
  const file = `${index}.rgba`;
  writeFileSync(join(outDir, file), dst);
  images.push({ index, file, encoding: ktx.isUASTC() ? "uastc" : "etc1s", width, height,
    levels: ktx.getLevels(), hasAlpha: !!ktx.getHasAlpha(), bytes: bytes.length, name: image.name ?? "" });
  ktx.close();
}
writeFileSync(join(outDir, "index.json"), JSON.stringify({ glb: resolve(glbPath), images, slots }, null, 1));
console.log(`${images.length} images, ${slots.length} material slots -> ${outDir}`);
