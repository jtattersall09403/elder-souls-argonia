/**
 * What worn armour is worth against a hit.
 *
 * One rule for every kind of damage. A sword and an arrow both meet the same
 * plate, so the same total rating reduces both — an arrow is not special-cased
 * against a cuirass while a greatsword ignores the wearer's kit entirely.
 *
 * Pure and free of the item system on purpose: the caller resolves whatever an
 * actor is wearing down to one number first, so a creature with natural hide
 * and a knight in full plate go through the same call.
 */

/**
 * Armour rating at which exactly half of incoming damage is stopped.
 *
 * Diminishing returns by construction: `rating / (rating + K)` cannot reach 1,
 * so there is no rating at which an actor becomes immune, and every extra point
 * is worth a little less than the last. A full steel set rates about 50 and
 * turns roughly a quarter of a blow; daedric plate rates about 100 and turns
 * closer to two fifths.
 */
export const ARMOUR_HALF_MITIGATION_RATING = 150;

/** Fraction of incoming damage the rating stops, 0-1. */
export function armourMitigation(armourRating: number) {
  const rating = Math.max(0, armourRating);
  return rating / (rating + ARMOUR_HALF_MITIGATION_RATING);
}

/** Damage left after armour. */
export function damageAfterArmour(damage: number, armourRating: number) {
  return Math.max(0, damage) * (1 - armourMitigation(armourRating));
}
