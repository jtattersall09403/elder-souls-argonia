import { describe, expect, it } from "vitest";
import { weaponById } from "./arsenal";
describe("riposte clips per class", () => {
  it("daggers stab, swords lunge", () => {
    expect(weaponById("steel-dagger").animations.riposte.attackerAction).toBe("RIPOSTE_STAB");
    expect(weaponById("steel-dagger").attacks.riposte.animation).toBe("RIPOSTE_STAB");
    expect(weaponById("steel-sword").animations.riposte.attackerAction).toBe("RIPOSTE");
  });
});
