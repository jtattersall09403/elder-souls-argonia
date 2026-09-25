import { describe, expect, it } from "vitest";
import { armourById } from "../equipment/armour";
import { ARSENAL_SHIELDS } from "../equipment/arsenal";
import { materialWeightClass } from "../equipment/materials";
import { bodyImpactTarget, bowCycleSounds, footwearFor, guardSoundClass } from "./soundClasses";
import type { Loadout, WeaponDefinition } from "../equipment/types";

// Expected answers written before the code: Skyrim's own light/heavy armour
// split for every material both games share.
describe("materialWeightClass", () => {
  it("splits the shared materials as Skyrim does", () => {
    for (const light of ["studded", "elven", "glass"] as const) expect(materialWeightClass(light)).toBe("light");
    for (const heavy of ["iron", "steel", "dwarven", "orcish", "ebony", "daedric"] as const) {
      expect(materialWeightClass(heavy)).toBe("heavy");
    }
  });
});

describe("worn armour", () => {
  it("sounds bare feet, light and heavy boots", () => {
    expect(footwearFor([])).toBe("barefoot");
    expect(footwearFor([armourById("elven-boots")])).toBe("light");
    expect(footwearFor([armourById("iron-boots")])).toBe("heavy");
  });

  it("strikes flesh, light armour or plate by the cuirass", () => {
    expect(bodyImpactTarget([armourById("iron-boots")])).toBe("flesh");
    expect(bodyImpactTarget([armourById("glass-cuirass")])).toBe("armor");
    expect(bodyImpactTarget([armourById("steel-cuirass")])).toBe("metal");
  });
});

describe("guardSoundClass", () => {
  const sword = { stats: { class: "straightSword" } } as unknown as WeaponDefinition;
  const hammer = { stats: { class: "warhammer" } } as unknown as WeaponDefinition;
  it("blocks on the weapon without a guard in the off hand", () => {
    expect(guardSoundClass({ mainHand: sword, offHand: null })).toBe("blade-1h");
    expect(guardSoundClass({ mainHand: hammer, offHand: null })).toBe("blunt-2h");
  });

  it("blocks on the shield by its material's weight", () => {
    const shields = Object.values(ARSENAL_SHIELDS);
    const heavy = shields.find((s) => materialWeightClass(s.materialId) === "heavy");
    const light = shields.find((s) => materialWeightClass(s.materialId) === "light");
    if (heavy) expect(guardSoundClass({ mainHand: sword, offHand: heavy } as Loadout)).toBe("shield-heavy");
    if (light) expect(guardSoundClass({ mainHand: sword, offHand: light } as Loadout)).toBe("shield-light");
    expect(heavy ?? light).toBeDefined();
  });
});

describe("bowCycleSounds", () => {
  it("nocks, pulls and releases on the cycle's edges only", () => {
    expect(bowCycleSounds("ready", "nocking", false)).toEqual(["bow.nock"]);
    expect(bowCycleSounds("nocking", "nocking", false)).toEqual([]);
    expect(bowCycleSounds("nocking", "drawing", false)).toEqual(["bow.pull"]);
    expect(bowCycleSounds("drawing", "loosed", true)).toEqual(["bow.release"]);
    expect(bowCycleSounds("drawing", "ready", false)).toEqual([]);
  });
});
