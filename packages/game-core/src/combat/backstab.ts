import type { FighterState } from "./fighter";

/** States that can be interrupted by a correctly positioned backstab. */
const BACKSTAB_ELIGIBLE_STATES: ReadonlySet<FighterState> = new Set([
  "watching",
  "approach",
  "strafe",
  "attack",
  "shoot",
  "recover",
  "heal",
]);

export function canBackstabState(state: FighterState) {
  return BACKSTAB_ELIGIBLE_STATES.has(state);
}
