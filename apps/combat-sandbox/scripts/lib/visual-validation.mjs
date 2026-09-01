import { extractRenderedRuns } from "./visual-run-contract.mjs";

const DEFAULT_GROUNDING_LIMITS = Object.freeze({
  maxMeshPenetrationMeters: 0.02,
  minGroundCorrectionMeters: -0.001,
  maxGroundCorrectionMeters: 0.08,
  // While two ground-bound clips are materially blended, support is solved
  // from the blended sole geometry, not either clip's baked envelope. A heel
  // rotating through a blend can sit below both endpoint poses, so the
  // correction legitimately exceeds what any authored pose demands. The
  // pipeline calibrates that excess as `crossFadeSoleSafetyMarginMeters`
  // (0.025 m), so blended frames are audited at the authored limit plus that
  // declared margin. They stay under the same mesh-penetration, step, and
  // speed gates, which is where an actual float or pop would show.
  maxBlendedGroundCorrectionMeters: 0.105,
  maxGroundCorrectionSpeedMetersPerSecond: 2,
  maxAirborneGroundCorrectionMeters: 0.01,
  maxFloorContactGapMeters: 0.03,
});

const DEFAULT_MOTION_LIMITS = Object.freeze({
  maxBoneAngularStepDegrees: 90,
  maxBonePositionStepMeters: 0.8,
  maxRootCorrectionStepMeters: 0.25,
});

// Correct production samples are exactly world-up because actor-root pitch and
// roll belong to neither gameplay nor authored skeletal motion. The previous
// Ecctrl auto-balance regression reached 3.2-9.4 degrees. A one-degree gate
// leaves ample room for floating-point noise while retaining a 3x margin to
// the smallest known-bad tilt. Yaw is intentionally unconstrained.
const DEFAULT_ACTOR_ORIENTATION_LIMITS = Object.freeze({
  maxWorldUpTiltDegrees: 1,
});

const MAX_CONTIGUOUS_FRAME_GAP_SECONDS = 0.12;
// The character's visual origin includes Ecctrl's 18 cm floating suspension.
// At impact the physical capsule may compress below that neutral origin while
// the rendered support solve keeps the visible actor on the plane. Correction
// magnitude is not a defect during that compression; the deformed-mesh gap is
// the authoritative check. Keep a centimetre of tolerance for resting noise.
const SUSPENSION_COMPRESSION_EPSILON_METERS = 0.01;

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function round(value, digits = 5) {
  return finite(value) ? Number(value.toFixed(digits)) : value;
}

function distance3(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function inverseRotateVectorByQuaternion(vector, quaternion) {
  if (
    !Array.isArray(vector)
    || vector.length !== 3
    || !vector.every(finite)
    || !Array.isArray(quaternion)
    || quaternion.length !== 4
    || !quaternion.every(finite)
  ) return null;
  const length = Math.hypot(...quaternion);
  if (length <= Number.EPSILON) return null;

  // Apply the normalized conjugate with the optimized quaternion-vector
  // product. World-space actor motion then disappears while genuine motion
  // relative to the animated pelvis remains measurable.
  const x = -quaternion[0] / length;
  const y = -quaternion[1] / length;
  const z = -quaternion[2] / length;
  const w = quaternion[3] / length;
  const tx = 2 * (y * vector[2] - z * vector[1]);
  const ty = 2 * (z * vector[0] - x * vector[2]);
  const tz = 2 * (x * vector[1] - y * vector[0]);
  return [
    vector[0] + w * tx + (y * tz - z * ty),
    vector[1] + w * ty + (z * tx - x * tz),
    vector[2] + w * tz + (x * ty - y * tx),
  ];
}

function quaternionYawRadians(quaternion) {
  if (!Array.isArray(quaternion) || quaternion.length !== 4 || !quaternion.every(finite)) return null;
  const [x, y, z, w] = quaternion;
  return Math.atan2(2 * (w * y + x * z), 1 - 2 * (y * y + z * z));
}

function wrappedRadians(delta) {
  return Math.atan2(Math.sin(delta), Math.cos(delta));
}

/**
 * Bone positions are captured in world space. Express their displacement in
 * the animated pelvis frame before measuring articulation so a legitimate
 * physics move or whole-body tuck rotation cannot masquerade as a limb snap.
 * Grounding/travel retain their separate world-space mesh/root checks.
 */
function pelvisRelativeBonePosition(sample, bone) {
  const position = sample?.bones?.[bone]?.position;
  const pelvisPoint = sample?.bones?.pelvis;
  const pelvis = pelvisPoint?.position;
  if (!position || !pelvis) return null;
  const displacement = [
    position[0] - pelvis[0],
    position[1] - pelvis[1],
    position[2] - pelvis[2],
  ];
  // Small synthetic fixtures created before worldQuaternion was added model
  // translation only. Production probes always publish this field; malformed
  // quaternions fail closed instead of silently reverting to world axes.
  return pelvisPoint.worldQuaternion === undefined
    ? displacement
    : inverseRotateVectorByQuaternion(displacement, pelvisPoint.worldQuaternion);
}

function pelvisRelativePoint(sample, point) {
  const pelvisPoint = sample?.bones?.pelvis;
  const pelvis = pelvisPoint?.position;
  if (!point || !pelvis) return null;
  const displacement = [
    point[0] - pelvis[0],
    point[1] - pelvis[1],
    point[2] - pelvis[2],
  ];
  return pelvisPoint.worldQuaternion === undefined
    ? displacement
    : inverseRotateVectorByQuaternion(displacement, pelvisPoint.worldQuaternion);
}

/** Quaternion angular distance. abs(dot) makes q and -q the same rotation. */
export function quaternionAngularDistanceDegrees(a, b) {
  const aLength = Math.hypot(...a);
  const bLength = Math.hypot(...b);
  if (aLength <= Number.EPSILON || bLength <= Number.EPSILON) return Number.POSITIVE_INFINITY;
  const dot = Math.abs(
    (a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3])
    / (aLength * bLength),
  );
  return THREE_RAD_TO_DEG * 2 * Math.acos(Math.min(1, Math.max(-1, dot)));
}

/**
 * Angle between the actor root's local +Y and world +Y. This measures only
 * pitch/roll: any yaw, including the production 180-degree facing quaternion,
 * leaves the result at zero.
 */
export function quaternionWorldUpTiltDegrees(quaternion) {
  if (
    !Array.isArray(quaternion)
    || quaternion.length !== 4
    || !quaternion.every(finite)
  ) return Number.POSITIVE_INFINITY;
  const length = Math.hypot(...quaternion);
  if (length <= Number.EPSILON) return Number.POSITIVE_INFINITY;
  const x = quaternion[0] / length;
  const z = quaternion[2] / length;
  const worldUpDot = 1 - 2 * (x * x + z * z);
  return THREE_RAD_TO_DEG * Math.acos(Math.min(1, Math.max(-1, worldUpDot)));
}

const THREE_RAD_TO_DEG = 180 / Math.PI;

function actorFrames(visualFrames, actor) {
  return visualFrames
    .map((frame) => ({ time: frame.time, sample: frame[actor] }))
    .filter(({ time, sample }) => finite(time) && sample);
}

function isSuspensionCompression(sample) {
  return finite(sample?.actorBaseY)
    && finite(sample?.groundY)
    && sample.actorBaseY < sample.groundY - SUSPENSION_COMPRESSION_EPSILON_METERS;
}

function correctionMagnitudeIsAuditable(sample) {
  return sample?.supportMode !== "floor-contact" && !isSuspensionCompression(sample);
}

function expectedAnimations(expected, actor) {
  return expected[actor === "player" ? "playerAnimations" : "enemyAnimations"] ?? [];
}

function actorIsRequired(expected, actor) {
  return actor === "player" || expectedAnimations(expected, actor).length > 0;
}

function sameAnimationFrame(previous, current, animations) {
  return previous
    && current.time > previous.time
    && current.time - previous.time <= MAX_CONTIGUOUS_FRAME_GAP_SECONDS
    && previous.sample.animation === current.sample.animation
    && animations.includes(current.sample.animation);
}

function sameRenderedCommand(previous, current, animations) {
  if (!sameAnimationFrame(previous, current, animations)) return false;
  const previousSerial = previous.sample.commandSerial;
  const currentSerial = current.sample.commandSerial;
  return !finite(previousSerial) || !finite(currentSerial) || previousSerial === currentSerial;
}

function isLoopWrap(previous, current, animations) {
  if (!sameRenderedCommand(previous, current, animations)) return false;
  const previousClipTime = previous.sample.clipTime;
  const currentClipTime = current.sample.clipTime;
  return finite(previousClipTime)
    && finite(currentClipTime)
    && currentClipTime < previousClipTime - 0.05;
}

function sameMotionRun(previous, current, animations, minClipTime = 0.05) {
  if (!sameAnimationFrame(previous, current, animations)) return false;
  const previousClipTime = previous.sample.clipTime;
  const currentClipTime = current.sample.clipTime;
  if (!finite(previousClipTime) || !finite(currentClipTime)) return false;
  const clipStep = currentClipTime - previousClipTime;
  // A reset/wrap is a transition, not pose jitter. Ignore the first authored
  // frame because paired alignment and cross-fade entry can reposition an
  // actor before the production clip clock has genuinely started advancing.
  return previousClipTime > minClipTime
    && clipStep >= -0.001
    && clipStep <= (current.time - previous.time) * 4 + 0.05;
}

function createActorSummary(actor, frames) {
  const animationSamples = {};
  let minMeshGap = Number.POSITIVE_INFINITY;
  let minMeshGapTime = null;
  // Which mesh was the lowest one. With worn armour an actor has a dozen
  // meshes, and "something penetrated the floor" is not a diagnosis.
  let minMeshGapMesh = null;
  let minGroundCorrection = Number.POSITIVE_INFINITY;
  let maxGroundCorrection = Number.NEGATIVE_INFINITY;
  let minNonFloorGroundCorrection = Number.POSITIVE_INFINITY;
  let minNonFloorGroundCorrectionTime = null;
  let maxNonFloorGroundCorrection = Number.NEGATIVE_INFINITY;
  let maxNonFloorGroundCorrectionTime = null;
  let maxBlendedGroundCorrection = Number.NEGATIVE_INFINITY;
  let maxBlendedGroundCorrectionTime = null;
  let maxAirborneGroundCorrection = 0;
  let maxAirborneGroundCorrectionTime = null;
  let maxFloorContactGap = 0;
  let maxFloorContactGapTime = null;
  let maxClipTime = Number.NEGATIVE_INFINITY;
  let maxClipTimeAt = null;
  let maxGroundCorrectionSpeed = 0;
  let maxGroundCorrectionStep = 0;
  let maxBoneAngularStep = 0;
  let maxBoneAngularJerk = 0;
  let maxBonePositionStep = 0;
  let worstBoneAngularStep = null;
  let worstBonePositionStep = null;
  let previous = null;
  const previousAngularSpeeds = new Map();
  const supportModeSamples = {};
  let suspensionCompressionSamples = 0;
  let worldUpOrientationSamples = 0;
  let maxWorldUpTilt = Number.NEGATIVE_INFINITY;
  let maxWorldUpTiltTime = null;

  for (const frame of frames) {
    const { sample } = frame;
    const worldUpTilt = quaternionWorldUpTiltDegrees(sample.rootWorldQuaternion);
    if (finite(worldUpTilt)) {
      worldUpOrientationSamples += 1;
      if (worldUpTilt > maxWorldUpTilt) {
        maxWorldUpTilt = worldUpTilt;
        maxWorldUpTiltTime = frame.time;
      }
    }
    const supportMode = ["airborne", "penetration", "floor-contact"].includes(sample.supportMode)
      ? sample.supportMode
      : "penetration";
    supportModeSamples[supportMode] = (supportModeSamples[supportMode] ?? 0) + 1;
    if (isSuspensionCompression(sample)) suspensionCompressionSamples += 1;
    animationSamples[sample.animation] = (animationSamples[sample.animation] ?? 0) + 1;
    if (finite(sample.meshGap) && sample.meshGap < minMeshGap) {
      minMeshGap = sample.meshGap;
      minMeshGapTime = frame.time;
      minMeshGapMesh = null;
      let lowest = Number.POSITIVE_INFINITY;
      for (const [name, bounds] of Object.entries(sample.meshBounds ?? {})) {
        if (bounds?.min?.[1] < lowest) {
          lowest = bounds.min[1];
          minMeshGapMesh = name;
        }
      }
    }
    if (finite(sample.groundCorrectionY)) {
      minGroundCorrection = Math.min(minGroundCorrection, sample.groundCorrectionY);
      maxGroundCorrection = Math.max(maxGroundCorrection, sample.groundCorrectionY);
      if (correctionMagnitudeIsAuditable(sample)) {
        if (sample.groundCorrectionY < minNonFloorGroundCorrection) {
          minNonFloorGroundCorrection = sample.groundCorrectionY;
          minNonFloorGroundCorrectionTime = frame.time;
        }
        // Blended-pose frames are audited against their own allowance, so a
        // real authored-pose offset cannot hide behind a transient blend.
        if (sample.blendedSupportProxy) {
          if (sample.groundCorrectionY > maxBlendedGroundCorrection) {
            maxBlendedGroundCorrection = sample.groundCorrectionY;
            maxBlendedGroundCorrectionTime = frame.time;
          }
        } else if (sample.groundCorrectionY > maxNonFloorGroundCorrection) {
          maxNonFloorGroundCorrection = sample.groundCorrectionY;
          maxNonFloorGroundCorrectionTime = frame.time;
        }
      }
      if (
        supportMode === "airborne"
        && !isSuspensionCompression(sample)
        && Math.abs(sample.groundCorrectionY) > maxAirborneGroundCorrection
      ) {
        maxAirborneGroundCorrection = Math.abs(sample.groundCorrectionY);
        maxAirborneGroundCorrectionTime = frame.time;
      }
    }
    if (supportMode === "floor-contact" && finite(sample.meshGap)) {
      const gap = Math.abs(sample.meshGap);
      if (gap > maxFloorContactGap) {
        maxFloorContactGap = gap;
        maxFloorContactGapTime = frame.time;
      }
    }
    if (finite(sample.clipTime) && sample.clipTime > maxClipTime) {
      maxClipTime = sample.clipTime;
      maxClipTimeAt = frame.time;
    }
    if (sameAnimationFrame(previous, frame, [sample.animation])) {
      const dt = frame.time - previous.time;
      if (
        correctionMagnitudeIsAuditable(previous.sample)
        && correctionMagnitudeIsAuditable(sample)
        && finite(previous.sample.groundCorrectionY)
        && finite(sample.groundCorrectionY)
      ) {
        const step = Math.abs(sample.groundCorrectionY - previous.sample.groundCorrectionY);
        maxGroundCorrectionStep = Math.max(maxGroundCorrectionStep, step);
        maxGroundCorrectionSpeed = Math.max(maxGroundCorrectionSpeed, step / dt);
      }
      // Generic cross-scenario metrics start after the entry blend/alignment.
      // Action-specific checks below deliberately retain the earlier frames.
      if (sameMotionRun(previous, frame, [sample.animation], 0.12)) {
        for (const [bone, point] of Object.entries(sample.bones ?? {})) {
          const priorPoint = previous.sample.bones?.[bone];
          if (!priorPoint) continue;
          const angularStep = quaternionAngularDistanceDegrees(priorPoint.quaternion, point.quaternion);
          const relativePosition = pelvisRelativeBonePosition(sample, bone);
          const priorRelativePosition = pelvisRelativeBonePosition(previous.sample, bone);
          const positionStep = relativePosition && priorRelativePosition
            ? distance3(priorRelativePosition, relativePosition)
            : 0;
          if (angularStep > maxBoneAngularStep) {
            maxBoneAngularStep = angularStep;
            worstBoneAngularStep = {
              bone,
              animation: sample.animation,
              fromTime: round(previous.time, 3),
              time: round(frame.time, 3),
              fromClipTime: round(previous.sample.clipTime, 3),
              clipTime: round(sample.clipTime, 3),
              degrees: round(angularStep),
            };
          }
          if (positionStep > maxBonePositionStep) {
            maxBonePositionStep = positionStep;
            worstBonePositionStep = {
              bone,
              animation: sample.animation,
              fromTime: round(previous.time, 3),
              time: round(frame.time, 3),
              fromClipTime: round(previous.sample.clipTime, 3),
              clipTime: round(sample.clipTime, 3),
              meters: round(positionStep),
            };
          }
          const angularSpeed = angularStep / dt;
          const priorSpeed = previousAngularSpeeds.get(bone);
          if (priorSpeed && priorSpeed.animation === sample.animation) {
            const jerkDt = (priorSpeed.dt + dt) / 2;
            maxBoneAngularJerk = Math.max(
              maxBoneAngularJerk,
              Math.abs(angularSpeed - priorSpeed.speed) / jerkDt,
            );
          }
          previousAngularSpeeds.set(bone, { animation: sample.animation, dt, speed: angularSpeed });
        }
      } else {
        previousAngularSpeeds.clear();
      }
    } else {
      previousAngularSpeeds.clear();
    }
    previous = frame;
  }

  return {
    actor,
    samples: frames.length,
    animationSamples,
    supportModeSamples,
    suspensionCompressionSamples,
    worldUpOrientationSamples,
    missingWorldUpOrientationSamples: frames.length - worldUpOrientationSamples,
    maxWorldUpTiltDegrees: finite(maxWorldUpTilt) ? round(maxWorldUpTilt) : null,
    maxWorldUpTiltTime: maxWorldUpTiltTime === null ? null : round(maxWorldUpTiltTime, 3),
    minMeshGapMeters: round(minMeshGap),
    minMeshGapTime: minMeshGapTime === null ? null : round(minMeshGapTime, 3),
    minMeshGapMesh,
    minGroundCorrectionMeters: round(minGroundCorrection),
    maxGroundCorrectionMeters: round(maxGroundCorrection),
    minNonFloorGroundCorrectionMeters: finite(minNonFloorGroundCorrection)
      ? round(minNonFloorGroundCorrection)
      : 0,
    minNonFloorGroundCorrectionTime: minNonFloorGroundCorrectionTime === null
      ? null
      : round(minNonFloorGroundCorrectionTime, 3),
    maxNonFloorGroundCorrectionMeters: finite(maxNonFloorGroundCorrection)
      ? round(maxNonFloorGroundCorrection)
      : 0,
    maxNonFloorGroundCorrectionTime: maxNonFloorGroundCorrectionTime === null
      ? null
      : round(maxNonFloorGroundCorrectionTime, 3),
    maxBlendedGroundCorrectionMeters: finite(maxBlendedGroundCorrection)
      ? round(maxBlendedGroundCorrection)
      : 0,
    maxBlendedGroundCorrectionTime: maxBlendedGroundCorrectionTime === null
      ? null
      : round(maxBlendedGroundCorrectionTime, 3),
    maxAirborneGroundCorrectionMeters: round(maxAirborneGroundCorrection),
    maxAirborneGroundCorrectionTime: maxAirborneGroundCorrectionTime === null
      ? null
      : round(maxAirborneGroundCorrectionTime, 3),
    maxFloorContactGapMeters: round(maxFloorContactGap),
    maxFloorContactGapTime: maxFloorContactGapTime === null
      ? null
      : round(maxFloorContactGapTime, 3),
    groundCorrectionRangeMeters: finite(minGroundCorrection) && finite(maxGroundCorrection)
      ? round(maxGroundCorrection - minGroundCorrection)
      : null,
    nonFloorGroundCorrectionRangeMeters:
      finite(minNonFloorGroundCorrection) && finite(maxNonFloorGroundCorrection)
        ? round(maxNonFloorGroundCorrection - minNonFloorGroundCorrection)
        : 0,
    maxClipTimeSeconds: round(maxClipTime),
    maxClipTimeAt: maxClipTimeAt === null ? null : round(maxClipTimeAt, 3),
    maxGroundCorrectionStepMeters: round(maxGroundCorrectionStep),
    maxGroundCorrectionSpeedMetersPerSecond: round(maxGroundCorrectionSpeed),
    maxBoneAngularStepDegrees: round(maxBoneAngularStep),
    worstBoneAngularStep,
    maxBoneAngularJerkDegreesPerSecondSquared: round(maxBoneAngularJerk),
    maxBonePositionStepMeters: round(maxBonePositionStep),
    worstBonePositionStep,
  };
}

function motionCheckSummary(frames, check) {
  const animations = check.animations ?? [];
  const bones = check.bones ?? [];
  const sampleMinClipTime = check.sampleMinClipTimeSeconds ?? Number.NEGATIVE_INFINITY;
  const sampleMaxClipTime = check.sampleMaxClipTimeSeconds ?? Number.POSITIVE_INFINITY;
  const selected = frames.filter(({ sample }) => (
    animations.includes(sample.animation)
    && finite(sample.clipTime)
    && sample.clipTime >= sampleMinClipTime
    && sample.clipTime <= sampleMaxClipTime
  ));
  let previous = null;
  let minGroundCorrection = Number.POSITIVE_INFINITY;
  let maxGroundCorrection = Number.NEGATIVE_INFINITY;
  let minNonFloorGroundCorrection = Number.POSITIVE_INFINITY;
  let maxNonFloorGroundCorrection = Number.NEGATIVE_INFINITY;
  let maxClipTime = Number.NEGATIVE_INFINITY;
  let maxClipTimeAt = null;
  let maxRootCorrectionStep = 0;
  let maxRootCorrectionSpeed = 0;
  let maxRootAngularStep = 0;
  let maxRootAngularJerk = 0;
  let maxBoneAngularStep = 0;
  let maxBoneAngularJerk = 0;
  let maxBonePositionStep = 0;
  let maxBoneVerticalSpeed = 0;
  let loopSeams = 0;
  let maxLoopRootAngularStep = 0;
  let maxLoopBoneAngularStep = 0;
  let maxLoopBoneAngularJerk = 0;
  let maxLoopBonePositionStep = 0;
  let minLoopPoseBoneAngularStep = Number.POSITIVE_INFINITY;
  let minLoopPoseBonePositionStep = Number.POSITIVE_INFINITY;
  let worstBoneAngularStep = null;
  let worstBoneAngularJerk = null;
  let worstRootAngularStep = null;
  let worstRootAngularJerk = null;
  let worstBonePositionStep = null;
  let worstBoneVerticalSpeed = null;
  let worstLoopRootAngularStep = null;
  let worstLoopBoneAngularStep = null;
  let worstLoopBoneAngularJerk = null;
  let worstLoopBonePositionStep = null;
  const previousSpeeds = new Map();
  let previousRootAngularSpeed = null;
  let beforePrevious = null;

  for (const frame of selected) {
    const { sample } = frame;
    if (finite(sample.groundCorrectionY)) {
      minGroundCorrection = Math.min(minGroundCorrection, sample.groundCorrectionY);
      maxGroundCorrection = Math.max(maxGroundCorrection, sample.groundCorrectionY);
      if (correctionMagnitudeIsAuditable(sample)) {
        minNonFloorGroundCorrection = Math.min(minNonFloorGroundCorrection, sample.groundCorrectionY);
        maxNonFloorGroundCorrection = Math.max(maxNonFloorGroundCorrection, sample.groundCorrectionY);
      }
    }
    if (finite(sample.clipTime) && sample.clipTime > maxClipTime) {
      maxClipTime = sample.clipTime;
      maxClipTimeAt = frame.time;
    }
    const loopWrap = isLoopWrap(previous, frame, animations);
    if (loopWrap) {
      loopSeams += 1;
      const dt = frame.time - previous.time;
      let seamBoneAngularStep = 0;
      let seamBonePositionStep = 0;
      const yaw = quaternionYawRadians(sample.rootWorldQuaternion);
      const previousYaw = quaternionYawRadians(previous.sample.rootWorldQuaternion);
      if (yaw !== null && previousYaw !== null) {
        const angularStep = Math.abs(wrappedRadians(yaw - previousYaw) * 180 / Math.PI);
        if (angularStep > maxLoopRootAngularStep) {
          maxLoopRootAngularStep = angularStep;
          worstLoopRootAngularStep = {
            animation: sample.animation,
            time: round(frame.time, 3),
            value: round(angularStep),
          };
        }
      }
      for (const bone of bones) {
        const point = sample.bones?.[bone];
        const priorPoint = previous.sample.bones?.[bone];
        if (!point || !priorPoint) continue;
        const angularStep = quaternionAngularDistanceDegrees(priorPoint.quaternion, point.quaternion);
        seamBoneAngularStep = Math.max(seamBoneAngularStep, angularStep);
        if (angularStep > maxLoopBoneAngularStep) {
          maxLoopBoneAngularStep = angularStep;
          worstLoopBoneAngularStep = {
            bone,
            animation: sample.animation,
            time: round(frame.time, 3),
            value: round(angularStep),
          };
        }
        if (sameMotionRun(beforePrevious, previous, animations)) {
          const priorDt = previous.time - beforePrevious.time;
          const priorBone = beforePrevious.sample.bones?.[bone];
          if (priorBone && priorDt > 0 && dt > 0) {
            const priorSpeed = quaternionAngularDistanceDegrees(
              priorBone.quaternion,
              priorPoint.quaternion,
            ) / priorDt;
            const wrapSpeed = angularStep / dt;
            const angularJerk = Math.abs(wrapSpeed - priorSpeed) / ((priorDt + dt) / 2);
            if (angularJerk > maxLoopBoneAngularJerk) {
              maxLoopBoneAngularJerk = angularJerk;
              worstLoopBoneAngularJerk = {
                bone,
                animation: sample.animation,
                time: round(frame.time, 3),
                value: round(angularJerk),
              };
            }
          }
        }
        const relativePosition = pelvisRelativeBonePosition(sample, bone);
        const priorRelativePosition = pelvisRelativeBonePosition(previous.sample, bone);
        const positionStep = relativePosition && priorRelativePosition
          ? distance3(priorRelativePosition, relativePosition)
          : 0;
        seamBonePositionStep = Math.max(seamBonePositionStep, positionStep);
        if (positionStep > maxLoopBonePositionStep) {
          maxLoopBonePositionStep = positionStep;
          worstLoopBonePositionStep = {
            bone,
            animation: sample.animation,
            time: round(frame.time, 3),
            value: round(positionStep),
          };
        }
      }
      minLoopPoseBoneAngularStep = Math.min(minLoopPoseBoneAngularStep, seamBoneAngularStep);
      minLoopPoseBonePositionStep = Math.min(minLoopPoseBonePositionStep, seamBonePositionStep);
      previousSpeeds.clear();
      previousRootAngularSpeed = null;
    } else if (sameMotionRun(previous, frame, animations)) {
      const dt = frame.time - previous.time;
      const yaw = quaternionYawRadians(sample.rootWorldQuaternion);
      const previousYaw = quaternionYawRadians(previous.sample.rootWorldQuaternion);
      if (yaw !== null && previousYaw !== null) {
        const signedAngularStep = wrappedRadians(yaw - previousYaw) * 180 / Math.PI;
        const angularStep = Math.abs(signedAngularStep);
        const angularSpeed = signedAngularStep / dt;
        if (angularStep > maxRootAngularStep) {
          maxRootAngularStep = angularStep;
          worstRootAngularStep = {
            animation: sample.animation,
            time: round(frame.time, 3),
            value: round(angularStep),
          };
        }
        if (previousRootAngularSpeed?.animation === sample.animation) {
          const jerkDt = (previousRootAngularSpeed.dt + dt) / 2;
          const angularJerk = Math.abs(angularSpeed - previousRootAngularSpeed.speed) / jerkDt;
          if (angularJerk > maxRootAngularJerk) {
            maxRootAngularJerk = angularJerk;
            worstRootAngularJerk = {
              animation: sample.animation,
              time: round(frame.time, 3),
              value: round(angularJerk),
            };
          }
        }
        previousRootAngularSpeed = { animation: sample.animation, dt, speed: angularSpeed };
      }
      if (
        correctionMagnitudeIsAuditable(previous.sample)
        && correctionMagnitudeIsAuditable(sample)
        && finite(sample.groundCorrectionY)
        && finite(previous.sample.groundCorrectionY)
      ) {
        const step = Math.abs(sample.groundCorrectionY - previous.sample.groundCorrectionY);
        maxRootCorrectionStep = Math.max(maxRootCorrectionStep, step);
        maxRootCorrectionSpeed = Math.max(maxRootCorrectionSpeed, step / dt);
      }
      for (const bone of bones) {
        const point = sample.bones?.[bone];
        const priorPoint = previous.sample.bones?.[bone];
        if (!point || !priorPoint) continue;
        const angularStep = quaternionAngularDistanceDegrees(priorPoint.quaternion, point.quaternion);
        const angularSpeed = angularStep / dt;
        const priorSpeed = previousSpeeds.get(bone);
        if (priorSpeed && priorSpeed.animation === sample.animation) {
          const jerkDt = (priorSpeed.dt + dt) / 2;
          const angularJerk = Math.abs(angularSpeed - priorSpeed.speed) / jerkDt;
          if (angularJerk > maxBoneAngularJerk) {
            maxBoneAngularJerk = angularJerk;
            worstBoneAngularJerk = { bone, animation: sample.animation, time: round(frame.time, 3), value: round(angularJerk) };
          }
        }
        previousSpeeds.set(bone, { animation: sample.animation, dt, speed: angularSpeed });
        if (angularStep > maxBoneAngularStep) {
          maxBoneAngularStep = angularStep;
          worstBoneAngularStep = { bone, animation: sample.animation, time: round(frame.time, 3), value: round(angularStep) };
        }
        const relativePosition = pelvisRelativeBonePosition(sample, bone);
        const priorRelativePosition = pelvisRelativeBonePosition(previous.sample, bone);
        const positionStep = relativePosition && priorRelativePosition
          ? distance3(priorRelativePosition, relativePosition)
          : 0;
        if (positionStep > maxBonePositionStep) {
          maxBonePositionStep = positionStep;
          worstBonePositionStep = { bone, animation: sample.animation, time: round(frame.time, 3), value: round(positionStep) };
        }
        const verticalSpeed = relativePosition && priorRelativePosition
          ? Math.abs(relativePosition[1] - priorRelativePosition[1]) / dt
          : 0;
        if (verticalSpeed > maxBoneVerticalSpeed) {
          maxBoneVerticalSpeed = verticalSpeed;
          worstBoneVerticalSpeed = { bone, animation: sample.animation, time: round(frame.time, 3), value: round(verticalSpeed) };
        }
      }
    } else {
      previousSpeeds.clear();
      previousRootAngularSpeed = null;
    }
    beforePrevious = previous;
    previous = frame;
  }

  return {
    actor: check.actor,
    animations,
    bones,
    sampleMinClipTimeSeconds: finite(sampleMinClipTime) ? round(sampleMinClipTime) : null,
    sampleMaxClipTimeSeconds: finite(sampleMaxClipTime) ? round(sampleMaxClipTime) : null,
    samples: selected.length,
    allGroundCorrectionRangeMeters: finite(minGroundCorrection) && finite(maxGroundCorrection)
      ? round(maxGroundCorrection - minGroundCorrection)
      : null,
    groundCorrectionRangeMeters:
      finite(minNonFloorGroundCorrection) && finite(maxNonFloorGroundCorrection)
        ? round(maxNonFloorGroundCorrection - minNonFloorGroundCorrection)
        : 0,
    maxClipTimeSeconds: round(maxClipTime),
    maxClipTimeAt: maxClipTimeAt === null ? null : round(maxClipTimeAt, 3),
    maxRootCorrectionStepMeters: round(maxRootCorrectionStep),
    maxRootCorrectionSpeedMetersPerSecond: round(maxRootCorrectionSpeed),
    maxRootAngularStepDegrees: round(maxRootAngularStep),
    worstRootAngularStep,
    maxRootAngularJerkDegreesPerSecondSquared: round(maxRootAngularJerk),
    worstRootAngularJerk,
    maxBoneAngularStepDegrees: round(maxBoneAngularStep),
    worstBoneAngularStep,
    maxBoneAngularJerkDegreesPerSecondSquared: round(maxBoneAngularJerk),
    worstBoneAngularJerk,
    maxBonePositionStepMeters: round(maxBonePositionStep),
    worstBonePositionStep,
    maxBoneVerticalSpeedMetersPerSecond: round(maxBoneVerticalSpeed),
    worstBoneVerticalSpeed,
    loopSeams,
    maxLoopRootAngularStepDegrees: round(maxLoopRootAngularStep),
    worstLoopRootAngularStep,
    maxLoopBoneAngularStepDegrees: round(maxLoopBoneAngularStep),
    worstLoopBoneAngularStep,
    maxLoopBoneAngularJerkDegreesPerSecondSquared: round(maxLoopBoneAngularJerk),
    worstLoopBoneAngularJerk,
    maxLoopBonePositionStepMeters: round(maxLoopBonePositionStep),
    worstLoopBonePositionStep,
    minLoopPoseBoneAngularStepDegrees: finite(minLoopPoseBoneAngularStep)
      ? round(minLoopPoseBoneAngularStep)
      : null,
    minLoopPoseBonePositionStepMeters: finite(minLoopPoseBonePositionStep)
      ? round(minLoopPoseBonePositionStep)
      : null,
  };
}

function exceeds(failures, value, limit, label) {
  if (limit === undefined) return;
  if (!finite(value)) {
    failures.push(`${label} was not measurable`);
  } else if (value > limit) {
    failures.push(`${label} ${round(value)} exceeded ${limit}`);
  }
}

function fallsBelow(failures, value, limit, label) {
  if (limit === undefined) return;
  if (!finite(value)) {
    failures.push(`${label} was not measurable`);
  } else if (value < limit) {
    failures.push(`${label} ${round(value)} fell below ${limit}`);
  }
}

/**
 * Hard assertions derived from the final rendered actor samples. These checks
 * can fail a scenario but never replace the required qualitative review.
 */
export function evaluateVisualFrames(scenario, telemetry, expected) {
  const failures = [];
  const visualFrames = Array.isArray(telemetry.visualFrames) ? telemetry.visualFrames : [];
  if (visualFrames.length < 3) failures.push(`${scenario}: render-pose probe published fewer than 3 frames`);

  const limits = { ...DEFAULT_GROUNDING_LIMITS, ...(expected.groundingLimits ?? {}) };
  // Per-scenario motion bounds, for the few scenes whose fastest authored
  // action legitimately exceeds the suite-wide default.
  const motionLimits = { ...DEFAULT_MOTION_LIMITS, ...(expected.motionLimits ?? {}) };
  const actors = {};
  for (const actor of ["player", "enemy"]) {
    const frames = actorFrames(visualFrames, actor);
    const required = actorIsRequired(expected, actor);
    if (required && frames.length < 3) {
      failures.push(`${scenario}: ${actor} render-pose probe is missing or incomplete`);
      continue;
    }
    if (!frames.length) continue;

    const summary = createActorSummary(actor, frames);
    actors[actor] = summary;
    for (const animation of expectedAnimations(expected, actor)) {
      if (!summary.animationSamples[animation]) {
        failures.push(`${scenario}: ${actor} probe never sampled expected ${animation}`);
      }
    }
    if (summary.worldUpOrientationSamples !== summary.samples) {
      failures.push(
        `${scenario}: ${actor} root world-up orientation was not measurable for ${summary.missingWorldUpOrientationSamples}/${summary.samples} frames`,
      );
    } else if (
      summary.maxWorldUpTiltDegrees > DEFAULT_ACTOR_ORIENTATION_LIMITS.maxWorldUpTiltDegrees
    ) {
      failures.push(
        `${scenario}: ${actor} root world-up tilt ${summary.maxWorldUpTiltDegrees}° at ${summary.maxWorldUpTiltTime}s exceeded ${DEFAULT_ACTOR_ORIENTATION_LIMITS.maxWorldUpTiltDegrees}°`,
      );
    }
    if (!finite(summary.minMeshGapMeters)) {
      failures.push(`${scenario}: ${actor} deformed-mesh support gap was not measurable`);
    } else if (summary.minMeshGapMeters < -limits.maxMeshPenetrationMeters) {
      failures.push(
        `${scenario}: ${actor} mesh penetrated support by ${round(-summary.minMeshGapMeters)}m at ${summary.minMeshGapTime}s`
        + `${summary.minMeshGapMesh ? ` (deepest mesh: ${summary.minMeshGapMesh})` : ""}`
        + ` (limit ${limits.maxMeshPenetrationMeters}m)`,
      );
    }
    if (!finite(summary.minGroundCorrectionMeters) || !finite(summary.maxGroundCorrectionMeters)) {
      failures.push(`${scenario}: ${actor} ground correction was not measurable`);
    } else {
      if (summary.minNonFloorGroundCorrectionMeters < limits.minGroundCorrectionMeters) {
        failures.push(
          `${scenario}: ${actor} used negative/downward ground correction ${summary.minNonFloorGroundCorrectionMeters}m outside floor-contact mode at ${summary.minNonFloorGroundCorrectionTime}s`,
        );
      }
      exceeds(
        failures,
        summary.maxAirborneGroundCorrectionMeters,
        limits.maxAirborneGroundCorrectionMeters,
        `${scenario}: ${actor} airborne ground correction`,
      );
      exceeds(
        failures,
        summary.maxFloorContactGapMeters,
        limits.maxFloorContactGapMeters,
        `${scenario}: ${actor} floor-contact surface gap`,
      );
      exceeds(
        failures,
        summary.maxNonFloorGroundCorrectionMeters,
        limits.maxGroundCorrectionMeters,
        `${scenario}: ${actor} ground correction`,
      );
      exceeds(
        failures,
        summary.maxBlendedGroundCorrectionMeters,
        limits.maxBlendedGroundCorrectionMeters,
        `${scenario}: ${actor} blended-pose ground correction`,
      );
      exceeds(
        failures,
        summary.maxGroundCorrectionSpeedMetersPerSecond,
        limits.maxGroundCorrectionSpeedMetersPerSecond,
        `${scenario}: ${actor} ground-correction speed`,
      );
    }
    exceeds(
      failures,
      summary.maxGroundCorrectionStepMeters,
      motionLimits.maxRootCorrectionStepMeters,
      `${scenario}: ${actor} per-frame root-correction step`,
    );
    exceeds(
      failures,
      summary.maxBoneAngularStepDegrees,
      motionLimits.maxBoneAngularStepDegrees,
      `${scenario}: ${actor} per-frame bone rotation`,
    );
    exceeds(
      failures,
      summary.maxBonePositionStepMeters,
      motionLimits.maxBonePositionStepMeters,
      `${scenario}: ${actor} per-frame bone travel`,
    );
  }

  const motionChecks = [];
  for (const check of expected.motionChecks ?? []) {
    const frames = actorFrames(visualFrames, check.actor);
    const summary = motionCheckSummary(frames, check);
    motionChecks.push(summary);
    if (summary.samples < 2) {
      failures.push(
        `${scenario}: ${check.actor} motion check has fewer than 2 samples for ${check.animations.join("/")}`,
      );
      continue;
    }
    exceeds(failures, summary.groundCorrectionRangeMeters, check.maxGroundCorrectionRangeMeters,
      `${scenario}: ${check.actor} ${check.animations.join("/")} ground-correction range`);
    exceeds(failures, summary.maxClipTimeSeconds, check.maxClipTimeSeconds,
      `${scenario}: ${check.actor} ${check.animations.join("/")} clip-time out-point`);
    exceeds(failures, summary.maxRootCorrectionStepMeters, check.maxRootCorrectionStepMeters,
      `${scenario}: ${check.actor} ${check.animations.join("/")} root-correction step`);
    exceeds(failures, summary.maxRootCorrectionSpeedMetersPerSecond, check.maxRootCorrectionSpeedMetersPerSecond,
      `${scenario}: ${check.actor} ${check.animations.join("/")} root-correction speed`);
    exceeds(failures, summary.maxRootAngularStepDegrees, check.maxRootAngularStepDegrees,
      `${scenario}: ${check.actor} ${check.animations.join("/")} root-yaw step`);
    exceeds(failures, summary.maxRootAngularJerkDegreesPerSecondSquared, check.maxRootAngularJerkDegreesPerSecondSquared,
      `${scenario}: ${check.actor} ${check.animations.join("/")} root-yaw angular jerk`);
    exceeds(failures, summary.maxBoneAngularStepDegrees, check.maxBoneAngularStepDegrees,
      `${scenario}: ${check.actor} ${check.animations.join("/")} bone angular step`);
    exceeds(failures, summary.maxBoneAngularJerkDegreesPerSecondSquared, check.maxBoneAngularJerkDegreesPerSecondSquared,
      `${scenario}: ${check.actor} ${check.animations.join("/")} bone angular jerk`);
    exceeds(failures, summary.maxBonePositionStepMeters, check.maxBonePositionStepMeters,
      `${scenario}: ${check.actor} ${check.animations.join("/")} bone position step`);
    exceeds(failures, summary.maxBoneVerticalSpeedMetersPerSecond, check.maxBoneVerticalSpeedMetersPerSecond,
      `${scenario}: ${check.actor} ${check.animations.join("/")} bone vertical speed`);
    if (check.minLoopSeams !== undefined && summary.loopSeams < check.minLoopSeams) {
      failures.push(
        `${scenario}: ${check.actor} ${check.animations.join("/")} sampled ${summary.loopSeams} loop seams; expected at least ${check.minLoopSeams}`,
      );
    }
    exceeds(failures, summary.maxLoopRootAngularStepDegrees, check.maxLoopRootAngularStepDegrees,
      `${scenario}: ${check.actor} ${check.animations.join("/")} loop-seam root-yaw step`);
    exceeds(failures, summary.maxLoopBoneAngularStepDegrees, check.maxLoopBoneAngularStepDegrees,
      `${scenario}: ${check.actor} ${check.animations.join("/")} loop-seam bone angular step`);
    exceeds(
      failures,
      summary.maxLoopBoneAngularJerkDegreesPerSecondSquared,
      check.maxLoopBoneAngularJerkDegreesPerSecondSquared,
      `${scenario}: ${check.actor} ${check.animations.join("/")} loop-seam bone angular jerk`,
    );
    exceeds(failures, summary.maxLoopBonePositionStepMeters, check.maxLoopBonePositionStepMeters,
      `${scenario}: ${check.actor} ${check.animations.join("/")} loop-seam bone position step`);
    fallsBelow(
      failures,
      summary.minLoopPoseBoneAngularStepDegrees,
      check.minLoopPoseBoneAngularStepDegrees,
      `${scenario}: ${check.actor} ${check.animations.join("/")} loop-seam visible pose advance`,
    );
  }

  let actorSeparation = null;
  if (expected.actorSeparation) {
    const samples = visualFrames
      .filter((frame) => finite(frame.actorDistance))
      .map((frame) => ({ time: frame.time, meters: frame.actorDistance }));
    const minimum = samples.reduce(
      (closest, sample) => sample.meters < closest.meters ? sample : closest,
      { time: null, meters: Number.POSITIVE_INFINITY },
    );
    actorSeparation = {
      samples: samples.length,
      minimumMeters: finite(minimum.meters) ? round(minimum.meters) : null,
      minimumAt: minimum.time === null ? null : round(minimum.time, 3),
      requiredMinimumMeters: expected.actorSeparation.minDistanceMeters,
    };
    if (samples.length < 3) {
      failures.push(`${scenario}: actor-separation probe published fewer than 3 finite samples`);
    } else if (minimum.meters < expected.actorSeparation.minDistanceMeters) {
      failures.push(
        `${scenario}: actor centre separation ${round(minimum.meters)}m at ${round(minimum.time, 3)}s fell below ${expected.actorSeparation.minDistanceMeters}m`,
      );
    }
  }

  return {
    scenario,
    pass: failures.length === 0,
    supportPlaneY: 0,
    limits,
    actorOrientationLimits: DEFAULT_ACTOR_ORIENTATION_LIMITS,
    actors,
    motionChecks,
    actorSeparation,
    failures,
  };
}

function firstAnimationTrace(telemetry, actor, animation) {
  const frames = actorFrames(telemetry.visualFrames ?? [], actor);
  const trace = [];
  let started = false;
  for (const frame of frames) {
    if (frame.sample.animation !== animation) {
      if (started) break;
      continue;
    }
    started = true;
    trace.push(frame);
  }
  if (!trace.length) return [];
  const startTime = trace[0].time;
  const startClipTime = trace[0].sample.clipTime;
  return trace.map((frame) => ({
    time: frame.time - startTime,
    clipTime: frame.sample.clipTime - startClipTime,
  }));
}

function interpolateTrace(trace, at) {
  if (!trace.length || at < trace[0].time || at > trace.at(-1).time) return null;
  const upperIndex = trace.findIndex((sample) => sample.time >= at);
  if (upperIndex <= 0) return trace[0].clipTime;
  const lower = trace[upperIndex - 1];
  const upper = trace[upperIndex];
  const alpha = (at - lower.time) / Math.max(Number.EPSILON, upper.time - lower.time);
  return lower.clipTime + (upper.clipTime - lower.clipTime) * alpha;
}

/** Compare launch clip progression reached from idle and from run. */
export function compareAnimationProgression(
  firstTelemetry,
  secondTelemetry,
  { actor = "player", animation, maxClipTimeDelta = 0.08, maxDurationDelta = 0.05 },
) {
  const first = firstAnimationTrace(firstTelemetry, actor, animation);
  const second = firstAnimationTrace(secondTelemetry, actor, animation);
  const failures = [];
  if (first.length < 3 || second.length < 3) {
    failures.push(`${animation} predecessor comparison lacks render-pose samples`);
    return { pass: false, animation, actor, samples: [first.length, second.length], failures };
  }
  const firstDuration = first.at(-1).time;
  const secondDuration = second.at(-1).time;
  const commonDuration = Math.min(firstDuration, secondDuration);
  const points = [];
  for (let index = 1; index <= 8; index += 1) {
    const time = commonDuration * index / 8;
    const firstClipTime = interpolateTrace(first, time);
    const secondClipTime = interpolateTrace(second, time);
    if (!finite(firstClipTime) || !finite(secondClipTime)) continue;
    points.push({ time, firstClipTime, secondClipTime, delta: Math.abs(firstClipTime - secondClipTime) });
  }
  const maxObservedDelta = Math.max(0, ...points.map((point) => point.delta));
  const durationDelta = Math.abs(firstDuration - secondDuration);
  if (maxObservedDelta > maxClipTimeDelta) {
    failures.push(`${animation} clip-time progression differs by ${round(maxObservedDelta)}s (limit ${maxClipTimeDelta}s)`);
  }
  if (durationDelta > maxDurationDelta) {
    failures.push(`${animation} rendered duration differs by ${round(durationDelta)}s (limit ${maxDurationDelta}s)`);
  }
  return {
    pass: failures.length === 0,
    actor,
    animation,
    samples: [first.length, second.length],
    durations: [round(firstDuration), round(secondDuration)],
    durationDelta: round(durationDelta),
    maxClipTimeDelta: round(maxObservedDelta),
    limit: { maxClipTimeDelta, maxDurationDelta },
    points: points.map((point) => ({
      time: round(point.time),
      firstClipTime: round(point.firstClipTime),
      secondClipTime: round(point.secondClipTime),
      delta: round(point.delta),
    })),
    failures,
  };
}

function pointSegmentDistance(point, start, end) {
  const segment = [end[0] - start[0], end[1] - start[1], end[2] - start[2]];
  const lengthSquared = segment[0] ** 2 + segment[1] ** 2 + segment[2] ** 2;
  if (lengthSquared <= Number.EPSILON) return distance3(point, start);
  const towardPoint = [point[0] - start[0], point[1] - start[1], point[2] - start[2]];
  const alpha = Math.min(1, Math.max(0,
    (towardPoint[0] * segment[0] + towardPoint[1] * segment[1] + towardPoint[2] * segment[2])
    / lengthSquared,
  ));
  return distance3(point, [
    start[0] + segment[0] * alpha,
    start[1] + segment[1] * alpha,
    start[2] + segment[2] * alpha,
  ]);
}

function actorTorsoPoints(sample) {
  return [sample?.bones?.spine2?.position, sample?.bones?.pelvis?.position].filter(Boolean);
}

function bladeDistance(attacker, victim) {
  if (!attacker?.weaponGrip || !attacker?.weaponTip) return Number.POSITIVE_INFINITY;
  const torso = actorTorsoPoints(victim);
  return torso.length
    ? Math.min(...torso.map((point) => pointSegmentDistance(point, attacker.weaponGrip, attacker.weaponTip)))
    : Number.POSITIVE_INFINITY;
}

function nearestFrame(frames, time) {
  return frames.reduce((nearest, frame) => (
    !nearest || Math.abs(frame.time - time) < Math.abs(nearest.time - time) ? frame : nearest
  ), null);
}

function firstDamageEvent(telemetry, healthField) {
  const events = telemetry.events ?? [];
  const initialHealth = Math.max(
    telemetry[healthField] ?? 0,
    ...events.map((event) => event[healthField] ?? 0),
  );
  return events.find((event) => finite(event[healthField]) && event[healthField] < initialHealth) ?? null;
}

function firstEnemyDamageEvent(telemetry) {
  return firstDamageEvent(telemetry, "enemyHealth");
}

/**
 * Geometry-level paired-role check. Semantic clip names/provenance cannot make
 * this pass: the rendered player's real sword must approach the rendered enemy
 * torso at damage while the victim's sword must not become the stabbing blade.
 */
export function evaluateBackstabWeaponRole(telemetry, {
  maxAttackerBladeDistanceMeters = 0.55,
  minRoleSeparationMeters = 0.08,
  minApproachMeters = 0.08,
} = {}) {
  const failures = [];
  const damageEvent = firstEnemyDamageEvent(telemetry);
  if (!damageEvent) {
    return { pass: false, failures: ["backstab weapon-role check could not locate the damage event"] };
  }
  const damageTime = damageEvent.time;
  const frames = (telemetry.visualFrames ?? []).filter((frame) => frame.player && frame.enemy);
  const contactFrames = frames.filter((frame) => Math.abs(frame.time - damageTime) <= 0.3);
  if (contactFrames.length < 2) {
    return { pass: false, damageTime, failures: ["backstab weapon-role check lacks paired render samples around damage"] };
  }

  let playerMinimum = Number.POSITIVE_INFINITY;
  let playerMinimumTime = null;
  let enemyMinimum = Number.POSITIVE_INFINITY;
  let enemyMinimumTime = null;
  for (const frame of contactFrames) {
    const playerDistance = bladeDistance(frame.player, frame.enemy);
    const enemyDistance = bladeDistance(frame.enemy, frame.player);
    if (playerDistance < playerMinimum) {
      playerMinimum = playerDistance;
      playerMinimumTime = frame.time;
    }
    if (enemyDistance < enemyMinimum) {
      enemyMinimum = enemyDistance;
      enemyMinimumTime = frame.time;
    }
  }
  const beforeFrame = nearestFrame(frames, Math.max(0, damageTime - 0.45));
  const beforeDistance = beforeFrame ? bladeDistance(beforeFrame.player, beforeFrame.enemy) : Number.POSITIVE_INFINITY;
  const approach = beforeDistance - playerMinimum;
  const roleSeparation = enemyMinimum - playerMinimum;

  if (!finite(playerMinimum) || playerMinimum > maxAttackerBladeDistanceMeters) {
    failures.push(
      `player blade remained ${round(playerMinimum)}m from enemy torso (limit ${maxAttackerBladeDistanceMeters}m)`,
    );
  }
  if (!finite(roleSeparation) || roleSeparation < minRoleSeparationMeters) {
    failures.push(
      `victim/attacker blade-role separation was ${round(roleSeparation)}m (minimum ${minRoleSeparationMeters}m)`,
    );
  }
  if (!finite(approach) || approach < minApproachMeters) {
    failures.push(`player blade approached enemy torso by only ${round(approach)}m (minimum ${minApproachMeters}m)`);
  }

  return {
    pass: failures.length === 0,
    damageTime: round(damageTime, 3),
    playerBladeToEnemyTorso: {
      beforeMeters: round(beforeDistance),
      minimumMeters: round(playerMinimum),
      minimumTime: playerMinimumTime === null ? null : round(playerMinimumTime, 3),
      approachMeters: round(approach),
    },
    enemyBladeToPlayerTorso: {
      minimumMeters: round(enemyMinimum),
      minimumTime: enemyMinimumTime === null ? null : round(enemyMinimumTime, 3),
    },
    roleSeparationMeters: round(roleSeparation),
    limits: { maxAttackerBladeDistanceMeters, minRoleSeparationMeters, minApproachMeters },
    failures,
  };
}

/**
 * Geometry-level damage/contact contract for paired attacks. Actor roles,
 * semantic states, and the damaged health field are explicit so another
 * execution can reuse the probe without relying on a filename or actor order.
 */
export function evaluateWeaponContactAtDamage(telemetry, {
  attackerActor,
  victimActor,
  victimHealthField,
  attackerAnimation,
  victimReactionAnimation,
  maxAttackerBladeDistanceMeters,
  minRoleSeparationMeters,
  maxEarlyContactLeadSeconds,
}) {
  const failures = [];
  const roles = {
    attackerActor,
    victimActor,
    victimHealthField,
    attackerAnimation,
    victimReactionAnimation,
  };
  for (const [field, value] of Object.entries(roles)) {
    if (typeof value !== "string" || value.length === 0) {
      return { pass: false, roles, failures: [`weapon-contact contract needs a non-empty ${field}`] };
    }
  }
  for (const [field, value] of Object.entries({
    maxAttackerBladeDistanceMeters,
    minRoleSeparationMeters,
    maxEarlyContactLeadSeconds,
  })) {
    if (!finite(value) || value < 0) {
      return { pass: false, roles, failures: [`weapon-contact contract needs a non-negative ${field}`] };
    }
  }

  const frames = (telemetry.visualFrames ?? []).filter((frame) => frame[attackerActor] && frame[victimActor]);
  const damageEvent = firstDamageEvent(telemetry, victimHealthField);
  const attackerStart = frames.find((frame) => frame[attackerActor].animation === attackerAnimation);
  if (!damageEvent || !attackerStart) {
    return {
      pass: false,
      roles,
      failures: [
        !attackerStart ? `weapon-contact check could not locate rendered ${attackerAnimation}` : null,
        !damageEvent ? `weapon-contact check could not locate a ${victimHealthField} damage event` : null,
      ].filter(Boolean),
    };
  }

  const frameInterval = measuredFrameInterval(frames, damageEvent.time);
  const oneFrameLimit = Math.min(MAX_CONTIGUOUS_FRAME_GAP_SECONDS, Math.max(0.04, frameInterval * 1.25));
  const reactionFrame = frames.find((frame) => (
    frame.time >= damageEvent.time - oneFrameLimit
    && frame[victimActor].animation === victimReactionAnimation
  ));
  const reactionDelta = reactionFrame
    ? Math.abs(reactionFrame.time - damageEvent.time)
    : Number.POSITIVE_INFINITY;
  if (!reactionFrame || reactionDelta > oneFrameLimit) {
    failures.push(
      `weapon contact damage and rendered ${victimReactionAnimation} differed by ${round(reactionDelta)}s (one sampled frame ${round(oneFrameLimit)}s)`,
    );
  }
  if (reactionFrame && reactionFrame[attackerActor].animation !== attackerAnimation) {
    failures.push(
      `weapon contact reaction frame rendered attacker ${reactionFrame[attackerActor].animation}, not ${attackerAnimation}`,
    );
  }

  const attackerDistance = reactionFrame
    ? bladeDistance(reactionFrame[attackerActor], reactionFrame[victimActor])
    : Number.POSITIVE_INFINITY;
  const victimDistance = reactionFrame
    ? bladeDistance(reactionFrame[victimActor], reactionFrame[attackerActor])
    : Number.POSITIVE_INFINITY;
  const roleSeparation = victimDistance - attackerDistance;
  if (!finite(attackerDistance) || attackerDistance > maxAttackerBladeDistanceMeters) {
    failures.push(
      `${attackerActor} blade was ${round(attackerDistance)}m from ${victimActor} torso on the damage/reaction frame (limit ${maxAttackerBladeDistanceMeters}m)`,
    );
  }
  if (!finite(victimDistance) || !finite(roleSeparation) || roleSeparation < minRoleSeparationMeters) {
    failures.push(
      `weapon-contact role separation was ${round(roleSeparation)}m (minimum ${minRoleSeparationMeters}m; ${victimActor} blade ${round(victimDistance)}m)`,
    );
  }

  const earlyCutoff = damageEvent.time - maxEarlyContactLeadSeconds;
  const earlyContacts = frames.filter((frame) => (
    frame.time >= attackerStart.time
    && frame.time < earlyCutoff
    && frame[attackerActor].animation === attackerAnimation
    && bladeDistance(frame[attackerActor], frame[victimActor]) <= maxAttackerBladeDistanceMeters
  ));
  let earliestContact = null;
  if (earlyContacts.length) {
    const frame = earlyContacts[0];
    const distance = bladeDistance(frame[attackerActor], frame[victimActor]);
    earliestContact = {
      time: round(frame.time, 3),
      attackerClipTime: round(frame[attackerActor].clipTime),
      distanceMeters: round(distance),
      leadSeconds: round(damageEvent.time - frame.time),
    };
    failures.push(
      `${attackerActor} blade made an unacknowledged contact beat ${earliestContact.leadSeconds}s before damage at ${earliestContact.time}s (${earliestContact.distanceMeters}m)`,
    );
  }

  const damageEventAnimationField = `${victimActor}Animation`;
  if (damageEvent[damageEventAnimationField] !== victimReactionAnimation) {
    failures.push(
      `damage event reported ${damageEvent[damageEventAnimationField]}, not ${victimActor} ${victimReactionAnimation}`,
    );
  }

  return {
    pass: failures.length === 0,
    roles,
    damageTime: round(damageEvent.time, 3),
    measuredFrameIntervalSeconds: round(frameInterval),
    oneFrameLimitSeconds: round(oneFrameLimit),
    contactFrame: reactionFrame ? {
      time: round(reactionFrame.time, 3),
      damageDeltaSeconds: round(reactionDelta),
      attackerClipTime: round(reactionFrame[attackerActor].clipTime),
      victimClipTime: round(reactionFrame[victimActor].clipTime),
      attackerBladeToVictimTorsoMeters: round(attackerDistance),
      victimBladeToAttackerTorsoMeters: round(victimDistance),
      roleSeparationMeters: round(roleSeparation),
    } : null,
    earliestUnacknowledgedContact: earliestContact,
    limits: {
      maxAttackerBladeDistanceMeters,
      minRoleSeparationMeters,
      maxEarlyContactLeadSeconds,
    },
    failures,
  };
}

/** Measure the real rendered seam for one declared occurrence-aware edge. */
export function evaluateAnimationTransitionMotion(telemetry, {
  actor,
  fromAnimation,
  fromOccurrence,
  toAnimation,
  toOccurrence,
  transitionWindowSeconds,
  bones,
  maxPelvisRelativeBoneStepMeters,
  maxBoneAngularStepDegrees,
  maxWeaponTipStepMeters,
  weaponTipSpace = "world",
}) {
  const failures = [];
  if (typeof actor !== "string" || typeof fromAnimation !== "string" || typeof toAnimation !== "string") {
    return { pass: false, failures: ["transition-motion contract needs explicit actor/fromAnimation/toAnimation"] };
  }
  if (!Number.isInteger(fromOccurrence) || fromOccurrence < 1
    || !Number.isInteger(toOccurrence) || toOccurrence < 1) {
    return { pass: false, failures: ["transition-motion contract needs positive from/to occurrence numbers"] };
  }
  if (!Array.isArray(bones) || !bones.length || bones.some((bone) => typeof bone !== "string" || !bone)) {
    return { pass: false, failures: ["transition-motion contract needs at least one named bone"] };
  }
  if (!["world", "pelvis-relative"].includes(weaponTipSpace)) {
    return { pass: false, failures: ["transition-motion contract weaponTipSpace must be world or pelvis-relative"] };
  }
  for (const [field, value] of Object.entries({
    transitionWindowSeconds,
    maxPelvisRelativeBoneStepMeters,
    maxBoneAngularStepDegrees,
    maxWeaponTipStepMeters,
  })) {
    if (!finite(value) || value < 0) {
      return { pass: false, failures: [`transition-motion contract needs a non-negative ${field}`] };
    }
  }

  const runs = extractRenderedRuns(telemetry, actor);
  const fromIndex = runs.findIndex((run) => (
    run.state === fromAnimation && run.occurrence === fromOccurrence
  ));
  const fromRun = fromIndex >= 0 ? runs[fromIndex] : null;
  const toRun = fromRun ? runs[fromIndex + 1] : null;
  const edgeLabel = `${actor} ${fromAnimation}#${fromOccurrence}→${toAnimation}#${toOccurrence}`;
  if (!fromRun || !toRun || toRun.state !== toAnimation || toRun.occurrence !== toOccurrence) {
    return {
      pass: false,
      edge: { actor, fromAnimation, fromOccurrence, toAnimation, toOccurrence },
      failures: [`${edgeLabel} is not an adjacent rendered transition`],
    };
  }

  const frames = actorFrames(telemetry.visualFrames ?? [], actor);
  const window = frames.filter(({ time }) => (
    time >= fromRun.end - 0.001 && time <= toRun.start + transitionWindowSeconds + 0.001
  ));
  let worstPosition = null;
  let worstAngle = null;
  let worstWeaponTip = null;
  let missingBonePairs = 0;
  let missingWeaponPairs = 0;
  for (let index = 1; index < window.length; index += 1) {
    const prior = window[index - 1];
    const current = window[index];
    if (current.time - prior.time > MAX_CONTIGUOUS_FRAME_GAP_SECONDS) continue;
    for (const bone of bones) {
      const priorBone = prior.sample.bones?.[bone];
      const currentBone = current.sample.bones?.[bone];
      const priorPosition = pelvisRelativeBonePosition(prior.sample, bone);
      const currentPosition = pelvisRelativeBonePosition(current.sample, bone);
      if (!priorBone || !currentBone || !priorPosition || !currentPosition) {
        missingBonePairs += 1;
        continue;
      }
      const positionStep = distance3(priorPosition, currentPosition);
      const angularStep = quaternionAngularDistanceDegrees(priorBone.quaternion, currentBone.quaternion);
      if (!worstPosition || positionStep > worstPosition.value) {
        worstPosition = { bone, value: positionStep, time: current.time };
      }
      if (!worstAngle || angularStep > worstAngle.value) {
        worstAngle = { bone, value: angularStep, time: current.time };
      }
    }
    const priorWeaponTip = weaponTipSpace === "pelvis-relative"
      ? pelvisRelativePoint(prior.sample, prior.sample.weaponTip)
      : prior.sample.weaponTip;
    const currentWeaponTip = weaponTipSpace === "pelvis-relative"
      ? pelvisRelativePoint(current.sample, current.sample.weaponTip)
      : current.sample.weaponTip;
    if (priorWeaponTip && currentWeaponTip) {
      const weaponTipStep = distance3(priorWeaponTip, currentWeaponTip);
      if (!worstWeaponTip || weaponTipStep > worstWeaponTip.value) {
        worstWeaponTip = { value: weaponTipStep, time: current.time };
      }
    } else {
      missingWeaponPairs += 1;
    }
  }

  if (window.length < 2) failures.push(`${edgeLabel} transition window has fewer than two rendered samples`);
  if (!worstPosition || missingBonePairs) {
    failures.push(`${edgeLabel} transition lacks complete pelvis-relative samples for ${bones.join(", ")}`);
  } else if (worstPosition.value > maxPelvisRelativeBoneStepMeters) {
    failures.push(
      `${edgeLabel} moved ${worstPosition.bone} ${round(worstPosition.value)}m in one frame at ${round(worstPosition.time, 3)}s (limit ${maxPelvisRelativeBoneStepMeters}m)`,
    );
  }
  if (!worstAngle || missingBonePairs) {
    failures.push(`${edgeLabel} transition lacks complete local bone rotation samples for ${bones.join(", ")}`);
  } else if (worstAngle.value > maxBoneAngularStepDegrees) {
    failures.push(
      `${edgeLabel} rotated ${worstAngle.bone} ${round(worstAngle.value)}° in one frame at ${round(worstAngle.time, 3)}s (limit ${maxBoneAngularStepDegrees}°)`,
    );
  }
  if (!worstWeaponTip || missingWeaponPairs) {
    failures.push(`${edgeLabel} transition lacks complete ${weaponTipSpace} rendered weapon-tip samples`);
  } else if (worstWeaponTip.value > maxWeaponTipStepMeters) {
    failures.push(
      `${edgeLabel} moved ${weaponTipSpace} rendered weapon tip ${round(worstWeaponTip.value)}m in one frame at ${round(worstWeaponTip.time, 3)}s (limit ${maxWeaponTipStepMeters}m)`,
    );
  }

  return {
    pass: failures.length === 0,
    edge: {
      actor,
      fromAnimation,
      fromOccurrence,
      fromCommandSerial: fromRun.commandSerial,
      toAnimation,
      toOccurrence,
      toCommandSerial: toRun.commandSerial,
      transitionTime: toRun.start,
    },
    window: {
      durationSeconds: transitionWindowSeconds,
      samples: window.length,
      start: window.length ? round(window[0].time, 3) : null,
      end: window.length ? round(window.at(-1).time, 3) : null,
    },
    worstPelvisRelativeBoneStep: worstPosition ? {
      bone: worstPosition.bone,
      meters: round(worstPosition.value),
      time: round(worstPosition.time, 3),
    } : null,
    worstLocalBoneAngularStep: worstAngle ? {
      bone: worstAngle.bone,
      degrees: round(worstAngle.value),
      time: round(worstAngle.time, 3),
    } : null,
    worstRenderedWeaponTipStep: worstWeaponTip ? {
      space: weaponTipSpace,
      meters: round(worstWeaponTip.value),
      time: round(worstWeaponTip.time, 3),
    } : null,
    limits: {
      maxPelvisRelativeBoneStepMeters,
      maxBoneAngularStepDegrees,
      maxWeaponTipStepMeters,
      weaponTipSpace,
    },
    failures,
  };
}

function measuredFrameInterval(frames, aroundTime) {
  const nearby = frames.filter((frame) => Math.abs(frame.time - aroundTime) <= 0.25);
  const steps = nearby.slice(1)
    .map((frame, index) => frame.time - nearby[index].time)
    .filter((step) => step > 0 && step <= MAX_CONTIGUOUS_FRAME_GAP_SECONDS)
    .sort((first, second) => first - second);
  return steps.length ? steps[Math.floor(steps.length / 2)] : 1 / 30;
}

/** Assert the authored execution annotation drives one coherent riposte phase. */
export function evaluateRipostePhases(telemetry, {
  minStableLeadInSeconds = 0.2,
  minVictimStartClipTimeSeconds = 0,
  maxVictimStartClipTimeSeconds = 0.08,
  victimReactionAnimation = "CRITICAL_KNOCKDOWN",
  /**
   * Which clip the attacker performs. Named by the scenario rather than assumed:
   * the one-handed execution is no longer the only thing a riposte can play —
   * a thrusting class has its own execution and a swinging one uses its opening
   * light attack — and hardcoding it here meant this whole check silently
   * failed to find its own subject the moment either changed.
   */
  attackerAnimation = "RIPOSTE",
  expectedAttackerContactElapsedSeconds,
  expectedAttackerContactClipTimeSeconds,
  attackerReleaseClipTimeSeconds,
  expectedAttackerReleaseWallElapsedSeconds,
  expectedVictimReleaseClipTimeSeconds,
  maxPhaseTimingErrorSeconds = 0.06,
  postBlendMotionWindowSeconds = 0.3,
  maxPostBlendHeadUpwardReboundMeters,
  maxPostBlendPelvisUpwardReboundMeters,
  maxReactionToAirborneSeconds,
} = {}) {
  const failures = [];
  const frames = (telemetry.visualFrames ?? []).filter((frame) => frame.player && frame.enemy);
  const damageEvent = firstEnemyDamageEvent(telemetry);
  const attackerStart = frames.find((frame) => frame.player.animation === attackerAnimation);
  if (!damageEvent || !attackerStart) {
    return {
      pass: false,
      failures: [
        !attackerStart ? `riposte phase check could not locate the rendered ${attackerAnimation} start` : null,
        !damageEvent ? "riposte phase check could not locate the damage event" : null,
      ].filter(Boolean),
    };
  }

  const frameInterval = measuredFrameInterval(frames, damageEvent.time);
  const oneFrameLimit = Math.min(MAX_CONTIGUOUS_FRAME_GAP_SECONDS, Math.max(0.04, frameInterval * 1.25));
  const timingFields = {
    expectedAttackerContactElapsedSeconds,
    expectedAttackerContactClipTimeSeconds,
    attackerReleaseClipTimeSeconds,
    expectedAttackerReleaseWallElapsedSeconds,
    expectedVictimReleaseClipTimeSeconds,
  };
  for (const [field, value] of Object.entries(timingFields)) {
    if (value !== undefined && (!finite(value) || value < 0)) {
      failures.push(`riposte phase contract needs a non-negative ${field}`);
    }
  }
  if (!finite(maxPhaseTimingErrorSeconds) || maxPhaseTimingErrorSeconds < 0) {
    failures.push("riposte phase contract needs a non-negative maxPhaseTimingErrorSeconds");
  }
  const preImpact = frames.filter((frame) => (
    frame.time >= attackerStart.time && frame.time < damageEvent.time - oneFrameLimit * 0.25
  ));
  const unexpectedLeadIn = preImpact.filter((frame) => frame.enemy.animation !== "GUARD_BREAK");
  const leadInDuration = preImpact.length > 1 ? preImpact.at(-1).time - preImpact[0].time : 0;
  if (leadInDuration < minStableLeadInSeconds) {
    failures.push(`riposte stable GUARD_BREAK lead-in lasted only ${round(leadInDuration)}s`);
  }
  if (unexpectedLeadIn.length) {
    const first = unexpectedLeadIn[0];
    const observed = [...new Set(unexpectedLeadIn.map((frame) => frame.enemy.animation))];
    failures.push(
      `riposte victim left GUARD_BREAK before impact at ${round(first.time, 3)}s (${observed.join(", ")}; SWORD_IDLE/GUARD recovery is forbidden)`,
    );
  }

  const victimStart = frames.find((frame) => (
    frame.time >= damageEvent.time - oneFrameLimit && frame.enemy.animation === victimReactionAnimation
  ));
  const reactionDelta = victimStart ? Math.abs(victimStart.time - damageEvent.time) : Number.POSITIVE_INFINITY;
  if (!victimStart || reactionDelta > oneFrameLimit) {
    failures.push(
      `riposte damage and rendered ${victimReactionAnimation} start differed by ${round(reactionDelta)}s (one sampled frame ${round(oneFrameLimit)}s)`,
    );
  }
  const victimStartClipTime = victimStart?.enemy.clipTime;
  if (!finite(victimStartClipTime)
    || victimStartClipTime < minVictimStartClipTimeSeconds
    || victimStartClipTime > maxVictimStartClipTimeSeconds) {
    failures.push(
      `riposte victim reaction began at clip time ${round(victimStartClipTime)}s (expected ${minVictimStartClipTimeSeconds}–${maxVictimStartClipTimeSeconds}s)`,
    );
  }
  if (damageEvent.enemyAnimation !== victimReactionAnimation) {
    failures.push(
      `riposte damage event reported ${damageEvent.enemyAnimation}, not ${victimReactionAnimation}`,
    );
  }

  const attackerContactFrame = nearestFrame(
    frames.filter((frame) => frame.player.animation === attackerAnimation),
    damageEvent.time,
  );
  const attackerContactElapsed = damageEvent.time - attackerStart.time;
  const attackerContactClipTime = attackerContactFrame?.player.clipTime;
  if (finite(expectedAttackerContactElapsedSeconds)
    && Math.abs(attackerContactElapsed - expectedAttackerContactElapsedSeconds) > maxPhaseTimingErrorSeconds) {
    failures.push(
      `riposte contact occurred ${round(attackerContactElapsed)}s after rendered attacker entry (expected ${expectedAttackerContactElapsedSeconds}s ±${maxPhaseTimingErrorSeconds}s)`,
    );
  }
  if (finite(expectedAttackerContactClipTimeSeconds)
    && (!finite(attackerContactClipTime)
      || Math.abs(attackerContactClipTime - expectedAttackerContactClipTimeSeconds) > maxPhaseTimingErrorSeconds)) {
    failures.push(
      `riposte contact rendered attacker clip time ${round(attackerContactClipTime)}s (expected ${expectedAttackerContactClipTimeSeconds}s ±${maxPhaseTimingErrorSeconds}s)`,
    );
  }

  const checksRelease = Object.values({
    attackerReleaseClipTimeSeconds,
    expectedAttackerReleaseWallElapsedSeconds,
    expectedVictimReleaseClipTimeSeconds,
  }).some((value) => value !== undefined);
  let releaseFrame = null;
  if (checksRelease) {
    if (!finite(attackerReleaseClipTimeSeconds)
      || !finite(expectedAttackerReleaseWallElapsedSeconds)
      || !finite(expectedVictimReleaseClipTimeSeconds)) {
      failures.push(
        "riposte release continuity needs attackerReleaseClipTimeSeconds, expectedAttackerReleaseWallElapsedSeconds, and expectedVictimReleaseClipTimeSeconds",
      );
    } else {
      releaseFrame = frames.find((frame) => (
        frame.time >= attackerStart.time
        && frame.player.animation === attackerAnimation
        && finite(frame.player.clipTime)
        && frame.player.clipTime >= attackerReleaseClipTimeSeconds
      )) ?? null;
      if (!releaseFrame) {
        failures.push(`riposte release check never reached attacker clip time ${attackerReleaseClipTimeSeconds}s`);
      } else {
        const releaseElapsed = releaseFrame.time - attackerStart.time;
        if (Math.abs(releaseElapsed - expectedAttackerReleaseWallElapsedSeconds) > maxPhaseTimingErrorSeconds) {
          failures.push(
            `riposte release occurred ${round(releaseElapsed)}s after rendered attacker entry (expected ${expectedAttackerReleaseWallElapsedSeconds}s wall time including hit-stop ±${maxPhaseTimingErrorSeconds}s)`,
          );
        }
        if (releaseFrame.enemy.animation !== victimReactionAnimation) {
          failures.push(
            `riposte victim rendered ${releaseFrame.enemy.animation}, not continuous ${victimReactionAnimation}, at attacker release`,
          );
        }
        const victimReleaseClipTime = releaseFrame.enemy.clipTime;
        if (!finite(victimReleaseClipTime)
          || Math.abs(victimReleaseClipTime - expectedVictimReleaseClipTimeSeconds) > maxPhaseTimingErrorSeconds) {
          failures.push(
            `riposte victim clip time was ${round(victimReleaseClipTime)}s at attacker release (expected ${expectedVictimReleaseClipTimeSeconds}s ±${maxPhaseTimingErrorSeconds}s)`,
          );
        }
      }
    }
  }

  let postBlendMotion = null;
  if (maxPostBlendHeadUpwardReboundMeters !== undefined
    || maxPostBlendPelvisUpwardReboundMeters !== undefined) {
    const fullWeightFrame = victimStart ? frames.find((frame) => (
      frame.time >= victimStart.time
      && frame.enemy.animation === victimReactionAnimation
      && finite(frame.enemy.actionWeight)
      && frame.enemy.actionWeight >= 0.99
    )) : null;
    const motionFrames = fullWeightFrame ? frames.filter((frame) => (
      frame.time >= fullWeightFrame.time
      && frame.time <= fullWeightFrame.time + postBlendMotionWindowSeconds
      && frame.enemy.animation === victimReactionAnimation
    )) : [];
    const upwardRebound = (bone) => {
      let runningMinimum = Number.POSITIVE_INFINITY;
      let maximum = 0;
      let maximumAt = null;
      let samples = 0;
      for (const frame of motionFrames) {
        const point = frame.enemy.bones?.[bone]?.position;
        if (!point || !finite(point[1])) continue;
        const groundY = finite(frame.enemy.groundY) ? frame.enemy.groundY : 0;
        const height = point[1] - groundY;
        runningMinimum = Math.min(runningMinimum, height);
        const rebound = height - runningMinimum;
        if (rebound > maximum) {
          maximum = rebound;
          maximumAt = frame.time;
        }
        samples += 1;
      }
      return { samples, meters: maximum, time: maximumAt };
    };
    const headRebound = upwardRebound("head");
    const pelvisRebound = upwardRebound("pelvis");
    if (!fullWeightFrame || motionFrames.length < 3 || headRebound.samples !== motionFrames.length) {
      failures.push("riposte post-blend head-rebound check lacks complete rendered samples");
    } else if (headRebound.meters > maxPostBlendHeadUpwardReboundMeters) {
      failures.push(
        `riposte victim head rebounded upward ${round(headRebound.meters)}m at ${round(headRebound.time, 3)}s after reaction entry (limit ${maxPostBlendHeadUpwardReboundMeters}m)`,
      );
    }
    if (!fullWeightFrame || motionFrames.length < 3 || pelvisRebound.samples !== motionFrames.length) {
      failures.push("riposte post-blend pelvis-rebound check lacks complete rendered samples");
    } else if (pelvisRebound.meters > maxPostBlendPelvisUpwardReboundMeters) {
      failures.push(
        `riposte victim pelvis rebounded upward ${round(pelvisRebound.meters)}m at ${round(pelvisRebound.time, 3)}s after reaction entry (limit ${maxPostBlendPelvisUpwardReboundMeters}m)`,
      );
    }
    postBlendMotion = {
      fullWeightTime: fullWeightFrame ? round(fullWeightFrame.time, 3) : null,
      samples: motionFrames.length,
      headUpwardReboundMeters: round(headRebound.meters),
      headUpwardReboundTime: headRebound.time === null ? null : round(headRebound.time, 3),
      pelvisUpwardReboundMeters: round(pelvisRebound.meters),
      pelvisUpwardReboundTime: pelvisRebound.time === null ? null : round(pelvisRebound.time, 3),
    };
  }

  let reactionToAirborne = null;
  if (maxReactionToAirborneSeconds !== undefined) {
    const airborneFrame = frames.find((frame) => (
      frame.time >= damageEvent.time
      && frame.enemy.animation === victimReactionAnimation
      && frame.enemy.supportMode === "airborne"
    ));
    const seconds = airborneFrame ? airborneFrame.time - damageEvent.time : Number.POSITIVE_INFINITY;
    if (!airborneFrame || seconds > maxReactionToAirborneSeconds) {
      failures.push(
        `riposte victim took ${round(seconds)}s to reach the authored airborne fall (limit ${maxReactionToAirborneSeconds}s)`,
      );
    }
    reactionToAirborne = {
      time: airborneFrame ? round(airborneFrame.time, 3) : null,
      seconds: round(seconds),
    };
  }

  return {
    pass: failures.length === 0,
    attackerStartTime: round(attackerStart.time, 3),
    damageTime: round(damageEvent.time, 3),
    damageEventEnemyAnimation: damageEvent.enemyAnimation,
    victimReactionAnimation,
    measuredFrameIntervalSeconds: round(frameInterval),
    oneFrameLimitSeconds: round(oneFrameLimit),
    stableLeadIn: {
      samples: preImpact.length,
      durationSeconds: round(leadInDuration),
      unexpectedAnimations: [...new Set(unexpectedLeadIn.map((frame) => frame.enemy.animation))],
      firstUnexpectedTime: unexpectedLeadIn.length ? round(unexpectedLeadIn[0].time, 3) : null,
    },
    victimReaction: victimStart ? {
      time: round(victimStart.time, 3),
      damageDeltaSeconds: round(reactionDelta),
      clipTimeSeconds: round(victimStartClipTime),
    } : null,
    attackerContact: {
      elapsedSeconds: round(attackerContactElapsed),
      clipTimeSeconds: round(attackerContactClipTime),
    },
    releaseContinuity: releaseFrame ? {
      time: round(releaseFrame.time, 3),
      attackerElapsedSeconds: round(releaseFrame.time - attackerStart.time),
      attackerClipTimeSeconds: round(releaseFrame.player.clipTime),
      victimAnimation: releaseFrame.enemy.animation,
      victimClipTimeSeconds: round(releaseFrame.enemy.clipTime),
    } : null,
    postBlendMotion,
    reactionToAirborne,
    limits: {
      minStableLeadInSeconds,
      minVictimStartClipTimeSeconds,
      maxVictimStartClipTimeSeconds,
      expectedAttackerContactElapsedSeconds,
      expectedAttackerContactClipTimeSeconds,
      attackerReleaseClipTimeSeconds,
      expectedAttackerReleaseWallElapsedSeconds,
      expectedVictimReleaseClipTimeSeconds,
      maxPhaseTimingErrorSeconds,
      postBlendMotionWindowSeconds,
      maxPostBlendHeadUpwardReboundMeters,
      maxPostBlendPelvisUpwardReboundMeters,
      maxReactionToAirborneSeconds,
    },
    failures,
  };
}

/** Guard break is a standing stagger; a prolonged one-knee pose is rejected. */
export function evaluateGuardBreakPosture(telemetry, {
  minHeadHeightMeters = 1.25,
  kneelingKneeHeightMeters = 0.24,
  maxKneelingFrameRatio = 0.2,
} = {}) {
  const failures = [];
  const frames = actorFrames(telemetry.visualFrames ?? [], "enemy")
    .filter(({ sample }) => sample.animation === "GUARD_BREAK");
  if (frames.length < 5) {
    return { pass: false, failures: ["guard-break standing-posture check lacks rendered GUARD_BREAK samples"] };
  }
  const edge = Math.floor(frames.length * 0.2);
  const central = frames.slice(edge, Math.max(edge + 1, frames.length - edge));
  const samples = central.map((frame) => {
    const groundY = finite(frame.sample.groundY) ? frame.sample.groundY : 0;
    const head = frame.sample.bones?.head?.position;
    const calfL = frame.sample.bones?.calfL?.position;
    const calfR = frame.sample.bones?.calfR?.position;
    return {
      time: frame.time,
      headHeight: head ? head[1] - groundY : null,
      kneeHeight: calfL && calfR ? Math.min(calfL[1], calfR[1]) - groundY : null,
    };
  });
  const measurable = samples.filter((sample) => finite(sample.headHeight) && finite(sample.kneeHeight));
  if (measurable.length !== central.length) {
    failures.push("guard-break posture probe is missing head or calf/knee bones");
  }
  const lowestHead = measurable.reduce((lowest, sample) => (
    !lowest || sample.headHeight < lowest.headHeight ? sample : lowest
  ), null);
  const lowestKnee = measurable.reduce((lowest, sample) => (
    !lowest || sample.kneeHeight < lowest.kneeHeight ? sample : lowest
  ), null);
  const kneeling = measurable.filter((sample) => sample.kneeHeight < kneelingKneeHeightMeters);
  const kneelingFrameRatio = measurable.length ? kneeling.length / measurable.length : 1;
  if (!lowestHead || lowestHead.headHeight < minHeadHeightMeters) {
    failures.push(
      `GUARD_BREAK head dropped to ${round(lowestHead?.headHeight)}m at ${round(lowestHead?.time, 3)}s (minimum ${minHeadHeightMeters}m)`,
    );
  }
  if (kneelingFrameRatio > maxKneelingFrameRatio) {
    failures.push(
      `GUARD_BREAK held a knee below ${kneelingKneeHeightMeters}m for ${round(kneelingFrameRatio * 100, 2)}% of central frames (limit ${maxKneelingFrameRatio * 100}%)`,
    );
  }
  return {
    pass: failures.length === 0,
    totalSamples: frames.length,
    centralSamples: central.length,
    lowestHead: lowestHead ? { time: round(lowestHead.time, 3), meters: round(lowestHead.headHeight) } : null,
    lowestKnee: lowestKnee ? { time: round(lowestKnee.time, 3), meters: round(lowestKnee.kneeHeight) } : null,
    kneelingFrames: kneeling.length,
    kneelingFrameRatio: round(kneelingFrameRatio),
    limits: { minHeadHeightMeters, kneelingKneeHeightMeters, maxKneelingFrameRatio },
    failures,
  };
}

/**
 * Require a critical victim to play one continuous authored outcome through
 * its configured end and return to ready. Optional floor/prone and recovered-
 * height bounds remain available for knockdown sources; standing hit or paired
 * reactions intentionally omit those incompatible checks.
 */
export function evaluateCriticalRecovery(telemetry, {
  animation = "CRITICAL_KNOCKDOWN",
  minStartClipTimeSeconds = 0,
  maxStartClipTimeSeconds = 0.08,
  minEndClipTimeSeconds = 3.8,
  floorContactStartClipTimeSeconds,
  floorContactEndClipTimeSeconds,
  maxFloorSurfaceGapMeters = 0.12,
  maxProneHeadHeightMeters = 0.9,
  recoveredPoseStartClipTimeSeconds,
  minRecoveredHeadHeightMeters = 1.3,
  maxClipStepSeconds = 0.15,
  predecessorAnimation = null,
  transitionWindowSeconds = 0.25,
  maxTransitionBonePositionStepMeters = 0.18,
  maxTransitionBoneAngularStepDegrees = 30,
} = {}) {
  const failures = [];
  const allEnemyFrames = actorFrames(telemetry.visualFrames ?? [], "enemy");
  const frames = allEnemyFrames.filter(({ sample }) => sample.animation === animation);
  if (frames.length < 5) {
    return { pass: false, animation, failures: [`critical recovery lacks rendered ${animation} samples`] };
  }

  const startClipTime = frames[0].sample.clipTime;
  const endClipTime = Math.max(...frames.map(({ sample }) => sample.clipTime));
  if (!finite(startClipTime)
    || startClipTime < minStartClipTimeSeconds
    || startClipTime > maxStartClipTimeSeconds) {
    failures.push(
      `${animation} began at clip time ${round(startClipTime)}s (expected ${minStartClipTimeSeconds}–${maxStartClipTimeSeconds}s)`,
    );
  }
  if (!finite(endClipTime) || endClipTime < minEndClipTimeSeconds) {
    failures.push(`${animation} ended at clip time ${round(endClipTime)}s before ${minEndClipTimeSeconds}s recovery boundary`);
  }

  let largestClipStep = 0;
  let largestClipStepAt = null;
  let previous = null;
  for (const frame of frames) {
    if (previous && frame.time - previous.time <= MAX_CONTIGUOUS_FRAME_GAP_SECONDS) {
      const step = frame.sample.clipTime - previous.sample.clipTime;
      if (step < -0.01) {
        failures.push(`${animation} clip clock moved backwards by ${round(-step)}s at ${round(frame.time, 3)}s`);
        break;
      }
      if (step > largestClipStep) {
        largestClipStep = step;
        largestClipStepAt = frame.time;
      }
    }
    previous = frame;
  }
  if (largestClipStep > maxClipStepSeconds) {
    failures.push(
      `${animation} skipped ${round(largestClipStep)}s of authored motion at ${round(largestClipStepAt, 3)}s (limit ${maxClipStepSeconds}s)`,
    );
  }

  let floorFrames = [];
  let closestFloor = null;
  let lowestHead = null;
  const checksFloorPhase = finite(floorContactStartClipTimeSeconds)
    && finite(floorContactEndClipTimeSeconds);
  if ((finite(floorContactStartClipTimeSeconds) || finite(floorContactEndClipTimeSeconds))
    && !checksFloorPhase) {
    failures.push(`${animation} floor phase requires both start and end clip times`);
  }
  if (checksFloorPhase) {
    floorFrames = frames.filter(({ sample }) => (
      sample.clipTime >= floorContactStartClipTimeSeconds
      && sample.clipTime <= floorContactEndClipTimeSeconds
    ));
    const measurableFloorFrames = floorFrames.filter(({ sample }) => (
      finite(sample.meshGap) && sample.bones?.head?.position && finite(sample.groundY)
    ));
    closestFloor = measurableFloorFrames.reduce((closest, frame) => (
      !closest || frame.sample.meshGap < closest.sample.meshGap ? frame : closest
    ), null);
    lowestHead = measurableFloorFrames.reduce((lowest, frame) => {
      const height = frame.sample.bones.head.position[1] - frame.sample.groundY;
      return !lowest || height < lowest.height ? { frame, height } : lowest;
    }, null);
    if (!closestFloor || closestFloor.sample.meshGap > maxFloorSurfaceGapMeters) {
      failures.push(
        `${animation} never visibly reached the support plane during its floor phase (closest gap ${round(closestFloor?.sample.meshGap)}m; limit ${maxFloorSurfaceGapMeters}m)`,
      );
    }
    if (!lowestHead || lowestHead.height > maxProneHeadHeightMeters) {
      failures.push(
        `${animation} never reached a credible prone pose (lowest head ${round(lowestHead?.height)}m; limit ${maxProneHeadHeightMeters}m)`,
      );
    }
  }

  let recoveredHead = null;
  if (finite(recoveredPoseStartClipTimeSeconds)) {
    const recoveredFrames = frames.filter(({ sample }) => (
      sample.clipTime >= recoveredPoseStartClipTimeSeconds
      && sample.bones?.head?.position
      && finite(sample.groundY)
    ));
    recoveredHead = recoveredFrames.reduce((highest, frame) => (
      Math.max(highest, frame.sample.bones.head.position[1] - frame.sample.groundY)
    ), Number.NEGATIVE_INFINITY);
    if (!finite(recoveredHead) || recoveredHead < minRecoveredHeadHeightMeters) {
      failures.push(
        `${animation} did not visibly recover to standing (highest late head ${round(recoveredHead)}m; minimum ${minRecoveredHeadHeightMeters}m)`,
      );
    }
  }

  const forbidden = [...new Set(
    allEnemyFrames
      .map(({ sample }) => sample.animation)
      .filter((observed) => observed === "DEATH" || observed === "GET_UP" || observed === "RIPOSTED"),
  )];
  if (forbidden.length) {
    failures.push(`critical recovery re-entered obsolete splice action(s): ${forbidden.join(", ")}`);
  }
  const returnedToIdle = allEnemyFrames.some(({ time, sample }) => (
    time > frames.at(-1).time && sample.animation === "SWORD_IDLE"
  ));
  if (!returnedToIdle) failures.push(`${animation} never completed into a rendered SWORD_IDLE recovery`);

  let transition = null;
  if (predecessorAnimation) {
    const first = frames[0];
    const preceding = allEnemyFrames.filter(({ time }) => time < first.time).at(-1) ?? null;
    const window = allEnemyFrames.filter(({ time }) => (
      time >= (preceding?.time ?? first.time) && time <= first.time + transitionWindowSeconds
    ));
    let worstPosition = null;
    let worstAngle = null;
    for (let index = 1; index < window.length; index += 1) {
      const prior = window[index - 1];
      const current = window[index];
      if (current.time - prior.time > MAX_CONTIGUOUS_FRAME_GAP_SECONDS) continue;
      const priorPelvis = prior.sample.bones?.pelvis?.position;
      const currentPelvis = current.sample.bones?.pelvis?.position;
      for (const [bone, point] of Object.entries(current.sample.bones ?? {})) {
        if (bone === "pelvis") continue;
        const priorPoint = prior.sample.bones?.[bone];
        if (!priorPoint) continue;
        const angular = quaternionAngularDistanceDegrees(priorPoint.quaternion, point.quaternion);
        if (!worstAngle || angular > worstAngle.value) {
          worstAngle = { bone, value: angular, time: current.time };
        }
        if (priorPelvis && currentPelvis) {
          const priorRelative = priorPoint.position.map((value, axis) => value - priorPelvis[axis]);
          const currentRelative = point.position.map((value, axis) => value - currentPelvis[axis]);
          const position = distance3(priorRelative, currentRelative);
          if (!worstPosition || position > worstPosition.value) {
            worstPosition = { bone, value: position, time: current.time };
          }
        }
      }
    }
    if (!preceding || preceding.sample.animation !== predecessorAnimation) {
      failures.push(
        `${animation} did not hand off directly from rendered ${predecessorAnimation} (observed ${preceding?.sample.animation ?? "no predecessor"})`,
      );
    }
    if (!worstPosition) {
      failures.push(`${predecessorAnimation}→${animation} transition lacks pelvis-relative bone samples`);
    } else if (worstPosition.value > maxTransitionBonePositionStepMeters) {
      failures.push(
        `${predecessorAnimation}→${animation} moved ${worstPosition.bone} ${round(worstPosition.value)}m in one frame at ${round(worstPosition.time, 3)}s (limit ${maxTransitionBonePositionStepMeters}m)`,
      );
    }
    if (!worstAngle) {
      failures.push(`${predecessorAnimation}→${animation} transition lacks bone rotation samples`);
    } else if (worstAngle.value > maxTransitionBoneAngularStepDegrees) {
      failures.push(
        `${predecessorAnimation}→${animation} rotated ${worstAngle.bone} ${round(worstAngle.value)}° in one frame at ${round(worstAngle.time, 3)}s (limit ${maxTransitionBoneAngularStepDegrees}°)`,
      );
    }
    transition = {
      predecessorAnimation,
      firstTime: round(first.time, 3),
      previousTime: preceding ? round(preceding.time, 3) : null,
      previousAnimation: preceding?.sample.animation ?? null,
      samples: window.length,
      worstPelvisRelativePositionStep: worstPosition ? {
        bone: worstPosition.bone,
        meters: round(worstPosition.value),
        time: round(worstPosition.time, 3),
      } : null,
      worstAngularStep: worstAngle ? {
        bone: worstAngle.bone,
        degrees: round(worstAngle.value),
        time: round(worstAngle.time, 3),
      } : null,
    };
  }

  return {
    pass: failures.length === 0,
    animation,
    samples: frames.length,
    startClipTimeSeconds: round(startClipTime),
    endClipTimeSeconds: round(endClipTime),
    largestClipStep: {
      seconds: round(largestClipStep),
      time: largestClipStepAt === null ? null : round(largestClipStepAt, 3),
    },
    floorPhase: checksFloorPhase ? {
      samples: floorFrames.length,
      closestSurfaceGapMeters: round(closestFloor?.sample.meshGap),
      closestSurfaceTime: closestFloor ? round(closestFloor.time, 3) : null,
      lowestHeadHeightMeters: round(lowestHead?.height),
      lowestHeadTime: lowestHead ? round(lowestHead.frame.time, 3) : null,
    } : null,
    recoveredHeadHeightMeters: round(recoveredHead),
    returnedToIdle,
    transition,
    forbiddenAnimations: forbidden,
    limits: {
      minStartClipTimeSeconds,
      maxStartClipTimeSeconds,
      minEndClipTimeSeconds,
      floorContactStartClipTimeSeconds,
      floorContactEndClipTimeSeconds,
      maxFloorSurfaceGapMeters,
      maxProneHeadHeightMeters,
      recoveredPoseStartClipTimeSeconds,
      minRecoveredHeadHeightMeters,
      maxClipStepSeconds,
      predecessorAnimation,
      transitionWindowSeconds,
      maxTransitionBonePositionStepMeters,
      maxTransitionBoneAngularStepDegrees,
    },
    failures,
  };
}

/** Require a lethal critical to reach one audited prone pose and hold it. */
export function evaluateCriticalDeathHold(telemetry, {
  actor = "enemy",
  animation = "CRITICAL_DEATH",
  minStartClipTimeSeconds = 1.35,
  maxStartClipTimeSeconds = 1.5,
  minEndClipTimeSeconds = 1.85,
  maxEndClipTimeSeconds = 1.91,
  floorContactStartClipTimeSeconds = 1.65,
  maxFloorSurfaceGapMeters = 0.12,
  maxProneHeadHeightMeters = 0.9,
  minProneHoldSeconds = 1,
  maxClipStepSeconds = 0.15,
  forbiddenRecoveryAnimations = ["SWORD_IDLE", "GET_UP", "DEATH"],
} = {}) {
  const failures = [];
  const allActorFrames = actorFrames(telemetry.visualFrames ?? [], actor);
  const frames = allActorFrames.filter(({ sample }) => sample.animation === animation);
  if (frames.length < 5) {
    return { pass: false, animation, failures: [`critical death lacks rendered ${animation} samples`] };
  }
  const startClipTime = frames[0].sample.clipTime;
  const endClipTime = Math.max(...frames.map(({ sample }) => sample.clipTime));
  if (!finite(startClipTime) || startClipTime < minStartClipTimeSeconds || startClipTime > maxStartClipTimeSeconds) {
    failures.push(`${animation} began at ${round(startClipTime)}s (expected ${minStartClipTimeSeconds}–${maxStartClipTimeSeconds}s)`);
  }
  if (!finite(endClipTime) || endClipTime < minEndClipTimeSeconds || endClipTime > maxEndClipTimeSeconds) {
    failures.push(`${animation} ended at ${round(endClipTime)}s (expected ${minEndClipTimeSeconds}–${maxEndClipTimeSeconds}s)`);
  }

  let largestClipStep = 0;
  let largestClipStepAt = null;
  for (let index = 1; index < frames.length; index += 1) {
    const prior = frames[index - 1];
    const current = frames[index];
    if (current.time - prior.time > MAX_CONTIGUOUS_FRAME_GAP_SECONDS) continue;
    const step = current.sample.clipTime - prior.sample.clipTime;
    if (step < -0.01) failures.push(`${animation} clip clock moved backwards at ${round(current.time, 3)}s`);
    if (step > largestClipStep) {
      largestClipStep = step;
      largestClipStepAt = current.time;
    }
  }
  if (largestClipStep > maxClipStepSeconds) {
    failures.push(`${animation} skipped ${round(largestClipStep)}s at ${round(largestClipStepAt, 3)}s (limit ${maxClipStepSeconds}s)`);
  }

  const floorFrames = frames.filter(({ sample }) => sample.clipTime >= floorContactStartClipTimeSeconds);
  const closestFloor = floorFrames.reduce((closest, frame) => (
    finite(frame.sample.meshGap) && (!closest || frame.sample.meshGap < closest.sample.meshGap) ? frame : closest
  ), null);
  const lowestHead = floorFrames.reduce((lowest, frame) => {
    const head = frame.sample.bones?.head?.position;
    if (!head || !finite(frame.sample.groundY)) return lowest;
    const height = head[1] - frame.sample.groundY;
    return !lowest || height < lowest.height ? { frame, height } : lowest;
  }, null);
  if (!closestFloor || closestFloor.sample.meshGap > maxFloorSurfaceGapMeters) {
    failures.push(`${animation} prone surface gap was ${round(closestFloor?.sample.meshGap)}m (limit ${maxFloorSurfaceGapMeters}m)`);
  }
  if (!lowestHead || lowestHead.height > maxProneHeadHeightMeters) {
    failures.push(`${animation} prone head height was ${round(lowestHead?.height)}m (limit ${maxProneHeadHeightMeters}m)`);
  }

  const held = frames.filter(({ sample }) => sample.clipTime >= minEndClipTimeSeconds);
  const heldSeconds = held.length > 1 ? held.at(-1).time - held[0].time : 0;
  if (heldSeconds < minProneHoldSeconds) {
    failures.push(`${animation} held its prone out-point for only ${round(heldSeconds)}s (minimum ${minProneHoldSeconds}s)`);
  }
  const outcomeStart = frames[0].time;
  const forbidden = [...new Set(allActorFrames
    .filter((frame) => frame.time >= outcomeStart)
    .map(({ sample }) => sample.animation)
    .filter((observed) => forbiddenRecoveryAnimations.includes(observed)))];
  if (forbidden.length) failures.push(`lethal critical entered forbidden recovery action(s): ${forbidden.join(", ")}`);

  return {
    pass: failures.length === 0,
    actor,
    animation,
    samples: frames.length,
    startClipTimeSeconds: round(startClipTime),
    endClipTimeSeconds: round(endClipTime),
    heldProneSeconds: round(heldSeconds),
    largestClipStep: { seconds: round(largestClipStep), time: largestClipStepAt === null ? null : round(largestClipStepAt, 3) },
    closestFloorGapMeters: round(closestFloor?.sample.meshGap),
    lowestHeadHeightMeters: round(lowestHead?.height),
    forbiddenAnimations: forbidden,
    limits: {
      minStartClipTimeSeconds,
      maxStartClipTimeSeconds,
      minEndClipTimeSeconds,
      maxEndClipTimeSeconds,
      floorContactStartClipTimeSeconds,
      maxFloorSurfaceGapMeters,
      maxProneHeadHeightMeters,
      minProneHoldSeconds,
      maxClipStepSeconds,
      forbiddenRecoveryAnimations,
    },
    failures,
  };
}
