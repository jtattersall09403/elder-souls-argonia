/**
 * Minified frame -> source file:line for the heap-sample and CPU-profile summaries (perf-diag9 A1). A gpu-lane build
 * made with ES_GPU_LANE_SOURCEMAP=1 carries hidden source maps (`<chunk>.js.map` beside each chunk, no
 * sourceMappingURL comment, so the page never fetches them); `measure.mjs --maps <built site or dist dir>` loads them
 * here on the VM and every summarised frame whose chunk has a map is named by its source position.
 */
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const DIGIT = new Map([...B64].map((c, i) => [c, i]));

/** One `mappings` string -> per generated line, segments [genCol, srcIdx, srcLine, srcCol] (0-based, absolute). */
export function decodeMappings(mappings) {
  const lines = [];
  let src = 0, sl = 0, sc = 0;
  for (const line of mappings.split(";")) {
    const segs = [];
    let gc = 0;
    for (const seg of line.split(",")) {
      if (!seg) continue;
      const v = [];
      let value = 0, shift = 0;
      for (const ch of seg) {
        const d = DIGIT.get(ch);
        value += (d & 31) << shift;
        if (d & 32) { shift += 5; continue; }
        v.push(value & 1 ? -(value >>> 1) : value >>> 1);
        value = 0; shift = 0;
      }
      gc += v[0];
      if (v.length >= 4) { src += v[1]; sl += v[2]; sc += v[3]; segs.push([gc, src, sl, sc]); }
    }
    lines.push(segs);
  }
  return lines;
}

/** Every `*.js.map` under `dir` (recursive), keyed by its chunk's file name: {sources, lines}. Empty map without dir. */
export function loadSourceMaps(dir) {
  const maps = new Map();
  if (!dir) return maps;
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".js.map")) {
        const m = JSON.parse(readFileSync(p, "utf8"));
        maps.set(basename(e.name, ".map"), { sources: m.sources.map((s) => s.replace(/^(\.\.\/)+/, "")), lines: decodeMappings(m.mappings) });
      }
    }
  };
  walk(dir);
  return maps;
}

/** A CDP callFrame-style position (url, 0-based line and column) -> "source:line" (1-based), or null without a map. */
export function sourcePosition(maps, url, line0, col0) {
  if (!maps?.size || !url) return null;
  const m = maps.get(url.replace(/[?#].*$/, "").replace(/^.*\//, ""));
  const segs = m?.lines[line0];
  if (!segs?.length) return null;
  let hit = null;
  for (const s of segs) { if (s[0] <= col0) hit = s; else break; }
  return hit ? `${m.sources[hit[1]]}:${hit[2] + 1}` : null;
}
