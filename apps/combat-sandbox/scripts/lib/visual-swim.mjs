/**
 * The swim scene's checks (decision 0093), from the runtime's per-frame
 * `swimSamples`: the player starts on dry ground, swims, has the weapon away
 * the whole time it swims, keeps its chest at the surface over deep water once
 * the entry has settled, and ends standing out of the water.
 *
 * Returns the failures and the measured numbers (worst settled chest error,
 * seconds swum), so a run reports what it saw as well as whether it passed.
 */
export function evaluateSwim(scenario, telemetry, expected) {
  const samples = telemetry?.swimSamples;
  if (!Array.isArray(samples) || samples.length === 0) {
    return { failures: [`${scenario}: no swim telemetry`], measured: null };
  }
  const failures = [];
  const first = samples[0];
  const last = samples.at(-1);
  if (expected.startsGrounded && (first.swimming || !first.grounded)) {
    failures.push(`${scenario}: player did not start grounded (swimming ${first.swimming}, grounded ${first.grounded})`);
  }

  let swimSeconds = 0;
  let enteredAt = null;
  let worst = 0;
  let worstAt = null;
  for (let index = 0; index < samples.length; index += 1) {
    const current = samples[index];
    const previous = samples[index - 1];
    if (!current.swimming) {
      enteredAt = null;
      continue;
    }
    if (enteredAt === null) enteredAt = current.time;
    if (previous?.swimming) swimSeconds += current.time - previous.time;
    if (expected.sheathedWhileSwimming && current.equipped) {
      failures.push(`${scenario}: weapon drawn while swimming at ${current.time}s`);
    }
    if (current.floating && current.time >= enteredAt + (expected.settleSeconds ?? 0)) {
      const error = Math.abs(current.chestY - current.surfaceY);
      if (error > worst) {
        worst = error;
        worstAt = current.time;
      }
    }
  }
  if (swimSeconds === 0) failures.push(`${scenario}: player never swam`);
  else if (expected.minSwimSeconds !== undefined && swimSeconds < expected.minSwimSeconds) {
    failures.push(`${scenario}: swam ${swimSeconds.toFixed(2)}s, expected at least ${expected.minSwimSeconds}s`);
  }
  if (expected.maxChestSurfaceErrorMeters !== undefined && worst > expected.maxChestSurfaceErrorMeters) {
    failures.push(
      `${scenario}: chest ${worst.toFixed(3)}m off the surface at ${worstAt}s while swimming over deep water`
      + ` (limit ${expected.maxChestSurfaceErrorMeters}m)`,
    );
  }
  if (expected.endsGroundedOutOfWater && (last.swimming || !last.grounded || last.inWater)) {
    failures.push(
      `${scenario}: player did not end grounded out of the water`
      + ` (swimming ${last.swimming}, grounded ${last.grounded}, in water ${last.inWater})`,
    );
  }
  return {
    failures,
    measured: {
      maxChestSurfaceErrorMeters: Number(worst.toFixed(4)),
      maxChestSurfaceErrorAt: worstAt,
      swimSeconds: Number(swimSeconds.toFixed(3)),
    },
  };
}
