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

/**
 * Whether the operator sockets (the dev pole, the talk prompt, the travel
 * menu) are mounted in the walk. Owner walk 4 (16k, 2026-09-28): a socket is
 * never visible or interactable unless the sockets overlay is on
 * (`?sockets=1` or its checkbox); the Claywater poler's pole stood in the
 * street and answered "talk". Off while the ladder hides the services layer
 * (16g: sockets from an older run stand where nothing was solved).
 */
export function travelSocketsShown(showSockets: boolean, hiddenLayers: ReadonlySet<string>): boolean {
  return showSockets && !hiddenLayers.has("services");
}
