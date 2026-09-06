import { describe, expect, it } from "vitest";
import type { Vec3, WaterInteractionEvent, WorldWaterQuery } from "@elder-souls/contracts";
import { PhysicsMassUnits } from "../physics/massUnits";
import { WaterRigidBodyDriver, type WaterRigidBody } from "./rigidBody";

const ZERO = { x: 0, y: 0, z: 0 };
function fixture(scale: number) {
  const units = new PhysicsMassUnits(scale), events: WaterInteractionEvent[] = [];
  const impulses: { force: Vec3; point: Vec3 }[] = [];
  let position = { x: 0, y: -2, z: 0 };
  let rotation = { x: 0, y: 0, z: 0, w: 1 };
  const body: WaterRigidBody = { translation: () => position, rotation: () => rotation,
    linvel: () => ZERO, angvel: () => ZERO, worldCom: () => position,
    applyImpulseAtPoint: (force, point) => impulses.push({ force, point }) };
  const query: WorldWaterQuery = { sample: () => ({ waterBodyId: "water.pool", surfaceHeight: 0,
    surfaceNormal: { x: 0, y: 1, z: 0 }, flowVelocity: ZERO, depth: 100, immersion: 1,
    turbidity: 0, salinity: 0, temperature: 20, hazardIds: [] }), emitInteraction: event => events.push(event) };
  const driver = new WaterRigidBodyDriver({ actorId: "object.cargo", massUnits: units,
    halfExtentsM: { x: 2, y: 0.5, z: 0.5 }, buoyancy: { volumeM3: 1,
      points: [{ x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }], pointHeightM: 1, linearDrag: 0 } });
  return { units, driver, query, body, impulses, events,
    move: (p: Vec3) => { position = p; }, rotate: (q: typeof rotation) => { rotation = q; } };
}

describe("reusable fixed-step water body adapter", () => {
  it("keeps acceleration identical across SI and legacy mass units, and preserves point torques", () => {
    for (const dt of [1 / 60, 1 / 120]) {
      for (const scale of [1, 0.01]) {
        const f = fixture(scale);
        f.driver.step(f.query, 0, f.body, dt);
        const impulse = f.impulses.reduce((total, p) => total + p.force.y, 0);
        expect(impulse / f.units.mass(1000) / dt).toBeCloseTo(9.81, 9);
        expect(f.impulses.map(p => p.point.x)).toEqual([-1, 1]);
        expect(f.units.kilograms(f.units.mass(250))).toBe(250);
        expect(f.units.density(1000)).toBe(f.units.mass(1000));
        expect(f.units.impulse({ x: 2, y: 3, z: 4 })).toEqual({ x: 2 * scale, y: 3 * scale, z: 4 * scale });
      }
    }
  });
  it("detects first contact at the rotated hull bottom and resets pooled state", () => {
    const f = fixture(1);
    f.move({ x: 0, y: 2.5, z: 0 });
    f.driver.step(f.query, 0, f.body, 1 / 60);
    f.rotate({ x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 });
    f.move({ x: 0, y: 1.5, z: 0 });
    f.driver.step(f.query, 0, f.body, 1 / 60);
    expect(f.events.map(e => e.kind)).toEqual(["enter"]);
    expect(f.events[0].actorId).toBe("object.cargo");
    f.driver.reset(); f.events.length = 0;
    f.driver.step(f.query, 0, f.body, 1 / 60);
    expect(f.events).toHaveLength(0);
  });
  it("does no work without a physics step and refuses an unsafe frame-time impulse", () => {
    const f = fixture(1);
    expect(f.driver.step(f.query, 0, f.body, 0)).toBeNull();
    expect(f.impulses).toHaveLength(0);
    expect(() => f.driver.step(f.query, 0, f.body, 1)).toThrow("fixed physics steps");
    expect(() => new PhysicsMassUnits(0)).toThrow(RangeError);
  });
});
