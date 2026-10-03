/**
 * The character view's load-time URL parameters the App's URL sync carries
 * unchanged: `race`, `profile`, and `yaw` (compass degrees, the spawn and
 * `?interior=` facing; vol10 diag4 D1: the sync used to strip it).
 */
const CARRIED = ["race", "profile", "yaw"] as const;

export function carryCharacterParams(from: URLSearchParams, into: URLSearchParams): void {
  for (const k of CARRIED) {
    const v = from.get(k);
    if (v) into.set(k, v);
  }
}
