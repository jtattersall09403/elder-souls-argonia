import { describe, expect, it } from "vitest";
import type { WaterInteractionEvent, WorldWaterQuery, WaterDisplacementSphere } from "@elder-souls/contracts";
import { computeBuoyancy } from "@elder-souls/game-core/water/index";
import { studioScaledWaterQuery } from "./studioScaledWaterQuery";

describe("studio buoyancy display scaling", () => {
  it("floats an unchanged-size crate at the displayed surface and converts emitted effects back to true metres", () => {
    const events: WaterInteractionEvent[] = [];
    let displacement: readonly WaterDisplacementSphere[] | null = null;
    const query: WorldWaterQuery = {
      sample: p => ({ waterBodyId: "water.test.pool", surfaceHeight: 5, depth: 3,
        surfaceNormal: { x: 0, y: 1, z: 0 }, flowVelocity: { x: 2, y: 0.2, z: 0 },
        immersion: p.y < 5 ? 1 : 0, turbidity: 0.2, salinity: 0, temperature: 20, hazardIds: [] }),
      emitInteraction: event => events.push(event),
      setDisplacementSpheres: (_actor, spheres) => { displacement = spheres; return true; },
      sampleSheetContact: () => ({ waterBodyId: 'fall', position: { x: 0, y: 5, z: 0 },
        normal: { x: 0, y: 0, z: 1 }, flowVelocity: { x: 0, y: -8, z: 0 }, distanceM: 0 }),
    };
    const scaled = studioScaledWaterQuery(query, 2);
    const sampled = scaled.sample({ x: 0, y: 10, z: 0 }, 0);
    expect(sampled.surfaceHeight).toBe(10);
    expect(sampled.depth).toBe(6);
    expect(sampled.flowVelocity.y).toBe(0.4);
    const buoyancy = computeBuoyancy(scaled, 0, { x: 0, y: 10, z: 0 }, p => p, { x: 2, y: 0.4, z: 0 }, {
      volumeM3: 0.5, linearDrag: 10, pointHeightM: 0.8, points: [{ x: 0, y: 0, z: 0 }],
    });
    expect(buoyancy.immersion).toBeCloseTo(0.5);
    expect(buoyancy.force.y).toBeCloseTo(1000 * 9.81 * 0.5 * 0.5);
    scaled.emitInteraction({ kind: "splash", position: { x: 1, y: 10, z: 3 }, velocity: { x: 4, y: -6, z: 5 } });
    expect(events[0].position).toEqual({ x: 1, y: 5, z: 3 });
    expect(events[0].velocity).toEqual({ x: 4, y: -3, z: 5 });
    expect(studioScaledWaterQuery(query, 1)).toBe(query);
    expect(scaled.setDisplacementSpheres?.('crate', [{ center: { x: 1, y: 10, z: 3 }, radiusM: 0.3 }])).toBe(true);
    expect(displacement).toEqual([{ center: { x: 1, y: 5, z: 3 }, radiusM: 0.3 }]);
    scaled.setDisplacementSpheres?.('crate', null); expect(displacement).toBeNull();
    const sheet = scaled.sampleSheetContact!({ x: 0, y: 10, z: 0 }, 0.3, 0)!;
    expect(sheet.position.y).toBe(10); expect(sheet.flowVelocity.y).toBe(-16);
    scaled.emitInteraction({ kind: 'splash', position: sheet.position, waterVelocity: sheet.flowVelocity,
      sheetContact: { waterBodyId: sheet.waterBodyId, normal: sheet.normal } });
    expect(events[1].waterVelocity?.y).toBe(-8);
    expect(events[1].sheetContact?.normal).toEqual({ x: 0, y: 0, z: 1 });
  });
});
