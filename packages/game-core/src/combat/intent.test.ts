import { describe, expect, it } from "vitest";
import { InputController } from "../io/input";
import { inputToIntent, swimmingIntent, type PlayerIntent } from "./intent";

/**
 * The off hand's attack presses (dual wield, decision 0091) are the input
 * controller's `offLight` / `offHeavy` actions, read as edges like every other
 * press. The gesture itself is tested in io/input.test.ts.
 */
describe("inputToIntent: off-hand attacks", () => {
  it("reads offLight and offHeavy presses and nothing from guard alone", () => {
    const controller = new InputController();
    controller.setVirtual("offLight", true);
    controller.update(1000);
    let intent = inputToIntent(controller);
    expect(intent.offLightPressed).toBe(true);
    expect(intent.offHeavyPressed).toBe(false);
    controller.update(1016);
    expect(inputToIntent(controller).offLightPressed).toBe(false);
    controller.setVirtual("offLight", false);
    controller.setVirtual("offHeavy", true);
    controller.update(1032);
    intent = inputToIntent(controller);
    expect(intent.offHeavyPressed).toBe(true);
    expect(intent.offLightPressed).toBe(false);
  });
});

describe("swimmingIntent (decision 0093)", () => {
  it("keeps moving, looking, the sprint hold and healing, and refuses every combat, dodge release, jump and stance control", () => {
    const all: PlayerIntent = {
      move: { x: 0.3, y: 1 }, camera: { x: 2, y: -1 },
      lightPressed: true, lightHeld: true, heavyPressed: true, guardHeld: true, aimExitPressed: true,
      parryPressed: true, offLightPressed: true, offHeavyPressed: true, dodgePressed: true,
      dodgeHeld: true, dodgeReleased: true, lockOnPressed: true, healPressed: true, equipPressed: true,
      jumpPressed: true, jumpHeld: true, crouchPressed: true, zoomInHeld: true, zoomOutHeld: true,
      zoomWheel: 3, targetLeftPressed: true, targetRightPressed: true,
    };
    const swim = swimmingIntent(all);
    expect(swim.move).toEqual({ x: 0.3, y: 1 });
    expect(swim.camera).toEqual({ x: 2, y: -1 });
    expect(swim.healPressed).toBe(true);
    const stillTrue = Object.entries(swim)
      .filter(([, value]) => value === true)
      .map(([key]) => key)
      .sort();
    expect(stillTrue).toEqual(["aimExitPressed", "dodgeHeld", "dodgePressed", "healPressed", "zoomInHeld", "zoomOutHeld"]);
  });
});
