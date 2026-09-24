import { describe, expect, it } from "vitest";

import { armourById } from "../equipment/armour";
import {
  addItem,
  armourRating,
  countOf,
  encumbrance,
  equipItem,
  isEquipped,
  isOverEncumbered,
  removeItem,
  toggleEquip,
  unequipSlot,
} from "./inventory";
import { ITEMS, itemById } from "./registry";
import { buildInventoryView } from "./view";
import { EMPTY_INVENTORY, type Inventory } from "./types";
import { ARSENAL_SHIELDS, ARSENAL_WEAPONS } from "../equipment/arsenal";
import { SHIELD_STABILITY_BAND, WEAPON_STABILITY_BAND } from "../equipment/guard";

const base: Inventory = { ...EMPTY_INVENTORY, capacityKg: 100 };

describe("item catalogue", () => {
  it("registers every built arsenal item exactly once", () => {
    for (const id of [...Object.keys(ARSENAL_WEAPONS), ...Object.keys(ARSENAL_SHIELDS)]) {
      expect(ITEMS.has(id), id).toBe(true);
    }
    expect(new Set(ITEMS.keys()).size).toBe(ITEMS.size);
  });

  it("gives every item a name, a weight and a category", () => {
    for (const item of ITEMS.values()) {
      expect(item.name.length, item.id).toBeGreaterThan(0);
      expect(item.weightKg, item.id).toBeGreaterThan(0);
      expect(["weapon", "apparel", "magic", "misc"]).toContain(item.category);
    }
  });

  it("keeps every shield steadier than every weapon", () => {
    for (const weapon of Object.values(ARSENAL_WEAPONS)) {
      expect(weapon.stats.guard.stability, weapon.id)
        .toBeLessThanOrEqual(WEAPON_STABILITY_BAND.max);
    }
    for (const shield of Object.values(ARSENAL_SHIELDS)) {
      expect(shield.stats.guard.stability, shield.id)
        .toBeGreaterThanOrEqual(SHIELD_STABILITY_BAND.min);
    }
  });

  it("scales an item's damage with its material and its reach with its class", () => {
    const { "steel-sword": steel, "daedric-sword": daedric, "iron-dagger": dagger } = ARSENAL_WEAPONS;
    expect(daedric.attacks.light1.damage).toBeGreaterThan(steel.attacks.light1.damage);
    expect(dagger.attacks.light1.range).toBeLessThan(steel.attacks.light1.range);
    expect(ARSENAL_WEAPONS["daedric-greatsword"].attacks.light1.range)
      .toBeGreaterThan(steel.attacks.light1.range);
  });
});

describe("carrying", () => {
  it("stacks repeats into one row and drops the row when it empties", () => {
    let inventory = addItem(base, "lockpick", 3);
    inventory = addItem(inventory, "lockpick", 2);
    expect(inventory.stacks).toHaveLength(1);
    expect(countOf(inventory, "lockpick")).toBe(5);
    inventory = removeItem(inventory, "lockpick", 5);
    expect(inventory.stacks).toHaveLength(0);
  });

  it("never mutates the inventory it is given", () => {
    const before = addItem(base, "steel-sword");
    const snapshot = JSON.stringify(before);
    addItem(before, "iron-sword");
    removeItem(before, "steel-sword");
    equipItem(before, "steel-sword");
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it("counts worn items toward encumbrance, as the original does", () => {
    const inventory = addItem(base, "steel-sword");
    const worn = equipItem(inventory, "steel-sword");
    expect(worn.ok).toBe(true);
    if (!worn.ok) return;
    expect(encumbrance(worn.inventory)).toBe(itemById("steel-sword").weightKg);
  });

  it("reports over-encumbrance against the carrying limit", () => {
    let inventory: Inventory = { ...base, capacityKg: 5 };
    inventory = addItem(inventory, "steel-sword");
    expect(isOverEncumbered(inventory)).toBe(false);
    inventory = addItem(inventory, "steel-shield");
    expect(isOverEncumbered(inventory)).toBe(true);
  });
});

describe("equipping", () => {
  it("refuses what is not carried", () => {
    expect(equipItem(base, "steel-sword")).toEqual({ ok: false, reason: "not-carried" });
  });

  it("refuses what cannot be worn", () => {
    const inventory = addItem(base, "lockpick");
    expect(equipItem(inventory, "lockpick")).toEqual({ ok: false, reason: "not-equippable" });
  });

  it("replaces whatever already occupies the slot", () => {
    let inventory = addItem(addItem(base, "steel-sword"), "iron-sword");
    inventory = toggleEquip(inventory, "steel-sword");
    inventory = toggleEquip(inventory, "iron-sword");
    expect(inventory.equipped.mainHand).toBe("iron-sword");
    expect(isEquipped(inventory, "steel-sword")).toBe(false);
  });

  it("gives a two-handed weapon both hands, and refuses a shield while it is held", () => {
    let inventory = addItem(addItem(base, "daedric-greatsword"), "steel-shield");
    inventory = toggleEquip(inventory, "steel-shield");
    expect(inventory.equipped.offHand).toBe("steel-shield");

    inventory = toggleEquip(inventory, "daedric-greatsword");
    expect(inventory.equipped.mainHand).toBe("daedric-greatsword");
    expect(inventory.equipped.offHand, "the greatsword takes the off hand with it").toBeUndefined();

    expect(equipItem(inventory, "steel-shield")).toEqual({ ok: false, reason: "two-handed" });
  });

  // The off hand takes a shield, a torch or a one-handed weapon (decision
  // 0091). Expected answers written before the rules.
  describe("the off hand", () => {
    const equipOk = (inventory: Inventory, id: string, hand?: "offHand") => {
      const result = equipItem(inventory, id, hand);
      if (!result.ok) throw new Error(`${id}: ${result.reason}`);
      return result.inventory;
    };

    it("holds a dagger beside a sword: dual wield", () => {
      let inventory = addItem(addItem(base, "steel-sword"), "iron-dagger");
      inventory = equipOk(inventory, "steel-sword");
      inventory = equipOk(inventory, "iron-dagger", "offHand");
      expect(inventory.equipped).toMatchObject({ mainHand: "steel-sword", offHand: "iron-dagger" });
    });

    it("loses a dual-wield off hand to a greatsword", () => {
      let inventory = ["steel-sword", "iron-dagger", "daedric-greatsword"].reduce((inv, id) => addItem(inv, id), base);
      inventory = equipOk(equipOk(inventory, "steel-sword"), "iron-dagger", "offHand");
      inventory = equipOk(inventory, "daedric-greatsword");
      expect(inventory.equipped.mainHand).toBe("daedric-greatsword");
      expect(inventory.equipped.offHand).toBeUndefined();
    });

    it("refuses a two-handed weapon or a bow in the off hand", () => {
      const inventory = ["steel-sword", "daedric-greatsword", "steel-longbow"].reduce((inv, id) => addItem(inv, id), base);
      const armed = equipOk(inventory, "steel-sword");
      expect(equipItem(armed, "daedric-greatsword", "offHand")).toEqual({ ok: false, reason: "not-one-handed" });
      expect(equipItem(armed, "steel-longbow", "offHand")).toEqual({ ok: false, reason: "not-one-handed" });
    });

    it("needs two iron daggers to fill both hands with them", () => {
      let inventory = equipOk(addItem(base, "iron-dagger"), "iron-dagger");
      expect(equipItem(inventory, "iron-dagger", "offHand")).toEqual({ ok: false, reason: "needs-two" });
      inventory = addItem(inventory, "iron-dagger");
      inventory = equipOk(inventory, "iron-dagger", "offHand");
      expect(inventory.equipped).toMatchObject({ mainHand: "iron-dagger", offHand: "iron-dagger" });
      // Dropping one of the pair empties the off hand, not both.
      inventory = removeItem(inventory, "iron-dagger");
      expect(inventory.equipped).toMatchObject({ mainHand: "iron-dagger" });
      expect(inventory.equipped.offHand).toBeUndefined();
    });

    it("moves the only copy from the off hand to the main hand", () => {
      let inventory = ["steel-sword", "iron-dagger"].reduce((inv, id) => addItem(inv, id), base);
      inventory = equipOk(equipOk(inventory, "steel-sword"), "iron-dagger", "offHand");
      inventory = equipOk(inventory, "iron-dagger");
      expect(inventory.equipped.mainHand).toBe("iron-dagger");
      expect(inventory.equipped.offHand).toBeUndefined();
    });

    it("equips a torch beside a sword, not beside a bow", () => {
      const inventory = ["steel-sword", "steel-longbow", "torch"].reduce((inv, id) => addItem(inv, id), base);
      const sworded = equipOk(equipOk(inventory, "steel-sword"), "torch");
      expect(sworded.equipped).toMatchObject({ mainHand: "steel-sword", offHand: "torch" });
      const bowed = equipOk(sworded, "steel-longbow");
      expect(bowed.equipped.offHand, "the bow takes the off hand with it").toBeUndefined();
      expect(equipItem(bowed, "torch")).toEqual({ ok: false, reason: "two-handed" });
    });

    it("swaps a torch for a shield and back", () => {
      let inventory = ["steel-sword", "steel-shield", "torch"].reduce((inv, id) => addItem(inv, id), base);
      inventory = equipOk(equipOk(inventory, "steel-sword"), "torch");
      inventory = equipOk(inventory, "steel-shield");
      expect(inventory.equipped.offHand).toBe("steel-shield");
      inventory = equipOk(inventory, "torch");
      expect(inventory.equipped.offHand).toBe("torch");
    });

    it("toggles off whichever hand holds the item", () => {
      let inventory = ["steel-sword", "iron-dagger"].reduce((inv, id) => addItem(inv, id), base);
      inventory = equipOk(equipOk(inventory, "steel-sword"), "iron-dagger", "offHand");
      inventory = toggleEquip(inventory, "iron-dagger");
      expect(inventory.equipped.offHand).toBeUndefined();
      expect(inventory.equipped.mainHand).toBe("steel-sword");
    });
  });

  it("takes an item off when the last of it is dropped", () => {
    let inventory = toggleEquip(addItem(base, "steel-sword"), "steel-sword");
    expect(isEquipped(inventory, "steel-sword")).toBe(true);
    inventory = removeItem(inventory, "steel-sword");
    expect(isEquipped(inventory, "steel-sword")).toBe(false);
  });

  it("adds worn apparel to the armour rating", () => {
    const cuirass = armourById("steel-cuirass");
    const helmet = armourById("steel-helmet");
    let inventory = toggleEquip(addItem(base, cuirass.id), cuirass.id);
    expect(armourRating(inventory)).toBe(cuirass.armourRating);
    inventory = toggleEquip(addItem(inventory, helmet.id), helmet.id);
    expect(armourRating(inventory)).toBe(cuirass.armourRating + helmet.armourRating);
    expect(armourRating(unequipSlot(inventory, "chest"))).toBe(helmet.armourRating);
  });

  it("rates a heavier material above a lighter one in the same slot", () => {
    expect(armourById("daedric-cuirass").armourRating)
      .toBeGreaterThan(armourById("studded-cuirass").armourRating);
  });
});

describe("the view a UI is handed", () => {
  const carried = ["steel-sword", "daedric-greatsword", "steel-shield", "healing-draught", "lockpick"]
    .reduce((inventory, id) => addItem(inventory, id), base);

  it("filters by category and counts each tab", () => {
    const all = buildInventoryView(carried);
    expect(all.cells).toHaveLength(5);
    expect(all.tabs.find((tab) => tab.id === "weapon")?.count).toBe(2);
    expect(buildInventoryView(carried, { category: "magic" }).cells.map((c) => c.itemId))
      .toEqual(["healing-draught"]);
  });

  it("filters by search text", () => {
    expect(buildInventoryView(carried, { search: "shield" }).cells.map((c) => c.itemId))
      .toEqual(["steel-shield"]);
  });

  it("puts worn things first whatever the sort", () => {
    const worn = toggleEquip(carried, "lockpick" in carried.equipped ? "lockpick" : "steel-shield");
    for (const sort of ["category", "name", "weight", "value"] as const) {
      const view = buildInventoryView(worn, { sort });
      expect(view.cells[0].equipped, sort).toBe(true);
    }
  });

  it("explains why an item cannot be equipped rather than going quiet", () => {
    const twoHanded = toggleEquip(carried, "daedric-greatsword");
    const shield = buildInventoryView(twoHanded).cells.find((c) => c.itemId === "steel-shield");
    expect(shield?.equipBlocked).toBe("Your weapon needs both hands.");
    const sword = buildInventoryView(carried).cells.find((c) => c.itemId === "steel-sword");
    expect(sword?.equipBlocked).toBeUndefined();
  });

  // Two-handed weapons swung with borrowed one-handed motion until the
  // greatsword and greataxe packs were sourced; this is what proves they no
  // longer do. The flag itself stays — the next weapon family to be added
  // (spears, dual wield) borrows until its clips exist, and a player is owed
  // that warning.
  it("no longer flags two-handed weapons as borrowing a moveset", () => {
    const greatsword = buildInventoryView(carried).cells
      .find((c) => c.itemId === "daedric-greatsword");
    expect(greatsword).toBeDefined();
    expect(greatsword?.provisional).toBeUndefined();
  });

  it("reports encumbrance, armour and the worn slots", () => {
    const worn = toggleEquip(carried, "steel-sword");
    const view = buildInventoryView(worn);
    expect(view.encumbrance.currentKg).toBeCloseTo(encumbrance(worn), 5);
    expect(view.encumbrance.ratio).toBeGreaterThan(0);
    expect(view.slots.find((slot) => slot.slot === "mainHand")?.cell?.itemId).toBe("steel-sword");
    expect(view.slots.find((slot) => slot.slot === "head")?.cell).toBeNull();
  });
});

describe("the sandbox starting pack", () => {
  it("carries every built weapon and shield, the supplies, and fits the pack", async () => {
    const { startingInventory } = await import("./store");
    const inventory = startingInventory();
    for (const id of [...Object.keys(ARSENAL_WEAPONS), ...Object.keys(ARSENAL_SHIELDS)]) {
      expect(countOf(inventory, id), id).toBe(1);
    }
    expect(countOf(inventory, "iron-war-arrow")).toBe(48);
    expect(countOf(inventory, "healing-draught")).toBe(5);
    expect(countOf(inventory, "lockpick")).toBe(12);
    expect(isOverEncumbered(inventory)).toBe(false);
    expect(isEquipped(inventory, "steel-sword")).toBe(true);
  });
});
