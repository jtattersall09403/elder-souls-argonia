import {
  armourRating,
  encumbrance,
  equipItem,
  isEquipped,
  type EquipRejection,
} from "./inventory";
import { itemStatLines, type ItemStatLine } from "./itemStats";
import { tryItemById } from "./registry";
import { ITEM_CATEGORIES, type EquipSlot, type Inventory, type ItemCategory, type ItemDefinition } from "./types";

/**
 * The seam between the inventory and whatever draws it.
 *
 * The UI is given a finished, sorted, filtered description of what to show and
 * nothing else — no registry lookups, no rules, no game types. That is what
 * makes the look swappable: a different skin, a controller-first layout or a
 * console renderer consumes this same object, and none of them can accidentally
 * become the place a rule lives.
 */

export type InventoryTab = {
  id: ItemCategory | "all";
  label: string;
  count: number;
  active: boolean;
};

export type InventoryCell = {
  itemId: string;
  name: string;
  /** Resolved art path, or null when the UI should draw its fallback. */
  icon: string | null;
  /** Two letters for the fallback tile, so an art-less item still reads. */
  initials: string;
  count: number;
  weightKg: number;
  value: number;
  category: ItemCategory;
  equipped: boolean;
  slot: EquipSlot | null;
  /*
   * There is deliberately no `description` here. Item definitions still carry
   * one, but it is a per-material blurb repeated across every item made of that
   * material, and the owner's ruling (2026-08-31) is that it should not be in
   * the inventory: it reads as noise beside the numbers that actually decide
   * what to wear. Do not add it back without asking.
   */
  /** Present when the item works but its presentation is incomplete. */
  provisional?: string;
  /**
   * Everything the item's numbers say, already worded. The UI decides how much
   * room it has for them; it never decides what they are.
   */
  stats: readonly ItemStatLine[];
  /**
   * Why this item cannot be equipped right now, if it cannot. A refusal the
   * player can see beats a click that silently does nothing.
   */
  equipBlocked?: string;
};

export type EquippedSlotView = {
  slot: EquipSlot;
  label: string;
  cell: InventoryCell | null;
};

export type { ItemStatLine };

export type InventoryView = {
  title: string;
  encumbrance: { currentKg: number; capacityKg: number; ratio: number; over: boolean };
  armourRating: number;
  gold: number;
  tabs: readonly InventoryTab[];
  search: string;
  cells: readonly InventoryCell[];
  slots: readonly EquippedSlotView[];
};

export type InventorySort = "category" | "name" | "weight" | "value";

export type InventoryViewOptions = {
  category?: ItemCategory | "all";
  search?: string;
  sort?: InventorySort;
  title?: string;
};

const TAB_LABELS: Record<ItemCategory | "all", string> = {
  all: "All",
  weapon: "Weapon",
  apparel: "Apparel",
  magic: "Magic",
  misc: "Misc",
};

export const SLOT_LABELS: Record<EquipSlot, string> = {
  mainHand: "Weapon",
  offHand: "Shield",
  ammo: "Arrows",
  head: "Head",
  chest: "Cuirass",
  hands: "Gauntlets",
  feet: "Boots",
  amulet: "Amulet",
  ring: "Ring",
};

/** Two letters from a name: "Ebony Greatsword" -> "EG". */
function initialsOf(name: string) {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "??";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

const REJECTION_TEXT: Record<EquipRejection, string> = {
  "unknown-item": "This does not exist.",
  "not-equippable": "This cannot be worn or held.",
  "not-carried": "You are not carrying this.",
  "two-handed": "Your weapon needs both hands.",
};

function equipBlockedReason(definition: ItemDefinition, inventory: Inventory) {
  if (!definition.equip || isEquipped(inventory, definition.id)) return undefined;
  const result = equipItem(inventory, definition.id);
  return result.ok ? undefined : REJECTION_TEXT[result.reason];
}

function toCell(
  definition: ItemDefinition,
  count: number,
  inventory: Inventory,
): InventoryCell {
  return {
    itemId: definition.id,
    name: definition.name,
    icon: definition.icon,
    initials: initialsOf(definition.name),
    count,
    weightKg: definition.weightKg,
    value: definition.value,
    category: definition.category,
    equipped: isEquipped(inventory, definition.id),
    slot: definition.equip?.slot ?? null,
    provisional: definition.provisional,
    stats: itemStatLines(definition),
    equipBlocked: equipBlockedReason(definition, inventory),
  };
}

const CATEGORY_ORDER: Record<ItemCategory, number> =
  Object.fromEntries(ITEM_CATEGORIES.map((c, i) => [c, i])) as Record<ItemCategory, number>;

function compare(a: InventoryCell, b: InventoryCell, sort: InventorySort) {
  // Worn things first regardless of sort: they are what the player is looking
  // for, and it is how the original reads.
  if (a.equipped !== b.equipped) return a.equipped ? -1 : 1;
  switch (sort) {
    case "name": return a.name.localeCompare(b.name);
    case "weight": return b.weightKg - a.weightKg || a.name.localeCompare(b.name);
    case "value": return b.value - a.value || a.name.localeCompare(b.name);
    case "category":
    default:
      return CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category]
        || a.name.localeCompare(b.name);
  }
}

/** Project an inventory into everything a UI needs to draw one screen. */
export function buildInventoryView(
  inventory: Inventory,
  options: InventoryViewOptions = {},
): InventoryView {
  const category = options.category ?? "all";
  const search = options.search ?? "";
  const needle = search.trim().toLowerCase();

  const owned: InventoryCell[] = [];
  for (const stack of inventory.stacks) {
    const definition = tryItemById(stack.itemId);
    if (!definition) continue;
    owned.push(toCell(definition, stack.count, inventory));
  }

  const counts = Object.fromEntries(
    ITEM_CATEGORIES.map((id) => [id, owned.filter((cell) => cell.category === id).length]),
  ) as Record<ItemCategory, number>;

  const cells = owned
    .filter((cell) => category === "all" || cell.category === category)
    .filter((cell) => !needle || cell.name.toLowerCase().includes(needle))
    .sort((a, b) => compare(a, b, options.sort ?? "category"));

  const byId = new Map(owned.map((cell) => [cell.itemId, cell]));
  const slots = (Object.keys(SLOT_LABELS) as EquipSlot[]).map((slot) => ({
    slot,
    label: SLOT_LABELS[slot],
    cell: byId.get(inventory.equipped[slot] ?? "") ?? null,
  }));

  const currentKg = encumbrance(inventory);
  return {
    title: options.title ?? "Inventory",
    encumbrance: {
      currentKg,
      capacityKg: inventory.capacityKg,
      ratio: inventory.capacityKg > 0 ? Math.min(1, currentKg / inventory.capacityKg) : 0,
      over: currentKg > inventory.capacityKg,
    },
    armourRating: armourRating(inventory),
    gold: inventory.gold,
    tabs: (["all", ...ITEM_CATEGORIES] as const).map((id) => ({
      id,
      label: TAB_LABELS[id],
      count: id === "all" ? owned.length : counts[id],
      active: id === category,
    })),
    search,
    cells,
    slots,
  };
}
