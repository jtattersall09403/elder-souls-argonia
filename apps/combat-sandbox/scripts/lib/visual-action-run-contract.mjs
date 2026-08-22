const ACTION_FIELD = Object.freeze({
  player: "playerAction",
  enemy: "enemyAction",
});

function actionField(actor) {
  const field = ACTION_FIELD[actor];
  if (!field) throw new TypeError(`actor must be player or enemy; received ${actor}`);
  return field;
}

/**
 * Compress the production FSM snapshots in telemetry.events into an exact,
 * chronological action path. Animation-only event changes do not split a run.
 */
export function extractActionRuns(telemetry, actor) {
  const field = actionField(actor);
  if (!Array.isArray(telemetry?.events)) {
    throw new TypeError("telemetry.events must be an array");
  }

  const runs = [];
  let previousTime = -Infinity;
  for (const [eventIndex, event] of telemetry.events.entries()) {
    if (typeof event?.[field] !== "string" || event[field].length === 0) {
      throw new TypeError(`telemetry event ${eventIndex + 1} needs a non-empty ${field}`);
    }
    if (typeof event.time !== "number" || !Number.isFinite(event.time)) {
      throw new TypeError(`telemetry event ${eventIndex + 1} needs a finite time`);
    }
    if (event.time < previousTime) {
      throw new TypeError(`telemetry event ${eventIndex + 1} is out of chronological order`);
    }
    previousTime = event.time;

    const current = runs.at(-1);
    if (current?.state === event[field]) {
      current.end = event.time;
      current.eventSamples += 1;
      continue;
    }
    runs.push({
      actor,
      index: runs.length,
      state: event[field],
      start: event.time,
      end: event.time,
      eventSamples: 1,
    });
  }
  return runs;
}

/** Require the complete FSM path: no missing action, detour, or re-entry. */
export function compareActionRunPath({ telemetry, actor, requiredRuns }) {
  actionField(actor);
  if (!Array.isArray(requiredRuns)) throw new TypeError("requiredRuns must be an array");
  for (const [index, state] of requiredRuns.entries()) {
    if (typeof state !== "string" || state.length === 0) {
      throw new TypeError(`required action run ${index + 1} needs a non-empty state`);
    }
  }

  const runs = extractActionRuns(telemetry, actor);
  const observedStates = runs.map(({ state }) => state);
  const failures = [];
  const sharedLength = Math.min(requiredRuns.length, observedStates.length);

  for (let index = 0; index < sharedLength; index += 1) {
    if (requiredRuns[index] !== observedStates[index]) {
      failures.push(`action run ${index + 1} expected ${requiredRuns[index]}, observed ${observedStates[index]}`);
    }
  }
  if (observedStates.length < requiredRuns.length) {
    failures.push(`missing action run(s): ${requiredRuns.slice(observedStates.length).join(" -> ")}`);
  } else if (observedStates.length > requiredRuns.length) {
    failures.push(`unexpected action run(s): ${observedStates.slice(requiredRuns.length).join(" -> ")}`);
  }

  return {
    pass: failures.length === 0,
    actor,
    expectedStates: [...requiredRuns],
    observedStates,
    runs,
    failures,
  };
}
