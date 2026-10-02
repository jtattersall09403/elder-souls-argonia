#!/usr/bin/env node
// Window panes inside a published kit part, read from the part's own materials
// (decision 0114): the primitives whose base-colour image is a window texture
// (name contains "window", e.g. farmwindowinterior01, riftenwindows02) are
// decoded (meshopt + quantization), put in the part's frame by the node chain,
// and split into connected panes. Prints JSON: { "<glb>": { bounds, panes:
// [{ centre, size }] } } in metres, part frame. Called by interior_light.py.
import { readFileSync } from "node:fs";
import { MeshoptDecoder } from "meshoptimizer";

const WINDOW_IMAGE = /window/i;
const WELD_M = 0.05; // vertices closer than this join one pane

function readGlb(path) {
  const d = readFileSync(path);
  const jl = d.readUInt32LE(12);
  const json = JSON.parse(d.subarray(20, 20 + jl).toString("utf8"));
  const bl = d.readUInt32LE(20 + jl);
  return { json, bin: d.subarray(28 + jl, 28 + jl + bl) };
}

function viewBytes(g, vi) {
  const v = g.json.bufferViews[vi];
  const ext = v.extensions?.EXT_meshopt_compression;
  if (!ext) return new Uint8Array(g.bin.buffer, g.bin.byteOffset + (v.byteOffset ?? 0), v.byteLength);
  const src = new Uint8Array(g.bin.buffer, g.bin.byteOffset + (ext.byteOffset ?? 0), ext.byteLength);
  const out = new Uint8Array(ext.count * ext.byteStride);
  MeshoptDecoder.decodeGltfBuffer(out, ext.count, ext.byteStride, src, ext.mode, ext.filter ?? "NONE");
  return out;
}

const COMP = { 5120: [Int8Array, 127], 5121: [Uint8Array, 255], 5122: [Int16Array, 32767], 5123: [Uint16Array, 65535], 5125: [Uint32Array, 0], 5126: [Float32Array, 0] };
const WIDTH = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

function accessor(g, ai) {
  const a = g.json.accessors[ai];
  const bytes = viewBytes(g, a.bufferView);
  const [T, max] = COMP[a.componentType];
  const n = WIDTH[a.type];
  const stride = g.json.bufferViews[a.bufferView].byteStride ?? T.BYTES_PER_ELEMENT * n;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Float64Array(a.count * n);
  const get = { 5120: "getInt8", 5121: "getUint8", 5122: "getInt16", 5123: "getUint16", 5125: "getUint32", 5126: "getFloat32" }[a.componentType];
  for (let i = 0; i < a.count; i++) for (let k = 0; k < n; k++) {
    let x = dv[get]((a.byteOffset ?? 0) + i * stride + k * T.BYTES_PER_ELEMENT, true);
    if (a.normalized && max) x = Math.max(x / max, -1);
    out[i * n + k] = x;
  }
  return out;
}

function mul(a, b) { // column-major 4x4
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
function local(n) {
  if (n.matrix) return n.matrix;
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale ?? [1, 1, 1];
  const [tx, ty, tz] = n.translation ?? [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1];
}

function part(path) {
  const g = readGlb(path);
  const j = g.json;
  const imageOf = (mi) => {
    const t = j.materials?.[mi]?.pbrMetallicRoughness?.baseColorTexture?.index;
    if (t === undefined) return "";
    const tex = j.textures[t];
    const src = tex.extensions?.KHR_texture_basisu?.source ?? tex.source;
    return j.images?.[src]?.name ?? "";
  };
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  const verts = []; // window vertices, part frame
  const tris = [];
  const walk = (ni, parent) => {
    const n = j.nodes[ni];
    const m = mul(parent, local(n));
    if (n.mesh !== undefined) for (const p of j.meshes[n.mesh].primitives) {
      const pos = accessor(g, p.attributes.POSITION);
      const base = verts.length;
      const win = WINDOW_IMAGE.test(imageOf(p.material));
      for (let i = 0; i < pos.length; i += 3) {
        const v = [0, 1, 2].map((r) => m[r] * pos[i] + m[4 + r] * pos[i + 1] + m[8 + r] * pos[i + 2] + m[12 + r]);
        for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], v[k]); hi[k] = Math.max(hi[k], v[k]); }
        if (win) verts.push(v);
      }
      if (win) {
        const idx = p.indices !== undefined ? accessor(g, p.indices) : Float64Array.from({ length: pos.length / 3 }, (_, i) => i);
        for (let i = 0; i < idx.length; i += 3) tris.push([base + idx[i], base + idx[i + 1], base + idx[i + 2]]);
      }
    }
    for (const c of n.children ?? []) walk(c, m);
  };
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const r of j.scenes[j.scene ?? 0].nodes) walk(r, I);
  // union-find over welded vertices and triangle edges
  const parent = verts.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  const join = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); };
  const cell = new Map();
  verts.forEach((v, i) => {
    const key = v.map((x) => Math.round(x / WELD_M)).join(",");
    if (cell.has(key)) join(i, cell.get(key)); else cell.set(key, i);
  });
  for (const t of tris) { join(t[0], t[1]); join(t[1], t[2]); }
  const groups = new Map();
  verts.forEach((v, i) => {
    const r = find(i);
    const b = groups.get(r) ?? { lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] };
    for (let k = 0; k < 3; k++) { b.lo[k] = Math.min(b.lo[k], v[k]); b.hi[k] = Math.max(b.hi[k], v[k]); }
    groups.set(r, b);
  });
  const r4 = (x) => Math.round(x * 1e4) / 1e4;
  const panes = [...groups.values()]
    .map((b) => ({ centre: b.lo.map((x, k) => r4((x + b.hi[k]) / 2)), size: b.lo.map((x, k) => r4(b.hi[k] - x)) }))
    .sort((a, b) => a.centre[0] - b.centre[0] || a.centre[2] - b.centre[2] || a.centre[1] - b.centre[1]);
  return { bounds: { lo: lo.map(r4), hi: hi.map(r4) }, panes };
}

await MeshoptDecoder.ready;
const out = {};
for (const p of process.argv.slice(2)) out[p] = part(p);
process.stdout.write(JSON.stringify(out));
