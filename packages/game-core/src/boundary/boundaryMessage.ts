/**
 * The one message the player gets at the edge of the world (16d).
 *
 * It fires when the character comes within `NEAR_M` of a wall and re-arms once
 * they are `REARM_M` back inside, so every approach shows it once. Pure state machine: the hook in `useBoundaryMessage.ts` holds
 * it in a ref and the tests drive it directly.
 */
export const BOUNDARY_MESSAGE_ID = "text.system.province-edge";
export const BOUNDARY_NEAR_M = 8;
/** Re-arms as soon as the character is this far back inside (a little
 * hysteresis past NEAR_M): every walk into the wall shows the line again, and
 * it never fires while it is already on screen. */
export const BOUNDARY_REARM_M = 10;
/** Seconds the line stays on screen. */
export const BOUNDARY_MESSAGE_SECONDS = 4;

/** Distance from (x, z) to the nearest wall of the square [0, extentM]². */
export function distanceToBoundary(x: number, z: number, extentM: number): number {
  return Math.min(x, z, extentM - x, extentM - z);
}

export interface BoundaryMessageState {
  /** False while the player is still near the wall the message fired for. */
  armed: boolean;
}

export interface BoundaryMessageStep {
  state: BoundaryMessageState;
  /** True on the single frame the message should be shown. */
  fire: boolean;
}

export function boundaryMessageStep(
  state: BoundaryMessageState,
  x: number,
  z: number,
  extentM: number,
): BoundaryMessageStep {
  const d = distanceToBoundary(x, z, extentM);
  if (state.armed && d <= BOUNDARY_NEAR_M) return { state: { armed: false }, fire: true };
  if (!state.armed && d >= BOUNDARY_REARM_M) return { state: { armed: true }, fire: false };
  return { state, fire: false };
}
