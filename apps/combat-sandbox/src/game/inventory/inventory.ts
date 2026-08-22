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
  }
  return { ...inventory, stacks, equipped };
}

/** Slot an item occupies, or null when it cannot be equipped at all. */
export function slotFor(itemId: string): EquipSlot | null {
  return tryItemById(itemId)?.equip?.slot ?? null;
}

export type EquipRejection = "unknown-item" | "not-equippable" | "not-carried" | "two-handed";

export type EquipResult =
  | { ok: true; inventory: Inventory }
  | { ok: false; reason: EquipRejection };

/**
 * Equip an item, resolving the conflicts equipping creates.
 *
 * A two-handed weapon takes the off hand with it, and a shield cannot be
 * raised while one is held. Returning a reason rather than silently doing
 * nothing lets the UI say why.
 */
export function equipItem(inventory: Inventory, itemId: string): EquipResult {
  const definition = tryItemById(itemId);
  if (!definition) return { ok: false, reason: "unknown-item" };
  if (!definition.equip) return { ok: false, reason: "not-equippable" };
  if (countOf(inventory, itemId) <= 0) return { ok: false, reason: "not-carried" };

  const equipped = { ...inventory.equipped };
  const { slot } = definition.equip;

  if (definition.equip.kind === "weapon" && definition.equip.weapon.stats.occupiesOffHand) {
    delete equipped.offHand;
  }
  if (slot === "offHand") {
    const mainId = equipped.mainHand;
    const main = mainId ? tryItemById(mainId) : null;
    if (main?.equip?.kind === "weapon" && main.equip.weapon.stats.occupiesOffHand) {
      return { ok: false, reason: "two-handed" };
    }
  }

  equipped[slot] = itemId;
  return { ok: true, inventory: { ...inventory, equipped } };
}

export function unequipSlot(inventory: Inventory, slot: EquipSlot): Inventory {
  if (!(slot in inventory.equipped)) return inventory;
  const equipped = { ...inventory.equipped };
  delete equipped[slot];
  return { ...inventory, equipped };
}

/** Equip if the item is not already worn, otherwise take it off. */
export function toggleEquip(inventory: Inventory, itemId: string): Inventory {
  const slot = slotFor(itemId);
  if (!slot) return inventory;
  if (inventory.equipped[slot] === itemId) return unequipSlot(inventory, slot);
  const result = equipItem(inventory, itemId);
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
