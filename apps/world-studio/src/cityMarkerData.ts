/**
 * Where the golden city beacons stand (owner ask, 2026-09-05).
 *
 * Positions come from EXPORTED DATA, never from a hard-coded list:
 *   - `province/places.json`      (worldgen.export_places) — every plotted
 *     place with its `positionM` in world metres and its `importanceTier`.
 *   - `province/blueprints.json`  (worldgen.export_blueprints) — when a
 *     blueprint exists for the place, the marker stands on the blueprint's
 *     boundary centroid instead of the place anchor (Lilmoth's blueprint sits
 *     ~55 m east of its anchor).
 *
 * So a re-siting via `worldgen.apply_sitings` (which re-exports both files)
 * moves the beacon with no code change.
 *
 * Pure data mapping — no three.js, no fetch. `cityMarkers` is unit-tested.
 */
import type { PlottedPlace } from "@elder-souls/contracts";
import type { Blueprint, Poly } from "./blueprints/blueprintsData";

/** Tiers that get a beacon: 0 = landmark city, 1 = landmark settlement. */
export const MARKER_TIERS = [0, 1] as const;

export interface CityMarkerSpec {
  /** Place id — stable, and the key the blueprint is matched on. */
  id: string;
  name: string;
  /** World metres, X east / Z south, province NW origin. */
  xM: number;
  zM: number;
  /** Tier 0 draws gold, tier 1 draws pale. */
  major: boolean;
  /** True when the position came from a blueprint centroid. */
  fromBlueprint: boolean;
}

/**
 * Area-weighted centroid of a simple polygon in metres. Falls back to the
 * mean of the vertices for degenerate (zero-area) rings.
 */
export function polygonCentroid(poly: Poly): [number, number] | null {
  if (!poly.length) return null;
  let twiceArea = 0;
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, z0] = poly[i];
    const [x1, z1] = poly[(i + 1) % poly.length];
    const cross = x0 * z1 - x1 * z0;
    twiceArea += cross;
    cx += (x0 + x1) * cross;
    cz += (z0 + z1) * cross;
  }
  if (Math.abs(twiceArea) < 1e-9) {
    const mx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
    const mz = poly.reduce((s, p) => s + p[1], 0) / poly.length;
    return [mx, mz];
  }
  return [cx / (3 * twiceArea), cz / (3 * twiceArea)];
}

/** Blueprint centre: the exported `centreM` if present, else the boundary centroid. */
export function blueprintCentre(bp: Blueprint): [number, number] | null {
  const exported = (bp as Blueprint & { centreM?: [number, number] | null }).centreM;
  if (exported && Number.isFinite(exported[0]) && Number.isFinite(exported[1])) return exported;
  return bp.boundary ? polygonCentroid(bp.boundary) : null;
}

/** The beacons to draw, in place-id order (deterministic). */
export function cityMarkers(places: PlottedPlace[], blueprints: Blueprint[] = []): CityMarkerSpec[] {
  const centres = new Map<string, [number, number]>();
  for (const bp of blueprints) {
    const c = blueprintCentre(bp);
    if (c) centres.set(bp.id, c);
  }
  const tiers = new Set<number>(MARKER_TIERS);
  return places
    .filter((p) => tiers.has(p.importanceTier) && p.positionM)
    .map((p) => {
      const centre = centres.get(p.id);
      return {
        id: p.id,
        name: p.name,
        xM: centre ? centre[0] : p.positionM![0],
        zM: centre ? centre[1] : p.positionM![1],
        major: p.importanceTier === 0,
        fromBlueprint: Boolean(centre),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}
