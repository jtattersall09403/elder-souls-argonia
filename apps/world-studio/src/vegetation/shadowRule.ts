/**
 * THE SHADOW RULE (round 7, corrected round 8). The sun shadow is cast by the
 * HIGHEST NON-CARD kit level at or below 1: the mid rung (level 1) where the
 * species has a mesh there, else the full mesh (level 0). Cards never cast,
 * and no rung beyond level 1 casts.
 *
 * Round 7 stated the rule as "level 1 where a rung resolves to it", which was
 * wrong for every alpha-tested species: their ladder folds to [full mesh,
 * card] (`buildKit`), so level 1 IS the card, the card was excluded, and the
 * species cast no shadow at all — the tree shadows the owner lost.
 *
 * Measured at the jungle site at rest before the round-7 rule: 2.6 M triangles
 * in the main pass and 2.4 M more in the two shadow cascades, because the near
 * rung is the full mesh and is drawn again in every cascade.
 *
 * The casting rung's depth material is patched with `shadowBandFromZero` so it
 * covers the distances nearer than its own band too — needed only when the
 * caster is level 1; a level-0 caster's band already starts at zero.
 */

/** A ladder rung, as far as this rule cares. */
export interface ShadowRung {
  level: number;
}

/**
 * The kit level that casts, for a species whose ladder is `rungs`, whose kit
 * has levels 0..`maxLevel`, and whose card (if any) is kit level `cardIndex`.
 */
export function shadowLevelFor(
  rungs: readonly ShadowRung[] | undefined,
  maxLevel: number,
  cardIndex: number | null,
): number {
  if (cardIndex === 1) return 0;
  return rungs?.some((r) => Math.min(maxLevel, r.level) === 1) ? 1 : 0;
}

/** `level` is the CLAMPED kit level the rung actually draws. */
export function castsShadowFor(
  rungs: readonly ShadowRung[] | undefined,
  maxLevel: number,
  cardIndex: number | null,
  level: number,
): boolean {
  return level !== cardIndex && level === shadowLevelFor(rungs, maxLevel, cardIndex);
}
