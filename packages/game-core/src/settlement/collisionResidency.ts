import type { SettlementBundle } from "./types";

export interface CollisionResidencyCandidate<T> {
  value: T;
  placementId: string;
  distanceM: number;
  parts: number;
}

export interface CollisionBudgetExceeded {
  activeSettlementIds: string[];
  requiredResidentParts: number;
  partBudget: number;
  residentPlacementIds: string[];
}

export interface CollisionResidencySelection<T> {
  chosen: T[];
  residentPlacementIds: string[];
  activeSettlementIds: string[];
  coveredRadiusM: number;
  parts: number;
  requiredResidentParts: number;
  omittedPlacementIds: string[];
  budgetExceeded: CollisionBudgetExceeded | null;
}

type SettlementBoundary = SettlementBundle["settlements"][number];

function distanceToSegment(
  x: number, z: number, a: [number, number], b: [number, number],
): number {
  const dx = b[0] - a[0]; const dz = b[1] - a[1];
  const denominator = dx * dx + dz * dz;
  const t = denominator === 0 ? 0
    : Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / denominator));
  return Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t));
}

/** Boundary points count as resident so a collider set cannot flicker while
 * the focus crosses a settlement polygon edge or an adjacent terrain chunk. */
export function pointInSettlementBoundary(
  x: number, z: number, polygon: readonly [number, number][],
): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]; const b = polygon[j];
    if (distanceToSegment(x, z, a, b) <= 1e-6) return true;
    if ((a[1] > z) !== (b[1] > z)
        && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

export function activeSettlementIdsAt(
  settlements: readonly SettlementBoundary[], focus: { x: number; z: number },
): string[] {
  return settlements
    .filter((settlement) => pointInSettlementBoundary(focus.x, focus.z, settlement.boundaryM))
    .map((settlement) => settlement.id)
    .sort();
}

export function residentPlacementIdsAt(
  settlements: readonly SettlementBoundary[], focus: { x: number; z: number },
): Set<string> {
  const active = new Set(activeSettlementIdsAt(settlements, focus));
  return new Set(settlements
    .filter((settlement) => active.has(settlement.id))
    .flatMap((settlement) => settlement.placementIds));
}

/**
 * Keep every collider owned by the settlement the focus is standing in.
 * Those residents are selected by authored boundary membership and stable id,
 * never distance. Only the remaining budget is spent on the ordinary moving
 * ring. If resident colliders alone exceed the hard part budget, selection
 * fails explicitly instead of returning a deceptively partial settlement.
 */
export function selectCollisionResidency<T>(
  candidates: readonly CollisionResidencyCandidate<T>[],
  settlements: readonly SettlementBoundary[],
  focus: { x: number; z: number },
  radiusM: number,
  partBudget: number,
): CollisionResidencySelection<T> {
  const activeSettlementIds = activeSettlementIdsAt(settlements, focus);
  const residentIds = residentPlacementIdsAt(settlements, focus);
  const residents = candidates
    .filter((candidate) => residentIds.has(candidate.placementId))
    .slice()
    .sort((a, b) => a.placementId.localeCompare(b.placementId));
  const requiredResidentParts = residents.reduce((sum, candidate) =>
    sum + Math.max(1, candidate.parts), 0);
  if (requiredResidentParts > partBudget) {
    const residentPlacementIds = residents.map((candidate) => candidate.placementId);
    return {
      chosen: [], residentPlacementIds, activeSettlementIds,
      coveredRadiusM: 0, parts: 0, requiredResidentParts,
      omittedPlacementIds: residentPlacementIds,
      budgetExceeded: {
        activeSettlementIds, requiredResidentParts, partBudget, residentPlacementIds,
      },
    };
  }

  const chosen = residents.map((candidate) => candidate.value);
  let parts = requiredResidentParts;
  let coveredRadiusM = radiusM;
  const ambient = candidates
    .filter((candidate) => !residentIds.has(candidate.placementId)
      && candidate.distanceM <= radiusM)
    .slice()
    .sort((a, b) => a.distanceM - b.distanceM
      || a.placementId.localeCompare(b.placementId));
  let omittedPlacementIds: string[] = [];
  for (let index = 0; index < ambient.length; index++) {
    const candidate = ambient[index];
    const cost = Math.max(1, candidate.parts);
    if (parts + cost > partBudget) {
      coveredRadiusM = candidate.distanceM;
      omittedPlacementIds = ambient.slice(index).map((row) => row.placementId);
      break;
    }
    parts += cost;
    chosen.push(candidate.value);
  }
  return {
    chosen,
    residentPlacementIds: residents.map((candidate) => candidate.placementId),
    activeSettlementIds, coveredRadiusM, parts, requiredResidentParts,
    omittedPlacementIds,
    budgetExceeded: null,
  };
}
