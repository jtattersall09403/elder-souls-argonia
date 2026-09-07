/** Compare baked reach with independent production-renderer hitbox telemetry.
 * These fixtures start at x=z=0 and perform one unopposed light attack. The
 * 1 cm bound accommodates 30 Hz live samples versus the 240 Hz bake.
 */
export function evaluateMeasuredReach(telemetry, measurement, toleranceMeters = 0.01) {
  const [start, end] = measurement.activeSourceWindow;
  const values = (telemetry.visualFrames ?? []).flatMap(frame => {
    const pose = frame.player;
    if (pose?.animation !== measurement.animation || pose.clipTime < start || pose.clipTime >= end) return [];
    const capsule = pose.weaponCapsule;
    if (!capsule) throw new Error("Reach validation requires actual weapon capsule telemetry");
    return [Math.max(...[capsule.from, capsule.to].map(p => Math.hypot(p[0], p[2]))) + capsule.radius];
  });
  if (values.length < 4) throw new Error("Too few active hitbox samples for reach validation");
  const liveRange = Math.max(...values);
  const error = Math.abs(liveRange - measurement.range);
  if (error > toleranceMeters) throw new Error(`Baked/live reach differ by ${error.toFixed(4)} m (limit ${toleranceMeters} m)`);
  return { liveRange, bakedRange: measurement.range, error, activeSamples: values.length, toleranceMeters };
}
