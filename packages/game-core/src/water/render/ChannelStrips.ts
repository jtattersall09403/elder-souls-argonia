import * as THREE from "three";
import type { WaterMeta } from "../waterData";

/**
 * Explicit ribbon meshes for the compiled steep-reach strips (decision 0046
 * item 4).
 *
 * Why they exist: the province W raster is a 3.66 m field sampled by a 2.6 m
 * vertex grid, so a mountain stream one texel wide bilinears into a chain of
 * disconnected blobs and, over a cliff, into a stretched vertical sheet. The
 * compiler classifies those reaches (`water-meta.json` `channels[]`) and marks
 * their cells in `water-owner.png`; the field surface discards there and these
 * meshes draw the water instead — same shader, same look, driven by per-vertex
 * hydraulics rather than a raster fetch (`ES_STRIP`).
 *
 * The first and last point of every chain is a `join` point sitting exactly on
 * the field surface one station INTO the field (v2: or a `lip`/`plunge` where
 * a sheet bridges a cliff), so the ribbon overlaps rather than butts against
 * it; `polygonOffset` on the strip material wins that overlap and the bank
 * profile (`aSide`) dissolves the margins.
 *
 * Decision 0047: the ribbon carries its own UV — `aSideM` (signed across
 * metres) and `aArc` (cumulative metres, the compiler's `arcM` when present)
 * — plus `aScroll`, the chain's mean speed, so the whitewater streaks scroll
 * along the ribbon's own axis at one uniform rate per ribbon, and `aEdge`,
 * the mesh-edge ratio `(halfWidth + bank) / halfWidth`, so the bank fade
 * spans exactly the margin beyond the COMPILED width (the water is drawn at
 * its full compiled width; only the 0.6 m overlap dissolves).
 *
 * Boulders in the bed are a scatter-compiler job; `stripBoulderCandidates`
 * below is the deterministic density rule it consumes (research
 * `waterfalls-realtime.md` §3.6: `fxrapidsrocks01` = 1 boulder / 160 m²).
 */

export type ChannelStrip = NonNullable<WaterMeta["channels"]>[number];
export type ChannelPoint = ChannelStrip["points"][number];

/** Longitudinal resampling step. Fine enough that a 2 m arc reads as a curve. */
export const STRIP_STEP_M = 2;
/** Half of the 1.2 m of extra width that the depth fade dissolves into banks. */
export const STRIP_BANK_M = 0.6;
/** Never let a bad record produce a zero-area or knife-edge ribbon. */
const MIN_HALF_WIDTH_M = 0.35;
/** Across-ratio where the bank fade begins (1 = the compiled water edge). */
export const STRIP_BANK_FADE_START = 0.85;

export interface ChannelStripGeometry {
  geometry: THREE.BufferGeometry;
  /** Resampled cross-sections (2 vertices each). */
  stationCount: number;
  vertexCount: number;
  triangleCount: number;
  /** Chains that produced geometry (degenerate ones are dropped). */
  stripCount: number;
}

interface Station {
  x: number; z: number; y: number; bedY: number; halfWidthM: number;
  speedMS: number; season: number; tx: number; tz: number; dropPerM: number;
  /** Cumulative metres along the chain. */
  arcM: number;
}

function finitePoint(p: ChannelPoint): boolean {
  return [p.x, p.z, p.y, p.bedY, p.halfWidthM, p.speedMS, p.season].every(Number.isFinite);
}

/**
 * Resample one chain to `stepM` along its horizontal arc length. Linear in
 * every field, so a monotone input `y` stays monotone and the join points keep
 * exactly the field height the compiler recorded.
 */
export function resampleStrip(points: readonly ChannelPoint[], stepM = STRIP_STEP_M): Station[] {
  const pts = points.filter(finitePoint);
  if (pts.length < 2 || !(stepM > 0)) return [];
  const arc: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    arc.push(arc[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  }
  // v2 chains carry their own cumulative arc; prefer it when it is a sane
  // monotone series (it is measured along the smoothed centreline the
  // compiler carved, which the resampled polyline approximates).
  const authored = pts.map((p) => p.arcM);
  const useAuthored = authored.every((a, i) => Number.isFinite(a) && (i === 0 || (a as number) >= (authored[i - 1] as number)));
  const arcOut = useAuthored ? (authored as number[]) : arc;
  const total = arc[arc.length - 1];
  if (!(total > 1e-3)) return [];
  const count = Math.max(1, Math.ceil(total / stepM));
  const out: Station[] = [];
  let seg = 0;
  for (let i = 0; i <= count; i++) {
    const s = (total * i) / count;
    while (seg < pts.length - 2 && arc[seg + 1] < s) seg++;
    const a = pts[seg];
    const b = pts[seg + 1];
    const span = arc[seg + 1] - arc[seg];
    const t = span > 1e-6 ? Math.min(Math.max((s - arc[seg]) / span, 0), 1) : 0;
    const mix = (u: number, v: number) => u + (v - u) * t;
    let tx = b.x - a.x;
    let tz = b.z - a.z;
    const tl = Math.hypot(tx, tz);
    if (tl > 1e-6) { tx /= tl; tz /= tl; } else { tx = 1; tz = 0; }
    out.push({
      x: mix(a.x, b.x), z: mix(a.z, b.z), y: mix(a.y, b.y), bedY: mix(a.bedY, b.bedY),
      halfWidthM: Math.max(mix(a.halfWidthM, b.halfWidthM), MIN_HALF_WIDTH_M),
      speedMS: mix(a.speedMS, b.speedMS), season: mix(a.season, b.season),
      tx, tz, dropPerM: 0, arcM: mix(arcOut[seg], arcOut[seg + 1]),
    });
  }
  // Along-chain drop per metre — the shader's cascade/rapids shading term,
  // which on the field surface comes from a downstream raster fetch.
  const ds = total / count;
  for (let i = 0; i < out.length; i++) {
    const lo = out[Math.max(i - 1, 0)];
    const hi = out[Math.min(i + 1, out.length - 1)];
    const run = ds * (Math.min(i + 1, out.length - 1) - Math.max(i - 1, 0));
    out[i].dropPerM = run > 1e-6 ? Math.min(Math.max((lo.y - hi.y) / run, 0), 1) : 0;
  }
  return out;
}

/** One merged geometry for every strip — 259 chains are ~19 k triangles. */
export function buildChannelStripGeometry(
  channels: readonly ChannelStrip[],
  options: { stepM?: number; bankM?: number } = {},
): ChannelStripGeometry {
  const stepM = options.stepM ?? STRIP_STEP_M;
  const bankM = options.bankM ?? STRIP_BANK_M;
  const chains = channels
    .map((c) => resampleStrip(c.points ?? [], stepM))
    .filter((s) => s.length >= 2);

  const stationCount = chains.reduce((n, s) => n + s.length, 0);
  const vertexCount = stationCount * 2;
  const triangleCount = chains.reduce((n, s) => n + (s.length - 1) * 2, 0);

  const position = new Float32Array(vertexCount * 3);
  const aStill = new Float32Array(vertexCount);
  const aBedDepth = new Float32Array(vertexCount);
  const aFlow = new Float32Array(vertexCount * 2);
  const aSeason = new Float32Array(vertexCount);
  const aDrop = new Float32Array(vertexCount);
  // Signed across-width coordinate, normalised so |aSide| = 1 at the WATER
  // edge and grows through the bank margin to the mesh edge. Without it the
  // shader had no idea where the water stopped and the overlap began, so it
  // treated the margin as a shoreline and drew a bright foam line down both
  // sides of every chute.
  const aSide = new Float32Array(vertexCount);
  // Ribbon UV for the whitewater streaks (decision 0047 item 4).
  const aSideM = new Float32Array(vertexCount);
  const aArc = new Float32Array(vertexCount);
  const aScroll = new Float32Array(vertexCount);
  // mesh-edge ratio: |aSide| at the outer vertex, so the fragment knows where
  // the bank margin ends without guessing a per-fragment half width
  const aEdge = new Float32Array(vertexCount);
  const index = new Uint32Array(triangleCount * 3);

  let v = 0;
  let k = 0;
  for (const chain of chains) {
    const base = v;
    // one uniform scroll speed per ribbon: the chain's mean speed (never a
    // per-vertex speed × time — that shears the streak field apart)
    const scroll = Math.max(0.5, chain.reduce((n, st) => n + st.speedMS, 0) / chain.length);
    for (const st of chain) {
      const half = st.halfWidthM + bankM;
      const nx = -st.tz;
      const nz = st.tx;
      for (const side of [-1, 1]) {
        const i = v * 3;
        position[i] = st.x + nx * half * side;
        position[i + 1] = st.y;
        position[i + 2] = st.z + nz * half * side;
        aStill[v] = st.y;
        aBedDepth[v] = Math.max(st.y - st.bedY, 0.05);
        aFlow[v * 2] = st.tx * st.speedMS;
        aFlow[v * 2 + 1] = st.tz * st.speedMS;
        aSeason[v] = st.season;
        aDrop[v] = st.dropPerM;
        aSide[v] = side * (half / Math.max(st.halfWidthM, 1e-3));
        aSideM[v] = side * half;
        aArc[v] = st.arcM;
        aScroll[v] = scroll;
        aEdge[v] = half / Math.max(st.halfWidthM, 1e-3);
        v++;
      }
    }
    for (let s = 0; s + 1 < chain.length; s++) {
      const a = base + s * 2;
      index[k++] = a; index[k++] = a + 2; index[k++] = a + 1;
      index[k++] = a + 1; index[k++] = a + 2; index[k++] = a + 3;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("aStill", new THREE.BufferAttribute(aStill, 1));
  geometry.setAttribute("aBedDepth", new THREE.BufferAttribute(aBedDepth, 1));
  geometry.setAttribute("aFlow", new THREE.BufferAttribute(aFlow, 2));
  geometry.setAttribute("aSeason", new THREE.BufferAttribute(aSeason, 1));
  geometry.setAttribute("aDrop", new THREE.BufferAttribute(aDrop, 1));
  geometry.setAttribute("aSide", new THREE.BufferAttribute(aSide, 1));
  geometry.setAttribute("aSideM", new THREE.BufferAttribute(aSideM, 1));
  geometry.setAttribute("aArc", new THREE.BufferAttribute(aArc, 1));
  geometry.setAttribute("aScroll", new THREE.BufferAttribute(aScroll, 1));
  geometry.setAttribute("aEdge", new THREE.BufferAttribute(aEdge, 1));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.computeBoundingSphere();
  return { geometry, stationCount, vertexCount, triangleCount, stripCount: chains.length };
}

/* ------------------------------------------------------------------ *
 * Boulder candidates along a strip (for the scatter compiler).
 * ------------------------------------------------------------------ */

/** Bethesda's own calibration: 6 boulders in a 24 x 40 m rapids patch. */
export const BOULDER_BED_M2_PER_ROCK = 160;
/** Rock radius range (m) that reads as an individual obstacle in a channel. */
export const BOULDER_RADIUS_M = { min: 0.6, max: 2.5 } as const;

export interface BoulderCandidate {
  /** Stable id: `${stripId}:rock-${n}`. */
  id: string;
  x: number; z: number;
  /** Bed height under the rock (the strip's `bedY`). */
  y: number;
  radiusM: number;
  /** Arc metres along the chain and signed across offset (m) from the centreline. */
  arcM: number;
  sideM: number;
  /** Unit downstream tangent at the rock — the foam-stamp axis (pillow
   * ~0.5 r upstream, tail ~3 r downstream, baked at compile time). */
  tx: number; tz: number;
}

/** Deterministic 32-bit hash of a string (FNV-1a). */
function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function lcg(state: number): () => number {
  let s = state || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Boulder candidate positions along one strip: one per
 * `BOULDER_BED_M2_PER_ROCK` of wetted bed (Σ 2·halfWidth·ds), seeded by the
 * strip id so the same data always yields the same rocks. Rocks sit inside
 * 80 % of the compiled half width, never on the join stations (the field
 * overlap), radii 0.6–2.5 m biased small. The scatter compiler owns whether a
 * candidate survives (kit availability, slope, other scatter).
 */
export function stripBoulderCandidates(
  strip: ChannelStrip,
  options: { stepM?: number; bedM2PerRock?: number } = {},
): BoulderCandidate[] {
  const stations = resampleStrip(strip.points ?? [], options.stepM ?? STRIP_STEP_M);
  if (stations.length < 3) return [];
  const perRock = options.bedM2PerRock ?? BOULDER_BED_M2_PER_ROCK;
  const random = lcg(hashString(strip.id));
  const out: BoulderCandidate[] = [];
  let area = 0;
  // start half a quota in so the first rock is not glued to the head join
  let quota = perRock * (0.5 + random() * 0.5);
  for (let i = 1; i < stations.length - 1; i++) {
    const a = stations[i - 1];
    const b = stations[i];
    const ds = Math.hypot(b.x - a.x, b.z - a.z);
    area += 2 * b.halfWidthM * ds;
    if (area < quota) continue;
    area -= quota;
    quota = perRock;
    const sideM = (random() * 2 - 1) * 0.8 * b.halfWidthM;
    const r = BOULDER_RADIUS_M.min + Math.pow(random(), 1.6) * (BOULDER_RADIUS_M.max - BOULDER_RADIUS_M.min);
    const nx = -b.tz;
    const nz = b.tx;
    out.push({
      id: `${strip.id}:rock-${out.length}`,
      x: b.x + nx * sideM, z: b.z + nz * sideM, y: b.bedY,
      radiusM: Math.min(r, Math.max(b.halfWidthM * 0.9, BOULDER_RADIUS_M.min)),
      arcM: b.arcM, sideM, tx: b.tx, tz: b.tz,
    });
  }
  return out;
}
