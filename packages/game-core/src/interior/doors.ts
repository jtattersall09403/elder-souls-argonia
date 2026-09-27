import type { SettlementDoor } from "../settlement/types";

/** Reach at which a door answers the action input (0103 decision 4 brief). */
export const DOOR_REACH_M = 1.5;
/** An interior exit door also needs the player on its floor (storeys). */
export const DOOR_REACH_VERTICAL_M = 2;
/** Tier A bundles stream when the player is this close to their door. */
export const INTERIOR_PREFETCH_RADIUS_M = 40;
/** Leaving puts the player this far outside the threshold. */
export const EXIT_OUTWARD_M = 1;
/**
 * Height of the interior space. An interior is a separate cell (0081
 * decision 4), drawn in the same physics world as the exterior, which stays
 * loaded but hidden. Lifting the cell this far above the door keeps its
 * floor clear of the terrain, the water surfaces and the canopy below, and
 * keeps the player's x/z (and so every exterior streaming ring) where the
 * door is, so the return is instant.
 */
export const INTERIOR_SPACE_LIFT_M = 4000;

export const DOOR_TEXT = {
  enter: "text.door.prompt-enter",
  leave: "text.door.prompt-leave",
  closed: "text.door.closed",
} as const;

export type DoorAccess = { kind: "enter"; cellId: string } | { kind: "closed" };

/**
 * What a door does. Only a tier A claim naming a cell opens; a reserved door,
 * a claim of any other tier and a door with no claim stay closed and show the
 * reserved line (0081 decision 4, 0103).
 */
export function doorAccess(door: SettlementDoor): DoorAccess {
  const claim = door.interiorClaim;
  if (door.interiorStatus !== "reserved" && claim?.tier === "A"
    && typeof claim.cellId === "string" && claim.cellId) {
    return { kind: "enter", cellId: claim.cellId };
  }
  return { kind: "closed" };
}

/** Compass bearing to a planar unit vector: 0 = -z (north), 90 = +x (east). */
export function compassDirection(deg: number): { x: number; z: number } {
  const r = (deg * Math.PI) / 180;
  return { x: Math.sin(r), z: -Math.cos(r) };
}

/** The nearest door within reach of a planar point, or null. */
export function nearestDoor(
  doors: readonly SettlementDoor[], x: number, z: number, reachM = DOOR_REACH_M,
): SettlementDoor | null {
  let best: SettlementDoor | null = null;
  let bestD = reachM;
  for (const door of doors) {
    const d = Math.hypot(door.thresholdM[0] - x, door.thresholdM[1] - z);
    if (d <= bestD) { best = door; bestD = d; }
  }
  return best;
}

/** Cells of every tier A door within the prefetch radius (streaming, item d). */
export function cellsToPrefetch(
  doors: readonly SettlementDoor[], x: number, z: number,
  radiusM = INTERIOR_PREFETCH_RADIUS_M,
): string[] {
  const out = new Set<string>();
  for (const door of doors) {
    const access = doorAccess(door);
    if (access.kind !== "enter") continue;
    if (Math.hypot(door.thresholdM[0] - x, door.thresholdM[1] - z) <= radiusM) out.add(access.cellId);
  }
  return [...out];
}
