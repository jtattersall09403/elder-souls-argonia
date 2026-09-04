/**
 * Catalogue content.
 *
 * Seeded with the system text that exists today. Everything player-visible
 * written from here on is registered in this file (or, once the volume
 * justifies it, in per-area files exported from here) — see
 * docs/engineering-standards.md standard 4.
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
      "With this death, a root is severed. Restore an earlier save to keep this story.",
    note:
      "Shown when the player kills a tier-protected character. All NPCs are killable and none are flagged invincible (quests 40 §30b), so this message is the whole protection — it must be plain and instantly actionable. The first draft read 'a root the story grew along is severed': the owner's example of AI voice reaching for gravitas (quests 60 §45e).",
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

/** The live catalogue. Built at module load so a malformed entry fails the tests. */
export const CATALOGUE = buildCatalogue(SYSTEM_TEXT);
