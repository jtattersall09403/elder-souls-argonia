import { useMemo } from "react";
import { create } from "zustand";
import type { Loadout } from "../equipment/types";
import { ARMOUR_IDS, type ArmourDefinition } from "../equipment/armour";
import type { ArrowDefinition } from "../equipment/arrows";
import { ARSENAL_SHIELDS, ARSENAL_WEAPONS, STRAIGHT_SWORD } from "../equipment/arsenal";
import { offHandWeapon } from "../equipment/movesets/dualWield";
import { addItem, countOf, encumbrance, equipItem, removeItem, toggleEquip, unequipSlot, type EquipHand } from "./inventory";
import { tryItemById } from "./registry";
import { EMPTY_INVENTORY, type EquipSlot, type Inventory, type ItemCategory, type ItemEquipProfile } from "./types";
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
  /**
   * Idempotent: equipping what is already worn changes nothing. `hand`
   * "offHand" puts a one-handed weapon in the left hand (decision 0091).
   */
  equip: (itemId: string, hand?: EquipHand) => void;
  toggle: (itemId: string, hand?: EquipHand) => void;
  unequip: (slot: EquipSlot) => void;
};

/**
 * What the player starts with, besides the armoury.
 *
 * The sandbox exists to exercise the systems, so the pack carries every built
 * weapon and shield (below, from the arsenal manifest, as armour does) plus
 * the arrows, draughts and picks listed here.
 */
const STARTING_SUPPLIES: readonly (readonly [string, number])[] = [
  ["iron-war-arrow", 48],
  ["iron-flight-arrow", 24],
  ["steel-war-arrow", 24],
  ["steel-hunting-arrow", 24],
  ["daedric-war-arrow", 12],
  ["healing-draught", 5],
  ["lockpick", 12],
  ["torch", 3],
];

/**
 * Worn on the first frame. A mid-tier set with the head left bare, so the race
 * a player picked is still readable on their character.
 */
const STARTING_WORN: readonly string[] = [
  STRAIGHT_SWORD.id, "steel-shield", "iron-war-arrow", "steel-cuirass", "steel-gauntlets", "steel-boots",
];

/** Every built weapon, shield and armour piece: what the sandbox pack holds one of each. */
export const STARTING_ARMOURY_IDS: readonly string[] = [
  ...Object.keys(ARSENAL_WEAPONS),
  ...Object.keys(ARSENAL_SHIELDS),
  ...ARMOUR_IDS,
];

export function startingInventory(): Inventory {
  // A sandbox carries the whole armoury, so it gets a sandbox's back. The
  // encumbrance *rule* is unchanged; only this starting character's limit is.
  let inventory: Inventory = { ...EMPTY_INVENTORY, gold: 240, capacityKg: 0 };
  for (const [itemId, count] of STARTING_SUPPLIES) {
    if (tryItemById(itemId)) inventory = addItem(inventory, itemId, count);
  }
  // Every built piece, rather than a hand-kept list: the arsenal and the
  // armoury are generated, and a sandbox that cannot try on what was built is
  // not testing it.
  for (const id of STARTING_ARMOURY_IDS) inventory = addItem(inventory, id, 1);
  // Room for all of it with a fifth to spare, so the load the sandbox starts
  // with never slows the fight it is there to test.
  inventory = { ...inventory, capacityKg: Math.max(420, Math.ceil(encumbrance(inventory) * 1.2)) };
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
  equip: (itemId, hand) => set((state) => {
    const result = equipItem(state.inventory, itemId, hand);
    return result.ok ? { inventory: result.inventory } : {};
  }),
  toggle: (itemId, hand) => set((state) => ({ inventory: toggleEquip(state.inventory, itemId, hand) })),
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
    offHand: offHandFor(off?.equip ?? null),
  };
}

/** What the off hand holds, in the shape combat reads (`OffHandItem`). */
function offHandFor(equip: ItemEquipProfile | null): Loadout["offHand"] {
  switch (equip?.kind) {
    case "shield": return equip.shield;
    case "torch": return equip.torch;
    // A weapon in the left hand rides the left hand's node (dual wield).
    case "weapon": return offHandWeapon(equip.weapon);
    default: return null;
  }
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
