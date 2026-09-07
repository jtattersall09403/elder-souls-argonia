import { describe, expect, it } from "vitest";
import {
  GRAVITY_MPS2, GROUND_CLEARANCE_M, MAX_SEGMENT_DROP_M, MIN_LIP_SPEED_MS,
  SHEET_LAYERS, buildWaterfallSheetGeometry, traceWaterfallSheet, type Cascade,
} from "./WaterfallSheets";
import { CASCADE_PATH_LIMIT, WaterCascadeSources, cascadePathEmitters } from "./WaterCascadeSources";
import { waterEmissionProfile } from "./WaterEffects";
import type { WorldWaterQuery } from "@elder-souls/contracts";

function cascade(over: Partial<Cascade> & { profile: number[] }): Cascade {
  return {
    id: "fall-test", bodyIndex: 0, riverBand: 2,
    lip: { x: 0, y: 20, z: 0 }, plunge: { x: 8, y: 0, z: 0 },
    direction: { x: 1, y: 0, z: 0 }, widthM: 4, dropM: 20,
    profileStepM: 1, profileStartM: -3, lipSpeedMS: 3,
    ...over,
  };
}

/** Ground: flat at lip level up to the lip, then a sheer face. */
const cliffProfile = (length: number, top: number, base: number) =>
  Array.from({ length }, (_, i) => (i < 3 ? top : base));

describe("waterfall sheet paths", () => {
  it("throws a parabola off a free cliff and lands at the plunge height", () => {
    const fall = cascade({ profile: cliffProfile(40, 20, 0) });
    const path = traceWaterfallSheet(fall);
    expect(path.freeFlight).toBe(true);
    const last = path.points[path.points.length - 1];
    expect(Math.abs(last.y - fall.plunge.y)).toBeLessThan(0.5);
    // mid-flight the sheet follows the analytic ballistic arc
    const mid = path.points.find((p) => p.s > 3 && p.s < 5)!;
    const t = mid.s / Math.max(fall.lipSpeedMS!, MIN_LIP_SPEED_MS);
    expect(mid.y).toBeCloseTo(fall.lip.y - 0.5 * GRAVITY_MPS2 * t * t, 1);
  });

  it("wraps the crest by starting upstream of the lip at lip level", () => {
    const path = traceWaterfallSheet(cascade({ profile: cliffProfile(40, 20, 0) }));
    expect(path.points[0].s).toBeLessThan(0);
    expect(path.points[0].y).toBeCloseTo(20, 6);
  });

  it("follows the ground down a 30 degree ramp instead of flying", () => {
    const slope = Math.tan((30 * Math.PI) / 180);
    const profile = Array.from({ length: 60 }, (_, i) => 20 - Math.max(-3 + i, 0) * slope);
    const path = traceWaterfallSheet(cascade({
      profile, plunge: { x: 30, y: 20 - 30 * slope, z: 0 }, dropM: 30 * slope,
    }));
    expect(path.freeFlight).toBe(false);
    for (const p of path.points.filter((q) => q.s > 1)) {
      expect(Math.abs(p.y - (20 - p.s * slope + GROUND_CLEARANCE_M))).toBeLessThan(0.25);
    }
    // a rapid still gets its sheet
    const built = buildWaterfallSheetGeometry([cascade({
      profile, plunge: { x: 30, y: 20 - 30 * slope, z: 0 }, dropM: 30 * slope,
    })]);
    expect(built.triangleCount).toBeGreaterThan(0);
    expect(built.freeFlightCount).toBe(0);
  });

  it("splits a 200 m drop into segments no taller than the limit", () => {
    const path = traceWaterfallSheet(cascade({
      lip: { x: 0, y: 200, z: 0 }, plunge: { x: 12, y: 0, z: 0 }, dropM: 200,
      profile: cliffProfile(45, 200, -5), lipSpeedMS: 1.5,
    }));
    expect(path.segments.length).toBeGreaterThanOrEqual(4);
    for (const seg of path.segments) {
      expect(seg[0].y - seg[seg.length - 1].y).toBeLessThan(MAX_SEGMENT_DROP_M + 5);
    }
  });

  it("skips cascades below the minimum drop and builds the three-layer volume", () => {
    const tiny = cascade({ profile: cliffProfile(40, 20, 18.5), dropM: 1.5,
      plunge: { x: 4, y: 18.5, z: 0 } });
    expect(buildWaterfallSheetGeometry([tiny]).fallCount).toBe(0);
    const built = buildWaterfallSheetGeometry([cascade({ profile: cliffProfile(40, 20, 0) })]);
    const layers = built.geometry.getAttribute("aLayer");
    const values = Array.from({ length: layers.count }, (_, i) => layers.getX(i));
    for (let l = 0; l < SHEET_LAYERS.length; l++) {
      expect(values.filter((v) => v === l).length).toBe(layers.count / SHEET_LAYERS.length);
    }
    // the core layer is narrower and brighter than the front sheet
    const tint = built.geometry.getAttribute("aTint");
    expect(Math.max(...Array.from({ length: tint.count }, (_, i) => tint.getX(i)))).toBeGreaterThan(1);
    expect(SHEET_LAYERS[2].widthScale).toBeLessThan(1);
  });
});

describe("cascade wiring", () => {
  it("hands the same compiled meta list to the sheets and the particle sources", () => {
    const meta = [
      cascade({ profile: cliffProfile(40, 20, 0) }),
      cascade({ id: "fall-b", lip: { x: 500, y: 20, z: 0 }, plunge: { x: 508, y: 0, z: 0 },
        profile: cliffProfile(40, 20, 0) }),
    ];
    expect(buildWaterfallSheetGeometry(meta).fallCount).toBe(2);
    const sources = new WaterCascadeSources(meta);
    expect(sources.nearby({ x: 4, y: 10, z: 0 }, 100, 16).map((c) => c.id)).toEqual(["fall-test"]);
    expect(sources.nearby({ x: 504, y: 10, z: 0 }, 100, 16).map((c) => c.id)).toEqual(["fall-b"]);
  });
});

describe("spray and mist along the fall", () => {
  const query: WorldWaterQuery = {
    sample: () => ({ waterBodyId: "pool", surfaceHeight: 0, depth: 2,
      surfaceNormal: { x: 0, y: 1, z: 0 }, flowVelocity: { x: 0, y: 0, z: 0 },
      immersion: 0, turbidity: 0, salinity: 0, temperature: 20, hazardIds: [] }),
    emitInteraction() {},
  };

  it("emits at the lip, down the sheet and as a plunge cloud", () => {
    const fall = cascade({ profile: cliffProfile(40, 20, 0) });
    const path = traceWaterfallSheet(fall);
    const emitters = cascadePathEmitters(fall, path.points, query, 0);
    expect(emitters.map((e) => e.id)).toEqual([
      "fall-test:lip", "fall-test:mid0.35", "fall-test:mid0.6", "fall-test:mid0.85", "fall-test:cloud",
    ]);
    // mid-air emitters ride the sheet; the plunge cloud rides the pool
    for (const e of emitters.slice(0, 4)) expect(e.event.sheetContact?.waterBodyId).toBe("pool");
    expect(emitters[4].event.sheetContact).toBeUndefined();
    expect(emitters[4].event.position.y).toBe(0);
    // rate grows with the distance fallen
    const mids = emitters.slice(1, 4).map((e) => e.ratePerSecond);
    expect(mids[1]).toBeGreaterThan(mids[0]);
    expect(mids[2]).toBeGreaterThan(mids[1]);
    // ... and with width and drop
    const wide = cascadePathEmitters({ ...fall, widthM: 12 }, path.points, query, 0);
    expect(wide[0].ratePerSecond).toBeGreaterThan(emitters[0].ratePerSecond);
  });

  it("emits nothing when the receiving pool is dry", () => {
    const fall = cascade({ profile: cliffProfile(40, 20, 0) });
    const dry: WorldWaterQuery = { ...query, sample: () => ({ ...query.sample(fall.plunge, 0), waterBodyId: null, depth: 0 }) };
    expect(cascadePathEmitters(fall, traceWaterfallSheet(fall).points, dry, 0)).toEqual([]);
  });

  it("stays inside the particle budget for the nearest falls", () => {
    const fall = cascade({ profile: cliffProfile(40, 20, 0), widthM: 12, dropM: 20 });
    const emitters = cascadePathEmitters(fall, traceWaterfallSheet(fall).points, query, 0);
    const perSecond = emitters.reduce(
      (n, e) => n + e.ratePerSecond * waterEmissionProfile(e.event).count, 0);
    // two full-kit falls plus their plunge splashes must fit 768 particles
    expect(perSecond).toBeLessThan(140);
    expect(perSecond * CASCADE_PATH_LIMIT).toBeLessThan(280);
  });
});
