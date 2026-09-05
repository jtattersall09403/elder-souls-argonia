/**
 * Making the shot go where the crosshair is.
 *
 * The bow does not sit behind the camera. The string hand is a third of a
 * metre to one side of the eye and lower than it, and in the over-the-shoulder
 * view the camera is further out again. Fire *parallel* to the camera from
 * that offset origin and the shot never crosses the line the player is
 * sighting along: it runs beside it forever, low and to the left by exactly
 * the offset — which is what the owner saw.
 *
 * The fix is the one every over-the-shoulder shooter uses: the crosshair is a
 * *ray*, the shot is aimed at the point that ray hits, and the two converge
 * there. At the convergence point the shot is exact; nearer and further it is
 * off by the parallax, which is the honest cost of the offset and is small
 * because the offset is.
 *
 * Pure, so the geometry is testable without a scene, a camera or a renderer.
 */

export type Vec3 = { x: number; y: number; z: number };

/**
 * How far out the crosshair ray is taken when it hits nothing.
 *
 * Far enough that aiming at the sky converges on a direction rather than on a
 * point near the archer's face, and near enough that the residual parallax at
 * ordinary bow ranges is a fraction of a degree.
 */
export const AIM_CONVERGENCE_FAR_METERS = 120;

/**
 * The convergence point is never pulled closer than this.
 *
 * A ray that hits something a metre from the camera — the archer's own elbow,
 * a wall being hugged — would otherwise swing the bow round onto it.
 */
export const AIM_CONVERGENCE_NEAR_METERS = 3;

/** The point the crosshair is on: along the ray, at whatever it hit. */
export function aimConvergencePoint(
  cameraOrigin: Vec3,
  cameraDirection: Vec3,
  /** Distance to what the ray hit, or null for "nothing out there". */
  hitDistance: number | null,
): Vec3 {
  const range = hitDistance == null
    ? AIM_CONVERGENCE_FAR_METERS
    : Math.min(AIM_CONVERGENCE_FAR_METERS, Math.max(AIM_CONVERGENCE_NEAR_METERS, hitDistance));
  return {
    x: cameraOrigin.x + cameraDirection.x * range,
    y: cameraOrigin.y + cameraDirection.y * range,
    z: cameraOrigin.z + cameraDirection.z * range,
  };
}

/** Unit direction from the nock to a point. The shot's line, and the bow's. */
export function directionTo(from: Vec3, to: Vec3): Vec3 {
  const x = to.x - from.x;
  const y = to.y - from.y;
  const z = to.z - from.z;
  const length = Math.hypot(x, y, z);
  if (!(length > 1e-9)) return { x: 0, y: 0, z: 1 };
  return { x: x / length, y: y / length, z: z / length };
}

/** Angle between two unit vectors, degrees. The aim-error telemetry. */
export function angleBetweenDegrees(a: Vec3, b: Vec3): number {
  const dot = Math.min(1, Math.max(-1, a.x * b.x + a.y * b.y + a.z * b.z));
  return (Math.acos(dot) * 180) / Math.PI;
}

/**
 * Yaw and pitch of a direction, in the aim's own convention.
 *
 * The same one `aimDirectionInto` uses in the scene: yaw 0 looks along −Z and
 * positive pitch looks up. Returned so the *body* can be turned and the spine
 * leaned onto the converged line rather than onto the camera's, which is what
 * makes the bow point where the shot goes.
 */
export function aimAngles(direction: Vec3): { yaw: number; pitch: number } {
  const horizontal = Math.hypot(direction.x, direction.z);
  return {
    yaw: Math.atan2(-direction.x, -direction.z),
    pitch: Math.atan2(direction.y, horizontal),
  };
}
