import { useMemo } from "react";
import { create } from "zustand";
import type { Loadout } from "../equipment/types";
import { ARMOUR_IDS, type ArmourDefinition } from "../equipment/armour";
import type { ArrowDefinition } from "../equipment/arrows";
import { STRAIGHT_SWORD } from "../equipment/arsenal";
import { addItem, countOf, equipItem, removeItem, toggleEquip, unequipSlot } from "./inventory";
import { tryItemById } from "./registry";
import { EMPTY_INVENTORY, type EquipSlot, type Inventory, type ItemCategory } from "./types";
import type { InventorySort } from "./view";

/**
 * Session state for the inventory.
 *
 * Deliberately its own store rather than more fields on the combat snapshot:
 * carrying and wearing things is a system the real game keeps, and the combat
 * HUD has no business owning it. What combat *does* read is `equippedLoadout`,
 * which is the one line where the two meet.
 */

type InventoryStore = {
  inventory: Inventory;
  open: boolean;
  category: ItemCategory | "all";
  search: string;
  sort: InventorySort;
  /** Item the cursor is on, for the detail line. */
  focused: string | null;

  setOpen: (open: boolean) => void;
  setCategory: (category: ItemCategory | "all") => void;
  setSearch: (search: string) => void;
  setSort: (sort: InventorySort) => void;
  setFocused: (itemId: string | null) => void;

  add: (itemId: string, count?: number) => void;
  remove: (itemId: string, count?: number) => void;
  /** Idempotent: equipping what is already worn changes nothing. */
  equip: (itemId: string) => void;
  toggle: (itemId: string) => void;
  unequip: (slot: EquipSlot) => void;
};

/**
 * What the player starts with.
 *
 * A deliberately wide spread rather than a realistic one: the sandbox exists to
 * exercise the systems, so the starting pack covers every weapon class and a
 * range of material tiers.
 */
const STARTING_ITEMS: readonly (readonly [string, number])[] = [
  ["steel-sword", 1],
  ["iron-sword", 1],
  ["elven-sword", 1],
  ["ebony-sword", 1],
  ["daedric-sword", 1],
  ["blades-sword", 1],
  ["steel-scimitar", 1],
  ["iron-dagger", 1],
  ["elven-dagger", 1],
  ["steel-waraxe", 1],
  ["orcish-waraxe", 1],
  ["steel-mace", 1],
  ["dwarven-mace", 1],
  ["steel-greatsword", 1],
  ["daedric-greatsword", 1],
  ["steel-battleaxe", 1],
  ["orcish-warhammer", 1],
  ["iron-shield", 1],
  ["steel-shield", 1],
  ["elven-shield", 1],
  ["steel-longbow", 1],
  ["daedric-warbow", 1],
  ["wood-shortbow", 1],
  ["iron-war-arrow", 48],
  ["iron-flight-arrow", 24],
  ["steel-war-arrow", 24],
  ["steel-hunting-arrow", 24],
  ["daedric-war-arrow", 12],
  ["healing-draught", 5],
  ["lockpick", 12],
];

/**
 * Worn on the first frame. A mid-tier set with the head left bare, so the race
 * a player picked is still readable on their character.
 */
const STARTING_WORN: readonly string[] = [
  STRAIGHT_SWORD.id, "steel-shield", "iron-war-arrow", "steel-cuirass", "steel-gauntlets", "steel-boots",
];

function startingInventory(): Inventory {
  // A sandbox carries the whole armoury, so it gets a sandbox's back. The
  // encumbrance *rule* is unchanged; only this starting character's limit is.
  let inventory: Inventory = { ...EMPTY_INVENTORY, gold: 240, capacityKg: 420 };
  for (const [itemId, count] of STARTING_ITEMS) {
    if (tryItemById(itemId)) inventory = addItem(inventory, itemId, count);
  }
  // Every built piece, rather than a hand-kept list: the armoury is generated,
  // and a sandbox that cannot try on what was built is not testing it.
  for (const id of ARMOUR_IDS) inventory = addItem(inventory, id, 1);
  for (const id of STARTING_WORN) {
    const equipped = equipItem(inventory, id);
    if (equipped.ok) inventory = equipped.inventory;
  }
  return inventory;
}

export const useInventoryStore = create<InventoryStore>((set) => ({
  inventory: startingInventory(),
  open: false,
  category: "all",
  search: "",
  sort: "category",
  focused: null,

  setOpen: (open) => set({ open }),
  setCategory: (category) => set({ category }),
  setSearch: (search) => set({ search }),
  setSort: (sort) => set({ sort }),
  setFocused: (focused) => set({ focused }),

  add: (itemId, count = 1) => set((state) => ({ inventory: addItem(state.inventory, itemId, count) })),
  remove: (itemId, count = 1) => set((state) => ({ inventory: removeItem(state.inventory, itemId, count) })),
  equip: (itemId) => set((state) => {
    const result = equipItem(state.inventory, itemId);
    return result.ok ? { inventory: result.inventory } : {};
  }),
  toggle: (itemId) => set((state) => ({ inventory: toggleEquip(state.inventory, itemId) })),
  unequip: (slot) => set((state) => ({ inventory: unequipSlot(state.inventory, slot) })),
}));

/**
 * The equipped kit, in the shape combat already speaks.
 *
 * Falls back to the reference weapon with empty hands rather than leaving the
 * fighter weaponless: an unarmed moveset is a separate piece of content, and
 * until it exists an empty main hand would mean an actor with no attacks.
 */
export function loadoutFor(mainId: string | undefined, offId: string | undefined): Loadout {
  const main = mainId ? tryItemById(mainId) : null;
  const off = offId ? tryItemById(offId) : null;
  return {
    mainHand: main?.equip?.kind === "weapon" ? main.equip.weapon : STRAIGHT_SWORD,
    offHand: off?.equip?.kind === "shield" ? off.equip.shield : null,
  };
}

export function loadoutFrom(inventory: Inventory): Loadout {
  return loadoutFor(inventory.equipped.mainHand, inventory.equipped.offHand);
}

/**
 * Subscribe to the player's equipped kit.
 *
 * Selects the two ids rather than the resolved loadout: a selector that builds
 * an object returns a new reference every render, which zustand reads as a
 * change and React reads as an infinite update loop.
 */
/**
 * Subscribe to the player's worn armour.
 *
 * Same shape of care as the loadout above: select the slot *ids*, then resolve,
 * so the returned array only changes identity when what is worn changes.
 */
export function useWornArmour(): readonly ArmourDefinition[] {
  const head = useInventoryStore((state) => state.inventory.equipped.head);
  const chest = useInventoryStore((state) => state.inventory.equipped.chest);
  const hands = useInventoryStore((state) => state.inventory.equipped.hands);
  const feet = useInventoryStore((state) => state.inventory.equipped.feet);
  return useMemo(() => wornArmourFor([head, chest, hands, feet]), [head, chest, hands, feet]);
}

/** The armour among a set of equipped item ids, in slot order. */
export function wornArmourFor(itemIds: readonly (string | undefined)[]): ArmourDefinition[] {
  const worn: ArmourDefinition[] = [];
  for (const id of itemIds) {
    const equip = id ? tryItemById(id)?.equip : null;
    if (equip?.kind === "apparel") worn.push(equip.armour);
  }
  return worn;
}

/**
 * The arrow currently on the string, and how many are left.
 *
 * Null when the quiver is empty, which is what stops a bow being drawn at all.
 */
export function useEquippedArrow(): { arrow: ArrowDefinition; count: number } | null {
  const ammoId = useInventoryStore((state) => state.inventory.equipped.ammo);
  const count = useInventoryStore((state) => (ammoId ? countOf(state.inventory, ammoId) : 0));
  return useMemo(() => {
    const equip = ammoId ? tryItemById(ammoId)?.equip : null;
    if (equip?.kind !== "ammunition" || count <= 0) return null;
    return { arrow: equip.arrow, count };
  }, [ammoId, count]);
}

export function useEquippedLoadout(): Loadout {
  const mainId = useInventoryStore((state) => state.inventory.equipped.mainHand);
  const offId = useInventoryStore((state) => state.inventory.equipped.offHand);
  return useMemo(() => loadoutFor(mainId, offId), [mainId, offId]);
}
