import manifest from "./generated/arsenal.items.json";
import { defineWeapon } from "./defineWeapon";
import { MATERIAL_PROFILES, scaleGuardValue, type MaterialId, type MaterialProfile } from "./materials";
import { SHIELD_STABILITY_BAND, WEAPON_STABILITY_BAND, clampToBand } from "./guard";
import { OFF_HAND_NODE_HALF_TURN, WEAPON_CLASSES, resolveMoveset, resolveWeaponAnimations, scaleMoveset } from "./weaponClasses";
import { SHIELD_ANIMATIONS } from "./movesets/shield";
import type {
  Absorption,
  AttributeMap,
  RangedStats,
  ShieldDefinition,
  WeaponClass,
  WeaponDefinition,
} from "./types";

/**
 * The buildable arsenal, resolved from pipeline data.
 *
 * The pipeline emits what it actually built — id, class, sheath socket, asset
 * path, icon path and measured size — and this file supplies the game meaning:
 * a class profile for how it fights and a material profile for how good it is.
 * Nothing here is per-item, so a new weapon is one line of pipeline config.
 */

type BuiltItem = {
  class: string;
  material: string;
  sheathSocket: string;
  asset: string;
  icon: string;
  lengthMeters: number;
  sizeMeters: [number, number, number];
};

const BUILT = manifest.items as unknown as Record<string, BuiltItem>;

/**
 * Map the pipeline's mesh-class vocabulary onto the game's weapon classes.
 * They are deliberately separate: the pipeline classifies by how a mesh is
 * built and sheathed, the game by how the thing fights.
 */
const PIPELINE_CLASS_TO_WEAPON_CLASS: Readonly<Record<string, WeaponClass>> = {
  dagger: "dagger",
  straightSword: "straightSword",
  scimitar: "scimitar",
  greatsword: "greatsword",
  waraxe: "axe",
  battleaxe: "greataxe",
  mace: "mace",
  warhammer: "warhammer",
  spear: "spear",
  halberd: "halberd",
  shortbow: "shortbow",
  longbow: "longbow",
  warbow: "warbow",
  staff: "staff",
};

/**
 * The pipeline declares each item's material; the game owns what a material
 * means. An unknown one is a configuration error worth failing loudly on
 * rather than silently statting as iron.
 */
function materialOf(itemId: string, built: BuiltItem): MaterialId {
  const material = built.material as MaterialId;
  if (!(material in MATERIAL_PROFILES)) {
    throw new RangeError(`arsenal item "${itemId}" has unknown material "${built.material}"`);
  }
  return material;
}

function titleCase(value: string) {
  return value.replace(/(^|-)([a-z])/g, (_, sep: string, letter: string) =>
    (sep ? " " : "") + letter.toUpperCase());
}

function addRequirements(base: AttributeMap, bonus: AttributeMap): AttributeMap {
  const merged: AttributeMap = { ...base };
  for (const [key, value] of Object.entries(bonus) as [keyof AttributeMap, number][]) {
    merged[key] = (merged[key] ?? 0) + value;
  }
  return merged;
}

export type ArsenalWeapon = WeaponDefinition & {
  materialId: MaterialId;
  classId: WeaponClass;
  /** Inventory art, relative to the deployment base URL. */
  icon: string;
  /** Gold. */
  value: number;
  description: string;
  /** True when this class has no authored moveset yet and borrows one. */
  borrowedMoveset: boolean;
};

export type ArsenalShield = ShieldDefinition & {
  materialId: MaterialId;
  icon: string;
  value: number;
  description: string;
};

/**
 * What a material does to a bow.
 *
 * Not a rarity multiplier: a better bow is a *stronger* bow that wastes less of
 * what it stores, which is what limb material actually buys. Everything else —
 * power stroke, limb mass, cadence — belongs to the class, because it is a
 * property of the bow's shape and not of what it is made from.
 */
function scaleRanged(base: RangedStats, material: MaterialProfile): RangedStats {
  // Draw weight is mostly the *archer's* limit, not the bow's, so a better
  // material moves it only a little. What it really buys is limbs that waste
  // less and weigh less, which is where a good bow's extra speed comes from —
  // and it keeps a daedric bow from quoting a draw weight no arm could pull.
  const drawForce = 1 + (material.damageScale - 1) * 0.25;
  const limbs = Math.sqrt(Math.max(0.4, material.damageScale));
  return {
    ...base,
    peakDrawForceN: Math.round(base.peakDrawForceN * drawForce),
    peakEfficiency: Math.min(0.97, base.peakEfficiency * (1 + (material.tier - 2) * 0.008)),
    virtualMassKg: Number((base.virtualMassKg / limbs).toFixed(4)),
    // A heavier pull costs more to hold, so the bow that hits hardest is also
    // the one you cannot stand around aiming with.
    drawStaminaPerSecond: Number((base.drawStaminaPerSecond * drawForce).toFixed(1)),
  };
}

function buildWeapon(itemId: string, built: BuiltItem): ArsenalWeapon {
  const materialId = materialOf(itemId, built);
  const material = MATERIAL_PROFILES[materialId];
  const classId = PIPELINE_CLASS_TO_WEAPON_CLASS[built.class];
  if (!classId) throw new RangeError(`arsenal item "${itemId}" has unmapped class ${built.class}`);
  const profile = WEAPON_CLASSES[classId];
  const moveset = resolveMoveset(profile);
  const weightKg = Number((profile.weightKg * material.weightScale).toFixed(2));

  const definition = defineWeapon({
    id: itemId,
    label: `${material.label} ${profile.label}`,
    stats: {
      class: classId,
      weightKg,
      baseDamage: {
        physical: Math.round(24 * material.damageScale),
        ...(material.bonusDamage ?? {}),
      },
      criticalMultiplier: 2,
      requirements: addRequirements(
        { strength: 10, agility: 10 },
        material.requirementBonus,
      ),
      scaling: { strength: 0.35, agility: 0.45 },
      occupiesOffHand: profile.twoHanded,
      ...(profile.ranged ? { ranged: scaleRanged(profile.ranged, material) } : {}),
      guard: {
        stability: clampToBand(
          scaleGuardValue(profile.stability, material.guardScale),
          WEAPON_STABILITY_BAND,
        ),
        absorption: {
          physical: scaleGuardValue(profile.physicalAbsorption, material.guardScale),
        } satisfies Absorption,
      },
    },
    visual: {
      asset: built.asset,
      // Identity: the rig's socket convention is applied once by the actor.
      held: {
        socket: profile.heldSocket ?? "Weapon",
        localPosition: [0, 0, 0],
        localRotation: profile.heldRotation ?? [0, 0, 0, 1],
        localScale: 1,
      },
      sheathed: { socket: built.sheathSocket, localPosition: [0, 0, 0], localRotation: [0, 0, 0, 1], localScale: 1 },
      sizeMeters: built.sizeMeters,
    },
    // Clips and authored timing come from the resolved moveset; how hard and
    // how far come from the class. Neither is restated per item.
    animations: resolveWeaponAnimations(profile, moveset),
    moveset: scaleMoveset(moveset.attacks, profile, moveset),
  });

  return {
    ...definition,
    materialId,
    classId,
    icon: built.icon,
    value: Math.round(weightKg * material.valuePerKg),
    description: material.description,
    // A bow is not missing a moveset: it has a shooting cycle, which is the
    // whole of what a bow does. Only the melee it borrows for a desperate bash
    // is stand-in motion, and flagging that would tell a player their bow is
    // unfinished when it is not.
    borrowedMoveset: !profile.ranged && moveset.id !== profile.moveset,
  };
}

/**
 * The shield's held-socket offset: the off-hand node's half turn.
 *
 * The rig convention is measured from *weapons*, whose attach node points down
 * the blade; a Bethesda shield node does not share that basis, so inheriting
 * the weapon convention unchanged mounted every shield facing the wrong way —
 * arm correctly through the straps, but the outer face turned in toward the
 * body.
 *
 * Measured on the built meshes rather than tuned by eye, because a rotation
 * picked by eye is the failure the rig-convention note in the animation
 * contract warns about. In shield-asset space the thin axis is Y and the mesh
 * hangs from about +0.03 to −0.14 on it, so the convex outer face is −Y and the
 * mount sits on the arm side; the pointed foot of a kite shield is −Z (elven
 * spans −0.373..+0.247). A half turn about **Z** therefore sends −Y outward
 * while leaving the point down. The other in-plane axis, X, would flip the
 * normal too — and stand every kite shield on its point.
 *
 * This was written as a fact about shields, and it is not: it is a fact about
 * the node, which is why bows on the same node need the identical turn and
 * why it now lives with the weapon classes. See `OFF_HAND_NODE_HALF_TURN`.
 */
const SHIELD_HELD_ROTATION = OFF_HAND_NODE_HALF_TURN;

function buildShield(itemId: string, built: BuiltItem): ArsenalShield {
  const materialId = materialOf(itemId, built);
  const material = MATERIAL_PROFILES[materialId];
  const weightKg = Number((6 * material.weightScale).toFixed(2));
  return {
    id: itemId,
    label: `${material.label} Shield`,
    stats: {
      class: "kiteShield",
      weightKg,
      requirements: addRequirements({ strength: 10 }, material.requirementBonus),
      guard: {
        // A shield is the reason the stability stat exists: it is a braced
        // face rather than an edge, so it sits above every weapon's band.
        stability: clampToBand(scaleGuardValue(0.72, material.guardScale), SHIELD_STABILITY_BAND),
        absorption: { physical: scaleGuardValue(0.96, material.guardScale) },
      },
    },
    animations: SHIELD_ANIMATIONS,
    visual: {
      asset: built.asset,
      held: { socket: "Shield", localPosition: [0, 0, 0], localRotation: SHIELD_HELD_ROTATION, localScale: 1 },
      // Slung on the same node when the weapon is stowed, so it keeps the same
      // correction: it is the same mount, not a second convention.
      sheathed: { socket: "Shield", localPosition: [0, 0, 0], localRotation: SHIELD_HELD_ROTATION, localScale: 1 },
      sizeMeters: built.sizeMeters,
    },
    materialId,
    icon: built.icon,
    value: Math.round(weightKg * material.valuePerKg * 0.8),
    description: material.description,
  };
}

const weapons: Record<string, ArsenalWeapon> = {};
const shields: Record<string, ArsenalShield> = {};
for (const [itemId, built] of Object.entries(BUILT)) {
  if (built.class === "shield") shields[itemId] = buildShield(itemId, built);
  else weapons[itemId] = buildWeapon(itemId, built);
}

export const ARSENAL_WEAPONS: Readonly<Record<string, ArsenalWeapon>> = weapons;
export const ARSENAL_SHIELDS: Readonly<Record<string, ArsenalShield>> = shields;

export function weaponById(id: string): ArsenalWeapon {
  const weapon = ARSENAL_WEAPONS[id];
  if (!weapon) throw new RangeError(`unknown weapon: ${id}`);
  return weapon;
}

export function shieldById(id: string): ArsenalShield {
  const shield = ARSENAL_SHIELDS[id];
  if (!shield) throw new RangeError(`unknown shield: ${id}`);
  return shield;
}

/**
 * The sandbox's reference weapon and the player's starting kit.
 *
 * Steel sits at the middle of every material scale and `straightSword` at the
 * middle of every class scale, so this resolves to exactly the numbers the
 * combat sandbox was tuned against — the arsenal generalises the reference
 * weapon rather than replacing it.
 */
export const STRAIGHT_SWORD = weaponById("steel-sword");

/** Display name for an item id without loading its whole definition. */
export function arsenalLabel(id: string) {
  return ARSENAL_WEAPONS[id]?.label ?? ARSENAL_SHIELDS[id]?.label ?? titleCase(id);
}
