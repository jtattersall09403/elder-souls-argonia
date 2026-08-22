import type { ArmourDefinition } from "../equipment/armour";
import type { ArrowDefinition } from "../equipment/arrows";
import type { EquipSlot, ShieldDefinition, WeaponDefinition } from "../equipment/types";

export { EQUIP_SLOTS } from "../equipment/types";
export type { EquipSlot } from "../equipment/types";

/**
 * Inventory vocabulary.
 *
 * Deliberately free of rendering and of React: this is the portable half of
 * the inventory, and the half the real game keeps. Anything that knows what a
 * cell looks like belongs in `src/ui/inventory`, and the only thing that
 * crosses between them is the view model in `view.ts`.
 */

/** Top-level filter tabs. Mirrors the categories a player thinks in. */
export type ItemCategory = "weapon" | "apparel" | "magic" | "misc";

export const ITEM_CATEGORIES: readonly ItemCategory[] = ["weapon", "apparel", "magic", "misc"];

/** What equipping an item gives the actor. */
export type ItemEquipProfile =
  | { slot: "mainHand"; kind: "weapon"; weapon: WeaponDefinition }
  | { slot: "offHand"; kind: "shield"; shield: ShieldDefinition }
  | { slot: "ammo"; kind: "ammunition"; arrow: ArrowDefinition }
  | { slot: Exclude<EquipSlot, "mainHand" | "offHand" | "ammo">; kind: "apparel"; armour: ArmourDefinition };

export type ItemDefinition = {
  id: string;
  name: string;
  category: ItemCategory;
  /**
   * Inventory art relative to the deployment base URL, or null for an item
   * whose art has not been built. The UI draws a legible fallback rather than
   * a hole, so a missing icon is visible without being broken.
   */
  icon: string | null;
  weightKg: number;
  /** Gold. */
  value: number;
  /** Identical stackable items share one cell and a count. */
  stackable: boolean;
  description: string;
  equip: ItemEquipProfile | null;
  /**
   * Set when the item works but its presentation is incomplete — a weapon
   * class with no authored moveset yet, say. Surfaced in the UI so a player
   * (and the next agent) can see the gap rather than mistake it for a bug.
   */
  provisional?: string;
};

export type ItemStack = {
  itemId: string;
  count: number;
};

export type Inventory = {
  stacks: readonly ItemStack[];
  equipped: Readonly<Partial<Record<EquipSlot, string>>>;
  /** Gold pieces, kept out of the weight budget as in Morrowind. */
  gold: number;
  /** Encumbrance limit in kilograms. */
  capacityKg: number;
};

export const EMPTY_INVENTORY: Inventory = {
  stacks: [],
  equipped: {},
  gold: 0,
  capacityKg: 180,
};
