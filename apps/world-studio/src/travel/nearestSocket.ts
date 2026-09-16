/**
 * The prompt-distance rule: which operator socket, if any, the character is
 * close enough to talk to. Pure so it can be tested without a scene.
 */

export interface SocketPoint {
  serviceId: string;
  stationId: string;
  /** World metres, [east, south]. */
  positionM: [number, number];
  role: string;
}

/** How close the character stands before the talk prompt appears. */
export const TALK_RADIUS_M = 4;

/**
 * The nearest socket within `radiusM` of (xM, zM), or null. Distance is
 * measured on the ground plane: a landing and its operator sit at the same
 * spot whatever the tide or the terrace does to the height.
 */
export function nearestSocket(
  sockets: readonly SocketPoint[],
  xM: number,
  zM: number,
  radiusM: number = TALK_RADIUS_M,
): SocketPoint | null {
  let best: SocketPoint | null = null;
  let bestD2 = radiusM * radiusM;
  for (const s of sockets) {
    const dx = s.positionM[0] - xM;
    const dz = s.positionM[1] - zM;
    const d2 = dx * dx + dz * dz;
    if (d2 <= bestD2) {
      bestD2 = d2;
      best = s;
    }
  }
  return best;
}
