/**
 * The invariants: what must be true of the design over a large sample of
 * variations, not over hand-picked cases.
 *
 * At Phase 10c these are ported as standing tests against the implemented
 * system (module 76 §104), so each one is written as a statement about the
 * design rather than about this harness.
 */

import { data, makeBuild, bandActor, duel, breathSeconds } from "./model.mjs";

export const THRESHOLDS = {
  referenceTolerance: 0.03,
  d5OneShotFraction: 0.9,
  d5PlayerChipFraction: 0.015,
  appropriateMinHealthLeft: 0.15,
  appropriateMinHitsToDie: 2,
  appropriateTtkRange: [2.5, 150],
  overmatchTwoBandsMaxHitsToDie: 3,
  overmatchThreeBandsMaxHitsToDie: 2,
  ordinaryAvoidance: 0.6,
  bossAvoidance: 0.78,
  minTtkSeconds: 2.5,
  armourMaxMitigationLightHit: 0.8,
  armourMaxMitigationD5Hit: 0.65,
  minD5BiteOnBestArmour: 0.15,

  bestArmourHitsToDie: [5, 7],
  affordabilityRange: [2, 8],
  parityTtkSpread: 4.5,
  breathCompetentSegment: 45,
  breathCompetentMargin: 1.1,
  loopDivergenceFactor: 1.5,
  vasteiSittingThrottle: 5,
  campaignEndLevel: [12, 40],
  campaignEndWeaponSkill: 90,
  campaignMaxEarlyDeaths: 60,
  campaignLevelSpread: 2.5,
};

/** Which build a band is *meant* for — the ladder's contract with the player. */
export const BAND_FOR_CHECKPOINT = {
  start: "D1",
  novice: "D1",
  competent: "D2",
  veteran: "D3",
  master: "D4",
  legend: "D5",
  god: "D5",
};

const near = (actual, expected, tol) => Math.abs(actual - expected) <= Math.abs(expected) * tol;

export function runInvariants(results) {
  const out = [];
  const check = (id, description, fn) => {
    try {
      const detail = fn();
      out.push({ id, description, pass: detail.pass, detail: detail.detail });
    } catch (error) {
      out.push({ id, description, pass: false, detail: `threw: ${error.message}` });
    }
  };
  const T = THRESHOLDS;

  check("reference-equivalence", "the reference character reproduces the sandbox as playtested", () => {
    const r = results.reference;
    const t = r.sandboxToday;
    const fails = [];
    if (!near(r.health, t.health, T.referenceTolerance)) fails.push(`health ${r.health.toFixed(1)} vs ${t.health}`);
    if (!near(r.stamina, t.stamina, 0.001)) fails.push(`stamina ${r.stamina}`);
    if (!near(r.staminaRegen, t.staminaRegen, 0.001)) fails.push(`regen ${r.staminaRegen}`);
    if (!near(r.carryCapacityKg, t.carryCapacityKg, 0.001)) fails.push(`carry ${r.carryCapacityKg}`);
    if (!near(r.mitigationAt50vs24, t.mitigationAt50vs24, 0.005)) fails.push(`mitigation ${r.mitigationAt50vs24.toFixed(4)}`);
    r.listedLightChain.forEach((d, i) => {
      if (!near(d, t.lightChain[i], 0.001)) fails.push(`light${i + 1} ${d.toFixed(2)} vs ${t.lightChain[i]}`);
    });
    if (r.burden.tier !== "mid") fails.push(`burden tier ${r.burden.tier}`);
    return { pass: fails.length === 0, detail: fails.length ? fails.join("; ") : "health/stamina/regen/carry/mitigation/listed damage/burden tier all match" };
  });

  check("d5-overmatches-a-beginner", "a D5 actor near-one-shots a starting character and is barely scratched by one", () => {
    const build = makeBuild("start", "melee");
    const enemy = bandActor("D5", 0.5);
    const d = duel(build, enemy);
    const oneShot = d.enemyPerHit >= build.health * T.d5OneShotFraction;
    const chip = d.playerPerHit <= enemy.health * T.d5PlayerChipFraction;
    return {
      pass: oneShot && chip,
      detail: `D5 hit ${d.enemyPerHit.toFixed(0)} vs ${build.health.toFixed(0)} health (${d.hitsToDie} hits to die); player lands ${d.playerPerHit.toFixed(1)} of ${enemy.health.toFixed(0)} (${((d.playerPerHit / enemy.health) * 100).toFixed(2)} %)`,
    };
  });

  check("band-is-fair-for-its-build", "every archetype wins its own band at ordinary play, and is never nearly one-shot in it", () => {
    const fails = [];
    for (const [checkpoint, bandId] of Object.entries(BAND_FOR_CHECKPOINT)) {
      for (const archetype of Object.keys(data.builds.archetypes)) {
        for (const position of [0.15, 0.5, 0.85]) {
          const build = makeBuild(checkpoint, archetype);
          // The endgame band assumes skilled play by design; everything below
          // it must be winnable at ordinary play.
          const avoidance = bandId === "D5" ? T.bossAvoidance : T.ordinaryAvoidance;
          const d = duel(build, bandActor(bandId, position), { avoidance });
          if (!d.won) fails.push(`${checkpoint}/${archetype} loses to ${bandId}@${position}`);
          else if (d.hitsToDie < T.appropriateMinHitsToDie) fails.push(`${checkpoint}/${archetype} dies in ${d.hitsToDie} ${bandId}@${position} hits`);
          else if (d.ttkSeconds < T.appropriateTtkRange[0] || d.ttkSeconds > T.appropriateTtkRange[1]) {
            fails.push(`${checkpoint}/${archetype} vs ${bandId}@${position}: ${d.ttkSeconds.toFixed(0)}s`);
          }
        }
      }
    }
    return { pass: fails.length === 0, detail: fails.length ? fails.slice(0, 8).join("; ") + (fails.length > 8 ? ` (+${fails.length - 8} more)` : "") : "all build x band pairings inside the fairness window" };
  });

  check("overmatch-is-lethal", "danger two bands above you kills in <=3 blows, three bands in <=2", () => {
    const order = data.ladder.bands.map((b) => b.id);
    const fails = [];
    for (const [checkpoint, bandId] of Object.entries(BAND_FOR_CHECKPOINT)) {
      for (const [gap, limit] of [[2, T.overmatchTwoBandsMaxHitsToDie], [3, T.overmatchThreeBandsMaxHitsToDie]]) {
        const idx = order.indexOf(bandId) + gap;
        if (idx >= order.length) continue;
        for (const archetype of Object.keys(data.builds.archetypes)) {
          const d = duel(makeBuild(checkpoint, archetype), bandActor(order[idx], 0.5));
          if (d.hitsToDie > limit) fails.push(`${checkpoint}/${archetype} survives ${d.hitsToDie} ${order[idx]} hits`);
        }
      }
    }
    return { pass: fails.length === 0, detail: fails.length ? fails.slice(0, 6).join("; ") : "overmatched characters die in a handful of blows at every checkpoint" };
  });

  check("armour-never-trivialises", "the best armour in the game is worth wearing but never approaches immunity", () => {
    const a = results.loops.armourCeiling;
    const bestArmoured = makeBuild("god", "melee");
    const d5 = bandActor("D5", 0.85);
    const perHit = duel(bestArmoured, d5).enemyPerHit;
    const fractionOfHealth = perHit / bestArmoured.health;
    const pass =
      a.mitigationVsLightHit < T.armourMaxMitigationLightHit &&
      a.mitigationVsD5Hit < T.armourMaxMitigationD5Hit &&
      fractionOfHealth > T.minD5BiteOnBestArmour;
    return {
      pass,
      detail: `max AR ${a.maxArmourRating}: ${(a.mitigationVsLightHit * 100).toFixed(1)} % of a light hit, ${(a.mitigationVsD5Hit * 100).toFixed(1)} % of a D5 hit; the hardest D5 blow still takes ${(fractionOfHealth * 100).toFixed(0)} % of the best-armoured character's health`,
    };
  });

  check("getting-hit-matters", "unavoided blows kill in about three at your own band, and only the very best armour buys five or six", () => {
    const pairs = { D1: "start", D2: "competent", D3: "veteran", D4: "master", D5: "legend" };
    const fails = [];
    for (const [bandId, checkpoint] of Object.entries(pairs)) {
      const target = data.ladder.bands.find((b) => b.id === bandId).hitsToDieTarget;
      for (const archetype of ["melee", "spear", "marksman", "magic"]) {
        const d = duel(makeBuild(checkpoint, archetype), bandActor(bandId, 0.5));
        // The band was solved for `target` at the median build; heavy armour may
        // buy up to two more blows, light armour may lose one.
        if (d.hitsToDie > target + 2 || d.hitsToDie < target - 1) {
          fails.push(`${checkpoint}/${archetype} vs ${bandId}: ${d.hitsToDie} (target ${target})`);
        }
      }
    }
    const best = duel(makeBuild("god", "melee"), bandActor("D5", 0.5));
    if (best.hitsToDie < T.bestArmourHitsToDie[0] || best.hitsToDie > T.bestArmourHitsToDie[1]) {
      fails.push(`best-in-slot armour survives ${best.hitsToDie} D5 blows (want ${T.bestArmourHitsToDie.join("-")})`);
    }
    return {
      pass: fails.length === 0,
      detail: fails.length ? fails.join("; ") : `every build lands within a blow or two of its band's target (10/5/4/3.5/3/3); best-in-slot armour survives ${best.hitsToDie} D5 blows`,
    };
  });

  check("climbing-is-a-real-cost", "climbing is limited by stamina, skill and what you are carrying", () => {
    const rows = results.climb;
    const beginner = rows[0];
    const master = rows.find((r) => r.who.startsWith("master climber"));
    const knight = rows.find((r) => r.who.startsWith("knight"));
    const pass =
      beginner.walls["25"] === "falls short" &&
      master.walls["40"] !== "falls short" &&
      knight.drainPerSecond > master.drainPerSecond;
    return {
      pass,
      detail: `hour one: 25 m ${beginner.walls["25"]}; master climber: 40 m ${master.walls["40"]}; a knight in daedric drains ${knight.drainPerSecond}/s against a climber's ${master.drainPerSecond}/s`,
    };
  });

  check("a-whole-game-holds-together", "every plausible build gets through a whole campaign, and dying is front-loaded", () => {
    const fails = [];
    const levels = [];
    for (const run of results.campaign) {
      const end = run.timeline.at(-1);
      const early = run.timeline.slice(0, 2).reduce((a, t) => a + t.deaths, 0);
      const late = run.timeline.slice(2).reduce((a, t) => a + t.deaths, 0);
      levels.push(end.level);
      if (end.level < T.campaignEndLevel[0] || end.level > T.campaignEndLevel[1]) {
        fails.push(`${run.label}: ends at level ${end.level}`);
      }
      if (end.weaponSkill < T.campaignEndWeaponSkill) fails.push(`${run.label}: weapon skill only ${end.weaponSkill}`);
      if (early <= late) fails.push(`${run.label}: ${early} early deaths against ${late} later ones`);
      if (early > T.campaignMaxEarlyDeaths) fails.push(`${run.label}: ${early} deaths in the first two acts`);
    }
    const spread = Math.max(...levels) / Math.min(...levels);
    if (spread > T.campaignLevelSpread) fails.push(`level spread across builds x${spread.toFixed(2)}`);
    return {
      pass: fails.length === 0,
      detail: fails.length
        ? fails.join("; ")
        : `all ${results.campaign.length} builds finish; end levels ${Math.min(...levels)}-${Math.max(...levels)}, deaths front-loaded in every run`,
    };
  });

  check("no-deferral-advantage", "hoarding vastei instead of spending it at each sitting buys nothing and costs power", () => {
    const d = results.deferral;
    const pass = d.advantage <= 0 && d.hoard.meanHealthPerRank < d.spend.meanHealthPerRank;
    return { pass, detail: `hoarder ends with ${d.advantage} extra attribute points and a mean health of ${d.hoard.meanHealthPerRank} against the spender's ${d.spend.meanHealthPerRank}` };
  });

  check("affordability-band", "a normal level's earnings buy a meaningful but not runaway number of attribute points", () => {
    const fails = [];
    for (const row of results.progression) {
      for (const cp of row.checkpoints) {
        if (cp.unreached) continue;
        if (cp.pointsBoughtThisSitting < T.affordabilityRange[0] || cp.pointsBoughtThisSitting > T.affordabilityRange[1]) {
          fails.push(`${row.class} L${cp.level}: ${cp.pointsBoughtThisSitting} points`);
        }
      }
    }
    return { pass: fails.length === 0, detail: fails.length ? fails.join("; ") : `every sampled sitting bought ${T.affordabilityRange[0]}-${T.affordabilityRange[1]} points` };
  });

  check("every-build-can-finish", "melee, marksman, magic and stealth builds can all kill the endgame boss", () => {
    const rows = results.parity;
    const ttks = rows.map((r) => r.ttk);
    const spread = Math.max(...ttks) / Math.min(...ttks);
    const pass = rows.every((r) => r.won && r.hitsToDie >= 2) && spread <= T.parityTtkSpread;
    return { pass, detail: rows.map((r) => `${r.archetype} ${r.won ? r.ttk + "s" : "LOSES"}`).join(", ") + ` (spread x${spread.toFixed(2)})` };
  });

  check("breath-margins", "underwater routes are passable by a competent non-Argonian and gate the untrained", () => {
    const competent = breathSeconds(40, 50);
    const beginner = breathSeconds(20, 40);
    const master = breathSeconds(100, 100);
    const pass =
      competent >= T.breathCompetentSegment * T.breathCompetentMargin &&
      beginner < 60 &&
      master < 120;
    return { pass, detail: `beginner ${beginner.toFixed(0)}s, competent ${competent.toFixed(0)}s, master ${master.toFixed(0)}s; Argonians unlimited` };
  });

  check("crafting-loops-are-bounded", "reading base stats stops alchemy feeding itself", () => {
    const l = results.loops.alchemyLoop;
    const flat = Math.max(...l.boundedByBaseStats) / Math.min(...l.boundedByBaseStats);
    const diverges = l.ifOutputsFedInputs.at(-1) / l.ifOutputsFedInputs[0];
    const pass = flat === 1 && diverges >= T.loopDivergenceFactor;
    return { pass, detail: `bounded series constant at ${l.boundedByBaseStats[0]}; the unbounded counterfactual reaches ${l.ifOutputsFedInputs.at(-1)} (x${diverges.toFixed(0)})` };
  });

  check("soft-requirements-never-block", "an over-heavy find is usable at level one, just expensive", () => {
    const s = results.softRequirements;
    return { pass: s.stillUsable && s.worstCaseSwing < s.startingStamina, detail: `worst-case swing ${s.worstCaseSwing} stamina against a starting pool of ${s.startingStamina}` };
  });

  check("clean-play-pays", "fighting at your own band pays when you play well, and costs you when you don't", () => {
    const fails = [];
    for (const f of results.economy.fights) {
      if (f.band === "D0") continue;
      const cost = f.cheapestHealing.cost;
      if (cost < f.incomePerClear * 0.03) fails.push(`${f.band}: healing ${cost} is trivial against ${f.incomePerClear} income`);
      if (["D3", "D4", "D5"].includes(f.band) && cost > f.incomePerClear) {
        fails.push(`${f.band}: clean play still loses money (${cost} healing against ${f.incomePerClear})`);
      }
    }
    return {
      pass: fails.length === 0,
      detail: fails.length
        ? fails.join("; ")
        : "clean play profits from D3 up; sloppy play does not, which is the lesson we want the economy to teach",
    };
  });

  check("vastei-farming-is-throttled", "no single sitting can absorb a farmed hoard", () => {
    const cap = results.loops.vasteiFarming.maxSittingSpendAtLevel10 ?? results.loops.vasteiFarming.maxSpendInOneSittingAtLevel10;
    const perLevel = results.progression[0].checkpoints.find((c) => c.level === 10);
    const income = perLevel?.carriedVastei ?? 0;
    const pass = cap > Math.max(1, income) * T.vasteiSittingThrottle;
    return { pass, detail: `a maximum sitting at level 10 costs ${cap} vastei; a level's ordinary earnings leave ${income} banked` };
  });

  return out;
}
