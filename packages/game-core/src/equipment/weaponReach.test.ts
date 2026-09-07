import { describe, expect, it } from "vitest";
import { ARSENAL_WEAPONS } from "./arsenal";
import { ARSENAL_BLUEPRINT_WEAPONS } from "./arsenalBlueprints";
import { applyWeaponReach, MEASURED_ATTACK_IDS } from "./weaponReach";
import { weaponTactics } from "../ai/weaponTactics";

describe("production arsenal reach", () => {
  it("resolves every melee attack from measurements and preserves paired entry limits", () => {
    for (const w of Object.values(ARSENAL_WEAPONS)) {
      if(w.stats.ranged) continue;
      expect(Object.keys(w.attacks).sort()).toEqual([...MEASURED_ATTACK_IDS].sort());
      for(const id of MEASURED_ATTACK_IDS) {
        expect(w.attacks[id].measuredReach, `${w.id}/${id}`).toBeDefined();
        expect(w.attacks[id].measuredReach!.range).toBeGreaterThan(0);
        if(id==='riposte'||id==='backstab') expect(w.attacks[id].range).toBe(ARSENAL_BLUEPRINT_WEAPONS[w.id].attacks[id].range);
        else expect(w.attacks[id].range).toBe(w.attacks[id].measuredReach!.range);
      }
      expect(weaponTactics(w).engageRange).toBeCloseTo(w.attacks.light1.range * .82);
    }
  });
  it("distinguishes actual geometry within a class and rejects an unmeasured new item", () => {
    expect(ARSENAL_WEAPONS['elven-sword'].attacks.light1.range).not.toBe(ARSENAL_WEAPONS['iron-sword'].attacks.light1.range);
    expect(ARSENAL_WEAPONS['elven-dagger'].attacks.light1.range).toBeLessThan(ARSENAL_WEAPONS['elven-sword'].attacks.light1.range);
    expect(()=>applyWeaponReach({...ARSENAL_BLUEPRINT_WEAPONS['elven-dagger'],id:'unmeasured'})).toThrow(/Missing measured reach/);
  });
});
