export { ChunkStore } from "@elder-souls/game-core/terrain/chunkStore";
export type { ChunkLodMeta, ChunkMeta, ChunksManifest, ChunkGrid } from "@elder-souls/game-core/terrain/chunkStore";
import type { ChunkMeta, ChunksManifest } from "@elder-souls/game-core/terrain/chunkStore";
import { ChunkStore } from "@elder-souls/game-core/terrain/chunkStore";
import { GroundOverlayRegistry, overlaysOfBundle, type GroundOverlaysDoc } from "@elder-souls/game-core/terrain/heightOverlays";
import type { BundleClearance } from "@elder-souls/game-core/vegetation/clearanceFilter";
import { loadLadder, type Ladder } from "../ladder";

/** `province/settlements/ground-overlays.json` (schemaVersion 1), written by
 * `worldgen.export_settlement_bundle` beside the bundle: each place's
 * levelled ground and vegetation clearance (decision 0102), under the
 * bundle's own `settlements` key so `overlaysOfBundle` and
 * `clearancesOfBundle` read it as they read the bundle. */
export interface PlaceGroundDoc {
  readonly schemaVersion: number;
  readonly settlements: readonly {
    readonly id: string;
    readonly groundOverlays?: GroundOverlaysDoc;
    readonly vegetationClearance?: BundleClearance;
  }[];
}
export const PLACE_GROUND_SCHEMA_VERSION = 1;

/** App-owned cache shared by fly/walk terrain, colliders and vegetation. It
 * carries the places' ground overlays (decision 0102), read from the ground
 * sidecar once when the ladder shows the settlements layer
 * (`installPlaceOverlays`), so every reader of the store sees the padded
 * ground. */
let shared: ChunkStore | null = null;
export function sharedChunkStore(baseUrl: string): ChunkStore {
  if (!shared || shared.baseUrl !== baseUrl) {
    const overlays = new GroundOverlayRegistry();
    shared = new ChunkStore(baseUrl, { overlays });
    void installPlaceOverlays(overlays, loadLadder(baseUrl), () => placeGround(baseUrl));
  }
  return shared;
}

/** Fill the store's overlay registry with the places' pads, only when the
 * ladder shows the `settlements` layer (16k fix 2 round 3): a build whose
 * ladder hides the places draws the frozen ground, with no pad under a
 * building that is not drawn and no wait on the ground sidecar. */
export async function installPlaceOverlays(
  overlays: GroundOverlayRegistry,
  ladder: Promise<Ladder | null>,
  doc: () => Promise<PlaceGroundDoc>,
): Promise<void> {
  const l = await ladder;
  if (l && l.hiddenLayers.includes("settlements")) {
    overlays.settleEmpty();
    return;
  }
  try {
    overlays.set(overlaysOfBundle(await doc()));
  } catch (error: unknown) {
    console.warn("[terrain] no place ground overlays", error);
    overlays.settleEmpty();
  }
}

/** The places' ground sidecar, fetched ONCE per base URL and shared by the
 * terrain store, the vegetation cells and the groundcover, and only when the
 * ladder shows the `settlements` layer (`ladderGatedPlaceGround`, 16k fix 2
 * round 4 ruling W4): a build whose ladder hides the places gets no pads and
 * no vegetation clearance. An unreadable or unknown-version file resolves to
 * no places (the frozen ground and no clearance), never a stalled terrain. */
let groundDoc: { baseUrl: string; doc: Promise<PlaceGroundDoc> } | null = null;
export function placeGround(baseUrl: string): Promise<PlaceGroundDoc> {
  if (!groundDoc || groundDoc.baseUrl !== baseUrl) {
    groundDoc = { baseUrl, doc: ladderGatedPlaceGround(loadLadder(baseUrl), () => fetchPlaceGround(baseUrl)) };
  }
  return groundDoc.doc;
}

const NO_PLACES: PlaceGroundDoc = { schemaVersion: PLACE_GROUND_SCHEMA_VERSION, settlements: [] };

/** The place ground doc when the ladder shows settlements (or there is no
 * ladder record); no places, and no read of the sidecar, when it hides
 * them. The one gate for the pads and the clearance alike. */
export async function ladderGatedPlaceGround(
  ladder: Promise<Ladder | null>,
  doc: () => Promise<PlaceGroundDoc>,
): Promise<PlaceGroundDoc> {
  const l = await ladder;
  if (l && l.hiddenLayers.includes("settlements")) return NO_PLACES;
  return doc();
}

function fetchPlaceGround(baseUrl: string): Promise<PlaceGroundDoc> {
  return fetch(`${baseUrl}province/settlements/ground-overlays.json`)
    .then((r) => (r.ok ? r.json() as Promise<PlaceGroundDoc> : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((d) => {
      if (d.schemaVersion !== PLACE_GROUND_SCHEMA_VERSION) {
        throw new Error(`schemaVersion ${String(d.schemaVersion)}, expected ${PLACE_GROUND_SCHEMA_VERSION}`);
      }
      return d;
    })
    .catch((error: unknown): PlaceGroundDoc => {
      console.warn("[terrain] place ground sidecar unreadable: no pads, no clearance", error);
      return NO_PLACES;
    });
}

/** Terrain LOD ladder: the band a rectangle of ground is drawn at, by the
 * distance from the camera to its NEAREST EDGE (0 inside it), not by a ring
 * index. Chunks are 467.9 m; these thresholds are metres.
 *
 * The two fine bands are much shorter than the chunk they used to be chosen
 * at: inside 400 m a chunk is not drawn whole but as a 4×4 grid of 117 m
 * sub-tiles, each taking LOD 1 or LOD 2 from its OWN edge distance
 * (`SUB_TILE_DIVISIONS`, `subGrid`). Choosing full 1.8 m detail per 468 m
 * chunk meant a whole chunk's 131 k triangles for a corner of it inside the
 * band. Skyrim draws its full 1.8 m ground only inside the 285 m loaded
 * square and 7 m beyond it; this ladder is the same shape.
 *
 * A rectangle steps UP in detail the moment it is inside a band, and steps
 * DOWN only once it is `LOD_HYSTERESIS` beyond it, so a camera sitting on a
 * boundary cannot flip it back and forth every frame. */
export const LOD_BANDS: { lod: string; maxM: number }[] = [
  { lod: "1", maxM: 150 },
  { lod: "2", maxM: 400 },
  { lod: "4", maxM: 1400 },
  { lod: "8", maxM: Infinity },
];
export const LOD_HYSTERESIS = 1.15;
/** The camera must move this far before the whole ladder is re-evaluated. */
export const LOD_REEVALUATE_M = 8;
/** A chunk inside the fine bands is drawn as this many sub-tiles per side. */
export const SUB_TILE_DIVISIONS = 4;
/** The LODs a sub-tile may take; a chunk coarser than these is drawn whole. */
export const SUB_TILE_LODS = ["1", "2"];

/** Distance in metres from (camX, camZ) to an axis-aligned ground rectangle. */
export function nearestEdgeToRectM(
  camX: number, camZ: number, minX: number, minZ: number, sizeX: number, sizeZ: number,
): number {
  const dx = Math.max(minX - camX, 0, camX - (minX + sizeX));
  const dz = Math.max(minZ - camZ, 0, camZ - (minZ + sizeZ));
  return Math.hypot(dx, dz);
}

/** Distance in metres from (camX, camZ) to the chunk cell's rectangle. */
export function nearestEdgeM(camX: number, camZ: number, cx: number, cy: number, chunkMetres: number): number {
  return nearestEdgeToRectM(camX, camZ, cx * chunkMetres, cy * chunkMetres, chunkMetres, chunkMetres);
}

/** The band for an edge distance, with the same hysteresis for a chunk and for
 * a sub-tile: `allowed`, when given, is the subset of LODs this rectangle may
 * take (a sub-tile is only ever LOD 1 or 2). */
export function lodForEdgeDistance(d: number, current?: string, allowed?: string[]): string {
  const bands = allowed ? LOD_BANDS.filter((b) => allowed.includes(b.lod)) : LOD_BANDS;
  let fine = bands.length - 1;
  for (let i = 0; i < bands.length; i++) if (d < bands[i].maxM) { fine = i; break; }
  const ci = current === undefined ? -1 : bands.findIndex((b) => b.lod === current);
  if (ci < 0) return bands[fine].lod;
  if (fine < ci) return bands[fine].lod;          // upgrade immediately
  let coarse = bands.length - 1;
  for (let i = 0; i < bands.length; i++) if (d < bands[i].maxM * LOD_HYSTERESIS) { coarse = i; break; }
  return bands[Math.max(ci, coarse)].lod;          // downgrade only past the margin
}

/** The LOD for a chunk cell, given the camera position and (for hysteresis)
 * the LOD it is currently drawn at. */
export function lodForDistance(
  camX: number, camZ: number, cx: number, cy: number, chunkMetres: number, current?: string,
): string {
  return lodForEdgeDistance(nearestEdgeM(camX, camZ, cx, cy, chunkMetres), current);
}

/** True when a chunk at this LOD is drawn as sub-tiles rather than whole. */
export function drawsAsSubTiles(lod: string): boolean {
  return SUB_TILE_LODS.includes(lod);
}

/** The NW corner and side of sub-tile `(ix, iz)` of a chunk cell, in metres. */
export function subTileRectM(
  cx: number, cy: number, ix: number, iz: number, chunkMetres: number,
): [number, number, number] {
  const side = chunkMetres / SUB_TILE_DIVISIONS;
  return [cx * chunkMetres + ix * side, cy * chunkMetres + iz * side, side];
}

/** The LOD for one sub-tile, by its own edge distance, on the same ladder and
 * the same hysteresis as a whole chunk. */
export function lodForSubTile(
  camX: number, camZ: number, cx: number, cy: number, ix: number, iz: number,
  chunkMetres: number, current?: string,
): string {
  const [minX, minZ, side] = subTileRectM(cx, cy, ix, iz, chunkMetres);
  return lodForEdgeDistance(
    nearestEdgeToRectM(camX, camZ, minX, minZ, side, side), current, SUB_TILE_LODS);
}

/** Start every chunk's tile download the moment the manifest is known,
 * without waiting for the splat material's textures (~40 MB of PNG) to
 * arrive: until 2026-09-13 the tile requests sat behind that gate inside
 * ChunkTerrain, so the flyover showed the flat grey fallback for 30 s or
 * more on a cold load. The store dedupes, so ChunkTerrain's own requests
 * find these pending or done. Fire-and-forget; failures surface later. */
export function prefetchChunks(store: ChunkStore, manifest: ChunksManifest, focusXM: number, focusZM: number): void {
  const cx = Math.max(0, Math.min(manifest.grid[0] - 1, Math.floor(focusXM / manifest.chunkMetres)));
  const cy = Math.max(0, Math.min(manifest.grid[1] - 1, Math.floor(focusZM / manifest.chunkMetres)));
  const near: ChunkMeta[] = [], far: ChunkMeta[] = [];
  for (const c of manifest.chunks) (Math.max(Math.abs(c.cx - cx), Math.abs(c.cy - cy)) <= 3 ? near : far).push(c);
  for (const c of [...near, ...far]) {
    store.load(c.cx, c.cy, lodForDistance(focusXM, focusZM, c.cx, c.cy, manifest.chunkMetres))
      .catch(() => { /* reported where it is drawn */ });
  }
}
