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

export function interactionGroups(memberships: number, filter: number): number {
  return (((memberships & 0xffff) << 16) | (filter & 0xffff)) >>> 0;
}

/** Member of every group, the camera's included; collides with everything. */
export const CAMERA_BLOCKING_GROUPS = interactionGroups(0xffff, 0xffff);
/** Member of every group EXCEPT the camera's; collides with everything. */
export const CAMERA_TRANSPARENT_GROUPS = interactionGroups(0xffff & ~CAMERA_BLOCKING_BIT, 0xffff);
/** The camera's query: sees only colliders that are members of its group. */
export const CAMERA_QUERY_GROUPS = interactionGroups(CAMERA_BLOCKING_BIT, CAMERA_BLOCKING_BIT);

/** Arm length (m) under which the player model starts to fade, and the
 * length at which it is gone: Skyrim blends the player out when the camera
 * is too close (research camera.md §b). */
export const PLAYER_FADE_START_ARM_M = 1.2;
export const PLAYER_FADE_END_ARM_M = 0.5;

/** Player model opacity for an arm length: 1 at or beyond the fade start,
 * 0 at or inside the fade end, linear between. */
export function playerOpacityForArm(armM: number): number {
  const t = (armM - PLAYER_FADE_END_ARM_M) / (PLAYER_FADE_START_ARM_M - PLAYER_FADE_END_ARM_M);
  return Math.min(1, Math.max(0, t));
}
