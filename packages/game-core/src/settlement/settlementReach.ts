/**
 * What a settlement build depends on the player's position for (perf-diag22
 * G-a). The draw batches are camera-independent (F40): only the inputs (the
 * bundle, the loaded pieces, the manifests, the quality) make a FULL pass
 * (buckets, signature, batches) necessary. A walk changes only what is in
 * reach (fixtures, smoke, colliders, the stats), so a move runs a REACH pass
 * (no bucket, no signature, no batch) and only when the set of placements in
 * reach has changed; otherwise nothing runs. Pure.
 */
import { residentPlacementIdsAt } from "./collisionResidency";
import { isSmokeColumnPlacement, SMOKE_MAX_DISTANCE_M } from "./smokeColumn";
import type { SettlementBundle, SettlementPlacement } from "./types";

/** The far-LOD draw distance at quality 1, m. */
export const MAX_RENDER_DISTANCE_M = 5000;
/** The focus moves this far (m) before what is in reach is judged again. */
export const REBUILD_MOVE_M = 40;

/** A placement's draw cap at quality 1 (dressing 350 m, route structures 2500 m, else the far draw). */
export function placementDrawCapM(kind: SettlementPlacement["kind"]): number {
  return kind === "dressing" ? 350 : kind === "route-structure" ? 2500 : MAX_RENDER_DISTANCE_M;
}

/**
 * The placements in reach of `focus`, as one string: drawn (inside the draw
 * cap), collision-resident, inside the collider ring, or a smoke column in
 * range. Two foci with the same key give the same reach pass.
 */
export function placementsInReachKey(
  bundle: Pick<SettlementBundle, "placements" | "settlements" | "lod">,
  focus: { x: number; z: number }, drawScale: number,
): string {
  const residents = residentPlacementIdsAt(bundle.settlements, focus);
  const colliderM = bundle.lod.colliderRadiusM;
  const ids: string[] = [];
  for (const p of bundle.placements) {
    const d = Math.hypot(p.positionM[0] - focus.x, p.positionM[2] - focus.z);
    const smoke = isSmokeColumnPlacement(p);
    const inReach = smoke ? d <= SMOKE_MAX_DISTANCE_M + REBUILD_MOVE_M
      : d <= placementDrawCapM(p.kind) * drawScale || d <= colliderM || residents.has(p.id);
    if (inReach) ids.push(p.id);
  }
  return ids.sort().join(",");
}

/** The inputs of the last FULL pass that swapped in; a pass with the same inputs needs no bucket pass. */
export interface FullPassInputs {
  readonly bundle: unknown; readonly kits: unknown; readonly manifests: unknown;
  readonly revision: number; readonly drawScale: number; readonly groundAt: unknown;
}

export const sameFullInputs = (a: FullPassInputs | null, b: FullPassInputs): boolean =>
  !!a && a.bundle === b.bundle && a.kits === b.kits && a.manifests === b.manifests
  && a.revision === b.revision && a.drawScale === b.drawScale && a.groundAt === b.groundAt;

/** What a build must do: a full pass on new inputs, a reach pass on a new reach set, else nothing. */
export function settlementPassKind(
  lastFull: FullPassInputs | null, now: FullPassInputs, liveReachKey: string | null, reachKey: string,
): "full" | "reach" | "none" {
  if (!sameFullInputs(lastFull, now)) return "full";
  return liveReachKey === reachKey ? "none" : "reach";
}
