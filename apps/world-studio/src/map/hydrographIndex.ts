/**
 * Hover lookup over the hydrology graph (Phase 16a, decision 0058) for the
 * 2D map: which river / reach / body / fall sits under a map pixel, and the
 * lines the tooltip shows for it. Reads world/sources/hydrology/hydrology-graph.json
 * as published to province/hydrology-graph.json; nothing here draws.
 */

export interface HgRiver {
  id: string; strahler: number; water: string; accumKm2: number; lengthM: number;
  mouth: { kind: string; bodyId?: string; form?: string; river?: string };
  tributaryOf: { river: string } | null;
}
export interface HgReach {
  id: string; river: string; kind: string; band: number; lengthM: number; slope: number;
  widthM: number; depthM: number; levelFromM: number; levelToM: number; speedMS: number;
  season: string; bodyId?: string; centreline: [number, number][];
  fall?: { dropM: number; lipLevelM: number; plungeLevelM: number; plungeBodyId: string };
}
export interface HgBody {
  id: string; kind: string; origin: string; levelM: number; altitudeBand: string; areaM2: number;
  maxDepthM: number; season: string; wetSeasonLevelM: number; drySeasonLevelM: number;
  inflow: string[]; outflow: string | null; bboxCells: [number, number, number, number] | null;
  deepestCell: [number, number] | null; causedBy?: { fall: string };
}
interface HgGraph {
  grid: { metresPerSample: number; coarseStep: number; fullResSamples: number };
  rivers: HgRiver[]; reaches: HgReach[]; bodies: HgBody[];
}

export interface HydrographIndex {
  reachAt(px: number, py: number): HgReach | null;
  bodyAt(px: number, py: number, bodyPixelAlpha: number): HgBody | null;
  river(id: string): HgRiver | undefined;
  body(id: string): HgBody | undefined;
}

/** Build the per-map-pixel index. `width` is the map raster width (1345). */
export function buildHydrographIndex(graph: HgGraph, width: number, height: number): HydrographIndex {
  const mpp = graph.grid.metresPerSample * graph.grid.coarseStep;
  const step = graph.grid.coarseStep;
  const reaches = new Map(graph.reaches.map((r) => [r.id, r]));
  const rivers = new Map(graph.rivers.map((r) => [r.id, r]));
  const bodies = new Map(graph.bodies.map((b) => [b.id, b]));
  // Reach cells: the centreline pixel first (exact), then one-pixel
  // neighbours only where nothing exact was written, so a junction keeps
  // the reach that really passes through the pixel.
  const cell = new Map<number, string>();
  const near = new Map<number, string>();
  for (const r of graph.reaches) {
    for (const [e, s] of r.centreline) {
      const x = Math.floor(e / mpp), y = Math.floor(s / mpp);
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      cell.set(y * width + x, r.id);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        if (!near.has(ny * width + nx)) near.set(ny * width + nx, r.id);
      }
    }
  }
  // Bodies: smallest bounding box containing the pixel wins; the caller
  // passes the bodies overlay's alpha so a bbox corner outside the water
  // does not claim the pixel.
  const boxed = graph.bodies.filter((b) => b.bboxCells);
  return {
    reachAt(px, py) {
      const id = cell.get(py * width + px) ?? near.get(py * width + px);
      return id ? reaches.get(id) ?? null : null;
    },
    bodyAt(px, py, alpha) {
      if (alpha === 0) return null;
      const fx = px * step, fy = py * step;
      let best: HgBody | null = null;
      let bestArea = Infinity;
      for (const b of boxed) {
        const [x0, y0, x1, y1] = b.bboxCells!;
        if (fx < x0 - step || fy < y0 - step || fx > x1 + step || fy > y1 + step) continue;
        const area = (x1 - x0) * (y1 - y0);
        if (area < bestArea) { bestArea = area; best = b; }
      }
      return best;
    },
    river: (id) => rivers.get(id),
    body: (id) => bodies.get(id),
  };
}

const ha = (m2: number) => m2 >= 10000 ? `${(m2 / 10000).toFixed(1)} ha` : `${Math.round(m2)} m²`;

/** Tooltip lines for what the index found (empty when nothing is under the pointer). */
export function describeHydrograph(index: HydrographIndex, reach: HgReach | null, body: HgBody | null): string[] {
  const lines: string[] = [];
  if (reach) {
    const river = index.river(reach.river);
    if (river) {
      const mouth = river.mouth.kind === "confluence"
        ? `joins ${river.mouth.river ?? river.tributaryOf?.river ?? "?"}`
        : river.mouth.kind === "sea" ? `to the sea (${river.mouth.form ?? "estuary"})`
        : river.mouth.kind === "lake" ? `into ${river.mouth.bodyId}` : `to the ${river.mouth.kind}`;
      lines.push(`River ${river.id} · ${river.water} · order ${river.strahler} · ${river.accumKm2.toFixed(1)} km² · ${(river.lengthM / 1000).toFixed(1)} km · ${mouth}`);
    }
    const levels = `${reach.levelFromM.toFixed(1)}→${reach.levelToM.toFixed(1)} m`;
    lines.push(`Reach ${reach.id} · ${reach.kind} · band ${reach.band} · ${Math.round(reach.lengthM)} m · level ${levels} · slope ${reach.slope} · ${reach.widthM} m wide · ${reach.season}`);
    if (reach.fall) {
      lines.push(`Waterfall · drop ${reach.fall.dropM} m · lip ${reach.fall.lipLevelM} m → plunge ${reach.fall.plungeLevelM} m into ${reach.fall.plungeBodyId}`);
    }
    if (reach.bodyId && !body) body = index.body(reach.bodyId) ?? null;
  }
  if (body) {
    const flow = `${body.inflow.length} in · ${body.outflow ? "outflow " + body.outflow : "no outflow"}`;
    lines.push(`Body ${body.id} · ${body.kind}${body.origin !== "measured" ? ` (${body.origin})` : ""} · ${body.altitudeBand} · level ${body.levelM} m · ${ha(body.areaM2)} · max depth ${body.maxDepthM} m`);
    lines.push(`Season ${body.season} · wet ${body.wetSeasonLevelM} m / dry ${body.drySeasonLevelM} m · ${flow}${body.causedBy ? ` · dug by ${body.causedBy.fall}` : ""}`);
  }
  return lines;
}
