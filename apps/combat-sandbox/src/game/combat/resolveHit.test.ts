import { describe, expect, it } from "vitest";
import { resolveHit } from "./resolveHit";
import { STRAIGHT_SWORD } from "../equipment/arsenal";

const GUARD = STRAIGHT_SWORD.stats.guard;

const light = STRAIGHT_SWORD.attacks.light1;
const heavy = STRAIGHT_SWORD.attacks.heavy;
const riposte = STRAIGHT_SWORD.attacks.riposte;

describe("resolveHit", () => {
  it("ignores contact during dodge invulnerability", () => {
    const result = resolveHit(100, 100, { attack: light, guard: null, iframe: true, execution: null });
    expect(result.kind).toBe("iframe");
  });

  it("still lands an execution through invulnerability", () => {
    const result = resolveHit(100, 100, { attack: riposte, guard: null, iframe: true, execution: "riposte" });
    expect(result.kind).toBe("execution");
  });

  it("subtracts weapon damage on a clean hit and flags heavy attacks", () => {
    const result = resolveHit(100, 100, { attack: heavy, guard: null, iframe: false, execution: null });
    expect(result.kind).toBe("hit");
    if (result.kind !== "hit") return;
    expect(result.health).toBe(100 - heavy.damage);
    expect(result.heavy).toBe(true);
    expect(result.killed).toBe(false);
  });

  it("reports a kill when damage empties health", () => {
    const result = resolveHit(light.damage - 1, 100, { attack: light, guard: null, iframe: false, execution: null });
    expect(result.kind).toBe("hit");
    if (result.kind !== "hit") return;
    expect(result.health).toBe(0);
    expect(result.killed).toBe(true);
  });

  it("blocks with a full stamina bar", () => {
    const result = resolveHit(100, 100, { attack: light, guard: GUARD, iframe: false, execution: null });
    expect(result.kind).toBe("blocked");
    if (result.kind !== "blocked") return;
    expect(result.health).toBeLessThanOrEqual(100);
    expect(result.stamina).toBeLessThan(100);
  });

  it("breaks a guard with an empty stamina bar and applies guard-break damage", () => {
    const result = resolveHit(100, 0, { attack: light, guard: GUARD, iframe: false, execution: null, guardBreakDamage: 18 });
    expect(result.kind).toBe("guardBroken");
    if (result.kind !== "guardBroken") return;
    expect(result.health).toBe(82);
    expect(result.stamina).toBe(0);
  });

  it("bypasses guard for executions", () => {
    const result = resolveHit(100, 100, { attack: riposte, guard: GUARD, iframe: false, execution: "backstab" });
    expect(result.kind).toBe("execution");
  });
});
