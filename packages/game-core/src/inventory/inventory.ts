import { itemById, tryItemById } from "./registry";
import type { EquipSlot, Inventory, ItemStack } from "./types";

/**
 * Inventory rules.
 *
 * Every operation returns a new `Inventory` rather than mutating one. That is
 * what makes the same model usable by React, by a save file, by an undo stack
 * and eventually by a networked session, and it keeps the rules testable
 * without a renderer anywhere near them.
 */

function withStacks(inventory: Inventory, stacks: ItemStack[]): Inventory {
  return { ...inventory, stacks };
}

export function countOf(inventory: Inventory, itemId: string) {
  return inventory.stacks.find((stack) => stack.itemId === itemId)?.count ?? 0;
}

export function addItem(inventory: Inventory, itemId: string, count = 1): Inventory {
  if (count <= 0) return inventory;
  const definition = itemById(itemId);
  const stacks = [...inventory.stacks];
  if (definition.stackable) {
    const index = stacks.findIndex((stack) => stack.itemId === itemId);
    if (index >= 0) {
      stacks[index] = { itemId, count: stacks[index].count + count };
      return withStacks(inventory, stacks);
    }
    stacks.push({ itemId, count });
    return withStacks(inventory, stacks);
  }
  // Unstackable items still share one row with a count, so a player carrying
  // three iron daggers sees one cell reading "3" rather than three cells.
  const index = stacks.findIndex((stack) => stack.itemId === itemId);
  if (index >= 0) stacks[index] = { itemId, count: stacks[index].count + count };
  else stacks.push({ itemId, count });
  return withStacks(inventory, stacks);
}

export function removeItem(inventory: Inventory, itemId: string, count = 1): Inventory {
  if (count <= 0) return inventory;
  const index = inventory.stacks.findIndex((stack) => stack.itemId === itemId);
  if (index < 0) return inventory;
  const remaining = inventory.stacks[index].count - count;
  const stacks = [...inventory.stacks];
  if (remaining > 0) stacks[index] = { itemId, count: remaining };
  else stacks.splice(index, 1);
  // Losing the last of something you are wearing takes it off.
  const equipped = { ...inventory.equipped };
  if (remaining <= 0) {
    for (const [slot, equippedId] of Object.entries(equipped) as [EquipSlot, string][]) {
      if (equippedId === itemId) delete equipped[slot];
    }
  } else if (remaining < 2 && equipped.mainHand === itemId && equipped.offHand === itemId) {
    // One of a pair held in both hands: the off hand lets go of it.
    delete equipped.offHand;
  }
  return { ...inventory, stacks, equipped };
}

/** Slot an item occupies, or null when it cannot be equipped at all. */
export function slotFor(itemId: string): EquipSlot | null {
  return tryItemById(itemId)?.equip?.slot ?? null;
}

export type EquipRejection =
  | "unknown-item"
  | "not-equippable"
  | "not-carried"
  | "two-handed"
  /** Only a one-handed melee weapon goes in the off hand (decision 0091). */
  | "not-one-handed"
  /** The same weapon in both hands needs two of it carried. */
  | "needs-two";

export type EquipResult =
  | { ok: true; inventory: Inventory }
  | { ok: false; reason: EquipRejection };

/** Which hand a weapon is equipped to; omitted means the item's own slot. */
export type EquipHand = "offHand";

/** A main-hand item that leaves no hand free: two-handed, or a bow. */
function holdsBothHands(itemId: string | undefined) {
  const equip = itemId ? tryItemById(itemId)?.equip : null;
  return equip?.kind === "weapon" && (equip.weapon.stats.occupiesOffHand || Boolean(equip.weapon.stats.ranged));
}

/**
 * Equip an item, resolving the conflicts equipping creates.
 *
 * A two-handed weapon or a bow takes the off hand with it, and nothing can be
 * put in the off hand while one is held. A weapon goes to the off hand only
 * when asked (`hand`), only if it is one-handed melee, and the same weapon in
 * both hands needs two of it. Returning a reason rather than silently doing
 * nothing lets the UI say why.
 */
export function equipItem(inventory: Inventory, itemId: string, hand?: EquipHand): EquipResult {
  const definition = tryItemById(itemId);
  if (!definition) return { ok: false, reason: "unknown-item" };
  if (!definition.equip) return { ok: false, reason: "not-equippable" };
  if (countOf(inventory, itemId) <= 0) return { ok: false, reason: "not-carried" };

  const equipped = { ...inventory.equipped };
  const equip = definition.equip;
  const toOffHand = equip.slot === "offHand" || (hand === "offHand" && equip.kind === "weapon");

  if (toOffHand) {
    if (equip.kind === "weapon" && (equip.weapon.stats.occupiesOffHand || equip.weapon.stats.ranged)) {
      return { ok: false, reason: "not-one-handed" };
    }
    if (holdsBothHands(equipped.mainHand)) return { ok: false, reason: "two-handed" };
    if (equipped.mainHand === itemId && countOf(inventory, itemId) < 2) {
      return { ok: false, reason: "needs-two" };
    }
    equipped.offHand = itemId;
    return { ok: true, inventory: { ...inventory, equipped } };
  }

  if (equip.kind === "weapon") {
    if (holdsBothHands(itemId)) delete equipped.offHand;
    // The only copy, moved from the off hand into the main hand.
    if (equipped.offHand === itemId && countOf(inventory, itemId) < 2) delete equipped.offHand;
  }
  equipped[equip.slot] = itemId;
  return { ok: true, inventory: { ...inventory, equipped } };
}

export function unequipSlot(inventory: Inventory, slot: EquipSlot): Inventory {
  if (!(slot in inventory.equipped)) return inventory;
  const equipped = { ...inventory.equipped };
  delete equipped[slot];
  return { ...inventory, equipped };
}

/**
 * Equip if the item is not already held or worn, otherwise take it off.
 *
 * With `hand`, the question is asked of that hand. Without it, whichever
 * slot holds the item lets go of it, its own slot first.
 */
export function toggleEquip(inventory: Inventory, itemId: string, hand?: EquipHand): Inventory {
  const slot = slotFor(itemId);
  if (!slot) return inventory;
  const target: EquipSlot = hand ?? slot;
  if (inventory.equipped[target] === itemId) return unequipSlot(inventory, target);
  if (!hand && inventory.equipped.offHand === itemId) return unequipSlot(inventory, "offHand");
  const result = equipItem(inventory, itemId, hand);
  return result.ok ? result.inventory : inventory;
}

export function isEquipped(inventory: Inventory, itemId: string) {
  return Object.values(inventory.equipped).includes(itemId);
}

/** Carried weight in kilograms. Worn items still weigh, as in Morrowind. */
export function encumbrance(inventory: Inventory) {
  return Number(inventory.stacks.reduce(
    (total, stack) => total + (tryItemById(stack.itemId)?.weightKg ?? 0) * stack.count,
    0,
  ).toFixed(2));
}

export function isOverEncumbered(inventory: Inventory) {
  return encumbrance(inventory) > inventory.capacityKg;
}

/** Total armour rating from worn apparel. */
export function armourRating(inventory: Inventory) {
  let rating = 0;
  for (const itemId of Object.values(inventory.equipped)) {
    const equip = itemId ? tryItemById(itemId)?.equip : null;
    if (equip?.kind === "apparel") rating += equip.armour.armourRating;
  }
  return rating;
}

/** Gold value of everything carried. */
export function totalValue(inventory: Inventory) {
  return inventory.stacks.reduce(
    (total, stack) => total + (tryItemById(stack.itemId)?.value ?? 0) * stack.count,
    0,
  );
}
