import { CATALOGUE, text } from "@elder-souls/text-catalogue";
import CLUTTER from "../equipment/generated/clutter.items.json";
import { ARMOUR, armourAsset } from "../equipment/armour";
import { ARROWS } from "../equipment/arrows";
import { ARSENAL_SHIELDS, ARSENAL_WEAPONS } from "../equipment/arsenal";
import { LIGHT_ITEMS } from "../equipment/lights";
import { WEAPON_CLASSES } from "../equipment/weaponClasses";
import type { Sex } from "../actors/races";
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
      ? text(CATALOGUE, "text.inventory.borrowed-moveset").replace("{class}", profile.label.toLowerCase())
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

// Carried lights (decision 0091): held in the off hand, spent as they burn,
// so they stack like any other consumable.
for (const torch of Object.values(LIGHT_ITEMS)) {
  register({
    id: torch.id,
    name: torch.label,
    category: "misc",
    icon: torch.icon,
    weightKg: torch.stats.weightKg,
    value: torch.value,
    stackable: true,
    description: text(CATALOGUE, "text.item.torch.description"),
    equip: { slot: "offHand", kind: "torch", torch },
  });
}

// Carried consumables and tools.
//
// Nothing holds or wears these, so they are not weapons and not apparel — but
// they are real inventory content: they stack, they weigh something, they can
// be spent, and they have to *look* like something in the grid. They used to
// draw a lettered fallback tile because no mesh had been sourced; both are now
// built through the arsenal builder from their vanilla clutter meshes
// (`config/weapons/clutter.json`), which is the same job as a weapon — a static
// NIF, its textures, a normalised GLB and an inventory icon.
register({
  id: "healing-draught",
  name: text(CATALOGUE, "text.item.healing-draught.name"),
  category: "magic",
  icon: CLUTTER.items["healing-draught"].icon,
  weightKg: 0.5,
  value: 45,
  stackable: true,
  description: text(CATALOGUE, "text.item.healing-draught.description"),
  equip: null,
});
register({
  id: "lockpick",
  name: text(CATALOGUE, "text.item.lockpick.name"),
  category: "misc",
  icon: CLUTTER.items.lockpick.icon,
  weightKg: 0.05,
  value: 6,
  stackable: true,
  description: text(CATALOGUE, "text.item.lockpick.description"),
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
 * The GLB an item renders as *on this wearer*, or null for one with no mesh.
 *
 * Exists so the game can warm its own cache: equipping something the browser
 * has never fetched suspends the actor holding it. Armour takes the wearer's
 * sex because it ships one mesh per sex — warming the male cuirass for a
 * female player prefetches a file she will never load and leaves the blink the
 * warmup exists to remove.
 */
export function itemAsset(id: string, sex: Sex): string | null {
  const equip = tryItemById(id)?.equip;
  if (!equip) return null;
  switch (equip.kind) {
    case "weapon": return equip.weapon.visual.asset;
    case "shield": return equip.shield.visual.asset;
    case "torch": return equip.torch.visual.asset;
    case "ammunition": return equip.arrow.asset;
    case "apparel": return armourAsset(equip.armour, sex);
  }
}
