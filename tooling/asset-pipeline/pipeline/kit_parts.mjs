#!/usr/bin/env node
/**
 * Publish a kit as PARTS (decision 0120, schema 4): one glTF per asset holding
 * that asset's root node and every LOD mesh node with the materials they use,
 * so a loader fetches the pieces it draws. A kit ships ONLY as parts: there is
 * no whole published GLB. `kit_compress.py` runs gltfpack into a temporary GLB
 * and calls this writer on it; every asset of the kit manifest gets a part.
 *
 *   node tooling/asset-pipeline/pipeline/kit_parts.mjs --kit <id> --glb <packed.glb> --raw <raw.glb>
 *   node tooling/asset-pipeline/pipeline/kit_parts.mjs --prune           # delete orphan pool files
 *   node tooling/asset-pipeline/pipeline/kit_parts.mjs --prune --check   # exit 1 if any exist
 *
 * Layout, under apps/world-studio/public/kits/:
 *   <kit>/parts/index.json  schemaVersion 4; `source` the RAW build's bytes and
 *                           sha256 (what kit_compress --check compares),
 *                           `packed` the gltfpack GLB's; one row per asset
 *                           (file, bytes, vertices/triangles of
 *                           LOD0, `lods` [{lod, vertices, triangles}], texture
 *                           hashes) and `fires` (the assets' fire rows)
 *   <kit>/parts/<file>.glb  one asset, read exactly as the whole kit GLB is
 *                           (settlement/kit.ts buildArchitectureKit): the scene
 *                           child is the asset root with extras.assetId, LOD from
 *                           child extras.lod; geometry meshopt, textures by URI
 *                           `../../tex/<sha16>.ktx2`
 *   tex/<sha16>.ktx2        ONE province-wide texture pool named by the sha256 of
 *                           the bytes (shared across kits); a pool file no parts
 *                           index references is deleted (`prunePool`)
 *
 * Written from the gltfpack GLB, never a second Blender run. The
 * KTX2 bytes are the published bytes. Geometry: gltfpack packs many accessors
 * into one meshopt stream, so each needed accessor is decoded, sliced and
 * re-encoded on its own with filter NONE (the decoded bytes are already the
 * quantised KHR_mesh_quantization form, so this is lossless). Deterministic
 * and idempotent: a re-run over the same GLB changes no byte, a file whose
 * bytes are unchanged is not rewritten, and a file no longer produced is
 * deleted.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";

export const PARTS_SCHEMA_VERSION = 4;
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
export const PUBLIC_KITS = join(REPO_ROOT, "apps/world-studio/public/kits");
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

/**
 * Split one packed kit GLB into parts, every asset root it holds. Returns
 * { index, files: Map<relPath, Buffer>, textures: Map<sha16, Buffer> } (textures
 * go to the pool `<kits>/tex/`). `manifest`: every asset it lists must be in
 * the GLB. `source`: the raw build's { bytes, sha256 } (default: the GLB's own).
 */
export function splitKit(kitId, glbBytes, { manifest = null, source = null } = {}) {
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
  if (manifest) {
    if (!Array.isArray(manifest.assets)) throw new Error(`${kitId}: kit manifest has no assets list`);
    const missing = manifest.assets.map((a) => a.id).filter((id) => !ids.some(([a]) => a === id)).sort();
    if (missing.length) throw new Error(`${kitId}: manifest lists asset(s) the kit GLB lacks: ${missing.join(", ")}`);
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
      file, bytes: glb.length,
      vertices: part.lods[0]?.lod === 0 ? part.lods[0].vertices : 0,
      triangles: part.lods[0]?.lod === 0 ? part.lods[0].triangles : 0,
      lods: part.lods,
      textures: [...new Set(imageHashes)].sort(),
    };
  }
  let textureBytes = 0;
  const textures = new Map();
  for (const hash of [...texBytes.keys()].sort()) {
    textures.set(hash, Buffer.from(texBytes.get(hash)));
    textureBytes += texBytes.get(hash).length;
  }
  const partBytes = Object.values(assets).reduce((s, a) => s + a.bytes, 0);
  const index = {
    schemaVersion: PARTS_SCHEMA_VERSION,
    kit: kitId,
    writer: "tooling/asset-pipeline/pipeline/kit_parts.mjs",
    source: source ?? { bytes: glbBytes.length, sha256: sha256(glbBytes) },
    packed: { bytes: glbBytes.length, sha256: sha256(glbBytes) },
    totals: {
      parts: Object.keys(assets).length, partBytes,
      textureFiles: texBytes.size, textureBytes, bytes: partBytes + textureBytes,
    },
    assets,
    fires: firesOf(manifest, Object.keys(assets)),
  };
  files.set("index.json", Buffer.from(`${JSON.stringify(index, null, 1)}\n`));
  return { index, files, textures };
}

/**
 * The fire rows of the split assets (schema 2): the kit manifest rows that
 * burn in an interior (fx/fire/interiorFires.ts `burnsInInterior`: mined
 * `flames`, `flameCardMaterials` or a light fixture record), reduced to the
 * fields the anchors read, so the interior loader never fetches the whole
 * `.kit.json` (walk 6: 1.1-1.5 MB a cell, only for these rows).
 */
export function firesOf(manifest, assetIds) {
  const fires = {};
  if (!manifest) return fires;
  if (!Array.isArray(manifest.assets)) throw new Error("kit manifest has no assets list");
  const wanted = new Set(assetIds);
  for (const a of manifest.assets) {
    if (typeof a?.id !== "string" || !wanted.has(a.id)) continue;
    if (!(a.flames?.length || a.flameCardMaterials?.length || a.light?.fixtureKind || a.emissiveMaterials?.length)) continue;
    const row = {};
    for (const k of ["id", "category", "anchorClass", "light", "flames", "sizeM", "originOffsetM", "flameCardMaterials", "emissiveMaterials", "windowMaterials"]) {
      if (a[k] !== undefined) row[k] = a[k];
    }
    fires[a.id] = row;
  }
  return Object.fromEntries(Object.entries(fires).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)));
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
    const name = img.name ? { name: img.name } : {};
    // The pool holds KTX2 bytes only. A kit published uncompressed (config
    // `compression: false`, e.g. waterfall-fx-v1's 16 px stubs read without a
    // renderer) keeps its images embedded in the part.
    if (img.mimeType !== "image/ktx2") {
      const byteOffset = pushBin(bytes);
      return { ...name, bufferView: out.bufferViews.push({ buffer: 0, byteOffset, byteLength: bytes.length }) - 1, mimeType: img.mimeType };
    }
    const hash = sha256(bytes).slice(0, 16);
    images.push({ hash, bytes });
    return { ...name, uri: `../../tex/${hash}.ktx2`, mimeType: img.mimeType };
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
  const lodStats = new Map(); // lod -> { lod, vertices, triangles }
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
    if (n.mesh !== undefined) {
      copy.mesh = mesh(n.mesh);
      const lod = lodOf(n);
      if (!lodStats.has(lod)) lodStats.set(lod, { lod, vertices: 0, triangles: 0 });
      const stat = lodStats.get(lod);
      for (const p of src.meshes[n.mesh].primitives) {
        stat.vertices += src.accessors[p.attributes.POSITION].count;
        stat.triangles += (p.indices !== undefined ? src.accessors[p.indices].count : src.accessors[p.attributes.POSITION].count) / 3;
      }
    }
    const children = (n.children ?? []).map(copyNode);
    if (children.length) copy.children = children;
    return slot;
  };
  copyNode(rootIndex);
  const lods = [...lodStats.values()].sort((a, b) => a.lod - b.lod);

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
  return { json: out, bin, images, lods };
}

/**
 * Write (or check) one kit's parts folder from its packed GLB. `rawPath`: the
 * raw build the GLB was packed from (its sha256 is the index `source`).
 * Returns { changed: [rel], removed: [rel], index }.
 */
export function publishParts(kitId, { glbPath, rawPath = null, kitsDir = PUBLIC_KITS, check = false } = {}) {
  if (!glbPath) throw new Error(`kit_parts: ${kitId}: no packed GLB given (--glb)`);
  const manifestPath = join(kitsDir, `${kitId}.kit.json`);
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : null;
  let source = null;
  if (rawPath) {
    const raw = readFileSync(rawPath);
    source = { bytes: raw.length, sha256: sha256(raw) };
  }
  const { index, files, textures } = splitKit(kitId, new Uint8Array(readFileSync(glbPath)), { manifest, source });
  const dir = join(kitsDir, kitId, "parts");
  const changed = [];
  for (const [rel, bytes] of files) {
    const p = join(dir, rel);
    if (existsSync(p) && Buffer.compare(readFileSync(p), bytes) === 0) continue;
    changed.push(rel);
    if (!check) { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, bytes); }
  }
  // Pool files are content-named: an existing file of that name holds these bytes.
  for (const [hash, bytes] of textures) {
    const p = join(kitsDir, "tex", `${hash}.ktx2`);
    if (existsSync(p)) continue;
    changed.push(`../../tex/${hash}.ktx2`);
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

/** Pool file names (`<sha16>.ktx2`) no `<kit>/parts/index.json` under kitsDir references, sorted. */
export function orphanPoolFiles(kitsDir = PUBLIC_KITS) {
  const pool = join(kitsDir, "tex");
  if (!existsSync(pool)) return [];
  const used = new Set();
  for (const e of readdirSync(kitsDir, { withFileTypes: true })) {
    const p = join(kitsDir, e.name, "parts", "index.json");
    if (!e.isDirectory() || !existsSync(p)) continue;
    for (const row of Object.values(JSON.parse(readFileSync(p, "utf8")).assets ?? {})) {
      for (const h of row.textures ?? []) used.add(`${h}.ktx2`);
    }
  }
  return readdirSync(pool).filter((f) => !used.has(f)).sort();
}

/** Kits published under kitsDir: every `<id>.kit.json`, sorted. */
export function publishedKits(kitsDir = PUBLIC_KITS) {
  return readdirSync(kitsDir).filter((f) => f.endsWith(".kit.json"))
    .map((f) => f.slice(0, -".kit.json".length)).sort();
}

/** Parts folders of kits with no published manifest (to delete). */
export function strayPartsDirs(kitsDir = PUBLIC_KITS) {
  const published = new Set(publishedKits(kitsDir));
  return readdirSync(kitsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== "tex" && !published.has(e.name) && existsSync(join(kitsDir, e.name, "parts")))
    .map((e) => e.name).sort();
}

async function main() {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const value = (flag) => args.flatMap((a, i) => (args[i - 1] === flag ? [a] : []));
  const [kit] = value("--kit");
  const [glbPath] = value("--glb");
  const [rawPath] = value("--raw");
  if (!kit && !args.includes("--prune")) {
    console.error("usage: kit_parts.mjs --kit <id> --glb <packed.glb> [--raw <raw.glb>] | --prune [--check]");
    process.exit(2);
  }
  let stale = 0;
  if (kit) {
    await MeshoptDecoder.ready;
    await MeshoptEncoder.ready;
    const t0 = Date.now();
    const { changed, removed, index } = publishParts(kit, { glbPath, rawPath, check });
    const t = index.totals;
    if (check && (changed.length || removed.length)) stale += 1;
    console.log(`kit_parts ${kit}: ${t.parts} parts ${t.partBytes} B + ${t.textureFiles} textures ${t.textureBytes} B`
      + ` = ${t.bytes} B (packed GLB ${index.packed.bytes} B); ${check ? "stale" : "written"} ${changed.length}, `
      + `${check ? "orphan" : "removed"} ${removed.length}; ${Date.now() - t0} ms`);
  }
  if (args.includes("--prune")) {
    for (const k of strayPartsDirs()) {
      stale += 1;
      console.log(`kit_parts ${k}: no published manifest; parts folder ${check ? "stray" : "deleted"}`);
      if (!check) rmSync(join(PUBLIC_KITS, k, "parts"), { recursive: true, force: true });
    }
    const orphans = orphanPoolFiles();
    if (orphans.length) {
      stale += 1;
      console.log(`kit_parts tex pool: ${orphans.length} file(s) no parts index references; ${check ? "orphan" : "deleted"}`);
      if (!check) for (const f of orphans) rmSync(join(PUBLIC_KITS, "tex", f));
    }
  }
  if (check && stale) { console.error(`kit_parts: ${stale} stale item(s); re-run without --check`); process.exit(1); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
