import { CATALOGUE, text } from "@elder-souls/text-catalogue";
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
  /** A right-click puts this in the off hand (a one-handed weapon, a torch). */
  offHand: boolean;
  /** The detail-line note saying so, on a one-handed weapon. */
  offHandHint?: string;
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

const t = (id: string) => text(CATALOGUE, id);

const TAB_LABELS: Record<ItemCategory | "all", string> = {
  all: t("text.inventory.tab-all"),
  weapon: t("text.inventory.tab-weapon"),
  apparel: t("text.inventory.tab-apparel"),
  magic: t("text.inventory.tab-magic"),
  misc: t("text.inventory.tab-misc"),
};

/** What each tab holds, for the panel when nothing is under the cursor. */
export const CATEGORY_HINTS: Record<ItemCategory | "all", string> = {
  all: t("text.inventory.hint-all"),
  weapon: t("text.inventory.hint-weapon"),
  apparel: t("text.inventory.hint-apparel"),
  magic: t("text.inventory.hint-magic"),
  misc: t("text.inventory.hint-misc"),
};

export const SLOT_LABELS: Record<EquipSlot, string> = {
  mainHand: t("text.inventory.slot-main-hand"),
  // A shield, a torch or a second weapon (decision 0091).
  offHand: t("text.inventory.slot-off-hand"),
  ammo: t("text.inventory.slot-ammo"),
  head: t("text.inventory.slot-head"),
  chest: t("text.inventory.slot-chest"),
  hands: t("text.inventory.slot-hands"),
  feet: t("text.inventory.slot-feet"),
  amulet: t("text.inventory.slot-amulet"),
  ring: t("text.inventory.slot-ring"),
};

/** Two letters from a name: "Ebony Greatsword" -> "EG". */
function initialsOf(name: string) {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "??";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

const REJECTION_TEXT: Record<EquipRejection, string> = {
  "unknown-item": t("text.inventory.reject-unknown-item"),
  "not-equippable": t("text.inventory.reject-not-equippable"),
  "not-carried": t("text.inventory.reject-not-carried"),
  "two-handed": t("text.inventory.reject-two-handed"),
  "not-one-handed": t("text.inventory.reject-not-one-handed"),
  "needs-two": t("text.inventory.reject-needs-two"),
};

function equipBlockedReason(definition: ItemDefinition, inventory: Inventory) {
  if (!definition.equip || isEquipped(inventory, definition.id)) return undefined;
  const result = equipItem(inventory, definition.id);
  return result.ok ? undefined : REJECTION_TEXT[result.reason];
}

/** True for what a right-click can put in the off hand: a one-handed melee weapon or a torch. */
function offHandCandidate(definition: ItemDefinition) {
  const equip = definition.equip;
  if (equip?.kind === "torch") return true;
  return equip?.kind === "weapon" && !equip.weapon.stats.occupiesOffHand && !equip.weapon.stats.ranged;
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
    offHand: offHandCandidate(definition),
    offHandHint: definition.equip?.kind === "weapon" && offHandCandidate(definition)
      ? t("text.inventory.right-click-off-hand")
      : undefined,
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
    title: options.title ?? t("text.inventory.title"),
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
