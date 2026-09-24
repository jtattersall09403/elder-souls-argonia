/**
 * The player's landed blows against a scene's expectation, from the runtime's
 * `playerHits` telemetry: the same number of blows, in order, each the named
 * attack from the named hand, its damage within the stated tolerance. The
 * expected damage is computed before the run and its formula sits beside it in
 * visualScenarioExpectations.json.
 *
 * Returns the failures and the blows as measured.
 */
export function evaluatePlayerHits(scenario, telemetry, expected) {
  const hits = telemetry?.playerHits;
  if (!Array.isArray(hits)) return { failures: [`${scenario}: no playerHits telemetry`], measured: null };
  const measured = hits.map(({ attack, hand, damage }) => ({ attack, hand, damage }));
  const failures = [];
  if (hits.length !== expected.length) {
    failures.push(`${scenario}: player blows ${expected.length} expected, ${hits.length} landed (${JSON.stringify(measured)})`);
  }
  expected.forEach((want, index) => {
    const got = hits[index];
    if (!got) return;
    if (got.attack !== want.attack) failures.push(`${scenario}: blow ${index + 1} attack ${got.attack}, expected ${want.attack}`);
    if (want.hand !== undefined && got.hand !== want.hand) failures.push(`${scenario}: blow ${index + 1} hand ${got.hand}, expected ${want.hand}`);
    if (!(Math.abs(got.damage - want.damage) <= want.tolerance)) {
      failures.push(`${scenario}: blow ${index + 1} ${got.attack} damage ${got.damage}, expected ${want.damage} ± ${want.tolerance}`);
    }
  });
  return { failures, measured };
}
