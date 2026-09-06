import { describe, expect, it } from "vitest";
import type { WaterInteractionEvent, WorldWaterQuery } from "@elder-souls/contracts";
import { WaterContactEmitter } from "./contactEmitter";

function queryFixture(flowX = 0) {
  const events: WaterInteractionEvent[] = [];
  const query: WorldWaterQuery = {
    sample: p => ({ waterBodyId: p.x < 100 ? "water.test.river" : null,
      surfaceHeight: 2, depth: p.x < 100 ? 3 : 0,
      surfaceNormal: { x: 0, y: 1, z: 0 }, flowVelocity: { x: flowX, y: 0, z: 0 },
      immersion: Math.max(0, Math.min(1, (2 - p.y) / 1.7)),
      turbidity: 0, salinity: 0, temperature: 20, hazardIds: [] }),
    emitInteraction: event => events.push(event),
  };
  return { query, events };
}

describe("actor water contacts", () => {
  it("keeps entry energy and distance-spaced wakes consistent at 30 and 200 fps", () => {
    const run = (fps: number, actorSpeed: number, flowSpeed: number) => {
      const { query, events } = queryFixture(flowSpeed);
      const emitter = new WaterContactEmitter("actor.test", 0.35);
      emitter.update(query, 0, { x: 0, y: 2.1, z: 0 }, -3, 1 / fps);
      for (let frame = 1; frame <= fps * 3; frame++) {
        emitter.update(query, frame / fps / 60,
          { x: actorSpeed * frame / fps, y: 1.5, z: 0 }, -3, 1 / fps);
      }
      return events;
    };
    // Includes a stationary actor disturbed by current: spacing follows
    // relative travel, while emitted velocity remains world velocity.
    for (const [actorSpeed, flowSpeed] of [[2, 0.4], [0, 1.6]]) {
      const low = run(30, actorSpeed, flowSpeed), high = run(200, actorSpeed, flowSpeed);
      expect(low.filter(e => e.kind === "enter")).toHaveLength(1);
      expect(high.filter(e => e.kind === "enter")).toHaveLength(1);
      expect(low[0].magnitude).toBeCloseTo(high[0].magnitude!, 7);
      const lowWake = low.filter(e => e.kind === "wake"), highWake = high.filter(e => e.kind === "wake");
      expect(lowWake.length).toBeGreaterThan(5);
      expect(Math.abs(lowWake.length - highWake.length)).toBeLessThanOrEqual(1);
      for (const event of [...lowWake, ...highWake]) {
        expect(event.magnitude).toBeCloseTo(1.6 ** 2 * 2, 7);
        expect(event.velocity!.x).toBeCloseTo(actorSpeed, 7);
      }
    }
  });

  it("emits a surface exit above water, but never invents one on dry ground or a teleport", () => {
    const { query, events } = queryFixture();
    const emitter = new WaterContactEmitter("actor.test");
    emitter.update(query, 0, { x: 0, y: 1.5, z: 0 }, 0, 1 / 60);
    emitter.update(query, 0, { x: 0, y: 2.2, z: 0 }, 3, 1 / 60);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("exit");
    expect(events[0].position.y).toBe(2);
    expect(events[0].velocity!.y).toBe(3);
    emitter.reset(); events.length = 0;
    emitter.update(query, 0, { x: 99.9, y: 1.5, z: 0 }, 0, 1 / 60);
    emitter.update(query, 0, { x: 100.1, y: 2.2, z: 0 }, 3, 1 / 60);
    expect(events).toHaveLength(0);
    emitter.update(query, 0, { x: 0, y: 1.5, z: 0 }, -3, 1 / 60);
    expect(events).toHaveLength(0);
  });

  it("tracks complete submersion and resurfacing without underwater wakes", () => {
    const { query, events } = queryFixture(2);
    const emitter = new WaterContactEmitter("actor.test", 0.35, 1);
    emitter.update(query, 0, { x: 0, y: 3, z: 0 }, -5, 0.1);
    emitter.update(query, 0, { x: 0, y: 0, z: 0 }, -5, 0.1);
    expect(events.map(e => e.kind)).toEqual(["enter", "submerge"]);
    events.length = 0;
    for (let i = 0; i < 10; i++) emitter.update(query, 0, { x: i * 0.1, y: 0, z: 0 }, 0, 0.1);
    expect(events).toHaveLength(0);
    emitter.update(query, 0, { x: 1, y: 1.5, z: 0 }, 5, 0.1);
    expect(events[0].kind).toBe("splash");
  });

  it("suppresses vertical teleports, body switches and paused updates", () => {
    const { query, events } = queryFixture(2);
    let id = "water.a";
    const source: WorldWaterQuery = { ...query, sample: (p, t) => ({ ...query.sample(p, t), waterBodyId: id }) };
    const emitter = new WaterContactEmitter("actor.test");
    emitter.update(source, 0, { x: 0, y: 30, z: 0 }, 0, 0.1);
    emitter.update(source, 0, { x: 0, y: 1, z: 0 }, 0, 0.1);
    id = "water.b";
    emitter.update(source, 0, { x: 2, y: 1, z: 0 }, 0, 0.1);
    emitter.update(source, 0, { x: 3, y: 1, z: 0 }, 0, 0);
    expect(events).toHaveLength(0);
  });

  it("spaces fast-hull wakes at low frame rates with a fixed catch-up budget", () => {
    const run = (fps: number) => {
      const { query, events } = queryFixture();
      const emitter = new WaterContactEmitter("actor.hull");
      for (let i = 0; i <= fps; i++) emitter.update(query, 0,
        { x: 10 * i / fps, y: 1.5, z: 0 }, 0, 1 / fps);
      return events.filter(e => e.kind === "wake");
    };
    const low = run(10), high = run(200);
    expect(low.length).toBeGreaterThan(15);
    expect(Math.abs(low.length - high.length)).toBeLessThanOrEqual(1);
    for (let i = 1; i < low.length; i++) expect(low[i].position.x - low[i - 1].position.x).toBeCloseTo(0.525, 7);
    const { query, events } = queryFixture(100);
    const emitter = new WaterContactEmitter("actor.hull");
    emitter.update(query, 0, { x: 0, y: 1.5, z: 0 }, 0, 0.1);
    emitter.update(query, 0, { x: 0, y: 1.5, z: 0 }, 0, 0.1);
    expect(events.length).toBeLessThanOrEqual(4);
  });
});
