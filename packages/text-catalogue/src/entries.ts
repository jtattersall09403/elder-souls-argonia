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
import { HYDROLOGY_NAME_TEXT } from "./generated/hydrology-names.js";
import { PLACE_NAME_TEXT } from "./generated/place-names.js";
import { QUEST_TITLE_TEXT } from "./generated/quest-titles.js";
import { STATS_TEXT } from "./stats-text.js";

/** Names for the water and the land (16g): generated from world/sources/hydrology/names.json. */
export { HYDROLOGY_NAME_TEXT };

/** Stat record names and stats-lab UI text: `stats-text.ts`. */
export { STATS_TEXT };

/** Place names: generated from world/sources/catalogue/places-*.json by `worldgen.place_text`. */
export { PLACE_NAME_TEXT };

/** Quest titles: generated from world/sources/quests/*.json by `worldgen.place_text`. */
export { QUEST_TITLE_TEXT };

export const SYSTEM_TEXT: readonly TextEntry[] = [
  {
    id: "text.system.essential-npc-killed",
    surface: "system",
    text:
      "You have killed a character that the story needs. Restore an earlier save to continue it.",
    note:
      "Shown when a tier-protected character is killed. All NPCs are killable and none are flagged invincible (quests 40 §30b), so this message is the whole protection — it must be plain and instantly actionable. Earlier drafts reached for gravitas ('a root the story grew along is severed', then 'a root is severed'); system text carries no imagery, so it states the cause and the remedy (style guide §3). Owner 2026-09-04: the wording is open to reviewer improvement, not pinned.",
  },
  {
    id: "text.system.province-edge",
    surface: "system",
    text: "You have reached the edge of Black Marsh. You can go no further.",
    note:
      "Shown once at the invisible wall on the province border (16d). The land visible beyond the border is scenery, so the line states the stop and promises nothing else. Reviewed 2026-09-15: text unchanged.",
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
      "Save-on-rest (decision 0031). One image; it says what happened. The only line here permitted any colour, because resting is a deliberate, unhurried act.",
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
  { id: "text.sandbox.pike-opponent", surface: "ui", text: "Pike opponent" },
  { id: "text.sandbox.halberd-opponent", surface: "ui", text: "Halberd opponent" },
  { id: "text.sandbox.rapier-opponent", surface: "ui", text: "Rapier opponent" },
  { id: "text.sandbox.claw-opponent", surface: "ui", text: "Claw opponent" },
  { id: "text.sandbox.archer-opponent", surface: "ui", text: "Archer opponent" },
  { id: "text.sandbox.combat-ready", surface: "ui", text: "Combat test ready" },
  { id: "text.sandbox.empty-hand", surface: "ui", text: "Empty hand" },
  { id: "text.sandbox.arrow-gravity", surface: "ui", text: "Arrow gravity" },
  { id: "text.sandbox.skills-enabled", surface: "ui", text: "Apply skill curves" },
  { id: "text.sandbox.marksman-skill", surface: "ui", text: "Marksman skill" },
  { id: "text.sandbox.melee-skill", surface: "ui", text: "Weapon skill" },
  { id: "text.sandbox.class-effects", surface: "ui", text: "Class effects" },
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

/**
 * Combat callouts: the one-line messages the combat runtime flashes over the
 * fight (`packages/character/src/combat`). Shown upper-cased by the HUD.
 */
export const COMBAT_CALLOUT_TEXT: readonly TextEntry[] = [
  { id: "text.combat.enemy-felled", surface: "ui", text: "Enemy felled" },
  { id: "text.combat.weapons-clashed", surface: "ui", text: "Weapons clashed. Light attack to riposte" },
  { id: "text.combat.enemy-blocked", surface: "ui", text: "Enemy blocked" },
  { id: "text.combat.enemy-guard-broken", surface: "ui", text: "Enemy guard broken" },
  { id: "text.combat.arrow-blocked", surface: "ui", text: "Arrow blocked" },
  { id: "text.combat.guard-broken", surface: "ui", text: "Guard broken" },
  { id: "text.combat.you-died", surface: "ui", text: "You died" },
  { id: "text.combat.headshot", surface: "ui", text: "Headshot" },
  { id: "text.combat.blocked", surface: "ui", text: "Blocked" },
  { id: "text.combat.target-released", surface: "ui", text: "Target released" },
  { id: "text.combat.target-locked", surface: "ui", text: "Target locked" },
  { id: "text.combat.weapon-stowed", surface: "ui", text: "Weapon stowed" },
  { id: "text.combat.parry", surface: "ui", text: "Parry" },
  { id: "text.combat.backstab", surface: "ui", text: "Backstab" },
  { id: "text.combat.riposte", surface: "ui", text: "Riposte" },
  { id: "text.combat.guarding", surface: "ui", text: "Guarding" },
  { id: "text.combat.attack-parried", surface: "ui", text: "Your attack was parried" },
  { id: "text.combat.fight-restarted", surface: "ui", text: "Fight restarted" },
  { id: "text.combat.critical-hit", surface: "ui", text: "Critical hit" },
  { id: "text.combat.torch-burnt-out", surface: "ui", text: "Torch burnt out" },
];

/**
 * The combat sandbox's HUD, debug panel and controls sheet (`apps/combat-sandbox`).
 * Button glyphs (R3, ZL, the arrows) stay in code: they name physical buttons.
 */
export const SANDBOX_HUD_TEXT: readonly TextEntry[] = [
  { id: "text.sandbox.debug", surface: "ui", text: "Debug" },
  { id: "text.sandbox.enemy-present", surface: "ui", text: "Enemy present" },
  { id: "text.sandbox.enemy-attacks", surface: "ui", text: "Enemy attacks" },
  { id: "text.sandbox.enemy-count", surface: "ui", text: "Enemies" },
  { id: "text.sandbox.pool-reset", surface: "ui", text: "Reset" },
  { id: "text.sandbox.poise-toggle", surface: "ui", text: "Poise (off: every hit flinches)" },
  { id: "text.sandbox.show-weapon-volumes", surface: "ui", text: "Show weapon and parry volumes" },
  { id: "text.sandbox.show-backstab-zones", surface: "ui", text: "Show backstab zones" },
  { id: "text.sandbox.enemy", surface: "ui", text: "Enemy" },
  { id: "text.sandbox.with-shield", surface: "ui", text: "with shield" },
  { id: "text.sandbox.foot-driven", surface: "ui", text: "Attack movement from the feet" },
  { id: "text.sandbox.locked-speed-follows-clip", surface: "ui", text: "Locked-on speed follows the strafe clips" },
  { id: "text.sandbox.locked-stride-rate", surface: "ui", text: "Locked stride rate" },
  { id: "text.sandbox.range-position", surface: "ui", text: "range position" },
  { id: "text.sandbox.nock", surface: "ui", text: "nock" },
  { id: "text.sandbox.draw", surface: "ui", text: "draw" },
  { id: "text.sandbox.stamina-cost", surface: "ui", text: "stamina" },
  { id: "text.sandbox.bow-view", surface: "ui", text: "Bow view" },
  { id: "text.sandbox.bow-view-first-person", surface: "ui", text: "First person, Skyrim arms rig" },
  { id: "text.sandbox.bow-view-shoulder", surface: "ui", text: "Third person, over the shoulder" },
  { id: "text.sandbox.bow-view-eye", surface: "ui", text: "Third person body, eye camera" },
  { id: "text.sandbox.aim-error", surface: "ui", text: "Aim error" },
  { id: "text.sandbox.show-colliders", surface: "ui", text: "Show all other colliders" },
  { id: "text.sandbox.reset-restart", surface: "ui", text: "Reset and restart" },
  { id: "text.sandbox.fps", surface: "ui", text: "fps" },
  { id: "text.sandbox.timing-heading", surface: "ui", text: "Attack timings, seconds" },
  { id: "text.sandbox.timing-class", surface: "ui", text: "Class" },
  { id: "text.sandbox.timing-light", surface: "ui", text: "Light" },
  { id: "text.sandbox.timing-heavy", surface: "ui", text: "Heavy" },
  { id: "text.sandbox.timing-phases", surface: "ui", text: "wind-up / active / recovery" },
  { id: "text.sandbox.visual-test", surface: "ui", text: "Visual test" },
  { id: "text.sandbox.player-status", surface: "ui", text: "Player status" },
  { id: "text.sandbox.equipment", surface: "ui", text: "Equipment" },
  { id: "text.sandbox.health", surface: "ui", text: "Health" },
  { id: "text.sandbox.stamina", surface: "ui", text: "Stamina" },
  { id: "text.sandbox.poise", surface: "ui", text: "Poise" },
  { id: "text.sandbox.controller-connected", surface: "ui", text: "Controller connected" },
  { id: "text.sandbox.input-modes", surface: "ui", text: "Keyboard · touch · gamepad" },
  { id: "text.sandbox.camera-drag", surface: "ui", text: "Drag to rotate camera" },
  { id: "text.sandbox.controls", surface: "ui", text: "Controls" },
  { id: "text.sandbox.close-controls", surface: "ui", text: "Close controls" },
  { id: "text.sandbox.help-move", surface: "ui", text: "Move / camera" },
  { id: "text.sandbox.help-attack", surface: "ui", text: "Light / heavy" },
  { id: "text.sandbox.help-guard", surface: "ui", text: "Guard / parry" },
  { id: "text.sandbox.help-dodge", surface: "ui", text: "Dodge / sprint" },
  { id: "text.sandbox.help-jump", surface: "ui", text: "Jump" },
  { id: "text.sandbox.help-crouch", surface: "ui", text: "Crouch" },
  { id: "text.sandbox.help-lock", surface: "ui", text: "Lock / heal / equip" },
  { id: "text.sandbox.help-inventory", surface: "ui", text: "Inventory" },
  { id: "text.sandbox.help-switch-target", surface: "ui", text: "Switch target" },
  { id: "text.sandbox.help-bow-draw", surface: "ui", text: "Bow: raise / draw" },
  { id: "text.sandbox.help-bow-lower", surface: "ui", text: "Bow: lower" },
  { id: "text.sandbox.help-bow-zoom", surface: "ui", text: "Bow: zoom" },
  { id: "text.sandbox.keys-move", surface: "ui", text: "WASD / drag" },
  { id: "text.sandbox.keys-attack", surface: "ui", text: "Mouse 1 tap / hold 0.3 s" },
  { id: "text.sandbox.keys-guard", surface: "ui", text: "Mouse 2 / Mouse 2 + Mouse 1" },
  { id: "text.sandbox.keys-dodge", surface: "ui", text: "Space tap / hold" },
  { id: "text.sandbox.keys-jump", surface: "ui", text: "Either Shift" },
  { id: "text.sandbox.keys-crouch", surface: "ui", text: "C" },
  { id: "text.sandbox.keys-lock", surface: "ui", text: "Q / H / Tab" },
  { id: "text.sandbox.keys-inventory", surface: "ui", text: "I (Esc closes)" },
  { id: "text.sandbox.keys-switch-target", surface: "ui", text: ", / ." },
  { id: "text.sandbox.keys-bow-draw", surface: "ui", text: "Mouse 1 tap / hold" },
  { id: "text.sandbox.keys-bow-lower", surface: "ui", text: "Mouse 2" },
  { id: "text.sandbox.keys-bow-zoom", surface: "ui", text: "Scroll wheel" },
  { id: "text.sandbox.pad-move", surface: "ui", text: "L stick / R stick" },
  { id: "text.sandbox.pad-attack", surface: "ui", text: "R / ZR" },
  { id: "text.sandbox.pad-guard", surface: "ui", text: "L / ZL" },
  { id: "text.sandbox.pad-dodge", surface: "ui", text: "B tap / hold" },
  { id: "text.sandbox.pad-jump", surface: "ui", text: "A" },
  { id: "text.sandbox.pad-crouch", surface: "ui", text: "L3" },
  { id: "text.sandbox.pad-lock", surface: "ui", text: "R3 / X / D-pad →" },
  { id: "text.sandbox.pad-inventory", surface: "ui", text: "Start" },
  { id: "text.sandbox.pad-bow-draw", surface: "ui", text: "R tap / hold" },
  { id: "text.sandbox.pad-bow-lower", surface: "ui", text: "L" },
  { id: "text.sandbox.pad-bow-zoom", surface: "ui", text: "ZR in / ZL out" },
  { id: "text.sandbox.pad-switch-target", surface: "ui", text: "Right stick ←/→" },
  { id: "text.sandbox.touch-lock", surface: "ui", text: "Lock" },
  { id: "text.sandbox.touch-target", surface: "ui", text: "Target" },
  { id: "text.sandbox.touch-lower", surface: "ui", text: "Lower" },
  { id: "text.sandbox.touch-guard", surface: "ui", text: "Guard" },
  { id: "text.sandbox.touch-zoom-out", surface: "ui", text: "Zoom −" },
  { id: "text.sandbox.touch-parry", surface: "ui", text: "Parry" },
  { id: "text.sandbox.touch-draw", surface: "ui", text: "Draw" },
  { id: "text.sandbox.touch-light", surface: "ui", text: "Light" },
  { id: "text.sandbox.touch-zoom-in", surface: "ui", text: "Zoom +" },
  { id: "text.sandbox.touch-heavy", surface: "ui", text: "Heavy" },
  { id: "text.sandbox.touch-dodge", surface: "ui", text: "Dodge" },
  { id: "text.sandbox.touch-estus", surface: "ui", text: "Estus" },
  { id: "text.sandbox.touch-equip", surface: "ui", text: "Equip" },
  { id: "text.sandbox.touch-jump", surface: "ui", text: "Jump" },
  { id: "text.sandbox.touch-crouch", surface: "ui", text: "Crouch" },
  {
    id: "text.sandbox.help-notes",
    surface: "ui",
    text: "GameSir mapping uses Nintendo-layout button positions. Release dodge quickly to roll; hold it while moving to sprint. On desktop, release Mouse 1 before 0.3 seconds for a light attack, or hold it for a heavy attack; hold Mouse 2 and press Mouse 1 to parry. Press the same attack again during a swing to chain the next one without recovering. An attack pressed during a roll comes out as the roll ends. Parry during the enemy's wind-up, then light attack at close range to riposte. Circle behind an enemy and light attack at close range to backstab. With a bow drawn, tap light to raise it and hold light to draw. The longer the pull, the harder the shot. Holding at full draw drains stamina. Release to loose. Guard lowers the bow. With it raised, scroll (or hold ZR or ZL) to zoom; the view turns more slowly the further in you are. Crouch is a toggle: it halves your pace and drops you into a sneak. You stand up on your own to sprint or jump.",
    note: "The paragraph under the controls table in the sandbox help panel.",
  },
];

export const EQUIPMENT_TEXT: readonly TextEntry[] = [
  /** Weapon class names (`equipment/weaponClasses.ts`), shown in the inventory and the sandbox's timing panel. */
  { id: "text.weapon-class.dagger", surface: "ui", text: "Dagger" },
  { id: "text.weapon-class.short-sword", surface: "ui", text: "Short Sword" },
  { id: "text.weapon-class.straight-sword", surface: "ui", text: "Sword" },
  { id: "text.weapon-class.scimitar", surface: "ui", text: "Scimitar" },
  { id: "text.weapon-class.greatsword", surface: "ui", text: "Greatsword" },
  { id: "text.weapon-class.axe", surface: "ui", text: "War Axe" },
  { id: "text.weapon-class.greataxe", surface: "ui", text: "Battleaxe" },
  { id: "text.weapon-class.mace", surface: "ui", text: "Mace" },
  { id: "text.weapon-class.warhammer", surface: "ui", text: "Warhammer" },
  { id: "text.weapon-class.spear", surface: "ui", text: "Spear" },
  { id: "text.weapon-class.pike", surface: "ui", text: "Pike" },
  { id: "text.weapon-class.halberd", surface: "ui", text: "Halberd" },
  { id: "text.weapon-class.rapier", surface: "ui", text: "Rapier" },
  { id: "text.weapon-class.katana", surface: "ui", text: "Katana" },
  { id: "text.weapon-class.claw", surface: "ui", text: "Claw" },
  { id: "text.weapon-class.shortbow", surface: "ui", text: "Hunting Bow" },
  { id: "text.weapon-class.longbow", surface: "ui", text: "Longbow" },
  { id: "text.weapon-class.warbow", surface: "ui", text: "War Bow" },
  { id: "text.weapon-class.staff", surface: "ui", text: "Quarterstaff" },
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
      "The shared hail for a scheduled stage, where the operator is a station keeper rather than a named character. Morrowind's travel NPCs open with the question and nothing else; the second sentence states the fare rule as trade custom; it also answers 'why can I leave immediately'.",
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


/**
 * Travel services beyond the ferries - the boat lanes and the rootworm
 * Underground Express. The graph is `world/sources/routes/travel-services.json`;
 * every `text.*` id it carries is registered here and checked by
 * `python3 -m worldgen.travel_services --check`.
 *
 * Register: boat owners are tradespeople working their own water. They state
 * the fare and the one rule of their boat, and nothing else.
 */
export const TRAVEL_TEXT: readonly TextEntry[] = [
  {
    id: "text.boat.alten-corimont-helstrom.name",
    surface: "descriptive",
    text: "Alten Corimont to Helstrom, by boat",
    note: "Service-menu label for the registry boat lane between Alten Corimont and Helstrom.",
  },
  {
    id: "text.boat.alten-corimont-helstrom.hail",
    surface: "dialogue",
    text: "Five drakes upriver to Helstrom. I leave when you sit down.",
    note: "The boat owner at Alten Corimont. Fare stated, then his rule for the boat.",
  },
  {
    id: "text.boat.archon-helstrom.name",
    surface: "descriptive",
    text: "Archon to Helstrom, by boat",
    note: "Service-menu label for the registry boat lane between Archon and Helstrom.",
  },
  {
    id: "text.boat.archon-helstrom.hail",
    surface: "dialogue",
    text: "Helstrom, five drakes. Keep your gear out of the bilge.",
    note: "The boat owner at Archon. Fare stated, then his rule for the boat.",
  },
  {
    id: "text.boat.archon-thorn.name",
    surface: "descriptive",
    text: "Archon to Thorn, by boat",
    note: "Service-menu label for the registry boat lane between Archon and Thorn.",
  },
  {
    id: "text.boat.archon-thorn.hail",
    surface: "dialogue",
    text: "Five drakes and I put you off at Thorn. Pay before you board.",
    note: "The boat owner at Archon. Fare stated, then his rule for the boat.",
  },
  {
    id: "text.boat.blackrose-lilmoth.name",
    surface: "descriptive",
    text: "Blackrose to Lilmoth, by boat",
    note: "Service-menu label for the registry boat lane between Blackrose and Lilmoth.",
  },
  {
    id: "text.boat.blackrose-lilmoth.hail",
    surface: "dialogue",
    text: "Lilmoth is five drakes. Do not stand up in my boat.",
    note: "The boat owner at Blackrose. Fare stated, then his rule for the boat.",
  },
  {
    id: "text.boat.gideon-helstrom.name",
    surface: "descriptive",
    text: "Gideon to Helstrom, by boat",
    note: "Service-menu label for the registry boat lane between Gideon and Helstrom.",
  },
  {
    id: "text.boat.gideon-helstrom.hail",
    surface: "dialogue",
    text: "Five drakes to Helstrom. If you are late I go without you.",
    note: "The boat owner at Gideon. Fare stated, then his rule for the boat.",
  },
  {
    id: "text.boat.lake-ferry-stage-blackrose.name",
    surface: "descriptive",
    text: "The North Stage to Blackrose, by boat",
    note: "Service-menu label for the registry boat lane between The North Stage and Blackrose.",
  },
  {
    id: "text.boat.lake-ferry-stage-blackrose.hail",
    surface: "dialogue",
    text: "Across to Blackrose, five drakes. Keep your blade sheathed on my boat.",
    note: "The boat owner at The North Stage. Fare stated, then his rule for the boat.",
  },
  {
    id: "text.boat.lilmoth-archon.name",
    surface: "descriptive",
    text: "Lilmoth to Archon, by boat",
    note: "Service-menu label for the registry boat lane between Lilmoth and Archon.",
  },
  {
    id: "text.boat.lilmoth-archon.hail",
    surface: "dialogue",
    text: "Archon, five drakes. I take no cargo that I cannot lift myself.",
    note: "The boat owner at Lilmoth. Fare stated, then his rule for the boat.",
  },
  {
    id: "text.boat.lilmoth-lighter-flotilla.name",
    surface: "descriptive",
    text: "Lilmoth to Lighter Flotilla, by boat",
    note: "Service-menu label for the registry boat lane between Lilmoth and Lighter Flotilla.",
  },
  {
    id: "text.boat.lilmoth-lighter-flotilla.hail",
    surface: "dialogue",
    text: "Out to the flotilla, five drakes. Mind the step, it is wet.",
    note: "The boat owner at Lilmoth. Fare stated, then his rule for the boat.",
  },
  {
    id: "text.boat.oliis-ferry-stage-oliis-boardwalk.name",
    surface: "descriptive",
    text: "Estuary Stage to Walks-The-Mangrove, by boat",
    note: "Service-menu label for the registry boat lane between Estuary Stage and Walks-The-Mangrove.",
  },
  {
    id: "text.boat.oliis-ferry-stage-oliis-boardwalk.hail",
    surface: "dialogue",
    text: "Over to the boardwalk, five drakes. Sit at the back of the boat.",
    note: "The boat owner at Estuary Stage. Fare stated, then his rule for the boat.",
  },
  {
    id: "text.boat.soulrest-blackrose.name",
    surface: "descriptive",
    text: "Soulrest to Blackrose, by boat",
    note: "Service-menu label for the registry boat lane between Soulrest and Blackrose.",
  },
  {
    id: "text.boat.soulrest-blackrose.hail",
    surface: "dialogue",
    text: "Blackrose, five drakes. Once I am off the landing I do not turn back.",
    note: "The boat owner at Soulrest. Fare stated, then his rule for the boat.",
  },
  {
    id: "text.boat.soulrest-lilmoth.name",
    surface: "descriptive",
    text: "Soulrest to Lilmoth, by boat",
    note: "Service-menu label for the registry boat lane between Soulrest and Lilmoth.",
  },
  {
    id: "text.boat.soulrest-lilmoth.hail",
    surface: "dialogue",
    text: "Down to Lilmoth for five drakes. One bag each, kept on your knees.",
    note: "The boat owner at Soulrest. Fare stated, then his rule for the boat.",
  },
  {
    id: "text.boat.stormhold-alten-corimont.name",
    surface: "descriptive",
    text: "Stormhold to Alten Corimont, by boat",
    note: "Service-menu label for the registry boat lane between Stormhold and Alten Corimont.",
  },
  {
    id: "text.boat.stormhold-alten-corimont.hail",
    surface: "dialogue",
    text: "Alten Corimont, five drakes. You bail when I tell you.",
    note: "The boat owner at Stormhold. Fare stated, then his rule for the boat.",
  },
  {
    id: "text.rootworm.underground-express.name",
    surface: "descriptive",
    text: "The Underground Express",
    note: "Service-menu label for the rootworm network. Placeholder until the stations are re-authored in 16g.",
  },
  {
    id: "text.rootworm.underground-express.hail",
    surface: "dialogue",
    text: "The worm is awake. Say where you are going and stand in the mouth.",
    note: "The Waykeeper at a root node. Placeholder line until the hero Hist nodes are authored in 16g.",
  },
  {
    id: "text.canoe.slough-point-quinrawl-anchorage.name",
    surface: "descriptive",
    text: "Slough Point to Quin'rawl Anchorage, by canoe",
    note: "Service-menu label for the canoe run along the Slough Point channels, calling at Moonmarch and Mudfoot.",
  },
  {
    id: "text.canoe.slough-point-quinrawl-anchorage.hail",
    surface: "dialogue",
    text: "Two drakes down the channels to the anchorage. Keep your weight in the middle.",
    note: "The poler at Slough Point. Fare stated, then his rule for the canoe.",
  },
  {
    id: "text.canoe.bright-throat-village-oliis-ferry-stage.name",
    surface: "descriptive",
    text: "Bright-Throat Village to the Estuary Stage, by canoe",
    note: "Service-menu label for the canoe run from Bright-Throat Village to the Estuary Stage, calling at Screen-Watch.",
  },
  {
    id: "text.canoe.bright-throat-village-oliis-ferry-stage.hail",
    surface: "dialogue",
    text: "Two drakes to the stage, by way of Screen-Watch. Bail when the water comes over the side.",
    note: "The poler at Bright-Throat Village. Fare stated, then his rule for the canoe.",
  },
  {
    id: "text.canoe.treasure-hunters-live-camp-portdun-mont.name",
    surface: "descriptive",
    text: "Fortune's Own to Portdun Mont, by canoe",
    note: "Service-menu label for the canoe run between the Fortune's Own camp and Portdun Mont.",
  },
  {
    id: "text.canoe.treasure-hunters-live-camp-portdun-mont.hail",
    surface: "dialogue",
    text: "Two drakes out to Portdun Mont. Whatever you dug up travels at your feet.",
    note: "The poler at Fortune's Own. Fare stated, then his rule for the canoe.",
  },
  {
    id: "text.canoe.lake-divers-yard-lake-ferry-stage.name",
    surface: "descriptive",
    text: "The Barge Yard to the North Stage, by canoe",
    note: "Service-menu label for the canoe run across the lake channel between the Barge Yard and the North Stage.",
  },
  {
    id: "text.canoe.lake-divers-yard-lake-ferry-stage.hail",
    surface: "dialogue",
    text: "Two drakes across to the North Stage. Stay seated the whole way.",
    note: "The poler at the Barge Yard. Fare stated, then his rule for the canoe.",
  },
  {
    id: "text.canoe.riverwalk-the-tide-fair.name",
    surface: "descriptive",
    text: "Riverwalk to Tide Fair, by canoe",
    note: "Service-menu label for the canoe run along the Riverwalk channels, calling at Hissmir and Murkwater.",
  },
  {
    id: "text.canoe.riverwalk-the-tide-fair.hail",
    surface: "dialogue",
    text: "Two drakes to Tide Fair, calling at Hissmir and Murkwater. Hands inside the hull.",
    note: "The poler at Riverwalk. Fare stated, then his rule for the canoe.",
  },
  {
    id: "text.canoe.hutan-tzel-the-black-stage.name",
    surface: "descriptive",
    text: "Hutan-Tzel to the Black Stage, by canoe",
    note: "Service-menu label for the short canoe run between Hutan-Tzel and the Black Stage.",
  },
  {
    id: "text.canoe.hutan-tzel-the-black-stage.hail",
    surface: "dialogue",
    text: "Two drakes over to the Black Stage. I take four and no more.",
    note: "The poler at Hutan-Tzel. Fare stated, then his rule for the canoe.",
  },
];

/**
 * The travel interaction itself (16e deliverable 7): the prompt at an
 * operator's socket, the fare line in the menu and the three outcomes.
 *
 * `{role}` and `{gold}` are filled by the caller from the service record.
 * Register: the game talking to the player, so plain and short.
 */
export const TRAVEL_UI_TEXT: readonly TextEntry[] = [
  {
    id: "text.travel.prompt-talk",
    surface: "system",
    text: "Talk to the {role}",
    note: "Shown when the character is within four metres of an operator socket. {role} is the service record's operator role, such as ferryman or boat owner.",
  },
  {
    id: "text.travel.menu-fare",
    surface: "ui",
    text: "{gold} drakes",
    note: "The fare in the service menu. Drakes are the septim by its Black Marsh name; {gold} is the fare after any free-passage gate.",
  },
  {
    id: "text.travel.menu-free",
    surface: "ui",
    text: "no charge",
    note: "Shown in place of the fare when a free-passage gate holds.",
  },
  {
    id: "text.travel.cannot-pay",
    surface: "system",
    text: "You cannot pay the fare.",
    note: "The purse is short. States the cause; the fare is already on screen beside it.",
  },
  {
    id: "text.travel.unavailable",
    surface: "system",
    text: "Nobody is taking passengers now.",
    note: "An availability gate fails, or the record carries a gate this build cannot evaluate. Says only that the service is shut, because the reason is weather or season, visible in the world.",
  },
  {
    id: "text.travel.arrived",
    surface: "system",
    text: "You arrive.",
    note: "Shown for three seconds after a trip resolves. Two words: nothing was simulated, so nothing is described.",
  },
];

/**
 * The inventory screen and the items with hand-written names (combat-sandbox
 * lane round 3, decision 0091). Labels are chrome; the rejection lines tell
 * the player why a click did nothing, so they state the rule and stop.
 * `{class}`, `{gold}` and `{rating}` are filled by the caller.
 */
export const INVENTORY_TEXT: readonly TextEntry[] = [
  { id: "text.inventory.title", surface: "ui", text: "Inventory" },
  { id: "text.inventory.sandbox-title", surface: "ui", text: "Ecctrl Combat Sandbox" },
  { id: "text.inventory.tab-all", surface: "ui", text: "All" },
  { id: "text.inventory.tab-weapon", surface: "ui", text: "Weapon" },
  { id: "text.inventory.tab-apparel", surface: "ui", text: "Apparel" },
  { id: "text.inventory.tab-magic", surface: "ui", text: "Magic" },
  { id: "text.inventory.tab-misc", surface: "ui", text: "Misc" },
  { id: "text.inventory.hint-all", surface: "ui", text: "Everything you are carrying." },
  { id: "text.inventory.hint-weapon", surface: "ui", text: "Blades, hafts and hammers." },
  { id: "text.inventory.hint-apparel", surface: "ui", text: "Worn and carried protection." },
  { id: "text.inventory.hint-magic", surface: "ui", text: "Potions, scrolls and enchanted things." },
  { id: "text.inventory.hint-misc", surface: "ui", text: "Everything else." },
  { id: "text.inventory.slot-main-hand", surface: "ui", text: "Weapon" },
  { id: "text.inventory.slot-off-hand", surface: "ui", text: "Off hand" },
  { id: "text.inventory.slot-ammo", surface: "ui", text: "Arrows" },
  { id: "text.inventory.slot-head", surface: "ui", text: "Head" },
  { id: "text.inventory.slot-chest", surface: "ui", text: "Cuirass" },
  { id: "text.inventory.slot-hands", surface: "ui", text: "Gauntlets" },
  { id: "text.inventory.slot-feet", surface: "ui", text: "Boots" },
  { id: "text.inventory.slot-amulet", surface: "ui", text: "Amulet" },
  { id: "text.inventory.slot-ring", surface: "ui", text: "Ring" },
  { id: "text.inventory.reject-unknown-item", surface: "ui", text: "This does not exist." },
  { id: "text.inventory.reject-not-equippable", surface: "ui", text: "This cannot be worn or held." },
  { id: "text.inventory.reject-not-carried", surface: "ui", text: "You are not carrying this." },
  { id: "text.inventory.reject-two-handed", surface: "ui", text: "Your weapon needs both hands." },
  {
    id: "text.inventory.reject-not-one-handed",
    surface: "ui",
    text: "Only a one-handed weapon fits the off hand.",
    note: "Shown on a two-handed weapon or a bow sent to the off hand.",
  },
  {
    id: "text.inventory.reject-needs-two",
    surface: "ui",
    text: "You need a second one to hold one in each hand.",
    note: "The same weapon in both hands needs two of it carried.",
  },
  { id: "text.inventory.equipped", surface: "ui", text: "Equipped" },
  { id: "text.inventory.tap-to-equip", surface: "ui", text: "Tap again to equip" },
  { id: "text.inventory.click-to-equip", surface: "ui", text: "Click to equip" },
  {
    id: "text.inventory.right-click-off-hand",
    surface: "ui",
    text: "Right-click for the off hand",
    note: "Detail line on a one-handed weapon or a torch: a right-click puts it in the left hand.",
  },
  { id: "text.inventory.gold", surface: "ui", text: "{gold} gold" },
  { id: "text.inventory.armour-rating", surface: "ui", text: "Armour: {rating}" },
  { id: "text.inventory.close", surface: "ui", text: "Close" },
  { id: "text.inventory.search", surface: "ui", text: "Search items" },
  { id: "text.inventory.empty", surface: "ui", text: "Nothing here." },
  {
    id: "text.inventory.borrowed-moveset",
    surface: "ui",
    text: "No {class} moveset yet. Swings with the one-handed set.",
    note: "Warning on a weapon whose class has no clips of its own. {class} is the class name in lower case.",
  },
  { id: "text.item.healing-draught.name", surface: "ui", text: "Healing Draught" },
  {
    id: "text.item.healing-draught.description",
    surface: "descriptive",
    text: "Sharp with mountain flower. Closes what is open.",
    note: "Moved unchanged from inventory/registry.ts (round 3); not reviewed since.",
  },
  { id: "text.item.lockpick.name", surface: "ui", text: "Lockpick" },
  {
    id: "text.item.lockpick.description",
    surface: "descriptive",
    text: "Bent iron. Optimism.",
    note: "Moved unchanged from inventory/registry.ts (round 3); not reviewed since.",
  },
  { id: "text.item.torch.name", surface: "ui", text: "Torch" },
  { id: "text.inventory.stat-burn-time", surface: "ui", text: "Burn time" },
  {
    id: "text.item.torch.description",
    surface: "descriptive",
    text: "Burns for four minutes before it is spent.",
    note: "Skyrim's Torch01 record: 240 seconds of light, then the torch is used up (decision 0091).",
  },
];

/** The live catalogue. Built at module load so a malformed entry fails the tests. */
export const CATALOGUE = buildCatalogue([
  ...SYSTEM_TEXT,
  ...COMBAT_SANDBOX_TEXT,
  ...COMBAT_CALLOUT_TEXT,
  ...SANDBOX_HUD_TEXT,
  ...EQUIPMENT_TEXT,
  ...INVENTORY_TEXT,
  ...FERRY_TEXT,
  ...TRAVEL_TEXT,
  ...TRAVEL_UI_TEXT,
  ...HYDROLOGY_NAME_TEXT,
  ...PLACE_NAME_TEXT,
  ...QUEST_TITLE_TEXT,
  ...STATS_TEXT,
]);
