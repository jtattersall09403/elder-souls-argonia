const DEFAULT_MIN_SAMPLES = 3;
const DEFAULT_MAX_FRAME_GAP_SECONDS = 0.12;
const DEFAULT_EVIDENCE_CHUNK_SECONDS = 1;

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function round(value, digits = 5) {
  return finite(value) ? Number(value.toFixed(digits)) : value;
}

function actorFrames(telemetry, actor) {
  return (Array.isArray(telemetry?.visualFrames) ? telemetry.visualFrames : [])
    .map((frame) => ({ time: frame?.time, sample: frame?.[actor] }))
    .filter(({ time, sample }) => finite(time) && typeof sample?.animation === "string");
}

function runId(actor, index, state, occurrence) {
  return `${actor}:${String(index + 1).padStart(2, "0")}:${state}#${occurrence}`;
}

function edgeId(actor, index, from, to) {
  return `${actor}:${String(index + 1).padStart(2, "0")}:${from.state}#${from.occurrence}->${to.state}#${to.occurrence}`;
}

/**
 * Compress final rendered samples into semantic animation runs.
 *
 * `commandSerial` distinguishes a deliberate same-semantic restart from a
 * looping clip-time wrap. Both are visible in source time; only the former is
 * a new transition that needs its own boundary evidence and review verdict.
 */
export function extractRenderedRuns(telemetry, actor) {
  const frames = actorFrames(telemetry, actor);
  const occurrences = new Map();
  const runs = [];
  let current = null;

  for (const frame of frames) {
    const state = frame.sample.animation;
    const commandSerial = finite(frame.sample.commandSerial) ? frame.sample.commandSerial : null;
    const commandRestarted = current
      && commandSerial !== null
      && current.commandSerial !== null
      && commandSerial !== current.commandSerial;
    if (!current || current.state !== state || commandRestarted) {
      const occurrence = (occurrences.get(state) ?? 0) + 1;
      occurrences.set(state, occurrence);
      current = {
        id: runId(actor, runs.length, state, occurrence),
        actor,
        index: runs.length,
        state,
        occurrence,
        commandSerial,
        start: frame.time,
        end: frame.time,
        duration: 0,
        samples: 1,
        startClipTime: finite(frame.sample.clipTime) ? frame.sample.clipTime : null,
        endClipTime: finite(frame.sample.clipTime) ? frame.sample.clipTime : null,
        minClipTime: finite(frame.sample.clipTime) ? frame.sample.clipTime : null,
        maxClipTime: finite(frame.sample.clipTime) ? frame.sample.clipTime : null,
        maxFrameGap: 0,
      };
      runs.push(current);
      continue;
    }

    const frameGap = frame.time - current.end;
    current.end = frame.time;
    current.duration = current.end - current.start;
    current.samples += 1;
    current.maxFrameGap = Math.max(current.maxFrameGap, frameGap);
    if (finite(frame.sample.clipTime)) {
      current.endClipTime = frame.sample.clipTime;
      current.minClipTime = current.minClipTime == null
        ? frame.sample.clipTime
        : Math.min(current.minClipTime, frame.sample.clipTime);
      current.maxClipTime = current.maxClipTime == null
        ? frame.sample.clipTime
        : Math.max(current.maxClipTime, frame.sample.clipTime);
    }
  }

  return runs.map((run) => ({
    ...run,
    start: round(run.start, 3),
    end: round(run.end, 3),
    duration: round(run.end - run.start, 3),
    startClipTime: round(run.startClipTime),
    endClipTime: round(run.endClipTime),
    minClipTime: round(run.minClipTime),
    maxClipTime: round(run.maxClipTime),
    maxFrameGap: round(run.maxFrameGap),
  }));
}

/** Build occurrence-aware adjacent edges from an ordered rendered/run contract. */
export function buildRunEdges(runs) {
  return runs.slice(1).map((to, index) => {
    const from = runs[index];
    return {
      id: edgeId(from.actor, index, from, to),
      actor: from.actor,
      index,
      from: from.state,
      fromOccurrence: from.occurrence,
      fromCommandSerial: from.commandSerial ?? null,
      to: to.state,
      toOccurrence: to.occurrence,
      toCommandSerial: to.commandSerial ?? null,
      transitionTime: finite(to.start) ? to.start : null,
      sampleGap: finite(to.start) && finite(from.end) ? round(to.start - from.end) : null,
    };
  });
}

function normalizeRequirement(requirement, index) {
  const normalized = typeof requirement === "string" ? { state: requirement } : requirement;
  if (!normalized || typeof normalized.state !== "string" || normalized.state.length === 0) {
    throw new TypeError(`required animation run ${index + 1} needs a non-empty state`);
  }
  for (const field of ["minSamples", "minDurationSeconds", "minClipSpanSeconds"]) {
    if (normalized[field] !== undefined && (!finite(normalized[field]) || normalized[field] < 0)) {
      throw new TypeError(`required animation run ${index + 1} has invalid ${field}`);
    }
  }
  return normalized;
}

function requirementFailures(run, requirement, defaultMinSamples) {
  const failures = [];
  const minSamples = requirement.minSamples ?? defaultMinSamples;
  if (run.samples < minSamples) {
    failures.push(`${run.id} has ${run.samples} rendered samples (minimum ${minSamples})`);
  }
  if (requirement.minDurationSeconds !== undefined && run.duration < requirement.minDurationSeconds) {
    failures.push(`${run.id} lasts ${run.duration}s (minimum ${requirement.minDurationSeconds}s)`);
  }
  if (requirement.minClipSpanSeconds !== undefined) {
    const clipSpan = run.minClipTime == null || run.maxClipTime == null
      ? null
      : run.maxClipTime - run.minClipTime;
    if (clipSpan == null || clipSpan < requirement.minClipSpanSeconds) {
      failures.push(`${run.id} covers ${round(clipSpan)}s of source time (minimum ${requirement.minClipSpanSeconds}s)`);
    }
  }
  return failures;
}

/**
 * Require the complete rendered semantic path, not an unordered set or an
 * in-order subsequence. Unexpected detours and re-entry are therefore errors.
 */
export function compareRenderedRunPath({
  telemetry,
  actor,
  requiredRuns,
  defaultMinSamples = DEFAULT_MIN_SAMPLES,
  maxFrameGapSeconds = DEFAULT_MAX_FRAME_GAP_SECONDS,
  maxTransitionGapSeconds = DEFAULT_MAX_FRAME_GAP_SECONDS,
  requireCommandSerial = true,
}) {
  if (!Array.isArray(requiredRuns)) throw new TypeError("requiredRuns must be an array");
  const requirements = requiredRuns.map(normalizeRequirement);
  const runs = extractRenderedRuns(telemetry, actor);
  const edges = buildRunEdges(runs);
  const expectedStates = requirements.map(({ state }) => state);
  const observedStates = runs.map(({ state }) => state);
  const failures = [];

  if (requireCommandSerial) {
    const missingSerials = actorFrames(telemetry, actor)
      .filter(({ sample }) => !finite(sample.commandSerial)).length;
    if (missingSerials > 0) {
      failures.push(`${actor} render probe is missing commandSerial on ${missingSerials} sample(s)`);
    }
  }

  const sharedLength = Math.min(requirements.length, runs.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const expected = requirements[index];
    const observed = runs[index];
    if (observed.state !== expected.state) {
      failures.push(`run ${index + 1} expected ${expected.state}, observed ${observed.state}`);
      continue;
    }
    failures.push(...requirementFailures(observed, expected, defaultMinSamples));
    if (observed.maxFrameGap > maxFrameGapSeconds) {
      failures.push(`${observed.id} has a ${observed.maxFrameGap}s frame gap (maximum ${maxFrameGapSeconds}s)`);
    }
  }
  if (runs.length < requirements.length) {
    failures.push(`missing rendered run(s): ${expectedStates.slice(runs.length).join(" -> ")}`);
  } else if (runs.length > requirements.length) {
    failures.push(`unexpected rendered run(s): ${observedStates.slice(requirements.length).join(" -> ")}`);
  }
  for (const edge of edges) {
    if (finite(edge.sampleGap) && edge.sampleGap > maxTransitionGapSeconds) {
      failures.push(`${edge.id} has a ${edge.sampleGap}s transition sample gap (maximum ${maxTransitionGapSeconds}s)`);
    }
  }

  return {
    pass: failures.length === 0,
    actor,
    expectedStates,
    observedStates,
    runs,
    edges,
    failures,
  };
}

/** Chunk every required rendered run into chronological frame-review strips. */
export function buildRunEvidenceSegments(
  runs,
  scenarioDuration,
  maxChunkSeconds = DEFAULT_EVIDENCE_CHUNK_SECONDS,
) {
  if (!finite(scenarioDuration) || scenarioDuration <= 0) {
    throw new TypeError("scenarioDuration must be a positive number");
  }
  if (!finite(maxChunkSeconds) || maxChunkSeconds <= 0) {
    throw new TypeError("maxChunkSeconds must be a positive number");
  }
  const chunks = [];
  for (const run of [...runs].sort((first, second) => (
    first.start - second.start || first.actor.localeCompare(second.actor) || first.index - second.index
  ))) {
    const paddedStart = Math.max(0, run.start - 0.05);
    const paddedEnd = Math.min(scenarioDuration, Math.max(run.end + 0.05, paddedStart + 0.1));
    const evidenceSpan = paddedEnd - paddedStart;
    const chunkCount = Math.max(1, Math.ceil(evidenceSpan / maxChunkSeconds));
    for (let index = 0; index < chunkCount; index += 1) {
      // Partition the interval evenly. Fixed-width chunks can leave a final
      // sub-frame remainder (for example 3.017s -> 1s + 1s + 1s + 0.017s),
      // which is not an independently renderable real-frame artifact.
      const start = round(paddedStart + evidenceSpan * index / chunkCount, 3);
      const end = round(paddedStart + evidenceSpan * (index + 1) / chunkCount, 3);
      const part = index + 1;
      chunks.push({
        id: run.id,
        reviewId: `run:${run.id}:part:${part}-of-${chunkCount}`,
        actor: run.actor,
        animation: run.state,
        occurrence: run.occurrence,
        commandSerial: run.commandSerial,
        start,
        end,
        // Never extend a declared window beyond its real interval merely to
        // satisfy a nominal minimum duration.
        duration: round(end - start, 3),
        part,
        parts: chunkCount,
        sourceSamples: run.samples,
      });
    }
  }
  return chunks;
}

/** Build review windows around every occurrence-aware required handoff. */
export function buildRunTransitionSegments(runs, scenarioDuration, {
  beforeSeconds = 0.15,
  afterSeconds = 0.25,
} = {}) {
  if (!finite(scenarioDuration) || scenarioDuration <= 0) {
    throw new TypeError("scenarioDuration must be a positive number");
  }
  const segments = [];
  for (const edge of buildRunEdges(runs)) {
    const start = Math.max(0, edge.transitionTime - beforeSeconds);
    const end = Math.min(scenarioDuration, edge.transitionTime + afterSeconds);
    if (end <= start) continue;
    segments.push({
      id: edge.id,
      reviewId: `edge:${edge.id}`,
      actor: edge.actor,
      fromAnimation: edge.from,
      fromOccurrence: edge.fromOccurrence,
      fromCommandSerial: edge.fromCommandSerial,
      toAnimation: edge.to,
      toOccurrence: edge.toOccurrence,
      toCommandSerial: edge.toCommandSerial,
      transitionTime: edge.transitionTime,
      start: round(start, 3),
      end: round(end, 3),
      duration: round(end - start, 3),
    });
  }
  return segments;
}

