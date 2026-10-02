/** True when a reported player position equals the stored one. The character
 * view reports its position every 3 s even standing still; storing a fresh
 * equal object re-rendered the whole app each time (perf10 diag Q2), so the
 * App keeps the previous object when this holds. */
export function samePositionKm(prev: { x: number; z: number }, x: number, z: number): boolean {
  return prev.x === x && prev.z === z;
}
