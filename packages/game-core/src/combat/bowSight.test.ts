import { expect, it } from "vitest";
import { bowSight } from "./bowSight";
import { DEFAULT_ARROW } from "../equipment/arrows";
import { WEAPON_CLASSES } from "../equipment/weaponClasses";
import { DEFAULT_ARROW_GRAVITY_SCALE } from "./arrowFlight";
import { useGameStore } from "../core/store";

const ranged = WEAPON_CLASSES.longbow.ranged!;
const actor = { x: 0, y: 1, z: 0 };
it("keeps body facing stable when the nock passes the close ground target", () => {
  const point = { x: 0.1, y: 0, z: 0.1 };
  for (const z of [-0.3, 0, 0.1, 0.3]) {
    const sight = bowSight({ nock: { x: 0, y: 1.6, z }, point, actor, cameraYaw: 0.4,
      ranged, arrow: DEFAULT_ARROW.physics, surface: true });
    expect(sight.yaw).toBe(0.4);
    expect(Number.isFinite(sight.pitch)).toBe(true);
  }
});
it("faces a locked target from the actor centre independently of the drawing hand", () => {
  const point = { x: 0, y: 1.5, z: 10 };
  for (const x of [-0.5, 0, 0.5]) {
    const sight = bowSight({ nock: { x, y: 1.6, z: 0 }, point, actor, cameraYaw: 0,
      lockedTarget: point, ranged, arrow: DEFAULT_ARROW.physics, surface: true });
    expect(Math.abs(sight.yaw)).toBe(Math.PI);
  }
});
it("shares the accepted 2x gravity default between gameplay and the store", () => {
  expect(DEFAULT_ARROW_GRAVITY_SCALE).toBe(2);
  expect(useGameStore.getState().arrowGravityScale).toBe(DEFAULT_ARROW_GRAVITY_SCALE);
});
