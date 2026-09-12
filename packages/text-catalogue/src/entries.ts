/**
 * Catalogue content.
 *
 * Seeded with the system text that exists today. Everything player-visible
 * written from here on is registered in this file (or, once the volume
 * justifies it, in per-area files exported from here) — see
 * docs/standards/engineering.md standard 4.
 *
 * **Before writing a line, read quests 60 §45e** (TES voice and the AI-voice
 * failure mode) and its banned-constructions table. The short version: short
 * declaratives, concrete nouns, archaism carried by vocabulary rather than by
 * twisted syntax. If a line feels portentous, cut it in half.
 */
import { buildCatalogue, type TextEntry } from "./catalogue.js";

export const SYSTEM_TEXT: readonly TextEntry[] = [
  {
    id: "text.system.essential-npc-killed",
    surface: "system",
    text:
      "You have killed a character that the story needs. Restore an earlier save to continue it.",
    note:
      "Shown when the player kills a tier-protected character. All NPCs are killable and none are flagged invincible (quests 40 §30b), so this message is the whole protection — it must be plain and instantly actionable. Earlier drafts reached for gravitas ('a root the story grew along is severed', then 'a root is severed'); system text carries no imagery, so it states the cause and the remedy (style guide §3). Owner 2026-09-04: the wording is open to reviewer improvement, not pinned.",
  },
  {
    id: "text.system.player-died",
    surface: "system",
    text: "You have died.",
    note: "Two words. Dark Souls is right about this.",
  },
  {
    id: "text.system.encumbered",
    surface: "system",
    text: "You are carrying too much to move.",
    note: "Burden threshold (module 76 §122). States the cause, not the feeling.",
  },
  {
    id: "text.system.breath-failing",
    surface: "system",
    text: "Your breath is running out.",
    note:
      "Underwater warning. 00-core criterion 25 makes breath manageable by design, so this is a prompt to act, never a death sentence.",
  },
  {
    id: "text.system.rest-saved",
    surface: "system",
    text: "You rest. The world holds its place.",
    note:
      "Save-on-rest (decision 0031). One image, and it says what happened. The only line here permitted any colour, because resting is a deliberate, unhurried act.",
  },
  {
    id: "text.system.cannot-rest-enemies-near",
    surface: "system",
    text: "You cannot rest with enemies nearby.",
    note: "Morrowind's own phrasing, near enough. Do not improve it.",
  },
  {
    id: "text.system.cannot-rest-in-settlement",
    surface: "system",
    text: "You need a bed to rest here. Wait, or pay for a room.",
    note:
      "0039 S3: no camping in settlements, which is what makes inns economically real. Names both alternatives so the rule teaches itself.",
  },
];

/** Plain labels for the combat proving ground. */
export const COMBAT_SANDBOX_TEXT: readonly TextEntry[] = [
  { id: "text.sandbox.sword-opponent", surface: "ui", text: "Sword opponent" },
  { id: "text.sandbox.dagger-opponent", surface: "ui", text: "Dagger opponent" },
  { id: "text.sandbox.shield-opponent", surface: "ui", text: "Sword and shield opponent" },
  { id: "text.sandbox.greatsword-opponent", surface: "ui", text: "Greatsword opponent" },
  { id: "text.sandbox.warhammer-opponent", surface: "ui", text: "Warhammer opponent" },
  { id: "text.sandbox.battleaxe-opponent", surface: "ui", text: "Battleaxe opponent" },
  { id: "text.sandbox.archer-opponent", surface: "ui", text: "Archer opponent" },
  { id: "text.sandbox.combat-ready", surface: "ui", text: "Combat test ready" },
  { id: "text.sandbox.arrow-gravity", surface: "ui", text: "Arrow gravity" },
  { id: "text.sandbox.bow-nock-speed", surface: "ui", text: "Bow nocking speed" },
  { id: "text.sandbox.bow-draw-speed", surface: "ui", text: "Bow draw speed" },
  {
    id: "text.sandbox.character-prompt",
    surface: "ui",
    text: "Character",
    note: "Heading over the sandbox's race and sex selection on the title screen.",
  },
  { id: "text.sandbox.character-sex", surface: "ui", text: "Sex" },
  { id: "text.sandbox.character-race", surface: "ui", text: "Race" },
  { id: "text.sandbox.sex-male", surface: "ui", text: "Male" },
  { id: "text.sandbox.sex-female", surface: "ui", text: "Female" },
];

export const EQUIPMENT_TEXT: readonly TextEntry[] = [
  { id: "text.equipment.weapon-length", surface: "ui", text: "Weapon length" },
  { id: "text.equipment.weapon-length-note", surface: "ui", text: "End-to-end model length" },
  { id: "text.equipment.attack-reach", surface: "ui", text: "Max reach" },
  { id: "text.equipment.attack-reach-note", surface: "ui", text: "Furthest horizontal weapon contact in the opening light attack, including its step" },
];

/**
 * Ferries — the talk-and-teleport crossings (owner ruling 2026-09-09).
 * The graph is `world/sources/routes/ferry-crossings.json`; every `text.*` id
 * it carries is registered here and checked by
 * `python3 -m worldgen.ferry_crossings --check`.
 *
 * Register: these are working people at a landing, not innkeepers. They are
 * doing a job in weather, they have said it a thousand times, and none of them
 * is pleased to see you (culture-registers.md — regional layer, marsh trades).
 */
export const FERRY_TEXT: readonly TextEntry[] = [
  {
    id: "text.ferry.underway-basin.name",
    surface: "descriptive",
    text: "The basin raft",
    note: "Map and service-menu label for the Helstrom basin crossing.",
  },
  {
    id: "text.ferry.underway-basin.hail",
    surface: "dialogue",
    text:
      "Three drakes and I pole you over. Or walk under Helstrom for nothing. The root keeps some of the people who enter it.",
    note:
      "Argonian village poler. The ferry only exists because the free alternative is the Underway, a Hist root gallery — so the line names the price and the alternative, and lets the player weigh them. No threat: he is stating what the root is like.",
  },
  {
    id: "text.ferry.onkobra-bond.name",
    surface: "descriptive",
    text: "The bonded crossing",
    note: "Gideon's customs ferry on the lower Onkobra.",
  },
  {
    id: "text.ferry.onkobra-bond.hail",
    surface: "dialogue",
    text:
      "Ten drakes and the clerk sees what you are carrying. The river is knee-deep if you would rather not be seen. Wading is legal until I write it down as smuggling.",
    note:
      "Imperial customs boatman at Gideon's bonded shed. The water measures 0.5 m, so the boat is not physically necessary and the line must not pretend otherwise — it sells lawfulness. The last sentence is the whole gate: wading is legal until he decides it was smuggling. Reviewed 2026-09-09.",
  },
  {
    id: "text.ferry.onkobra-bond.refusal",
    surface: "dialogue",
    text: "Not with that on your back. Declare it at the shed or walk.",
    note:
      "Shown when `carriedValueAtLeast` refuses the boat. Names the two ways out so the rule teaches itself.",
  },
  {
    id: "text.ferry.drowning-gate.name",
    surface: "descriptive",
    text: "The gate ferry",
    note: "The seasonal crossing at the Drowning Gate, on the Blackwood Road.",
  },
  {
    id: "text.ferry.drowning-gate.hail",
    surface: "dialogue",
    text:
      "The gate is down until the rains stop. Fifteen drakes to go round it by water. My brother takes the arguments.",
    note:
      "One of the two families Gideon pays to swing the monsoon barrier. The fare is a monopoly price and he knows it; the dry wit is structural (style guide §2.2): arguing is an established part of the service, handled by the brother. Reviewed 2026-09-09.",
  },
  {
    id: "text.ferry.drowning-gate.refusal",
    surface: "dialogue",
    text: "Gate is open. In the dry season there is no fare to take.",
    note: "Dry season, when the reach is a ford and the service does not run.",
  },
  {
    id: "text.ferry.blackrose-lake.name",
    surface: "descriptive",
    text: "The lake stages",
    note: "The Blackrose lake ferry network: five stations that already name each other.",
  },
  {
    id: "text.ferry.bramman-oliis.name",
    surface: "descriptive",
    text: "The Bramman ferry",
    note: "Bramman River Ferry to the Oliis stage; the coast road's crossing south of Soulrest.",
  },
  {
    id: "text.ferry.estuary-run.name",
    surface: "descriptive",
    text: "The estuary run",
    note: "Archon to Soulrest and Portdun-Mont; the longest open-water passage in the network.",
  },
  {
    id: "text.ferry.jungle-stage.name",
    surface: "descriptive",
    text: "The jungle stages",
    note: "Reserved. Both stages are deferred records in the catalogue.",
  },
  {
    id: "text.ferry.stage-generic.hail",
    surface: "dialogue",
    text: "Where are you bound? I go when the boat is full, or when you pay for the empty seats.",
    note:
      "The shared hail for a scheduled stage, where the operator is a station keeper rather than a named character. Morrowind's travel NPCs open with the question and nothing else; the second sentence is the fare rule stated as the way the trade works, and it is also the answer to 'why can I leave immediately'.",
  },
  {
    id: "text.ferry.refused-owing",
    surface: "dialogue",
    text: "You owe too much on this water. Settle it, then ask me again.",
    note:
      "`owingAtLeast` on the Blackrose lake, where the ferry is the only way off a prison shore. Names the remedy, because a gate with no way through it is a wall.",
  },
  {
    id: "text.ferry.refused-weather",
    surface: "dialogue",
    text: "Not in this. Come back when it drops.",
    note:
      "`weatherIs: storm`. Five words, because a boatman refusing weather does not explain himself.",
  },
];

/** The live catalogue. Built at module load so a malformed entry fails the tests. */
export const CATALOGUE = buildCatalogue([
  ...SYSTEM_TEXT,
  ...COMBAT_SANDBOX_TEXT,
  ...EQUIPMENT_TEXT,
  ...FERRY_TEXT,
]);
