/**
 * The one catalogue of player-visible text.
 *
 * Engineering standard 4 (docs/engineering-standards.md): no player-visible
 * string is a literal in a component or a data file. Everything the player can
 * read is registered here, keyed by a stable ID, with the surface it appears on
 * and the speaker where there is one.
 *
 * The payoff is not localization (out of scope). It is that
 *
 *   - the **voice review** (quests 60 §45e — an agent whose only job is
 *     catching AI voice) sweeps one table instead of grepping the codebase;
 *   - the **glossary and newcomer-topic coverage** checks (quest Q0 gate) read
 *     one table;
 *   - terminology stays consistent across hundreds of thousands of words
 *     without anyone having to remember what we called things.
 *
 * Debug and developer UI is exempt: debug strings are not player-facing, and
 * the sandbox/studio panels are not retrofitted.
 */

/** Where a string is shown. Determines which voice rules apply to it. */
export type TextSurface =
  /** Spoken by a character: dialogue, barks, staged scenes. */
  | "dialogue"
  /** In-world written matter: books, notes, letters, signage. */
  | "document"
  /** Journal entries — the player character's own voice. */
  | "journal"
  /** Names, item and place descriptions, tooltips. */
  | "descriptive"
  /**
   * The game talking to the player: deaths, failures, tutorials, prompts.
   * The register with no character to anchor it, and so the place AI voice
   * hides best — reviewed like dialogue, never written casually.
   */
  | "system"
  /** UI chrome: buttons, labels, menu headings. */
  | "ui";

export interface TextEntry {
  /** Stable ID, `text.<area>.<name>` (engineering standard 2). */
  readonly id: string;
  readonly surface: TextSurface;
  /** The text itself. */
  readonly text: string;
  /** Speaking NPC's stable ID, for `dialogue`; null for authorless text. */
  readonly speaker?: string | null;
  /** Free note for authors and the voice reviewer (tone, context, who hears it). */
  readonly note?: string;
}

export type TextCatalogue = ReadonlyMap<string, TextEntry>;

export const TEXT_ID_SHAPE = /^text(\.[a-z0-9]+(-[a-z0-9]+)*){2,}$/;

/** Normalised form used to detect the same line written twice. */
export function textFingerprint(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export class DuplicateTextError extends Error {}
export class MalformedTextIdError extends Error {}

/**
 * Build a catalogue, enforcing the standard as it goes: IDs are well-shaped and
 * unique, and no two IDs carry the same text (the tell of two agents writing
 * the same line twice, and the thing that makes terminology drift invisible).
 */
export function buildCatalogue(entries: readonly TextEntry[]): TextCatalogue {
  const byId = new Map<string, TextEntry>();
  const byFingerprint = new Map<string, string>();

  for (const entry of entries) {
    if (!TEXT_ID_SHAPE.test(entry.id))
      throw new MalformedTextIdError(
        `\`${entry.id}\` is not a text ID: expected text.<area>.<name> in lower kebab.`,
      );
    if (byId.has(entry.id))
      throw new DuplicateTextError(`text ID \`${entry.id}\` is registered twice.`);

    const fingerprint = textFingerprint(entry.text);
    // Short UI labels legitimately repeat ("Close", "Take"); prose does not.
    if (entry.surface !== "ui" && fingerprint.length >= 24) {
      const prior = byFingerprint.get(fingerprint);
      if (prior)
        throw new DuplicateTextError(
          `\`${entry.id}\` has the same text as \`${prior}\`. One line, one ID — ` +
            `reference the existing entry instead of restating it.`,
        );
      byFingerprint.set(fingerprint, entry.id);
    }

    byId.set(entry.id, entry);
  }

  return byId;
}

/** Look up text. Throws rather than returning a placeholder: a missing string is a bug, not a nicety. */
export function text(catalogue: TextCatalogue, id: string): string {
  const entry = catalogue.get(id);
  if (!entry) throw new Error(`no text registered for \`${id}\`.`);
  return entry.text;
}

/** Every entry on one surface — what the voice reviewer iterates. */
export function bySurface(
  catalogue: TextCatalogue,
  surface: TextSurface,
): readonly TextEntry[] {
  return [...catalogue.values()].filter((e) => e.surface === surface);
}
