import { describe, expect, it } from "vitest";
import { resolveHit, type HitContext } from "./resolveHit";
import { damageAfterArmour } from "./armourMitigation";
import type { AttackDefinition, GuardProfile } from "../equipment/types";

const ATTACK = {
  id: "light1",
  animation: "ATTACK_LIGHT_1",
  damage: 100,
  motionValue: 1,
  stamina: 20,
  windup: 0.2,
  active: 0.1,
  recovery: 0.3,
  range: 2,
  arc: 1,
  lunge: 1,
  hitStop: 0.055,
} as unknown as AttackDefinition;

const GUARD: GuardProfile = { stability: 0.6, absorption: { physical: 0.9 } };

const base = (over: Partial<HitContext> = {}): HitContext => ({
  attack: ATTACK,
  guard: null,
  iframe: false,
  execution: null,
  ...over,
});

describe("one resolve step for every blow", () => {
  it("is numerically unchanged when effects and attacker are omitted", () => {
    const plain = resolveHit(200, 100, base({ armourRating: 150 }));
    expect(plain.kind).toBe("hit");
    if (plain.kind !== "hit") throw new Error("expected a hit");
    // 100 damage against rating 150 is halved by the mitigation curve.
    expect(200 - plain.health).toBeCloseTo(damageAfterArmour(100, 150), 9);
    expect(200 - plain.health).toBeCloseTo(50, 9);
    expect(plain.status).toEqual([]);
  });

  it("i-frames and guards resolve before anything else", () => {
    expect(resolveHit(200, 100, base({ iframe: true })).kind).toBe("iframe");
    const blocked = resolveHit(200, 100, base({
      guard: GUARD,
      effects: [{ kind: "bleed", fraction: 0.25, seconds: 4 }],
    }));
    expect(blocked.kind).toBe("blocked");
    expect(blocked).not.toHaveProperty("status");
  });

  it("armour pierce lands more than the same blow without it", () => {
    const without = resolveHit(200, 100, base({ armourRating: 150, effects: [] }));
    const with25 = resolveHit(200, 100, base({
      armourRating: 150,
      effects: [{ kind: "armourPierce", share: 0.25 }],
    }));
    if (without.kind !== "hit" || with25.kind !== "hit") throw new Error("expected hits");
    expect(200 - with25.health).toBeGreaterThan(200 - without.health);
    // Rating 150 -> 112.5.
    expect(200 - with25.health).toBeCloseTo(damageAfterArmour(100, 112.5), 9);
  });

  it("bleeds by a fraction of what landed, on hits and executions only", () => {
    const hit = resolveHit(200, 100, base({
      armourRating: 150,
      effects: [{ kind: "bleed", fraction: 0.25, seconds: 4 }],
    }));
    if (hit.kind !== "hit") throw new Error("expected a hit");
    const landed = 200 - hit.health;
    expect(hit.status).toHaveLength(1);
    expect(hit.status[0].totalDamage).toBeCloseTo(landed * 0.25, 9);
    expect(hit.status[0].seconds).toBe(4);

    const execution = resolveHit(200, 100, base({
      execution: "backstab",
      armourRating: 0,
      effects: [{ kind: "bleed", fraction: 0.3, seconds: 4 }],
    }));
    if (execution.kind !== "execution") throw new Error("expected an execution");
    expect(execution.status[0].totalDamage).toBeCloseTo(30, 9);
  });

  it("applies damagePosition before armour", () => {
    const weak = resolveHit(200, 100, base({
      armourRating: 150,
      attacker: { damagePosition: 0.4, staminaCost: 1.25, strength: 1 },
    }));
    if (weak.kind !== "hit") throw new Error("expected a hit");
    expect(200 - weak.health).toBeCloseTo(damageAfterArmour(40, 150), 9);
    expect(200 - weak.health).toBeCloseTo(20, 9);
  });

  it("multiplies the hit zone and the attacker's position together", () => {
    const head = resolveHit(200, 100, base({
      hitZoneMultiplier: 2,
      attacker: { damagePosition: 0.5, staminaCost: 1, strength: 1 },
    }));
    if (head.kind !== "hit") throw new Error("expected a hit");
    expect(200 - head.health).toBeCloseTo(100, 9);
  });

  it("lands a class critical only when the roll clears its chance, and never on an execution", () => {
    const effects = [{ kind: "critChance", chance: 0.1, multiplier: 1.5 }] as const;
    const hit = (over: Partial<HitContext>) => {
      const r = resolveHit(1000, 100, base({ effects, ...over }));
      if (r.kind !== "hit" && r.kind !== "execution") throw new Error(r.kind);
      return { damage: 1000 - r.health, critical: r.kind === "hit" ? r.critical : false };
    };
    expect(hit({ critRoll: 0.05 })).toEqual({ damage: 150, critical: true });
    expect(hit({ critRoll: 0.1 })).toEqual({ damage: 100, critical: false });
    expect(hit({})).toEqual({ damage: 100, critical: false });
    expect(hit({ critRoll: 0, execution: "riposte" }).damage).toBe(100);
  });

  it("multiplies the attacker's Strength term beside the range position", () => {
    const r = resolveHit(1000, 100, base({ attacker: { damagePosition: 1, staminaCost: 1, strength: 1.5 } }));
    if (r.kind !== "hit") throw new Error(r.kind);
    expect(1000 - r.health).toBeCloseTo(150, 9);
  });
});

describe("the sneak multiplier (decision 0092 §5, module 76 §121.5)", () => {
  it("scales incoming damage at step 3, before armour", () => {
    const sneak = resolveHit(1000, 100, base({ sneakMultiplier: 7, armourRating: 150 }));
    if (sneak.kind !== "hit") throw new Error("expected a hit");
    // 100 × 7 = 700 incoming, then armour.
    expect(1000 - sneak.health).toBeCloseTo(damageAfterArmour(700, 150), 9);
  });
  it("defaults to 1", () => {
    const plain = resolveHit(1000, 100, base());
    const one = resolveHit(1000, 100, base({ sneakMultiplier: 1 }));
    expect(one).toEqual(plain);
  });
  it("applies to an execution, whose own critical stays out of it", () => {
    // The caller hands an unseen backstab the main weapon's light1 (§2 of the
    // brief); the resolve multiplies that by the sneak table and nothing else.
    const executed = resolveHit(1000, 100, base({ execution: "backstab", sneakMultiplier: 5 }));
    if (executed.kind !== "execution") throw new Error("expected an execution");
    expect(1000 - executed.health).toBeCloseTo(500, 9);
  });
});
