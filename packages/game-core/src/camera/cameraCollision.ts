/**
 * The camera-blocking collision group (16h check-in 2 item 3), as Rapier
 * interaction-group numbers: a 32-bit value, memberships in the high 16
 * bits and the filter in the low 16. Plain numbers, so game-core still
 * imports no physics engine; the app sets them on its colliders and passes
 * CAMERA_QUERY_GROUPS to its camera's ball cast.
 *
 * Rapier's default groups (0xffffffff) are a member of EVERY group, so a
 * collider left at the default blocks the camera. Settlement and terrain
 * colliders say so explicitly with CAMERA_BLOCKING_GROUPS; a collider the
 * camera must pass through (vegetation trunks, which would pump the arm)
 * takes CAMERA_TRANSPARENT_GROUPS. Sensors and moving bodies (the player,
 * crates) are left out by the query's flags, not by groups.
 */
export const CAMERA_BLOCKING_BIT = 1 << 15;
/** The camera pivot's start-overlap test. Terrain heightfields are NOT
 * members: Rapier projects a ball onto a heightfield by brute force over
 * every triangle (2×256² per chunk, ~4 ms a frame, perf10 diag Q1). The
 * pivot in the ground is still caught by the arm's sweep, which keeps them. */
export const CAMERA_PIVOT_BIT = 1 << 14;

export function interactionGroups(memberships: number, filter: number): number {
  return (((memberships & 0xffff) << 16) | (filter & 0xffff)) >>> 0;
}

/** Member of every group, the camera's included; collides with everything. */
export const CAMERA_BLOCKING_GROUPS = interactionGroups(0xffff, 0xffff);
/** Terrain heightfields: block the camera's sweep, skip the pivot test. */
export const TERRAIN_HEIGHTFIELD_GROUPS = interactionGroups(0xffff & ~CAMERA_PIVOT_BIT, 0xffff);
/** Member of every group EXCEPT the camera's; collides with everything. */
export const CAMERA_TRANSPARENT_GROUPS = interactionGroups(0xffff & ~CAMERA_BLOCKING_BIT & ~CAMERA_PIVOT_BIT, 0xffff);
/** The camera's sweep: sees only colliders that are members of its group. */
export const CAMERA_QUERY_GROUPS = interactionGroups(CAMERA_BLOCKING_BIT, CAMERA_BLOCKING_BIT);
/** The pivot start-overlap test: camera-blocking colliders minus terrain. */
export const CAMERA_PIVOT_QUERY_GROUPS = interactionGroups(CAMERA_PIVOT_BIT, CAMERA_PIVOT_BIT);

/** The player fades only when the camera is about to enter the body (vol10
 * diag6 C1: a fade keyed on the pivot arm, whose pivot sits 2.05 m over the
 * feet, faded a body the camera was nowhere near whenever a cell's ceiling
 * shortened the arm). Distances are from the camera to the SURFACE of the
 * controller's capsule: fully opaque at or beyond the start, gone at or
 * inside the end, linear between (Skyrim's blend-out, research camera.md §b). */
export const PLAYER_FADE_START_SURFACE_M = 0.35;
export const PLAYER_FADE_END_SURFACE_M = 0;

/** Distance (m) from a point to the surface of a vertical capsule (negative
 * inside it): `centre` is the body centre, the segment runs `halfHeight`
 * above and below it, `radius` is the capsule's. Allocation-free. */
export function distanceToCapsuleSurface(
  px: number, py: number, pz: number, cx: number, cy: number, cz: number,
  halfHeight: number, radius: number,
): number {
  const sy = Math.min(cy + halfHeight, Math.max(cy - halfHeight, py));
  return Math.hypot(px - cx, py - sy, pz - cz) - radius;
}

/** Player model opacity for the camera's distance to the body capsule's surface. */
export function playerOpacityForSurfaceDistance(surfaceM: number): number {
  const t = (surfaceM - PLAYER_FADE_END_SURFACE_M) / (PLAYER_FADE_START_SURFACE_M - PLAYER_FADE_END_SURFACE_M);
  return Math.min(1, Math.max(0, t));
}
