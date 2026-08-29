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
  breathSweep, progressionSweep, deferralCheck, economySweep, loopHunt, softRequirementCheck,
} from "./src/sweeps.mjs";
import { runInvariants } from "./src/invariants.mjs";

const argv = new Set(process.argv.slice(2));

const results = {
  reference: referenceCheck(),
  named: namedArchetypeTable(),
  parity: buildParity(),
  god: godCheck(),
  burden: burdenSweep(),
  breath: breathSweep(),
  progression: progressionSweep(),
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
  console.log(`carry ${n(r.carryCapacityKg)} kg (${t.carryCapacityKg}) · burden ${r.burden.tier} @ ${n(r.burden.ratio, 2)} · poise ${n(r.poise)}`);
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

h("progression pacing and affordability");
for (const row of results.progression) {
  console.log(`${row.class}: level ${row.finalLevel} after ${row.totalRanks} skill ranks, ${row.attributePoints} attribute points bought`);
  for (const cp of row.checkpoints) {
    if (cp.unreached) continue;
    console.log(`   L${String(cp.level).padStart(2)}  ${cp.pointsBoughtThisSitting} bought this sitting · ${cp.attributePointsTotal} total · health ${cp.health} · ${cp.carriedVastei} vastei banked`);
  }
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
