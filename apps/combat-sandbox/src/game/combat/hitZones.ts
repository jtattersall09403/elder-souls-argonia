import { VISUAL_PROBE_BONES } from "../validation/actorVisualMetrics";

/**
 * Where a blow landed, and what that is worth.
 *
 * Keyed by the rig's own bone names, so a hit zone is a property of the
 * skeleton rather than a list of magic strings in the combat code. A bone with
 * no entry is an ordinary hit — which is most of them, and which is what makes
 * this cheap to extend one limb at a time.
 *
 * Deliberately data: a future perk, arrow type or difficulty setting scales
 * these rather than adding a branch wherever damage is applied.
 */
export type HitZone = {
  id: string;
  label: string;
  /** Multiplies damage. */
  damageMultiplier: number;
  /** Force the heavy reaction, whatever the attack would normally cause. */
  heavyReaction: boolean;
};

const HEAD: HitZone = {
  id: "head",
  label: "head",
  damageMultiplier: 2,
  heavyReaction: true,
};

export const ORDINARY_HIT: HitZone = {
  id: "body",
  label: "body",
  damageMultiplier: 1,
  heavyReaction: false,
};

/** Bone name (sanitised, as three.js reports it) to the zone it belongs to. */
const ZONE_BY_BONE: Readonly<Record<string, HitZone>> = {
  [VISUAL_PROBE_BONES.head]: HEAD,
};

export function hitZoneForBone(boneName: string | null | undefined): HitZone {
  if (!boneName) return ORDINARY_HIT;
  return ZONE_BY_BONE[boneName] ?? ORDINARY_HIT;
}
