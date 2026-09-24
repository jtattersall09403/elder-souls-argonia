#!/usr/bin/env node
/**
 * Draws a FRESH seeded equivalence sample (inputs only): every sim function the
 * port covers, random in-range and out-of-range arguments. Answers then come
 * from generate-expected.mjs, never from the port.
 *
 *   node draw-sample.mjs <id> <seed> [casesPerFunction]
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [id, seedArg, perArg] = process.argv.slice(2);
if (!id || !seedArg) throw new Error("usage: draw-sample.mjs <id> <seed> [casesPerFunction]");
let seed = Number(seedArg) >>> 0;
const rnd = () => { // mulberry32
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const num = (lo, hi) => Math.round((lo + (hi - lo) * rnd()) * 100) / 100;
const int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * rnd());
const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
const ATTRS = ["strength", "endurance", "agility", "speed", "willpower", "intelligence", "personality"];
const attrs = () => Object.fromEntries(ATTRS.map((a) => [a, int(0, 130)]));
const SKILLS = ["longBlade", "blunt", "axe", "spear", "shortBlade", "marksman", "handToHand", "block", "heavyArmor",
  "mediumArmor", "lightArmor", "unarmored", "athletics", "acrobatics", "sneak", "security", "smithing", "mercantile",
  "speechcraft", "alchemy", "enchant", "alteration", "conjuration", "destruction", "illusion", "mysticism", "restoration"];
const TIERS = ["fast", "mid", "fat", "overloaded"];
const KINDS = ["dagger", "shortBlade", "oneHanded", "twoHanded", "bow", "unarmed", "spell", "claw"];

const GEN = {
  k: () => [num(-20, 130)],
  effectiveSkill: () => [pick(SKILLS), int(0, 120), rnd() < 0.1 ? null : attrs()],
  strengthDamage: () => [{ strength: int(0, 150) }],
  band: () => [[num(0, 2), num(0, 2)], num(-10, 110)],
  damagePosition: () => [num(-10, 120)],
  maxHealth: () => [attrs(), int(1, 60)],
  walkSpeed: () => [attrs(), num(0, 2)],
  sprintSpeed: () => [attrs(), int(0, 120), num(0, 2)],
  swimSpeed: () => [int(0, 120)],
  maxStamina: () => [attrs()],
  staminaRegen: () => [attrs()],
  maxMagicka: () => [attrs(), pick([0, 0.5, 1.5, num(0, 3)])],
  magickaRegen: () => [attrs()],
  carryCapacity: () => [attrs()],
  burdenTier: () => [num(0, 400), attrs()],
  mitigation: () => [num(0, 600), num(0, 400)],
  damageAfterArmour: () => [num(0, 400), num(0, 600)],
  incomingDamage: () => (rnd() < 0.3 ? [num(0, 400)] : [num(0, 400), num(0.5, 2)]),
  breathSeconds: () => [int(0, 120), int(0, 120), rnd() < 0.2],
  unarmouredRating: () => (rnd() < 0.5 ? [int(0, 120)] : [int(0, 120), int(0, 4)]),
  sneakMultiplier: () => [pick(KINDS), int(0, 120)],
  climb: () => [num(1, 200), { acrobatics: int(0, 110), attributes: attrs(), burdenTier: pick(TIERS),
    stamina: num(40, 200), staminaRegen: num(0, 60) }],
  vasteiPerRank: () => [int(0, 100), num(0, 120), pick([0.75, 1, 1.25]), pick([0.8, 1])],
  attributeCost: () => [int(1, 60), int(0, 120), int(1, 5)],
  rankCost: () => [int(0, 100), pick(["major", "minor", "misc"]), rnd() < 0.5],
};
const per = Number(perArg ?? 8);
const cases = [];
for (const [fn, gen] of Object.entries(GEN)) for (let i = 0; i < per; i++) cases.push([fn, gen()]);
const out = { schemaVersion: 1, sample: id, drawnWithSeed: Number(seedArg), cases };
writeFileSync(join(dirname(fileURLToPath(import.meta.url)), `sample-${id}.inputs.json`), JSON.stringify(out) + "\n");
console.log(`sample ${id}: ${cases.length} cases, seed ${seedArg}`);
