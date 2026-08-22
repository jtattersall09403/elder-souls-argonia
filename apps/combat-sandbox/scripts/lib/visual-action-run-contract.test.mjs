import { describe, expect, it } from "vitest";
import { compareActionRunPath, extractActionRuns } from "./visual-action-run-contract.mjs";

function event(time, playerAction, enemyAction = "watching", playerAnimation = "SWORD_IDLE") {
  return { time, playerAction, playerAnimation, enemyAction, enemyAnimation: "SWORD_IDLE" };
}

describe("production FSM action-run contracts", () => {
  it("does not split one action when only its rendered animation changes", () => {
    const telemetry = { events: [
      event(0, "idle"),
      event(0.1, "guard", "watching", "GUARD_ENTER"),
      event(0.9, "guard", "watching", "GUARD"),
      event(1.8, "guard", "attack", "GUARD_HIT_A"),
      event(2.4, "guard", "recoil", "GUARD"),
      event(3, "idle"),
    ] };

    expect(extractActionRuns(telemetry, "player").map(({ state }) => state))
      .toEqual(["idle", "guard", "idle"]);
    expect(compareActionRunPath({
      telemetry,
      actor: "player",
      requiredRuns: ["idle", "guard", "idle"],
    }).pass).toBe(true);
  });

  it("rejects a missing action, an unexpected detour, and state re-entry", () => {
    const requiredRuns = ["idle", "light1", "light2", "light3", "idle"];
    const missing = compareActionRunPath({
      telemetry: { events: [event(0, "idle"), event(0.2, "light1"), event(0.7, "light3"), event(1.2, "idle")] },
      actor: "player",
      requiredRuns,
    });
    expect(missing.pass).toBe(false);
    expect(missing.failures.join(" ")).toMatch(/expected light2, observed light3|missing action run/);

    const detour = compareActionRunPath({
      telemetry: { events: [
        event(0, "idle"),
        event(0.2, "light1"),
        event(0.4, "heal"),
        event(0.7, "light2"),
        event(1, "light3"),
        event(1.2, "idle"),
      ] },
      actor: "player",
      requiredRuns,
    });
    expect(detour.pass).toBe(false);
    expect(detour.failures.join(" ")).toMatch(/expected light2, observed heal|unexpected action run/);

    const reentry = compareActionRunPath({
      telemetry: { events: [
        event(0, "idle"),
        event(0.2, "light1"),
        event(0.4, "idle"),
        event(0.6, "light1"),
        event(0.8, "light2"),
        event(1, "light3"),
        event(1.2, "idle"),
      ] },
      actor: "player",
      requiredRuns,
    });
    expect(reentry.pass).toBe(false);
    expect(reentry.failures.join(" ")).toMatch(/expected light2, observed idle|unexpected action run/);
  });

  it("fails loudly on malformed or out-of-order production events", () => {
    expect(() => extractActionRuns({ events: [event(0.2, "idle"), event(0.1, "roll")] }, "player"))
      .toThrow(/chronological order/);
    expect(() => extractActionRuns({ events: [{ time: 0, playerAction: "idle" }] }, "enemy"))
      .toThrow(/enemyAction/);
    expect(() => compareActionRunPath({ telemetry: { events: [] }, actor: "npc", requiredRuns: [] }))
      .toThrow(/player or enemy/);
  });
});
