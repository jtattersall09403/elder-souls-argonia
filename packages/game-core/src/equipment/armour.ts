import manifest from "./generated/armour.items.json";
import { SEXES, type Sex } from "../actors/races";
import { MATERIAL_PROFILES, type MaterialId } from "./materials";
import type { AttributeMap, EquipSlot } from "./types";

/**
 * Wearable armour, resolved from pipeline data.
 *
 * Same two axes as the arsenal: a *slot* says what kind of protection it is and
 * roughly what it weighs, a *material* says how good it is. Nothing is written
 * per piece, so a new set is a few lines of pipeline config.
 *
 * A third axis is the wearer's, not the item's: a piece ships as one GLB per
 * sex, each carrying its maximum-weight geometry with the minimum-weight one as
 * a morph target. Which one a given actor loads, and how far it is blended, is
 * a property of the actor — so it is resolved at mount time from the wearer's
 * `CharacterBuild`, not baked into the definition (decision 0056).
 */

export type ArmourSlot = "cuirass" | "gauntlets" | "boots" | "helmet";

type BuiltSlot = { equipSlot: string; baseWeightKg: number; baseRating: number };
type BuiltArmour = {
  slot: string;
  material: string;
  assets: Record<string, string>;
  icon: string;
  coversBipedSlots: Record<string, number[]>;
  sizeMeters: [number, number, number];
};

const MANIFEST = manifest as unknown as {
  schemaVersion?: number;
  slots: Record<ArmourSlot, BuiltSlot>;
  items: Record<string, BuiltArmour>;
};

/**
 * Engineering standard 3. Version 1 was the unversioned manifest that carried a
 * single `asset` per piece — the male, maximum-weight mesh, which every wearer
 * loaded. Reading one as if it were this schema would dress every woman in a
 * man's armour and leave a hole between her head and her collar, so it fails at
 * import rather than on screen.
 */
if (MANIFEST.schemaVersion !== 2) {
  throw new Error(
    `armour.items.json is schemaVersion ${String(MANIFEST.schemaVersion)}, expected 2 — ` +
    "rebuild the armour set (tooling/asset-pipeline) before running the game.",
  );
}

const SLOTS = MANIFEST.slots;
const BUILT = MANIFEST.items;

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
  /**
   * The skinned GLB for each sex, relative to the deployment base URL.
   *
   * Two meshes, because Bethesda authored two: a female cuirass is not a male
   * one on a different body. Every sex in `SEXES` is present or the module
   * refuses to load, so `armourAsset` is a lookup rather than a search.
   */
  assets: Readonly<Record<Sex, string>>;
  icon: string;
  /**
   * Biped slots this piece occupies, read from the NIF's own dismember
   * partitions. Body meshes in the same slots are hidden underneath it, so
   * coverage cannot drift from the art.
   *
   * Per sex, because Bethesda's two halves are not always cut the same: the
   * male steel cuirass takes the forearms and the female one does not. Use
   * `armourCoverage`.
   */
  coversBipedSlots: Readonly<Record<Sex, readonly number[]>>;
  description: string;
};

function resolveAssets(id: string, built: BuiltArmour): Record<Sex, string> {
  const assets = {} as Record<Sex, string>;
  for (const sex of SEXES) {
    const asset = built.assets?.[sex];
    if (typeof asset !== "string") {
      throw new RangeError(`armour "${id}" has no ${sex} asset`);
    }
    assets[sex] = asset;
  }
  return assets;
}

function resolveCoverage(id: string, built: BuiltArmour): Record<Sex, readonly number[]> {
  const coverage = {} as Record<Sex, readonly number[]>;
  for (const sex of SEXES) {
    const slots = built.coversBipedSlots?.[sex];
    if (!Array.isArray(slots)) throw new RangeError(`armour "${id}" has no ${sex} coverage`);
    coverage[sex] = slots;
  }
  return coverage;
}

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
    assets: resolveAssets(id, built),
    icon: built.icon,
    coversBipedSlots: resolveCoverage(id, built),
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

/**
 * The GLB this piece is worn in by a wearer of this sex.
 *
 * No fallback: `resolveAssets` has already refused, at import, a manifest that
 * does not carry every sex. A wearer in the wrong sex's cuirass is the exact
 * defect this change exists to remove, so it is not offered as a degraded
 * mode.
 */
export function armourAsset(piece: Pick<ArmourDefinition, "assets">, sex: Sex): string {
  return piece.assets[sex];
}

/** The biped slots this piece covers on a wearer of this sex. */
export function armourCoverage(
  piece: Pick<ArmourDefinition, "coversBipedSlots">, sex: Sex,
): readonly number[] {
  return piece.coversBipedSlots[sex];
}

/** Total protection from a set of worn pieces. */
export function totalArmourRating(pieces: readonly ArmourDefinition[]) {
  return pieces.reduce((total, piece) => total + piece.armourRating, 0);
}
