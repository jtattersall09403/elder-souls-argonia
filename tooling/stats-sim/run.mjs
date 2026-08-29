#!/usr/bin/env node
/**
 * Balance simulation for workstream S (module 76 §103.1 step 7).
 *
 *   node tooling/stats-sim/run.mjs            # report + invariants
 *   node tooling/stats-sim/run.mjs --json     # machine-readable dump
 *   node tooling/stats-sim/run.mjs --matrix   # add the full matchup matrix
 *
 * Exit code 1 if any invariant fails. No dependencies, no build step, no game
 * package imported: it reads `data/` and prints.
 */

import {
  referenceCheck, matchupMatrix, namedArchetypeTable, buildParity, godCheck, burdenSweep,
  breathSweep, climbSweep, sneakSweep, progressionSweep, campaignSweep, argoniaPacing, argoniaMainQuestOnly,
  morrowindKnownAnswer, deferralCheck, economySweep, loopHunt, softRequirementCheck,
} from "./src/sweeps.mjs";
import { runInvariants } from "./src/invariants.mjs";

const argv = new Set(process.argv.slice(2));

const campaign = campaignSweep();
const results = {
  reference: referenceCheck(),
  named: namedArchetypeTable(),
  parity: buildParity(),
  god: godCheck(),
  burden: burdenSweep(),
  breath: breathSweep(),
  climb: climbSweep(),
  sneak: sneakSweep(),
  progression: progressionSweep(),
  campaign,
  pacing: argoniaPacing(campaign),
  mainQuestOnly: argoniaMainQuestOnly(),
  knownAnswer: morrowindKnownAnswer(),
  deferral: deferralCheck(),
  economy: economySweep(),
  loops: loopHunt(),
  softRequirements: softRequirementCheck(),
};
if (argv.has("--matrix")) results.matrix = matchupMatrix();

const invariants = runInvariants(results);

if (argv.has("--json")) {
  console.log(JSON.stringify({ results, invariants }, null, 2));
  process.exit(invariants.every((i) => i.pass) ? 0 : 1);
}

const h = (title) => console.log(`\n=== ${title}`);
const n = (x, places = 1) => (typeof x === "number" ? x.toFixed(places) : String(x));

h("reference character (the Marsh Hand) vs the sandbox as playtested");
{
  const r = results.reference;
  const t = r.sandboxToday;
  console.log(`health ${n(r.health)} (today ${t.health}) · stamina ${n(r.stamina)} (${t.stamina}) · regen ${n(r.staminaRegen)}/s (${t.staminaRegen})`);
  console.log(`carry ${n(r.carryCapacityKg)} kg (${t.carryCapacityKg}) · burden ${r.burden.tier} @ ${n(r.burden.ratio, 2)}`);
  console.log(`mitigation at AR 50 vs a 24 blow: ${(r.mitigationAt50vs24 * 100).toFixed(2)} % (today ${(t.mitigationAt50vs24 * 100).toFixed(2)} %)`);
  console.log(`listed light chain ${r.listedLightChain.map((x) => n(x)).join(" / ")} (today ${t.lightChain.map((x) => n(x)).join(" / ")})`);
  console.log(`damage position at Long Blade 60: ${(r.damagePositionAtSkill60 * 100).toFixed(1)} % of the range · breath ${n(r.breathSeconds)} s`);
}

h("the ladder, as worked archetypes");
for (const row of results.named) {
  console.log(
    `${row.band} ${row.enemy.padEnd(24)} hp ${String(Math.round(row.health)).padStart(4)} · hit ${String(row.damage).padStart(3)} · AR ${String(row.armourRating).padStart(3)} · loot ${row.lootValue}`,
  );
  console.log(
    "        " + row.vs.map((v) => `${v.build}: ${v.won ? `kills it in ${v.ttk}s` : `DIES at ${v.ttk}s`} (${v.hitsToDie} blows kill you)`).join(" | "),
  );
}

h("build parity at the endgame fight (Xal-Krona)");
for (const p of results.parity) {
  console.log(`${p.archetype.padEnd(11)} ${p.mode.padEnd(6)} ${p.won ? "win" : "LOSS"} in ${n(p.ttk)}s · burst dps ${n(p.dps)} · ${p.potionsUsed} potions · ${p.healthLeft} % health left · would die in ${p.hitsToDie} unavoided blows`);
}

h("the god-build against the whole ladder (it is supposed to walk through it)");
for (const g of results.god) {
  console.log(`${g.band} @0.85  ${g.build.padEnd(10)} ${g.won ? "win" : "LOSS"} in ${n(g.ttk)}s, ${g.healthLeft} % health left, ${g.potions} potions`);
}

h("encumbrance and roll tiers by Strength");
{
  const strengths = Object.keys(results.burden[0].tiers);
  console.log(`${"loadout".padEnd(34)}${"kg".padStart(6)}  ` + strengths.map((s) => `Str${s}`.padEnd(12)).join(""));
  for (const row of results.burden) {
    console.log(`${row.loadout.padEnd(34)}${n(row.kg).padStart(6)}  ` + strengths.map((s) => row.tiers[s].padEnd(12)).join(""));
  }
}

h("breath (seconds) against authored underwater segments");
for (const g of results.breath.grid.filter((x) => [30, 50, 100].includes(x.endurance))) {
  const clears = Object.entries(g.clears).filter(([, ok]) => ok).map(([s]) => s + "s").join(",") || "none";
  console.log(`Athletics ${String(g.athletics).padStart(3)} / End ${String(g.endurance).padStart(3)}: ${n(g.breathSeconds)}s — clears ${clears}`);
}
console.log("Argonians: unlimited (water breathing)");

h("climbing (Acrobatics), by wall height");
for (const c of results.climb) {
  console.log(`${c.who.padEnd(38)} ${c.burden.padEnd(10)} ${n(c.speed, 2)} m/s, ${n(c.drainPerSecond)} stamina/s, holds ${c.sustainableMeters} m` );
  console.log("        " + Object.entries(c.walls).map(([h, v]) => `${h}m: ${v}`).join(" · "));
}

h("sneak openers (damage multiplier on an undetected target)");
for (const r of results.sneak) {
  console.log(`Sneak ${String(r.sneak).padStart(3)}: ` + Object.entries(r.multipliers).map(([k, v]) => `${k} x${v}`).join(" · "));
}

h("progression pacing and affordability");
for (const row of results.progression) {
  console.log(`${row.class}: level ${row.finalLevel} after ${row.totalRanks} skill ranks, ${row.attributePoints} attribute points bought`);
  for (const cp of row.checkpoints) {
    if (cp.unreached) continue;
    console.log(`   L${String(cp.level).padStart(2)}  ${cp.pointsBoughtThisSitting} bought this sitting · ${cp.attributePointsTotal} total · health ${cp.health} · ${cp.carriedVastei} vastei banked`);
  }
}

h("coarse playthrough runs (a whole game, act by act)");
for (const run of results.campaign) {
  console.log(`\n${run.label}`);
  console.log(`  ${"act".padEnd(9)}${"hrs".padStart(4)}${"lvl".padStart(5)}${"deaths".padStart(8)}${"hp".padStart(6)}${"AR".padStart(5)}${"weapon".padStart(8)}${"armour".padStart(7)}${"athl".padStart(6)}${"acro".padStart(6)}${"speech".padStart(7)}${"attrs".padStart(7)}${"gold".padStart(8)}  climb 25 m`);
  for (const t of run.timeline) {
    console.log(
      `  ${t.act.padEnd(9)}${String(t.hours).padStart(4)}${String(t.level).padStart(5)}${String(t.deaths).padStart(8)}${String(t.health).padStart(6)}${String(t.armourRating).padStart(5)}${String(t.weaponSkill).padStart(8)}${String(t.armourSkillValue).padStart(7)}${String(t.athletics).padStart(6)}${String(t.acrobatics).padStart(6)}${String(t.speechcraft).padStart(7)}${String(t.attributePoints).padStart(7)}${String(t.gold).padStart(8)}  ${t.climb25m}`,
    );
  }
}

// Pacing is printed as a BAND, never as a single integer. "The campaign ends at
// level 22" is the shape of claim that let the old model be wrong for a hundred
// and fifty simulated hours without anybody noticing: it hides that one build
// got there at hour 60 and another never did.
const band = (rows) =>
  rows.map((x) => `h${x.hours}: ${x.min}-${x.max}`).join("  ·  ");
const firstReached = (rows) =>
  rows
    .map((x) => (x.reached ? `L${x.level} @ ${n(x.min)}-${n(x.max)} h${x.reached < x.of ? ` (${x.reached}/${x.of})` : ""}` : `L${x.level} unreached`))
    .join("  ·  ");

h("KNOWN-ANSWER TEST — Morrowind's rules against an estimate of Morrowind's content");
console.log("The rules half is documented and never tuned; content-vvardenfell.json is the estimate and is the only thing tuned to make this pass.");
for (const c of results.knownAnswer.checks) {
  console.log(`  ${c.pass ? "PASS" : "FAIL"}  ${c.id.padEnd(46)} want ${String(c.expected).padEnd(18)} got ${JSON.stringify(c.actual)}`);
}
console.log(`  level band   ${band(results.knownAnswer.band.levelAtHour)}`);
console.log(`  first at     ${firstReached(results.knownAnswer.band.hourAtLevel)}`);

h("our own pacing, as a band across all six builds (Argonia rules x Argonia content)");
console.log(`  level band   ${band(results.pacing.levelAtHour)}`);
console.log("  target       h2: 2  ·  h20: 10-14  ·  h40: 20-25  ·  h150: 45-55");
console.log(`  first at     ${firstReached(results.pacing.hourAtLevel)}`);
console.log(`  end levels   ${results.pacing.endLevels.map((e) => `${e.level} @ ${n(e.hours)}h`).join(" · ")}`);
console.log(`  main quest alone (${results.mainQuestOnly.hours} h): level ${results.mainQuestOnly.min}-${results.mainQuestOnly.max}`);

// The discard rate, as a first-class output. A progression model that delivers
// use-points into skills which cannot absorb them is lying about its own pacing,
// and the size of that lie belongs in the report rather than in a comment.
h("use-point discard rate (points delivered that bought no level credit)");
console.log(`  ${"build".padEnd(44)}${"delivered".padStart(10)}${"atCap".padStart(8)}${"zero".padStart(8)}${"1/3".padStart(8)}${"discard".padStart(9)}${"credit lost".padStart(12)}`);
for (const d of results.pacing.discard) {
  console.log(
    `  ${d.label.padEnd(44)}${String(d.pointsDelivered).padStart(10)}${(d.atCapRate * 100).toFixed(1).padStart(7)}%${(d.zeroCreditRate * 100).toFixed(1).padStart(7)}%${(d.partialCreditRate * 100).toFixed(1).padStart(7)}%${(d.useDiscardRate * 100).toFixed(1).padStart(8)}%${(d.levelCreditForgoneRate * 100).toFixed(1).padStart(11)}%`,
  );
}

h("what an hour of play actually contains (the content model, measured back out)");
console.log(`  ${"build".padEnd(44)}${"fights/h".padStart(9)}${"combat".padStart(8)}${"moving".padStart(8)}${"swim".padStart(7)}${"km".padStart(6)}${"blows/fight".padStart(12)}${"locks".padStart(7)}${"talks".padStart(7)}${"brews".padStart(7)}`);
for (const m of results.pacing.mix) {
  console.log(
    `  ${m.label.padEnd(44)}${n(m.encountersPerHour).padStart(9)}${(m.combatShareOfWallClock * 100).toFixed(0).padStart(7)}%${(m.movingShareOfWallClock * 100).toFixed(0).padStart(7)}%${(m.swimShareOfWallClock * 100).toFixed(0).padStart(6)}%${String(m.travelKm).padStart(6)}${n(m.connectsPerFight).padStart(12)}${String(m.locks).padStart(7)}${String(m.persuasions).padStart(7)}${String(m.brews).padStart(7)}`,
  );
}

h("the deferral exploit");
console.log(JSON.stringify(results.deferral));

h("economy");
for (const f of results.economy.fights) {
  console.log(`${f.band}: a sloppy fight costs ${f.damageTakenIfSloppy} health → ${f.cheapestHealing.count}x ${f.cheapestHealing.potion} = ${f.cheapestHealing.cost} gold, against ${f.incomePerClear} income`);
}
console.log(`training a skill 30→50 ${results.economy.trainingCost["30to50"]}g · 50→75 ${results.economy.trainingCost["50to75"]}g · 75→100 ${results.economy.trainingCost["75to100"]}g`);
console.log(`brewed healing: novice ${results.economy.brewedHealing.novice} · competent ${results.economy.brewedHealing.competent} · master ${results.economy.brewedHealing.master} (ingredients ~${results.economy.brewedHealing.ingredientCost}g)`);

h("degenerate-loop hunt");
console.log(`alchemy with base-stat inputs: ${results.loops.alchemyLoop.boundedByBaseStats.join(" → ")}`);
console.log(`the same loop if outputs fed inputs: ${results.loops.alchemyLoop.ifOutputsFedInputs.join(" → ")}`);
console.log(`smithing ceiling x${n(results.loops.smithing.maxMultiplier, 2)} · enchant budget ${n(results.loops.enchanting.maxPointBudget)} · unarmoured ceiling ${results.loops.unarmouredCeiling} AR`);
console.log(`armour ceiling AR ${results.loops.armourCeiling.maxArmourRating}: ${(results.loops.armourCeiling.mitigationVsLightHit * 100).toFixed(1)} % of a light hit, ${(results.loops.armourCeiling.mitigationVsD5Hit * 100).toFixed(1)} % of a D5 hit`);
console.log(`a maximum level-10 sitting costs ${results.loops.vasteiFarming.maxSpendInOneSittingAtLevel10} vastei`);

h("soft requirements");
console.log(JSON.stringify(results.softRequirements));

h("invariants");
let failed = 0;
for (const i of invariants) {
  if (!i.pass) failed += 1;
  console.log(`${i.pass ? "PASS" : "FAIL"}  ${i.id.padEnd(30)} ${i.detail}`);
}
console.log(`\n${invariants.length - failed}/${invariants.length} invariants hold.`);
process.exit(failed ? 1 : 0);
