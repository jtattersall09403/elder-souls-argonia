import { ARMOUR } from "../equipment/armour";
import { ARROWS } from "../equipment/arrows";
import { ARSENAL_SHIELDS, ARSENAL_WEAPONS } from "../equipment/arsenal";
import { WEAPON_CLASSES } from "../equipment/weaponClasses";
import type { EquipSlot, ItemDefinition } from "./types";

/**
 * The item catalogue.
 *
 * Every item the game knows about, keyed by id. It is assembled from the
 * generated arsenal plus a small hand-written set of things with no mesh, so
 * adding content means adding *data* — either a line of pipeline config or an
 * entry below — and never touching the inventory rules or the UI.
 */

const catalogue = new Map<string, ItemDefinition>();

function register(definition: ItemDefinition) {
  if (catalogue.has(definition.id)) {
    throw new RangeError(`duplicate item id: ${definition.id}`);
  }
  catalogue.set(definition.id, definition);
}

for (const weapon of Object.values(ARSENAL_WEAPONS)) {
  const profile = WEAPON_CLASSES[weapon.classId];
  register({
    id: weapon.id,
    name: weapon.label,
    category: "weapon",
    icon: weapon.icon,
    weightKg: weapon.stats.weightKg,
    value: weapon.value,
    stackable: false,
    description: weapon.description,
    equip: { slot: "mainHand", kind: "weapon", weapon },
    provisional: weapon.borrowedMoveset
      ? `No ${profile.label.toLowerCase()} moveset yet — swings with the one-handed set.`
      : undefined,
  });
}

for (const arrow of Object.values(ARROWS)) {
  register({
    id: arrow.id,
    name: arrow.label,
    category: "weapon",
    icon: arrow.icon,
    weightKg: arrow.weightKg,
    value: arrow.value,
    // Arrows are the one thing a player counts rather than owns.
    stackable: true,
    description: arrow.description,
    equip: { slot: "ammo", kind: "ammunition", arrow },
  });
}

for (const piece of Object.values(ARMOUR)) {
  register({
    id: piece.id,
    name: piece.label,
    category: "apparel",
    icon: piece.icon,
    weightKg: piece.weightKg,
    value: piece.value,
    stackable: false,
    description: piece.description,
    equip: {
      slot: piece.slot as Exclude<EquipSlot, "mainHand" | "offHand" | "ammo">,
      kind: "apparel",
      armour: piece,
    },
  });
}

for (const shield of Object.values(ARSENAL_SHIELDS)) {
  register({
    id: shield.id,
    name: shield.label,
    category: "apparel",
    icon: shield.icon,
    weightKg: shield.stats.weightKg,
    value: shield.value,
    stackable: false,
    description: shield.description,
    equip: { slot: "offHand", kind: "shield", shield },
  });
}

// Items with no built mesh. They are real inventory content — they stack, they
// weigh something, they can be spent — and they draw a lettered fallback tile
// until their art exists.
register({
  id: "healing-draught",
  name: "Healing Draught",
  category: "magic",
  icon: null,
  weightKg: 0.5,
  value: 45,
  stackable: true,
  description: "Sharp with mountain flower. Closes what is open.",
  equip: null,
});
register({
  id: "lockpick",
  name: "Lockpick",
  category: "misc",
  icon: null,
  weightKg: 0.05,
  value: 6,
  stackable: true,
  description: "Bent iron. Optimism.",
  equip: null,
});

export const ITEMS: ReadonlyMap<string, ItemDefinition> = catalogue;

export function itemById(id: string): ItemDefinition {
  const item = catalogue.get(id);
  if (!item) throw new RangeError(`unknown item: ${id}`);
  return item;
}

export function tryItemById(id: string): ItemDefinition | null {
  return catalogue.get(id) ?? null;
}

/** Every item id, in a stable order suitable for tests and debug listings. */
export function allItemIds(): string[] {
  return [...catalogue.keys()];
}

/**
 * The GLB an item renders as, or null for one with no mesh.
 *
 * Exists so the game can warm its own cache: equipping something the browser
 * has never fetched suspends the actor holding it.
 */
export function itemAsset(id: string): string | null {
  const equip = tryItemById(id)?.equip;
  if (!equip) return null;
  switch (equip.kind) {
    case "weapon": return equip.weapon.visual.asset;
    case "shield": return equip.shield.visual.asset;
    case "ammunition": return equip.arrow.asset;
    case "apparel": return equip.armour.asset;
  }
}
