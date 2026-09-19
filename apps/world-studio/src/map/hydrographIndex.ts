/**
 * Hover lookup over the hydrology graph (Phase 16a, decision 0058) for the
 * 2D map: which river / reach / body / fall sits under a map pixel, and the
 * lines the tooltip shows for it. Reads world/sources/hydrology/hydrology-graph.json
 * as published to province/hydrology-graph.json; nothing here draws.
 *
 * Names are a separate record (world/sources/hydrology/names.json, published as
 * province/hydrology-names.json): the graph is not edited to carry them, because
 * its `contentSha256` is recorded downstream. The tooltip joins on entity id.
 */

/** The published name record, keyed by the entity id the graph already carries. */
export interface HydrologyNames { names: { entityId: string; name: string; aliases?: string[] }[] }

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

/**
 * The compiled water's record of what stands where: the entity raster
 * (province/water/water-id.png + water-meta.json entities[]) decoded by the
 * caller. Decision 0066 — downstream stages read the signed record, they do
 * not re-solve it; decision 0063 §1 — every wet texel names its graph entity.
 */
export interface EntitySource {
  /** Graph entity id at a world point, or null where the compile put no water. */
  labelAt(eastM: number, southM: number): string | null;
}

export interface HydrographIndex {
  reachAt(px: number, py: number): HgReach | null;
  bodyAt(px: number, py: number, bodyPixelAlpha: number, elevationM?: number): HgBody | null;
  /** Entity id under the pixel; null = the compile has no water there; undefined = no entity source supplied. */
  entityIdAt(px: number, py: number): string | null | undefined;
  river(id: string): HgRiver | undefined;
  body(id: string): HgBody | undefined;
  /** The name this entity carries in the naming record, if it has one. */
  nameOf(id: string): string | undefined;
}

/** Build the per-map-pixel index. `width` is the map raster width (1345). */
export function buildHydrographIndex(
  graph: HgGraph, width: number, height: number, entities?: EntitySource,
  names?: HydrologyNames | null,
): HydrographIndex {
  const namesById = new Map((names?.names ?? []).map((n) => [n.entityId, n.name]));
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
  const labelAt = (px: number, py: number) =>
    entities ? entities.labelAt((px + 0.5) * mpp, (py + 0.5) * mpp) : undefined;
  return {
    reachAt(px, py) {
      const id = cell.get(py * width + px) ?? near.get(py * width + px);
      return id ? reaches.get(id) ?? null : null;
    },
    entityIdAt: (px, py) => labelAt(px, py),
    bodyAt(px, py, alpha, elevationM = 0) {
      // TRUTH: the compiled entity raster says which body (if any) stands on
      // this pixel. FALLBACK (below): the graph bbox scan, used only when no
      // entity source was supplied (the map can load before the water rasters,
      // and the water layer may be undelivered). The bbox scan names the
      // smallest box containing the pixel, which is a guess, not the record:
      // one lowland swamp's box covered 706 other bodies and the tooltip
      // named water that was not there (owner 2026-09-14).
      if (entities) {
        const id = labelAt(px, py);
        if (!id) return null;
        if (id.startsWith("body.")) return bodies.get(id) ?? null;
        return null; // a reach: reachAt already covers it
      }
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
      if (best) return best;
      // a promised plunge pool has no box, only its cell: within three map pixels
      for (const b of graph.bodies) {
        if (b.bboxCells || !b.deepestCell) continue;
        if (Math.abs(b.deepestCell[0] - fx) <= 3 * step && Math.abs(b.deepestCell[1] - fy) <= 3 * step) return b;
      }
      // painted water with no body under it is the sea only where the ground is at sea level:
      // a marker on a 100 m hillside used to fall through to "body.ocean" (owner 2026-09-13)
      return elevationM <= 0.5 ? bodies.get("body.ocean") ?? null : null;
    },
    river: (id) => rivers.get(id),
    body: (id) => bodies.get(id),
    nameOf: (id) => namesById.get(id),
  };
}

const ha = (m2: number) => m2 >= 10000 ? `${(m2 / 10000).toFixed(1)} ha` : `${Math.round(m2)} m²`;

/** One block of the tooltip: a heading and label/value rows. */
export interface TipSection { title: string; rows: [string, string][] }

const KIND_WORDS: Record<string, string> = {
  "horizontal-channel": "flat channel",
  "horizontal-backwater": "through a lake or pond", "horizontal-tidal": "tidal reach",
  "sloped-riffle": "riffle (gentle slope)", "sloped-rapid": "rapid", "sloped-chute": "chute (steep slide)",
  "vertical-fall": "waterfall",
};

/** Tooltip sections for what the index found (empty when nothing is under the pointer). */
export function describeHydrograph(
  index: HydrographIndex, reach: HgReach | null, body: HgBody | null, noWaterHere = false,
): TipSection[] {
  const out: TipSection[] = [];
  if (noWaterHere) out.push({ title: "no water here", rows: [["water", "the compiled water has nothing at this point"]] });
  if (reach) {
    const river = index.river(reach.river);
    if (river) {
      const mouth = river.mouth.kind === "confluence"
        ? `joins ${river.mouth.river ?? river.tributaryOf?.river ?? "?"}`
        : river.mouth.kind === "sea" ? `the sea (${river.mouth.form ?? "estuary"})`
        : river.mouth.kind === "lake" ? `lake ${river.mouth.bodyId}` : `the ${river.mouth.kind}`;
      const riverName = index.nameOf(river.id);
      out.push({ title: `${riverName ? riverName + " · " : ""}River ${river.id}`, rows: [
        ["water", river.water], ["order", String(river.strahler)],
        ["catchment", `${river.accumKm2.toFixed(1)} km²`], ["length", `${(river.lengthM / 1000).toFixed(1)} km`],
        ["river ends downstream at", mouth],
      ] });
    }
    const rows: [string, string][] = [
      ["kind", `${KIND_WORDS[reach.kind] ?? reach.kind} (${reach.kind})`],
      ["size", `band ${reach.band} (${["", "creek", "stream", "river"][reach.band] ?? ""})`],
      ["length", `${Math.round(reach.lengthM)} m`], ["level", `${reach.levelFromM.toFixed(1)} → ${reach.levelToM.toFixed(1)} m`],
      ["slope", `${(reach.slope * 100).toFixed(1)} cm per m`], ["width", `${reach.widthM} m`], ["season", reach.season],
    ];
    if (reach.fall) {
      rows.push(["waterfall drop", `${reach.fall.dropM} m (lip ${reach.fall.lipLevelM} m → ${reach.fall.plungeLevelM} m)`]);
      rows.push(["fall lands in", reach.fall.plungeBodyId === "body.ocean" ? "the sea" : reach.fall.plungeBodyId]);
      const suspect = (reach.fall as { suspect?: string }).suspect;
      if (suspect) rows.push(["flag", `${suspect}: a source-terrain step, 16b smooths it`]);
    }
    const reachName = index.nameOf(reach.id);
    out.push({ title: `${reachName ? reachName + " · " : ""}Reach ${reach.id}`, rows });
    if (reach.bodyId && !body) body = index.body(reach.bodyId) ?? null;
  }
  if (body) {
    const name = index.nameOf(body.id) ?? (body as { name?: string | null }).name;
    out.push({ title: `${name ? name + " · " : ""}Body ${body.id}`, rows: [
      ["kind", `${body.kind}${body.origin !== "measured" ? ` (${body.origin})` : ""}`], ["altitude", body.altitudeBand],
      ["level", `${body.levelM} m`], ["area", ha(body.areaM2)], ["max depth", `${body.maxDepthM} m`],
      ["season", `${body.season} (wet ${body.wetSeasonLevelM} m, dry ${body.drySeasonLevelM} m)`],
      ["flow", `${body.inflow.length} in · ${body.outflow ? "out via " + body.outflow : "no outflow"}`],
      ...(body.causedBy ? [["dug by", body.causedBy.fall] as [string, string]] : []),
    ] });
  }
  return out;
}
