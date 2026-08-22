const FRAME_BOUNDARY_EPSILON_SECONDS = 1e-6;

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * FFprobe exposes absolute container timestamps while FFmpeg's decoded filter
 * clock starts at the first frame. Rebase once so evidence-window planning and
 * frame-ordinal selection use the same clock.
 */
export function normalizeRecordingFrameTimes(frameTimes) {
  if (!Array.isArray(frameTimes) || frameTimes.length === 0 || frameTimes.some((time) => !finite(time))) {
    throw new TypeError("recording frame times must be a non-empty array of finite numbers");
  }
  for (let index = 1; index < frameTimes.length; index += 1) {
    if (frameTimes[index] < frameTimes[index - 1]) {
      throw new TypeError("recording frame times must be chronological");
    }
  }
  const first = frameTimes[0];
  return frameTimes.map((time) => Math.max(0, time - first));
}

function markerRuns(markerFrames) {
  const runs = [];
  let current = [];
  for (let sourceFrame = 0; sourceFrame < markerFrames.length; sourceFrame += 1) {
    const markerFrame = markerFrames[sourceFrame];
    if (!Number.isInteger(markerFrame) || markerFrame < 0) {
      if (current.length) runs.push(current);
      current = [];
      continue;
    }
    if (current.length && markerFrame < current.at(-1).markerFrame) {
      runs.push(current);
      current = [];
    }
    current.push({ sourceFrame, markerFrame });
  }
  if (current.length) runs.push(current);
  return runs;
}

/**
 * Build a CFR recording from the simulation index encoded into the composited
 * browser pixels themselves. Every target index must exist exactly in one
 * complete monotonic run: an ambiguous crop, recorder skip, stale prefix, or
 * constant telemetry/pixel offset is rejected rather than estimated.
 */
export function buildInPixelFramePlan(
  recordingFrameTimes,
  markerFrames,
  simulationDuration,
  { framesPerSecond = 30 } = {},
) {
  if (!Array.isArray(recordingFrameTimes) || recordingFrameTimes.length === 0
    || recordingFrameTimes.some((time) => !finite(time))) {
    throw new TypeError("in-pixel recording alignment needs finite decoded frame times");
  }
  if (!Array.isArray(markerFrames) || markerFrames.length !== recordingFrameTimes.length) {
    throw new TypeError("in-pixel recording alignment needs one marker result per decoded frame");
  }
  if (!finite(simulationDuration) || simulationDuration <= 0
    || !Number.isInteger(framesPerSecond) || framesPerSecond <= 0 || framesPerSecond > 120) {
    throw new TypeError("in-pixel recording alignment needs a positive duration and integer frame rate");
  }
  for (let index = 1; index < recordingFrameTimes.length; index += 1) {
    if (recordingFrameTimes[index] < recordingFrameTimes[index - 1]) {
      throw new TypeError("decoded frame times must be chronological");
    }
  }

  const outputFrameCount = Math.max(
    1,
    Math.ceil(simulationDuration * framesPerSecond - FRAME_BOUNDARY_EPSILON_SECONDS),
  );
  const lastTargetFrame = outputFrameCount - 1;
  const runs = markerRuns(markerFrames);
  const candidates = runs.filter((run) => (
    run.some(({ markerFrame }) => markerFrame === 0)
    && run.some(({ markerFrame }) => markerFrame >= lastTargetFrame)
  ));
  if (!candidates.length) {
    const observed = runs.map((run) => `${run[0].markerFrame}..${run.at(-1).markerFrame}`).join(", ") || "none";
    throw new Error(
      `No complete in-pixel frame-marker run covers 0..${lastTargetFrame}; observed ${observed}`,
    );
  }

  // React development resets can leave an earlier partial/full run in the raw
  // page recording. Telemetry survives only the final reset, so use the last
  // complete code run and reject any imperfection inside its selected window.
  const run = candidates.at(-1);
  const firstZeroIndex = run.findIndex(({ markerFrame }) => markerFrame === 0);
  const lastTargetIndex = run.findIndex(({ markerFrame }, index) => (
    index >= firstZeroIndex && markerFrame >= lastTargetFrame
  ));
  const selectedRun = run.slice(firstZeroIndex, lastTargetIndex + 1);
  const buckets = new Map();
  for (const entry of selectedRun) {
    if (entry.markerFrame > lastTargetFrame) break;
    const bucket = buckets.get(entry.markerFrame) ?? [];
    bucket.push(entry);
    buckets.set(entry.markerFrame, bucket);
  }
  const missing = Array.from(
    { length: outputFrameCount },
    (_, frame) => frame,
  ).filter((frame) => !buckets.has(frame));
  if (missing.length) {
    throw new Error(
      `In-pixel frame-marker run is missing simulation frame code(s): ${missing.join(", ")}`,
    );
  }

  const frames = Array.from({ length: outputFrameCount }, (_, outputFrame) => {
    // Take the last stable composite carrying this code, immediately before
    // the compositor advances to the next production simulation pose.
    const source = buckets.get(outputFrame).at(-1);
    return {
      outputFrame,
      simulationTime: outputFrame / framesPerSecond,
      sourceFrame: source.sourceFrame,
      sourceRecordingTime: recordingFrameTimes[source.sourceFrame],
      sourceMarkerFrame: source.markerFrame,
      sourceSimulationTime: source.markerFrame / framesPerSecond,
      simulationError: 0,
    };
  });
  for (let index = 1; index < frames.length; index += 1) {
    if (frames[index].sourceFrame <= frames[index - 1].sourceFrame) {
      throw new Error("In-pixel frame-marker selections are not strictly chronological");
    }
  }
  const selectedSourceFrames = frames.map(({ sourceFrame }) => sourceFrame);
  return {
    strategy: "in-pixel-simulation-frame-marker",
    framesPerSecond,
    simulationDuration,
    outputFrameCount,
    outputDuration: outputFrameCount / framesPerSecond,
    firstSourceFrame: selectedSourceFrames[0],
    lastSourceFrame: selectedSourceFrames.at(-1),
    uniqueSourceFrameCount: selectedSourceFrames.length,
    selectedSourceFrames,
    maximumSimulationError: 0,
    skippedRawPrefixFrames: selectedSourceFrames[0],
    frames,
  };
}

/**
 * Prove that semantic state telemetry was serialized after the probed actor
 * pose for the same fixed-step index. This catches a one-frame parent/child
 * useFrame ordering error even when the in-pixel code itself is perfect.
 */
export function validateRenderedFrameIdentity(
  visualFrames,
  events,
  { framesPerSecond = 30 } = {},
) {
  if (!Array.isArray(visualFrames) || visualFrames.length === 0 || !Array.isArray(events)) {
    throw new TypeError("rendered frame identity needs visual frames and semantic events");
  }
  for (const [index, frame] of visualFrames.entries()) {
    const expectedFrame = Math.round(frame.time * framesPerSecond);
    if (frame.simulationFrame !== expectedFrame) {
      throw new Error(
        `Telemetry frame ${index} labels ${frame.time}s as ${frame.simulationFrame}; expected ${expectedFrame}`,
      );
    }
    if (index === 0 && frame.simulationFrame !== 0) {
      throw new Error(`Telemetry begins at simulation frame ${frame.simulationFrame}; expected frame 0`);
    }
    if (index > 0 && frame.simulationFrame !== visualFrames[index - 1].simulationFrame + 1) {
      throw new Error(
        `Telemetry frame codes are missing or nonmonotonic at ${visualFrames[index - 1].simulationFrame} → ${frame.simulationFrame}`,
      );
    }
  }
  const framesByIndex = new Map(visualFrames.map((frame) => [frame.simulationFrame, frame]));
  return events.map((event, index) => {
    const simulationFrame = Math.round(event.time * framesPerSecond);
    const rendered = framesByIndex.get(simulationFrame);
    if (!rendered) throw new Error(`Semantic event ${index} has no rendered telemetry frame ${simulationFrame}`);
    for (const actor of ["player", "enemy"]) {
      const pose = rendered[actor];
      const expectedAnimation = event[`${actor}Animation`];
      if (pose && pose.animation !== expectedAnimation) {
        throw new Error(
          `Semantic event ${index} ${actor} says ${expectedAnimation} at frame ${simulationFrame}, `
          + `but the final rendered probe is ${pose.animation}`,
        );
      }
    }
    return {
      event: index,
      time: event.time,
      simulationFrame,
      playerAnimation: rendered.player?.animation ?? null,
      enemyAnimation: rendered.enemy?.animation ?? null,
    };
  });
}

/**
 * Resolve a half-open evidence window to real source-frame ordinals. The
 * caller can pass those ordinals to FFmpeg's `select` filter, avoiding both
 * timestamp-rounding disagreement and any need to clone/pad a short tile.
 */
export function resolveRealFrameWindow(
  frameTimes,
  segment,
  { minimum = 1, maximum = 60, label = "frame evidence" } = {},
) {
  if (!Array.isArray(frameTimes) || frameTimes.length === 0) {
    throw new TypeError(`${label} needs recording frame times`);
  }
  if (!finite(segment?.start) || !finite(segment?.duration) || segment.duration <= 0) {
    throw new TypeError(`${label} needs a finite start and positive duration`);
  }
  const end = segment.start + segment.duration;
  const reachesRecordingEnd = end >= frameTimes.at(-1) - FRAME_BOUNDARY_EPSILON_SECONDS;
  const indices = [];
  for (let index = 0; index < frameTimes.length; index += 1) {
    const time = frameTimes[index];
    if (time >= segment.start - FRAME_BOUNDARY_EPSILON_SECONDS
      && (time < end - FRAME_BOUNDARY_EPSILON_SECONDS
        || (reachesRecordingEnd && time <= end + FRAME_BOUNDARY_EPSILON_SECONDS))) {
      indices.push(index);
    }
  }
  if (indices.length < minimum) {
    throw new Error(
      `${label} has ${indices.length} real recording frame(s) in ${segment.start}s–${end.toFixed(3)}s; minimum ${minimum}`,
    );
  }
  if (indices.length > maximum) {
    throw new Error(`${label} has ${indices.length} real frames; split evidence windows at one second or less`);
  }
  return {
    count: indices.length,
    firstFrameIndex: indices[0],
    lastFrameIndex: indices.at(-1),
    firstFrameTime: frameTimes[indices[0]],
    lastFrameTime: frameTimes[indices.at(-1)],
  };
}

/** A transition strip is invalid unless its real frames straddle the edge. */
export function resolveRealTransitionFrameWindow(
  frameTimes,
  segment,
  { minimum = 2, maximum = 60, label = "transition frame evidence" } = {},
) {
  if (!finite(segment?.transitionTime)) {
    throw new TypeError(`${label} needs a finite transitionTime`);
  }
  const window = resolveRealFrameWindow(frameTimes, segment, { minimum, maximum, label });
  let beforeTransitionFrames = 0;
  let atOrAfterTransitionFrames = 0;
  for (let index = window.firstFrameIndex; index <= window.lastFrameIndex; index += 1) {
    if (frameTimes[index] < segment.transitionTime - FRAME_BOUNDARY_EPSILON_SECONDS) {
      beforeTransitionFrames += 1;
    } else {
      atOrAfterTransitionFrames += 1;
    }
  }
  if (beforeTransitionFrames === 0 || atOrAfterTransitionFrames === 0) {
    throw new Error(
      `${label} does not straddle ${segment.transitionTime}s `
      + `(${beforeTransitionFrames} before, ${atOrAfterTransitionFrames} at/after)`,
    );
  }
  return { ...window, beforeTransitionFrames, atOrAfterTransitionFrames };
}
