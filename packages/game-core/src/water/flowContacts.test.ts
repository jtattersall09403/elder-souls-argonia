import { describe, expect, it } from "vitest";
import type { WorldWaterQuery } from "@elder-souls/contracts";
import { WaterFlowContacts } from "./flowContacts";

function fixture(speed: number, obstacle: boolean): WorldWaterQuery {
  return { emitInteraction() {}, sample(p) {
    const dry = obstacle && p.x > 0.4 && p.x < 1.3 && Math.abs(p.z) < 0.3;
    return { waterBodyId: dry ? null : "water.test", surfaceHeight: 0, surfaceNormal: { x: 0, y: 1, z: 0 },
      flowVelocity: { x: speed, y: 0, z: 0 }, depth: dry ? 0 : 0.3, immersion: 0,
      turbidity: 0, salinity: 0, temperature: 20, hazardIds: [] };
  } };
}
describe("local flow contacts", () => {
  it("emits at an actual current-facing obstacle, not in open or still water", () => {
    for (const [speed, obstacle, expected] of [[2, true, true], [2, false, false], [0, true, false]] as const) {
      const contacts = new WaterFlowContacts();
      const ids = new Set<string>();
      for (let i = 0; i < 80; i++) contacts.update(fixture(speed, obstacle), 0, { x: 0, y: 1, z: 0 }, 0.05,
        (id, event) => { ids.add(id); expect(event.position.y).toBe(0); expect(event.radius).toBeLessThan(0.6); });
      expect(ids.size > 0).toBe(expected);
      expect(ids.size).toBeLessThanOrEqual(16);
    }
  });
  it("does not emit on paused steps or for an underwater viewer", () => {
    const contacts = new WaterFlowContacts();
    let count = 0;
    for (let i = 0; i < 80; i++) contacts.update(fixture(2, true), 0, { x: 0, y: -1, z: 0 }, 0.05, () => count++);
    contacts.update(fixture(2, true), 0, { x: 0, y: 1, z: 0 }, 0, () => count++);
    expect(count).toBe(0);
  });

  it("refreshes established contacts continuously at 10 fps instead of expiring between scans", () => {
    const contacts = new WaterFlowContacts();
    let established = false;
    for (let frame = 0; frame < 100; frame++) {
      let emitted = false;
      contacts.update(fixture(2, true), 0, { x: 0, y: 1, z: 0 }, 0.1, (id, event) => {
        if (id !== "water-obstacle.0.0") return;
        emitted = true;
        expect(event.velocity).toEqual({ x: 0, y: 0, z: 0 });
      });
      if (established) expect(emitted, `contact disappeared at frame ${frame}`).toBe(true);
      established ||= emitted;
    }
    expect(established).toBe(true);
  });

  it("bounds scan work after a stall and clears contacts when flying away vertically", () => {
    const contacts = new WaterFlowContacts();
    const source = fixture(2, true);
    let queries = 0;
    const query: WorldWaterQuery = { ...source, sample: p => { queries++; return source.sample(p, 0); } };
    contacts.update(query, 0, { x: 0, y: 1, z: 0 }, 0.5, () => {});
    expect(queries).toBeLessThanOrEqual(48 * 4);
    for (let i = 0; i < 80; i++) contacts.update(source, 0, { x: 0, y: 1, z: 0 }, 0.05, () => {});
    let emitted = 0;
    contacts.update(source, 0, { x: 0, y: 100, z: 0 }, 0.016, () => emitted++);
    expect(emitted).toBe(0);
  });
});
