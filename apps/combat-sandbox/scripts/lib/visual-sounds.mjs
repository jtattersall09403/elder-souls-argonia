/**
 * The sound events a scene emitted against its expectation, from the
 * runtime's `soundEvents` telemetry (counts by event type, decision 0095).
 * Each expected type is an exact count or an inclusive [min, max] range;
 * types the expectation does not name are not held to anything. The expected
 * counts are written before the run, their reasoning beside them in
 * visualScenarioExpectations.json.
 *
 * Returns the failures and the counts as measured.
 */
export function evaluateSounds(scenario, telemetry, expected) {
  const counts = telemetry?.soundEvents;
  if (!counts || typeof counts !== "object") return { failures: [`${scenario}: no soundEvents telemetry`], measured: null };
  const failures = [];
  for (const [type, want] of Object.entries(expected)) {
    const got = counts[type] ?? 0;
    const [min, max] = Array.isArray(want) ? want : [want, want];
    if (got < min || got > max) {
      failures.push(`${scenario}: ${type} fired ${got}, expected ${min === max ? min : `${min}-${max}`}`);
    }
  }
  return { failures, measured: counts };
}
