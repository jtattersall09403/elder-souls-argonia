/**
 * The invariants: what must be true of the design over a large sample of
 * variations, not over hand-picked cases.
 *
 * At Phase 10c these are ported as standing tests against the implemented
 * system (module 76 §104), so each one is written as a statement about the
 * design rather than about this harness.
 */

import { data, makeBuild, bandActor, duel, breathSeconds } from "./model.mjs";

const SKILL_SPEC = Object.fromEntries(data.skills.skills.map((s) => [s.id, s.spec]));

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
  campaignEndLevel: [40, 72],
  campaignEndWeaponSkill: 90,
  campaignMaxEarlyDeaths: 60,
  campaignLevelSpread: 2.5,
  campaignEarlyDeathWindow: 0.4,
  campaignMaxZeroUseLevelSkills: 0,
  // What a playthrough is shaped like. Wide on purpose — a smell test on the
  // content model, not a target to tune toward.
  contentEncountersPerHour: [8, 14],
  contentCombatShare: [0.12, 0.3],
  contentTravelKm: [700, 1300],
  contentMovingShare: [0.3, 0.55],
  contentMaxUseDiscardRate: 0.02,
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
const n = (x) => x.toFixed(1);
const pct = (x) => `${(x * 100).toFixed(0)} %`;

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
          // D1 spans a mudcrab to an armed smuggler; short fights there are the
          // point of the band, so only its upper TTK bound is meaningful.
          const vermin = bandId === "D1";
          if (!d.won) fails.push(`${checkpoint}/${archetype} loses to ${bandId}@${position}`);
          else if (vermin) continue;
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
      // Front-loading is a claim about HOURS, not about act indices — the
      // content model is free to split its acts however the quest plan wants,
      // so each act's deaths are placed at its midpoint.
      const cut = end.hours * T.campaignEarlyDeathWindow;
      let prev = 0;
      let early = 0;
      let late = 0;
      for (const t of run.timeline) {
        ((prev + t.hours) / 2 <= cut ? (early += t.deaths) : (late += t.deaths));
        prev = t.hours;
      }
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

  check(
    "content-model-is-a-playthrough",
    "the simulated content adds up to a game somebody could actually be playing",
    () => {
      // The old content model reported 6.5 fights an hour with combat at 2.9 %
      // of wall-clock and 414 km of travel at a mean 0.79 m/s — i.e. a game in
      // which the player is neither fighting nor moving, for a hundred and
      // fifty hours. Nothing in the harness objected, because nobody had
      // written down what a playthrough is *shaped* like. This is that, and
      // the bounds are deliberately wide: it is a smell test, not a target.
      const fails = [];
      for (const m of results.pacing.mix) {
        const b = (name, v, lo, hi) => {
          if (v < lo || v > hi) fails.push(`${m.label}: ${name} ${v} outside ${lo}-${hi}`);
        };
        b("fights/hour", m.encountersPerHour, ...T.contentEncountersPerHour);
        b("combat share", m.combatShareOfWallClock, ...T.contentCombatShare);
        b("travel km", m.travelKm, ...T.contentTravelKm);
        b("moving share", m.movingShareOfWallClock, ...T.contentMovingShare);
        if (m.swimShareOfWallClock <= 0) fails.push(`${m.label}: swimming is never simulated`);
      }
      // Use delivered into a skill that cannot absorb it at all. Under our
      // rules this must be ~zero: a maxed skill keeps earning, and no rank is
      // worth nothing. If it climbs, the misc/maxed credit fix has regressed.
      for (const d of results.pacing.discard) {
        if (d.useDiscardRate > T.contentMaxUseDiscardRate) {
          fails.push(`${d.label}: ${(d.useDiscardRate * 100).toFixed(1)} % of use-points discarded`);
        }
      }
      const mix = results.pacing.mix;
      return {
        pass: fails.length === 0,
        detail: fails.length
          ? fails.slice(0, 6).join("; ")
          : `${n(Math.min(...mix.map((m) => m.encountersPerHour)))}-${n(Math.max(...mix.map((m) => m.encountersPerHour)))} fights/h, combat ${pct(Math.min(...mix.map((m) => m.combatShareOfWallClock)))}-${pct(Math.max(...mix.map((m) => m.combatShareOfWallClock)))}, moving ${pct(Math.min(...mix.map((m) => m.movingShareOfWallClock)))}-${pct(Math.max(...mix.map((m) => m.movingShareOfWallClock)))} over ${Math.min(...mix.map((m) => m.travelKm))}-${Math.max(...mix.map((m) => m.travelKm))} km; nothing discarded`,
      };
    },
  );

  check(
    "morrowind-known-answer",
    "the campaign engine reproduces TES III's documented pacing when fed Morrowind's own rules",
    () => {
      // THE STANDING RED LIGHT. Morrowind is the explicit reference for this
      // design and its pacing is published: level 2 in the first hour or two,
      // 10-14 by hour 20, 30-45 by 100-120, Athletics and Acrobatics maxed by
      // 50-70 h without grinding, a Security-major thief capping the skill in a
      // normal playthrough, and a main quest that finishes around level 15-25.
      // The rule set (data/rules-morrowind.json) is known exactly and must
      // NEVER be tuned; if this goes red, the fault is in our engine or in
      // data/content-vvardenfell.json, which is an estimate. It exists because
      // the campaign model previously reported six builds reaching level 2-4
      // after nineteen hours and 16-27 after a hundred and fifty, and nothing
      // in the harness noticed.
      const k = results.knownAnswer;
      const failed = k.checks.filter((c) => !c.pass);
      return {
        pass: failed.length === 0,
        detail: failed.length
          ? failed.map((c) => `${c.id}: wanted ${c.expected}, got ${JSON.stringify(c.actual)}`).join("; ")
          : `all ${k.checks.length} documented answers reproduced (level 2 by hour ${k.checks[0].actual.max}, ${k.band.levelAtHour.find((x) => x.hours === 20).min}-${k.band.levelAtHour.find((x) => x.hours === 20).max} by hour 20, ${k.band.levelAtHour.find((x) => x.hours === 120).min}-${k.band.levelAtHour.find((x) => x.hours === 120).max} by hour 120)`,
      };
    },
  );

  check(
    "no-level-bearing-skill-is-dead-content",
    "every major and minor skill of every campaign build is actually exercised by ordinary play",
    () => {
      // The distortion that caused the pacing gap: four of the warrior's ten
      // level-bearing skills and five of the mage's received literally zero use
      // across a whole playthrough, because each archetype exercised one weapon
      // and one armour skill. A skill that never moves is a level the player
      // cannot reach.
      const fails = [];
      for (const run of results.campaign) {
        const cls = data.classes.classes.find((c) => c.id === run.classId);
        for (const id of [...cls.majors, ...cls.minors]) {
          const start =
            data.classes.startingSkill +
            (data.races.races.find((r) => r.id === run.race).skillBonuses[id] ?? 0) +
            (cls.majors.includes(id) ? data.classes.majorBonus : data.classes.minorBonus) +
            (SKILL_SPEC[id] === cls.specialization ? data.classes.specializationBonus : 0);
          if (run.skills[id] <= start) fails.push(`${run.label}: ${id} never moved off ${start}`);
        }
      }
      const dead = fails.length;
      return {
        pass: dead <= T.campaignMaxZeroUseLevelSkills,
        detail: dead
          ? fails.slice(0, 8).join("; ")
          : `all ${results.campaign.length} builds exercise every one of their ten level-bearing skills`,
      };
    },
  );

  check("no-deferral-advantage","hoarding vastei instead of spending it at each sitting buys nothing and costs power", () => {
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
      if (f.band === "D1") continue; // vermin clears are not an economy
      const cost = f.cheapestHealing.cost;
      // What a fight is worth as authored content is the ladder's lootValue —
      // the corpse's own drop (economy.perBandClear) is only part of it.
      const worth = f.lootValue;
      if (cost < worth * 0.03) fails.push(`${f.band}: healing ${cost} is trivial against ${worth} of loot`);
      if (["D3", "D4", "D5"].includes(f.band) && cost > worth) {
        fails.push(`${f.band}: clean play still loses money (${cost} healing against ${worth} of loot)`);
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
