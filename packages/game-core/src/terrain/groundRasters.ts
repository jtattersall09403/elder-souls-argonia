import * as THREE from "three";

/**
 * GPU forms of the province ground rasters (16k walk 9, owner: "412 MB of
 * uncompressed rgba8 is fixed now").
 *
 * The published PNGs stay what they are (the frozen world's record, read by
 * the workbench and the CPU samplers); what goes to the GPU is packed here at
 * load, deterministically, into the fewest bytes the shader needs:
 *
 * - `normal-grad.png` (RGB, only R,G read) -> RG8 with mips: half of RGBA8.
 * - `ground-control.png` (R id0, G id1, B blend 0..127, A macro brightness)
 *   -> RG8, nearest: R = id0 | blend bits 0-1 << 6, G = id1 | blend bits 2-3
 *   << 6 (ids are < 64; the blend keeps 16 levels over its 0..0.5 range).
 *   The macro brightness is smooth (mean neighbour step 0.85/255) and is
 *   folded into the tint raster's RGB, which the shader multiplies by anyway.
 *
 * The decode is a real PNG decode (`decodePng`), never a canvas round trip:
 * a 2D canvas premultiplies alpha, so every control texel with A = 0 (3 % of
 * the province) read back with its ids zeroed.
 */

/** Exact 8-bit PNG decode (grey, RGB, RGBA; non-interlaced) to RGBA bytes. */
export async function decodePng(bytes: Uint8Array): Promise<{ width: number; height: number; data: Uint8Array }> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0, height = 0, colourType = 0;
  const idat: Uint8Array[] = [];
  for (let p = 8; p < bytes.length;) {
    const len = view.getUint32(p);
    const type = String.fromCharCode(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7]);
    const body = bytes.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") {
      width = view.getUint32(p + 8); height = view.getUint32(p + 12);
      const depth = body[8]; colourType = body[9];
      if (depth !== 8 || body[12] !== 0 || ![0, 2, 6].includes(colourType)) {
        throw new Error(`decodePng: unsupported depth ${depth} type ${colourType} interlace ${body[12]}`);
      }
    } else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    p += 12 + len;
  }
  const raw = new Uint8Array(await new Response(
    new Blob(idat as BlobPart[]).stream().pipeThrough(new DecompressionStream("deflate"))).arrayBuffer());
  const bpp = colourType === 6 ? 4 : colourType === 2 ? 3 : 1;
  const stride = width * bpp;
  const out = new Uint8Array(width * height * 4);
  let prev = new Uint8Array(stride);
  let cur = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = src[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v;
    }
    const o = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (bpp === 1) { out[o + x * 4] = out[o + x * 4 + 1] = out[o + x * 4 + 2] = cur[x]; out[o + x * 4 + 3] = 255; }
      else {
        out[o + x * 4] = cur[x * bpp]; out[o + x * 4 + 1] = cur[x * bpp + 1]; out[o + x * 4 + 2] = cur[x * bpp + 2];
        out[o + x * 4 + 3] = bpp === 4 ? cur[x * 4 + 3] : 255;
      }
    }
    [prev, cur] = [cur, prev];
  }
  return { width, height, data: out };
}

/** A ground PNG request not settled by now fails, so a hung request reaches
 * the caller's error path instead of holding the spawn forever. */
export const GROUND_PNG_TIMEOUT_MS = 60000;

/** Fetch and decode a PNG exactly (see `decodePng`). */
export async function fetchPng(
  url: string,
  signal?: AbortSignal,
  timeoutMs: number = GROUND_PNG_TIMEOUT_MS,
): Promise<{ width: number; height: number; data: Uint8Array }> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const res = await fetch(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return decodePng(new Uint8Array(await res.arrayBuffer()));
}

export type DecodedPng = { width: number; height: number; data: Uint8Array };

/** One decode per URL for every reader that asks while it is in flight or
 * still held: the 4033² ground-control PNG has three readers (the ground
 * material, the walk world's material ids, groundcover). The decoded pixels
 * are held weakly once settled, so the ~65 MB RGBA is freed when the last
 * reader drops it. Owned by the `ChunkStore` its readers already share. */
export class PngCache {
  private readonly pending = new Map<string, Promise<DecodedPng>>();
  private readonly settled = new Map<string, WeakRef<DecodedPng>>();

  constructor(private readonly load: (url: string) => Promise<DecodedPng> = fetchPng) {}

  decode(url: string): Promise<DecodedPng> {
    const held = this.settled.get(url)?.deref();
    if (held) return Promise.resolve(held);
    let p = this.pending.get(url);
    if (!p) {
      p = this.load(url).then(
        (img) => { this.pending.delete(url); this.settled.set(url, new WeakRef(img)); return img; },
        (e: unknown) => { this.pending.delete(url); throw e; });
      this.pending.set(url, p);
    }
    return p;
  }
}

/** Control RGBA -> RG8 (ids + 4-bit blend). Inverse in GLSL: `CONTROL_DECODE_GLSL`. */
export function packControl(rgba: Uint8Array): Uint8Array {
  const n = rgba.length / 4;
  const out = new Uint8Array(n * 2);
  for (let i = 0; i < n; i++) {
    const q = Math.round((Math.min(rgba[i * 4 + 2], 127) / 127) * 15);
    out[i * 2] = (rgba[i * 4] & 63) | ((q & 3) << 6);
    out[i * 2 + 1] = (rgba[i * 4 + 1] & 63) | ((q >> 2) << 6);
  }
  return out;
}

/** GLSL: ids and blend from one RG8 control texel `c` (0..1 floats). */
export const CONTROL_DECODE_GLSL = /* glsl */ `
  int esR = int(c.r * 255.0 + 0.5), esGc = int(c.g * 255.0 + 0.5);
  int i0 = esR & 63;
  int i1 = esGc & 63;
  float esBlend = float((esR >> 6) | ((esGc >> 6) << 2)) * (127.0 / (15.0 * 255.0));`;

/** Fold the control's macro brightness (A, 0.84 + 0.32 a) into the tint RGB.
 * Each tint texel takes the mean macro of the control texels it covers. */
export function foldMacroIntoTint(tint: { width: number; height: number; data: Uint8Array },
  ctrl: { width: number; height: number; data: Uint8Array }): Uint8Array {
  const out = new Uint8Array(tint.data);
  const sx = ctrl.width / tint.width, sy = ctrl.height / tint.height;
  for (let ty = 0; ty < tint.height; ty++) {
    const y0 = Math.floor(ty * sy), y1 = Math.max(y0 + 1, Math.floor((ty + 1) * sy));
    for (let tx = 0; tx < tint.width; tx++) {
      const x0 = Math.floor(tx * sx), x1 = Math.max(x0 + 1, Math.floor((tx + 1) * sx));
      let sum = 0, k = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { sum += ctrl.data[(y * ctrl.width + x) * 4 + 3]; k++; }
      const m = 0.84 + 0.32 * (sum / k / 255);
      const o = (ty * tint.width + tx) * 4;
      for (let c = 0; c < 3; c++) out[o + c] = Math.min(255, Math.round(tint.data[o + c] * m));
    }
  }
  return out;
}

/** The tint is a smooth colour field: the province ships it at 1009², the
 * apron's near frame at 2097², which is twice what a field this smooth needs. */
export const TINT_MAX_TEXELS = 1100;

/** 2x2 box-halve an RGBA raster until its longer side is at most `max`. */
export function halveSmooth(img: { width: number; height: number; data: Uint8Array }, max: number):
  { width: number; height: number; data: Uint8Array } {
  while (Math.max(img.width, img.height) > max) {
    const w = img.width >> 1, h = img.height >> 1, out = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 4; c++) {
      const s = (yy: number, xx: number) => img.data[(yy * img.width + xx) * 4 + c];
      out[(y * w + x) * 4 + c] = (s(2 * y, 2 * x) + s(2 * y, 2 * x + 1) + s(2 * y + 1, 2 * x) + s(2 * y + 1, 2 * x + 1) + 2) >> 2;
    }
    img = { width: w, height: h, data: out };
  }
  return img;
}

/** RGB(A) gradient -> RG8 (the shader reads .rg only). */
export function packGradient(rgba: Uint8Array): Uint8Array {
  const n = rgba.length / 4;
  const out = new Uint8Array(n * 2);
  for (let i = 0; i < n; i++) { out[i * 2] = rgba[i * 4]; out[i * 2 + 1] = rgba[i * 4 + 1]; }
  return out;
}

function dataTexture(data: Uint8Array, w: number, h: number, format: THREE.PixelFormat, mips: boolean): THREE.DataTexture {
  const t = new THREE.DataTexture(data, w, h, format, THREE.UnsignedByteType);
  t.colorSpace = THREE.NoColorSpace;
  t.flipY = false;
  t.unpackAlignment = 1;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.magFilter = mips ? THREE.LinearFilter : THREE.NearestFilter;
  t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.NearestFilter;
  t.generateMipmaps = mips;
  t.needsUpdate = true;
  return t;
}

export interface GroundTextures { ctrl: THREE.DataTexture; tint: THREE.DataTexture; grad: THREE.DataTexture }

/** Load one ground raster set (province or an apron frame) in its GPU form.
 * An image texture uploads flipped (PNG row 0 at v = 1); data textures do
 * not, so the rows are reversed here once and the shader's UVs stay as they were. */
export async function loadGroundTextures(ctrlUrl: string, tintUrl: string, gradUrl: string,
  png: (url: string) => Promise<DecodedPng> = fetchPng): Promise<GroundTextures> {
  const [c, t0, g] = await Promise.all([png(ctrlUrl), png(tintUrl), png(gradUrl)]);
  const t = halveSmooth(t0, TINT_MAX_TEXELS);
  const flipRows = (d: Uint8Array, w: number, h: number, bpp: number) => {
    const out = new Uint8Array(d.length), row = w * bpp;
    for (let y = 0; y < h; y++) out.set(d.subarray(y * row, (y + 1) * row), (h - 1 - y) * row);
    return out;
  };
  const tint = dataTexture(flipRows(foldMacroIntoTint(t, c), t.width, t.height, 4), t.width, t.height, THREE.RGBAFormat, true);
  return {
    ctrl: dataTexture(flipRows(packControl(c.data), c.width, c.height, 2), c.width, c.height, THREE.RGFormat, false),
    tint,
    grad: dataTexture(flipRows(packGradient(g.data), g.width, g.height, 2), g.width, g.height, THREE.RGFormat, true),
  };
}

/** The climate rasters (air, weather, visibility) are smooth regional fields
 * sampled with linear filtering; 1345² carries nothing 673² does not. */
export const CLIMATE_MAX_TEXELS = 700;

/** A smooth RGBA field, halved to `max` texels and uploaded with mips. */
export async function loadSmoothRaster(url: string, max: number): Promise<THREE.DataTexture> {
  const img = halveSmooth(await fetchPng(url), max);
  const row = img.width * 4, flipped = new Uint8Array(img.data.length);
  for (let y = 0; y < img.height; y++) flipped.set(img.data.subarray(y * row, (y + 1) * row), (img.height - 1 - y) * row);
  return dataTexture(flipped, img.width, img.height, THREE.RGBAFormat, true);
}

/** `useLoader` adapter: the key is the three URLs joined by `|`
 * (`groundRasterKey`), so the set suspends and caches as one entry. */
export class GroundRasterLoader extends THREE.Loader<GroundTextures> {
  /** The decoder the PNGs go through; set to a shared `PngCache` via
   * `useLoader`'s extensions so other readers of the same PNG reuse it. */
  png: (url: string) => Promise<DecodedPng> = fetchPng;
  load(key: string, onLoad: (t: GroundTextures) => void, _onProgress?: unknown, onError?: (e: unknown) => void): void {
    const [c, t, g] = key.split("|");
    loadGroundTextures(c, t, g, this.png).then(onLoad, (e) => onError?.(e));
  }
}

export const groundRasterKey = (ctrlUrl: string, tintUrl: string, gradUrl: string) => `${ctrlUrl}|${tintUrl}|${gradUrl}`;

const BYTES_PER_TEXEL: Partial<Record<number, number>> = {
  [THREE.RGBAFormat]: 4, [THREE.RGFormat]: 2, [THREE.RedFormat]: 1,
};

/** Resident bytes of a 2D/array texture as uploaded: uncompressed with its
 * mip chain counted when `generateMipmaps` is on; a compressed (KTX2) one as
 * the transcoded mip levels it carries, whatever block format the device got.
 * The WebGL-path counterpart of the WebGPU boot check's bytes-by-format readout. */
export function textureResidentBytes(t: THREE.Texture): { format: string; bytes: number } {
  if ((t as THREE.CompressedTexture).isCompressedTexture) {
    const levels = (t as THREE.CompressedTexture).mipmaps as unknown as { data: ArrayBufferView }[];
    return { format: `compressed:${t.format}`, bytes: levels.reduce((s, m) => s + m.data.byteLength, 0) };
  }
  const img = t.image as { width: number; height: number; depth?: number };
  const bpp = BYTES_PER_TEXEL[t.format as number] ?? 4;
  let w = img.width, h = img.height, bytes = 0;
  for (;;) {
    bytes += w * h * (img.depth ?? 1) * bpp;
    if (!t.generateMipmaps || (w === 1 && h === 1)) break;
    w = Math.max(1, w >> 1); h = Math.max(1, h >> 1);
  }
  const format = bpp === 4 ? "rgba8unorm" : bpp === 2 ? "rg8unorm" : "r8unorm";
  return { format, bytes };
}
