import { deflateSync } from "node:zlib";

/** Minimal PNG writer (CRCs are not checked by the decoder). */
export function png(w: number, h: number, colourType: 2 | 6, rows: number[][], filter = 0): Uint8Array {
  const bpp = colourType === 6 ? 4 : 3;
  const raw: number[] = [];
  rows.forEach((r, y) => {
    raw.push(filter);
    r.forEach((v, i) => {
      const left = i >= bpp ? r[i - bpp] : 0;
      const up = y > 0 ? rows[y - 1][i] : 0;
      raw.push(filter === 1 ? (v - left) & 255 : filter === 2 ? (v - up) & 255 : v);
    });
  });
  const chunk = (type: string, body: Uint8Array) => {
    const out = new Uint8Array(12 + body.length);
    new DataView(out.buffer).setUint32(0, body.length);
    out.set([...type].map((c) => c.charCodeAt(0)), 4);
    out.set(body, 8);
    return out;
  };
  const ihdr = new Uint8Array(13);
  new DataView(ihdr.buffer).setUint32(0, w); new DataView(ihdr.buffer).setUint32(4, h);
  ihdr.set([8, colourType, 0, 0, 0], 8);
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Uint8Array.from(raw))), chunk("IEND", new Uint8Array())];
  const all = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0; for (const p of parts) { all.set(p, o); o += p.length; }
  return all;
}
