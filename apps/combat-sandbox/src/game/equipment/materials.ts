import type { AttributeMap, DamageType } from "./types";

/**
 * What a weapon or piece of armour is *made of*.
 *
 * Materials are the second axis of the arsenal: a class says how a weapon
 * fights, a material says how good it is. Keeping them separate is what lets
 * (13 classes x 14 materials) exist without 182 hand-written stat blocks, and
 * it is how a new tier is introduced — one entry here restats every item made
 * of it.
 */

export type MaterialId =
  | "studded"
  | "iron"
  | "steel"
  | "imperial"
  | "silver"
  | "dwarven"
  | "elven"
  | "orcish"
  | "nordhero"
  | "glass"
  | "ebony"
  | "daedric"
  | "draugr"
  | "falmer"
  | "forsworn"
  | "akaviri";

export type MaterialProfile = {
  id: MaterialId;
  label: string;
  /** Progression tier; ordering for sorting, gating and loot tables. */
  tier: number;
  /** Multiplies a class's motion values. */
  damageScale: number;
  /** Multiplies a class's base weight. */
  weightScale: number;
  /** Multiplies a class's stability and absorption, clamped below 1. */
  guardScale: number;
  /** Gold per kilogram of the finished item. */
  valuePerKg: number;
  /** Added to the class's attribute requirements. */
  requirementBonus: AttributeMap;
  /** Damage this material adds beyond the physical base. */
  bonusDamage?: Partial<Record<DamageType, number>>;
  /** One-line flavour, shown in the inventory. */
  description: string;
};

const MATERIALS: MaterialProfile[] = [
  {
    id: "studded", label: "Studded", tier: 1,
    damageScale: 0.8, weightScale: 0.5, guardScale: 0.75, valuePerKg: 14,
    requirementBonus: {},
    description: "Boiled hide under iron rivets. Light, and honest about it.",
  },
  {
    id: "iron", label: "Iron", tier: 1,
    damageScale: 0.85, weightScale: 1.05, guardScale: 0.9, valuePerKg: 8,
    requirementBonus: {},
    description: "Common, heavy and soft. What a militia is handed.",
  },
  {
    id: "steel", label: "Steel", tier: 2,
    damageScale: 1, weightScale: 1, guardScale: 1, valuePerKg: 16,
    requirementBonus: {},
    description: "The Nordic standard: dependable, well balanced, everywhere.",
  },
  {
    id: "imperial", label: "Imperial", tier: 2,
    damageScale: 1.02, weightScale: 0.95, guardScale: 1, valuePerKg: 22,
    requirementBonus: {},
    description: "Legion pattern, forged for a shield wall.",
  },
  {
    id: "silver", label: "Silver", tier: 3,
    damageScale: 1.05, weightScale: 1.0, guardScale: 0.95, valuePerKg: 55,
    requirementBonus: {}, bonusDamage: { magic: 6 },
    description: "Soft metal, bitter to anything that should already be dead.",
  },
  {
    id: "dwarven", label: "Dwarven", tier: 3,
    damageScale: 1.16, weightScale: 1.2, guardScale: 1.08, valuePerKg: 40,
    requirementBonus: { strength: 2 },
    description: "Dwemer alloy, still bright after four thousand years.",
  },
  {
    id: "elven", label: "Elven", tier: 4,
    damageScale: 1.28, weightScale: 0.78, guardScale: 1.02, valuePerKg: 70,
    requirementBonus: { agility: 2 },
    description: "Moonstone-bright and unreasonably light.",
  },
  {
    id: "orcish", label: "Orcish", tier: 4,
    damageScale: 1.34, weightScale: 1.15, guardScale: 1.06, valuePerKg: 60,
    requirementBonus: { strength: 3 },
    description: "Orichalcum, beaten thick. Built to break things.",
  },
  {
    id: "draugr", label: "Ancient Nord", tier: 4,
    damageScale: 1.2, weightScale: 1.1, guardScale: 1, valuePerKg: 45,
    requirementBonus: {}, bonusDamage: { frost: 5 },
    description: "Barrow-steel. It carries the cold of the place it was taken from.",
  },
  {
    id: "falmer", label: "Falmer", tier: 4,
    damageScale: 1.22, weightScale: 1.12, guardScale: 0.98, valuePerKg: 38,
    requirementBonus: {}, bonusDamage: { poison: 5 },
    description: "Chaurus chitin, lashed to bone. It smells of the deep places.",
  },
  {
    id: "forsworn", label: "Forsworn", tier: 3,
    damageScale: 1.1, weightScale: 0.9, guardScale: 0.9, valuePerKg: 30,
    requirementBonus: {}, bonusDamage: { poison: 4 },
    description: "Antler, hide and hate, bound by the Reach.",
  },
  {
    id: "akaviri", label: "Akaviri", tier: 5,
    damageScale: 1.4, weightScale: 0.85, guardScale: 1.04, valuePerKg: 120,
    requirementBonus: { agility: 4 },
    description: "A Blades katana, folded by a craft nobody here remembers.",
  },
  {
    id: "nordhero", label: "Nord Hero", tier: 5,
    damageScale: 1.42, weightScale: 1.0, guardScale: 1.08, valuePerKg: 110,
    requirementBonus: { strength: 3 },
    description: "Skyforge steel, made for the hand of someone worth naming.",
  },
  {
    id: "glass", label: "Glass", tier: 6,
    damageScale: 1.56, weightScale: 0.8, guardScale: 1.05, valuePerKg: 200,
    requirementBonus: { agility: 5 },
    description: "Malachite, ground to an edge that should not hold. It holds.",
  },
  {
    id: "ebony", label: "Ebony", tier: 7,
    damageScale: 1.72, weightScale: 1.25, guardScale: 1.14, valuePerKg: 320,
    requirementBonus: { strength: 6 },
    description: "The blood of a god, cooled and hammered flat.",
  },
  {
    id: "daedric", label: "Daedric", tier: 8,
    damageScale: 1.95, weightScale: 1.4, guardScale: 1.2, valuePerKg: 700,
    requirementBonus: { strength: 8, willpower: 2 },
    bonusDamage: { fire: 8 },
    description: "Ebony quenched in a heart still beating. It does not rust.",
  },
];

export const MATERIAL_PROFILES: Readonly<Record<MaterialId, MaterialProfile>> =
  Object.fromEntries(MATERIALS.map((m) => [m.id, m])) as Record<MaterialId, MaterialProfile>;

export const MATERIAL_IDS = MATERIALS.map((m) => m.id);

/** Guard values scale with material but can never reach a free block. */
export function scaleGuardValue(base: number, scale: number) {
  return Math.min(0.95, Number((base * scale).toFixed(4)));
}
