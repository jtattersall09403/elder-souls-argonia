import manifest from "./generated/armour.items.json";
import { MATERIAL_PROFILES, type MaterialId } from "./materials";
import type { AttributeMap, EquipSlot } from "./types";

/**
 * Wearable armour, resolved from pipeline data.
 *
 * Same two axes as the arsenal: a *slot* says what kind of protection it is and
 * roughly what it weighs, a *material* says how good it is. Nothing is written
 * per piece, so a new set is a few lines of pipeline config.
 */

export type ArmourSlot = "cuirass" | "gauntlets" | "boots" | "helmet";

type BuiltSlot = { equipSlot: string; baseWeightKg: number; baseRating: number };
type BuiltArmour = {
  slot: string;
  material: string;
  asset: string;
  icon: string;
  coversBipedSlots: number[];
  sizeMeters: [number, number, number];
};

const SLOTS = manifest.slots as unknown as Record<ArmourSlot, BuiltSlot>;
const BUILT = manifest.items as unknown as Record<string, BuiltArmour>;

const SLOT_LABELS: Record<ArmourSlot, string> = {
  cuirass: "Cuirass",
  gauntlets: "Gauntlets",
  boots: "Boots",
  helmet: "Helmet",
};

export type ArmourDefinition = {
  id: string;
  label: string;
  slot: EquipSlot;
  armourSlot: ArmourSlot;
  materialId: MaterialId;
  weightKg: number;
  armourRating: number;
  value: number;
  requirements: AttributeMap;
  /** Skinned GLB, relative to the deployment base URL. */
  asset: string;
  icon: string;
  /**
   * Biped slots this piece occupies, read from the NIF's own dismember
   * partitions. Body meshes in the same slots are hidden underneath it, so
   * coverage cannot drift from the art.
   */
  coversBipedSlots: readonly number[];
  description: string;
};

function build(id: string, built: BuiltArmour): ArmourDefinition {
  const armourSlot = built.slot as ArmourSlot;
  const profile = SLOTS[armourSlot];
  if (!profile) throw new RangeError(`armour "${id}" has unknown slot ${built.slot}`);
  const materialId = built.material as MaterialId;
  const material = MATERIAL_PROFILES[materialId];
  if (!material) throw new RangeError(`armour "${id}" has unknown material ${built.material}`);

  const weightKg = Number((profile.baseWeightKg * material.weightScale).toFixed(2));
  return {
    id,
    label: `${material.label} ${SLOT_LABELS[armourSlot]}`,
    slot: profile.equipSlot as EquipSlot,
    armourSlot,
    materialId,
    weightKg,
    // Armour rating rides the same guard scale a shield does: what a material
    // is worth at stopping a blow should not depend on which side of the
    // equipment split it lands on.
    armourRating: Math.round(profile.baseRating * material.guardScale * material.damageScale),
    value: Math.round(weightKg * material.valuePerKg * 0.9),
    requirements: material.requirementBonus,
    asset: built.asset,
    icon: built.icon,
    coversBipedSlots: built.coversBipedSlots,
    description: material.description,
  };
}

export const ARMOUR: Readonly<Record<string, ArmourDefinition>> = Object.fromEntries(
  Object.entries(BUILT).map(([id, built]) => [id, build(id, built)]),
);

export const ARMOUR_IDS: readonly string[] = Object.keys(ARMOUR);

export function armourById(id: string): ArmourDefinition {
  const piece = ARMOUR[id];
  if (!piece) throw new RangeError(`unknown armour: ${id}`);
  return piece;
}

/** Total protection from a set of worn pieces. */
export function totalArmourRating(pieces: readonly ArmourDefinition[]) {
  return pieces.reduce((total, piece) => total + piece.armourRating, 0);
}
