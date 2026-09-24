import { expect, it } from "vitest";
import { DEFAULT_ARROW_GRAVITY_SCALE } from "@elder-souls/game-core/combat/arrowFlight";
import { useGameStore } from "./sandboxStore";

it("starts the debug panel on the gameplay arrow gravity", () => {
  expect(useGameStore.getState().arrowGravityScale).toBe(DEFAULT_ARROW_GRAVITY_SCALE);
});
