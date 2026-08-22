import type { SupportEnvelope, SupportMode, SupportPhase } from "./animationManifest";

/** Resolve the semantic support policy at a source-clip time. */
export function supportModeAt(
  fallback: SupportMode,
  phases: readonly SupportPhase[] | undefined,
  sourceTime: number,
) {
  return phases?.find((phase) => sourceTime >= phase.startTime && sourceTime < phase.endTime)?.mode ?? fallback;
}

/**
 * Preserve exact floor contact through an outgoing floor-bound action's
 * material fade. Airborne input always releases contact immediately.
 */
export function supportModeDuringCrossFade(
  incomingMode: SupportMode,
  outgoingMode: SupportMode | null,
  incomingWeight: number,
  outgoingWeight: number,
  materialWeight = 0.05,
): SupportMode {
  if (incomingMode === "airborne") return "airborne";
  if (incomingMode === "floor-contact") return "floor-contact";
  return outgoingMode === "floor-contact"
    && incomingWeight >= materialWeight
    && outgoingWeight >= materialWeight
    ? "floor-contact"
    : incomingMode;
}

/**
 * Scalar marker clearance cannot model a heel rotating below both endpoint
 * poses. Add the asset-calibrated bound only while two penetration-mode
 * actions both materially contribute; pure clips and semantic contact modes
 * remain bit-for-bit unchanged.
 */
export function crossFadeSoleClearance(
  clearance: number | null,
  safetyMarginMeters: number,
  incomingMode: SupportMode,
  outgoingMode: SupportMode | null,
  incomingWeight: number,
  outgoingWeight: number,
  materialWeight = 0.05,
) {
  if (clearance == null) return null;
  return incomingMode === "penetration"
    && outgoingMode === "penetration"
    && incomingWeight >= materialWeight
    && outgoingWeight >= materialWeight
    ? clearance + Math.max(0, safetyMarginMeters)
    : clearance;
}

/**
 * Marker proxies are only needed for nonlinear, ground-bound blend poses.
 *
 * The threshold is deliberately tiny rather than a "material" 5%. Two clips
 * authored at different stance heights (a standing idle blending into a
 * crouched guard) develop their blended-pose penetration continuously from the
 * first blend frame, so switching the proxy on partway through discovers a
 * fully-formed penetration and corrects it in a single step — a visible hop.
 * Engaging from the start lets the same correction grow smoothly; at near-zero
 * incoming weight the blended pose is the outgoing pose, whose own envelope
 * already agrees, so nothing is over-corrected.
 */
export function usesCrossFadeSoleProxy(
  incomingMode: SupportMode,
  outgoingMode: SupportMode | null,
  incomingWeight: number,
  outgoingWeight: number,
  materialWeight = 0.002,
) {
  if (incomingWeight < materialWeight || outgoingWeight < materialWeight) return false;
  if (incomingMode === "floor-contact") return true;
  return incomingMode === "penetration"
    && (outgoingMode === "penetration" || outgoingMode === "floor-contact");
}

function sampleEnvelopeSeries(envelope: SupportEnvelope, samples: readonly number[], sourceTime: number) {
  if (samples.length === 0) return null;
  if (samples.length === 1 || envelope.sampleIntervalSeconds <= 0) return samples[0];
  const position = Math.max(0, sourceTime - (envelope.sampleStartTimeSeconds ?? 0))
    / envelope.sampleIntervalSeconds;
  const from = Math.min(samples.length - 1, Math.floor(position));
  const to = Math.min(samples.length - 1, from + 1);
  const alpha = Math.min(1, Math.max(0, position - from));
  return samples[from] + (samples[to] - samples[from]) * alpha;
}

/** Linearly sample a pipeline-baked visible-surface envelope in source time. */
export function sampleSupportEnvelope(envelope: SupportEnvelope, sourceTime: number) {
  return sampleEnvelopeSeries(envelope, envelope.surfaceMinY, sourceTime);
}

/**
 * Distance from the lowest foot/toe marker to the lowest visible surface.
 * The runtime applies this calibration to the actual cross-faded marker pose;
 * it does not treat a bone origin as if it were literally the shoe sole.
 */
export function sampleSoleMarkerClearance(envelope: SupportEnvelope, sourceTime: number) {
  if (!envelope.soleMarkerMinY || envelope.soleMarkerMinY.length !== envelope.surfaceMinY.length) {
    return null;
  }
  const marker = sampleEnvelopeSeries(envelope, envelope.soleMarkerMinY, sourceTime);
  const surface = sampleEnvelopeSeries(envelope, envelope.surfaceMinY, sourceTime);
  return marker == null || surface == null ? null : Math.max(0, marker - surface);
}

/**
 * Per-marker visible-surface clearance. Keeping marker identity avoids the
 * min-of-endpoints mismatch that occurs when a blend swaps which foot is low.
 */
export function sampleSoleMarkerClearanceById(
  envelope: SupportEnvelope,
  markerId: string,
  sourceTime: number,
) {
  const clearances = envelope.soleMarkerClearanceYById?.[markerId];
  if (clearances?.length === envelope.surfaceMinY.length) {
    return sampleEnvelopeSeries(envelope, clearances, sourceTime);
  }
  // Transitional fallback for the first identity-preserving schema, whose
  // marker heights were still calibrated against the actor-global surface.
  const markerSamples = envelope.soleMarkerYById?.[markerId];
  if (!markerSamples || markerSamples.length !== envelope.surfaceMinY.length) return null;
  const marker = sampleEnvelopeSeries(envelope, markerSamples, sourceTime);
  const surface = sampleEnvelopeSeries(envelope, envelope.surfaceMinY, sourceTime);
  return marker == null || surface == null ? null : Math.max(0, marker - surface);
}

/** Sample a visible heel/toe point in the marker bone's local GLB frame. */
export function sampleSoleMarkerPointById(
  envelope: SupportEnvelope,
  markerId: string,
  sourceTime: number,
): [number, number, number] | null {
  const points = envelope.soleMarkerPointBoneLocalById?.[markerId];
  if (!points || points.length !== envelope.surfaceMinY.length) return null;
  if (points.length === 1 || envelope.sampleIntervalSeconds <= 0) return [...points[0]];
  const position = Math.max(0, sourceTime - (envelope.sampleStartTimeSeconds ?? 0))
    / envelope.sampleIntervalSeconds;
  const from = Math.min(points.length - 1, Math.floor(position));
  const to = Math.min(points.length - 1, from + 1);
  const alpha = Math.min(1, Math.max(0, position - from));
  return [0, 1, 2].map((axis) => (
    points[from][axis] + (points[to][axis] - points[from][axis]) * alpha
  )) as [number, number, number];
}

/**
 * Turn a baked surface sample into the actor-root correction required by the
 * current semantic policy. `uncorrectedSurfaceY` is already in world metres.
 */
export function requiredSupportCorrection(
  mode: SupportMode,
  supportY: number,
  uncorrectedSurfaceY: number,
) {
  const contactCorrection = supportY - uncorrectedSurfaceY;
  return mode === "floor-contact"
    ? contactCorrection
    : mode === "penetration"
      ? Math.max(0, contactCorrection)
      : 0;
}

/**
 * Ecctrl's capsule can compress through its suspension distance at impact
 * before its floating spring restores the neutral body height. The animation
 * may still be in an `airborne` source phase for that render frame, but once
 * the actor base has reached the known support it is physical contact, not
 * authored airtime. Protect only an actually penetrating visible surface and
 * never create a downward correction or pin a still-airborne actor.
 */
export function requiredAirborneImpactCorrection(
  mode: SupportMode,
  supportY: number,
  actorBaseY: number,
  uncorrectedSurfaceY: number,
  impactProximityMeters = 0,
) {
  if (
    mode !== "airborne"
    || actorBaseY > supportY + Math.max(0, impactProximityMeters)
  ) return 0;
  return requiredSupportCorrection("penetration", supportY, uncorrectedSurfaceY);
}

/** Resolve the declared policy plus the physical-impact exception as one target. */
export function resolveSupportCorrection(
  mode: SupportMode,
  supportY: number,
  actorBaseY: number,
  uncorrectedSurfaceY: number,
  impactProximityMeters = 0,
): { mode: SupportMode; correction: number } {
  const correction = requiredSupportCorrection(mode, supportY, uncorrectedSurfaceY);
  const impactCorrection = requiredAirborneImpactCorrection(
    mode,
    supportY,
    actorBaseY,
    uncorrectedSurfaceY,
    impactProximityMeters,
  );
  return mode === "airborne" && impactCorrection > 0
    ? { mode: "penetration", correction: impactCorrection }
    : { mode, correction };
}

/**
 * Follow a semantic support target. Penetration prevention rises immediately;
 * airborne and released contact corrections decay without pinning the actor.
 * A floor-contact phase is authored to remain on its plane and therefore
 * follows the baked curve exactly, including a legitimate downward offset.
 */
export function nextSupportCorrection(
  currentCorrectionY: number,
  requiredCorrectionY: number,
  mode: SupportMode,
  deltaSeconds: number,
  releaseRate = 20,
) {
  if (mode === "floor-contact") return requiredCorrectionY;
  if (mode === "penetration" && requiredCorrectionY >= currentCorrectionY) return requiredCorrectionY;
  const release = 1 - Math.exp(-Math.max(0, deltaSeconds) * releaseRate);
  return currentCorrectionY + (requiredCorrectionY - currentCorrectionY) * release;
}

/**
 * Legacy fallback for manifests without a baked visible-surface envelope.
 * Residual actor grounding may prevent penetration, but it never turns an
 * authored lifted foot into mandatory contact and drags the whole actor down.
 */
export function nextUpwardGroundCorrection(
  currentCorrectionY: number,
  supportY: number,
  lowestMarkerY: number,
  deltaSeconds: number,
  releaseRate = 20,
) {
  const requiredCorrectionY = Math.max(
    0,
    currentCorrectionY + supportY - lowestMarkerY,
  );
  if (requiredCorrectionY >= currentCorrectionY) return requiredCorrectionY;

  const release = 1 - Math.exp(-Math.max(0, deltaSeconds) * releaseRate);
  return currentCorrectionY + (requiredCorrectionY - currentCorrectionY) * release;
}
