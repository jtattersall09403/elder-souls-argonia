#!/usr/bin/env node
/**
 * Publish a kit's PARTS folder beside its whole GLB (16k walk 4, lane
 * INTERIOR2): one glTF per asset holding only that asset's LOD0 meshes and
 * the materials they use, so an interior cell fetches the 53 pieces it draws
 * instead of the seven whole kits that hold them (KeebaHouseFisher: 108.9 MB).
 *
 *   node tooling/asset-pipeline/pipeline/kit_parts.mjs --kit works-v1 [--kit …]
 *   node tooling/asset-pipeline/pipeline/kit_parts.mjs --all            # every SCOPED kit; prunes the rest
 *   node tooling/asset-pipeline/pipeline/kit_parts.mjs --all --check    # exit 1 if any part is stale or out of scope
 *
 * Scope (16k walk 4, lane PARTS): only the interior loader reads parts, so a
 * kit publishes parts only when a published interior cell bundle
 * (public/province/interiors/<cell>.json) names it in its `kits` table. A kit
 * no cell names has its parts folder deleted: parts are a second copy of the
 * kit's LOD0 geometry, and every scoped megabyte ships to Pages.
 *
 * Layout, under apps/world-studio/public/kits/<kit>/parts/:
 *   index.json        schemaVersion, the source GLB's sha256, one row per asset
 *                     (file, bytes, vertices, triangles, texture hashes)
 *   <file>.glb        one asset: its root node (transform + extras) and LOD0
 *                     mesh nodes; geometry meshopt-encoded, textures by URI
 *   tex/<sha16>.ktx2  every KTX2 image of the kit's parts, once, named by the
 *                     sha256 of its bytes (a texture several assets use is one file)
 *
 * Written from the PUBLISHED (gltfpack) GLB, never a second Blender run. The
 * KTX2 bytes are the published bytes. Geometry: gltfpack packs many accessors
 * into one meshopt stream, so each needed accessor is decoded, sliced and
 * re-encoded on its own with filter NONE (the decoded bytes are already the
 * quantised KHR_mesh_quantization form, so this is lossless). Deterministic
 * and idempotent: a re-run over the same GLB changes no byte, a file whose
 * bytes are unchanged is not rewritten, and a file no longer produced is
 * deleted. The whole-kit GLB stays for exteriors (settlement layer).
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";

export const PARTS_SCHEMA_VERSION = 1;
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
export const PUBLIC_KITS = join(REPO_ROOT, "apps/world-studio/public/kits");
export const PUBLIC_INTERIORS = join(REPO_ROOT, "apps/world-studio/public/province/interiors");
const MESHOPT = "EXT_meshopt_compression";
const BASISU = "KHR_texture_basisu";
const QUANT = "KHR_mesh_quantization";
const COMPONENT_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COUNT = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function readGlb(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error("not a GLB");
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));
  const binStart = 20 + jsonLength;
  const bin = binStart + 8 <= bytes.byteLength
    ? bytes.subarray(binStart + 8, binStart + 8 + view.getUint32(binStart, true)) : new Uint8Array(0);
  return { json, bin };
}

export function writeGlb(json, bin) {
  const pad = (n) => (4 - (n % 4)) % 4;
  let text = JSON.stringify(json);
  text += " ".repeat(pad(Buffer.byteLength(text)));
  const jsonBytes = Buffer.from(text);
  const binPadded = Buffer.concat([Buffer.from(bin), Buffer.alloc(pad(bin.length))]);
  const total = 12 + 8 + jsonBytes.length + (bin.length ? 8 + binPadded.length : 0);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(total, 8);
  header.writeUInt32LE(jsonBytes.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const parts = [header, jsonBytes];
  if (bin.length) {
    const binHeader = Buffer.alloc(8);
    binHeader.writeUInt32LE(binPadded.length, 0); binHeader.writeUInt32LE(0x004e4942, 4);
    parts.push(binHeader, binPadded);
  }
  return Buffer.concat(parts);
}

/** A file-safe, collision-free name for an asset id (ids carry ':' and '/'). */
export function partFileName(assetId) {
  const slug = assetId.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[._]+/, "").slice(-80);
  return `${slug}-${sha256(assetId).slice(0, 8)}.glb`;
}

/** The runtime's LOD rule (settlement/kit.ts buildArchitectureKit): `extras.lod`, absent reads 0. */
const lodOf = (node) => (typeof node.extras?.lod === "number" ? node.extras.lod : 0);

/** Split one published kit GLB into parts. Returns { index, files: Map<relPath, Buffer> }. */
export function splitKit(kitId, glbBytes) {
  const { json, bin } = readGlb(glbBytes);
  const decoded = new Map(); // bufferView index -> decoded bytes
  const viewBytes = (bvIndex) => {
    if (decoded.has(bvIndex)) return decoded.get(bvIndex);
    const bv = json.bufferViews[bvIndex];
    const ext = bv.extensions?.[MESHOPT];
    let out;
    if (ext) {
      if ((ext.buffer ?? 0) !== 0) throw new Error(`${kitId}: meshopt view ${bvIndex} reads buffer ${ext.buffer}`);
      out = new Uint8Array(ext.count * ext.byteStride);
      const src = bin.subarray(ext.byteOffset ?? 0, (ext.byteOffset ?? 0) + ext.byteLength);
      MeshoptDecoder.decodeGltfBuffer(out, ext.count, ext.byteStride, src, ext.mode, ext.filter ?? "NONE");
    } else {
      if ((bv.buffer ?? 0) !== 0) throw new Error(`${kitId}: view ${bvIndex} reads buffer ${bv.buffer}`);
      out = bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength);
    }
    decoded.set(bvIndex, out);
    return out;
  };

  const roots = json.scenes[json.scene ?? 0].nodes;
  const files = new Map();
  const assets = {};
  const texBytes = new Map(); // hash -> bytes
  const ids = [];
  for (const r of roots) {
    const node = json.nodes[r];
    const assetId = node.extras?.assetId;
    if (typeof assetId === "string") ids.push([assetId, r]);
  }
  ids.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const seen = new Set();
  for (const [assetId, rootIndex] of ids) {
    if (seen.has(assetId)) throw new Error(`${kitId}: duplicate assetId ${assetId}`);
    seen.add(assetId);
    const part = buildPart(json, rootIndex, viewBytes);
    const imageHashes = [];
    for (const img of part.images) {
      texBytes.set(img.hash, img.bytes);
      imageHashes.push(img.hash);
    }
    const file = partFileName(assetId);
    const glb = writeGlb(part.json, part.bin);
    files.set(file, glb);
    assets[assetId] = {
      file, bytes: glb.length, vertices: part.vertices, triangles: part.triangles,
      textures: [...new Set(imageHashes)].sort(),
    };
  }
  let textureBytes = 0;
  for (const hash of [...texBytes.keys()].sort()) {
    files.set(`tex/${hash}.ktx2`, Buffer.from(texBytes.get(hash)));
    textureBytes += texBytes.get(hash).length;
  }
  const partBytes = Object.values(assets).reduce((s, a) => s + a.bytes, 0);
  const index = {
    schemaVersion: PARTS_SCHEMA_VERSION,
    kit: kitId,
    writer: "tooling/asset-pipeline/pipeline/kit_parts.mjs",
    source: { bytes: glbBytes.length, sha256: sha256(glbBytes) },
    totals: {
      parts: Object.keys(assets).length, partBytes,
      textureFiles: texBytes.size, textureBytes, bytes: partBytes + textureBytes,
    },
    assets,
  };
  files.set("index.json", Buffer.from(`${JSON.stringify(index, null, 1)}\n`));
  return { index, files };
}

function buildPart(src, rootIndex, viewBytes) {
  const out = {
    asset: { version: "2.0", generator: "kit_parts.mjs (from gltfpack output)" },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [], meshes: [], materials: [], textures: [],
    samplers: [], images: [], accessors: [], bufferViews: [], buffers: [],
  };
  const chunks = []; // compressed/raw bytes in buffer 0
  let binLength = 0;
  let fallbackLength = 0;
  let usesMeshopt = false;
  const images = [];
  const remap = (kind, fn) => {
    const m = new Map();
    return (i) => {
      if (!m.has(i)) { m.set(i, out[kind].length); out[kind].push(null); out[kind][m.get(i)] = fn(i); }
      return m.get(i);
    };
  };
  const pushBin = (bytes) => {
    const offset = binLength;
    chunks.push(bytes);
    binLength += bytes.length;
    const padding = (4 - (binLength % 4)) % 4;
    if (padding) { chunks.push(new Uint8Array(padding)); binLength += padding; }
    return offset;
  };
  const sampler = remap("samplers", (i) => ({ ...src.samplers[i] }));
  const image = remap("images", (i) => {
    const img = src.images[i];
    if (img.bufferView === undefined) throw new Error(`image ${i} has no bufferView`);
    const bytes = viewBytes(img.bufferView);
    const hash = sha256(bytes).slice(0, 16);
    images.push({ hash, bytes });
    const ext = img.mimeType === "image/ktx2" ? "ktx2" : img.mimeType === "image/png" ? "png" : "jpg";
    return { ...(img.name ? { name: img.name } : {}), uri: `tex/${hash}.${ext}`, mimeType: img.mimeType };
  });
  const texture = remap("textures", (i) => {
    const t = src.textures[i];
    const copy = {};
    if (t.sampler !== undefined) copy.sampler = sampler(t.sampler);
    if (t.source !== undefined) copy.source = image(t.source);
    if (t.extensions) {
      copy.extensions = {};
      for (const [k, v] of Object.entries(t.extensions)) {
        copy.extensions[k] = v && typeof v.source === "number" ? { ...v, source: image(v.source) } : v;
      }
    }
    if (t.name) copy.name = t.name;
    return copy;
  });
  const remapTextureRefs = (value, key) => {
    if (Array.isArray(value)) return value.map((v) => remapTextureRefs(v));
    if (!value || typeof value !== "object") return value;
    const copy = {};
    for (const [k, v] of Object.entries(value)) copy[k] = remapTextureRefs(v, k);
    if (key && /Texture$/.test(key) && typeof value.index === "number") copy.index = texture(value.index);
    return copy;
  };
  const material = remap("materials", (i) => remapTextureRefs(src.materials[i]));
  let vertices = 0;
  let triangles = 0;
  const accessor = remap("accessors", (i) => {
    const a = src.accessors[i];
    if (a.sparse) throw new Error(`accessor ${i} is sparse`);
    const copy = { ...a };
    delete copy.bufferView; delete copy.byteOffset;
    if (a.bufferView === undefined) return copy;
    const bv = src.bufferViews[a.bufferView];
    const ext = bv.extensions?.[MESHOPT];
    const elementSize = COMPONENT_BYTES[a.componentType] * TYPE_COUNT[a.type];
    const stride = ext ? ext.byteStride : (bv.byteStride ?? elementSize);
    const start = a.byteOffset ?? 0;
    if (start % stride !== 0 || elementSize > stride) throw new Error(`accessor ${i}: offset ${start} / stride ${stride}`);
    const slice = viewBytes(a.bufferView).subarray(start, start + a.count * stride);
    if (ext) {
      usesMeshopt = true;
      const encoded = MeshoptEncoder.encodeGltfBuffer(slice, a.count, stride, ext.mode);
      const byteOffset = pushBin(encoded);
      const view = {
        buffer: 1, byteOffset: fallbackLength, byteLength: slice.length,
        ...(ext.mode === "ATTRIBUTES" ? { byteStride: stride } : {}),
        ...(bv.target !== undefined ? { target: bv.target } : {}),
        extensions: { [MESHOPT]: { buffer: 0, byteOffset, byteLength: encoded.length, byteStride: stride, count: a.count, mode: ext.mode } },
      };
      fallbackLength += slice.length + ((4 - (slice.length % 4)) % 4);
      copy.bufferView = out.bufferViews.push(view) - 1;
    } else {
      const byteOffset = pushBin(slice);
      copy.bufferView = out.bufferViews.push({
        buffer: 0, byteOffset, byteLength: slice.length,
        ...(bv.byteStride !== undefined ? { byteStride: bv.byteStride } : {}),
        ...(bv.target !== undefined ? { target: bv.target } : {}),
      }) - 1;
    }
    return copy;
  });
  const mesh = remap("meshes", (i) => {
    const m = src.meshes[i];
    return {
      ...m,
      primitives: m.primitives.map((p) => {
        const prim = { ...p, attributes: {} };
        for (const [k, v] of Object.entries(p.attributes)) prim.attributes[k] = accessor(v);
        if (p.indices !== undefined) prim.indices = accessor(p.indices);
        if (p.material !== undefined) prim.material = material(p.material);
        if (p.targets) throw new Error(`mesh ${i} has morph targets`);
        return prim;
      }),
    };
  });

  const copyNode = (index) => {
    const n = src.nodes[index];
    const copy = { ...n };
    delete copy.children; delete copy.mesh;
    if (n.skin !== undefined || n.camera !== undefined) throw new Error(`node ${index} has a skin/camera`);
    const slot = out.nodes.push(copy) - 1;
    if (n.mesh !== undefined && lodOf(n) === 0) {
      copy.mesh = mesh(n.mesh);
      const m = src.meshes[n.mesh];
      for (const p of m.primitives) {
        vertices += src.accessors[p.attributes.POSITION].count;
        triangles += (p.indices !== undefined ? src.accessors[p.indices].count : src.accessors[p.attributes.POSITION].count) / 3;
      }
    }
    const children = [];
    for (const c of n.children ?? []) {
      const kept = keeps(c);
      if (kept) children.push(copyNode(c));
    }
    if (children.length) copy.children = children;
    return slot;
  };
  // A node survives if it, or a descendant, carries a LOD0 mesh.
  const keeps = (index) => {
    const n = src.nodes[index];
    return (n.mesh !== undefined && lodOf(n) === 0) || (n.children ?? []).some(keeps);
  };
  copyNode(rootIndex);

  if (usesMeshopt) {
    out.buffers.push({ byteLength: binLength });
    out.buffers.push({ byteLength: fallbackLength, extensions: { [MESHOPT]: { fallback: true } } });
  } else if (binLength) {
    out.buffers.push({ byteLength: binLength });
  }
  const used = [];
  if (out.accessors.some((a) => a.componentType !== 5126 && a.componentType !== 5125)) used.push(QUANT);
  if (usesMeshopt) used.push(MESHOPT);
  if (out.textures.some((t) => t.extensions?.[BASISU])) used.push(BASISU);
  if (used.length) { out.extensionsUsed = used; out.extensionsRequired = [...used]; }
  for (const k of ["meshes", "materials", "textures", "samplers", "images", "accessors", "bufferViews", "buffers"]) {
    if (!out[k].length) delete out[k];
  }
  const bin = new Uint8Array(binLength);
  let o = 0;
  for (const c of chunks) { bin.set(c, o); o += c.length; }
  return { json: out, bin, images, vertices, triangles };
}

/** Write (or check) one kit's parts folder. Returns { changed: [rel], removed: [rel], index }. */
export function publishParts(kitId, { kitsDir = PUBLIC_KITS, check = false } = {}) {
  const glbPath = join(kitsDir, `${kitId}.glb`);
  const { index, files } = splitKit(kitId, new Uint8Array(readFileSync(glbPath)));
  const dir = join(kitsDir, kitId, "parts");
  const changed = [];
  for (const [rel, bytes] of files) {
    const p = join(dir, rel);
    if (existsSync(p) && Buffer.compare(readFileSync(p), bytes) === 0) continue;
    changed.push(rel);
    if (!check) { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, bytes); }
  }
  const removed = [];
  const walk = (d) => (existsSync(d) ? readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)])) : []);
  for (const p of walk(dir)) {
    const rel = relative(dir, p).split("\\").join("/");
    if (!files.has(rel)) { removed.push(rel); if (!check) rmSync(p); }
  }
  return { changed, removed, index };
}

/** The kits a published interior cell names (the parts scope), sorted. */
export function scopedKits(interiorsDir = PUBLIC_INTERIORS) {
  if (!existsSync(interiorsDir)) return [];
  const ids = new Set();
  for (const f of readdirSync(interiorsDir).filter((n) => n.endsWith(".json"))) {
    const cell = JSON.parse(readFileSync(join(interiorsDir, f), "utf8"));
    for (const id of Object.keys(cell.kits ?? {})) ids.add(id);
  }
  return [...ids].sort();
}

/** Parts folders of kits outside the scope (to delete). */
export function unscopedPartsDirs(kitsDir = PUBLIC_KITS, interiorsDir = PUBLIC_INTERIORS) {
  const scope = new Set(scopedKits(interiorsDir));
  return readdirSync(kitsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !scope.has(e.name) && existsSync(join(kitsDir, e.name, "parts")))
    .map((e) => e.name).sort();
}

/** Kits published under kitsDir that carry assets (a GLB beside a manifest). */
export function publishedKits(kitsDir = PUBLIC_KITS) {
  return readdirSync(kitsDir).filter((f) => f.endsWith(".kit.json"))
    .map((f) => f.slice(0, -".kit.json".length)).filter((id) => existsSync(join(kitsDir, `${id}.glb`))).sort();
}

async function main() {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const all = args.includes("--all");
  const scope = scopedKits();
  const published = new Set(publishedKits());
  const named = args.flatMap((a, i) => (args[i - 1] === "--kit" ? [a] : []));
  for (const k of named) {
    if (!scope.includes(k)) { console.error(`kit_parts: ${k} is named by no interior cell (public/province/interiors/*.json kits); it publishes no parts`); process.exit(2); }
  }
  const missing = scope.filter((k) => !published.has(k));
  if (all && missing.length) { console.error(`kit_parts: interior cells name unpublished kit(s): ${missing.join(", ")}`); process.exit(1); }
  const kits = all ? scope : named;
  if (!kits.length) { console.error("usage: kit_parts.mjs (--kit <id>)... | --all [--check]"); process.exit(2); }
  await MeshoptDecoder.ready;
  await MeshoptEncoder.ready;
  let stale = 0;
  if (all) {
    for (const k of unscopedPartsDirs()) {
      stale += 1;
      console.log(`kit_parts ${k}: named by no interior cell; ${check ? "parts folder out of scope" : "parts folder deleted"}`);
      if (!check) rmSync(join(PUBLIC_KITS, k, "parts"), { recursive: true, force: true });
    }
  }
  for (const kit of kits) {
    const t0 = Date.now();
    const { changed, removed, index } = publishParts(kit, { check });
    const t = index.totals;
    if (check && (changed.length || removed.length)) stale += 1;
    console.log(`kit_parts ${kit}: ${t.parts} parts ${t.partBytes} B + ${t.textureFiles} textures ${t.textureBytes} B`
      + ` = ${t.bytes} B (whole GLB ${index.source.bytes} B); ${check ? "stale" : "written"} ${changed.length}, `
      + `${check ? "orphan" : "removed"} ${removed.length}; ${Date.now() - t0} ms`);
  }
  if (check && stale) { console.error(`kit_parts: ${stale} kit(s) have stale or out-of-scope parts; run --all without --check`); process.exit(1); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
