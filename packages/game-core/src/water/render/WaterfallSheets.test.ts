import { describe, expect, it } from "vitest";
import type * as THREE from "three";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  GRAVITY_MPS2, GROUND_CLEARANCE_M, MAX_CHUTE_SPEED_MS, MAX_SEGMENT_DROP_M, MIN_LIP_SPEED_MS,
  MIN_QUAD_LENGTH_M, SHEET_LAYERS, buildWaterfallSheetGeometry, sheetAeration, sheetAlpha,
  sheetWidthProfile, traceWaterfallSheet, type Cascade,
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

describe("across-width profile", () => {
  const both = [
    { kind: "free flight", free: true, airM: 6, slope: 0.9, speedMS: 22, frac: 0.5, depthDeltaM: 6 },
    { kind: "terrain-following chute", free: false, airM: 0, slope: 0.45, speedMS: 9, frac: 0.5,
      depthDeltaM: GROUND_CLEARANCE_M },
  ] as const;

  it("peaks in the middle and reaches zero at both edges", () => {
    expect(sheetWidthProfile(0.5)).toBeCloseTo(1, 6);
    expect(sheetWidthProfile(0)).toBe(0);
    expect(sheetWidthProfile(1)).toBe(0);
    for (let u = 0; u <= 0.5; u += 0.05) {
      expect(sheetWidthProfile(Math.min(u + 0.05, 0.5))).toBeGreaterThanOrEqual(sheetWidthProfile(u));
    }
  });

  for (const kind of both) {
    it(`is opaque at the centre and transparent at the edge — ${kind.kind}`, () => {
      const at = (u: number) => sheetAlpha({ ...kind, u, layer: 0 });
      expect(at(0.5)).toBeGreaterThan(at(0.02));
      expect(at(0.5)).toBeGreaterThan(0.5);
      expect(at(0)).toBeLessThan(0.05);
      expect(at(1)).toBeLessThan(0.05);
      expect(at(0.02)).toBeLessThan(0.05);
      expect(at(0.98)).toBeLessThan(0.05);
    });
  }

  it("keeps a bed-following chute opaque where the old depth fade erased it", () => {
    // 0.12 m of terrain behind the sheet: the free-flight fade would kill this.
    const chute = { u: 0.5, layer: 0, frac: 0.5, speedMS: 9, slope: 0.5, free: false,
      airM: 0, depthDeltaM: GROUND_CLEARANCE_M };
    expect(sheetAlpha(chute)).toBeGreaterThan(0.6);
    expect(sheetAlpha({ ...chute, airM: 6 })).toBeLessThan(0.3);
  });

  it("whitens a chute on local speed and slope, not on distance fallen", () => {
    const near = { free: false, frac: 0.02, speedMS: 9, slope: 0.5 };
    expect(sheetAeration(near)).toBeGreaterThan(0.8);
    // the same reach, flat and slow, is not whitewater
    expect(sheetAeration({ ...near, speedMS: 1.5, slope: 0.02 })).toBeLessThan(0.55);
    // and the free-flight branch still ramps with the drop
    expect(sheetAeration({ free: true, frac: 0.9, speedMS: 20, slope: 1 }))
      .toBeGreaterThan(sheetAeration({ free: true, frac: 0.02, speedMS: 3, slope: 1 }));
  });

  it("the core layer is the narrowest and brightest, never the edges", () => {
    expect(SHEET_LAYERS[2].widthScale).toBeLessThan(SHEET_LAYERS[0].widthScale);
    expect(SHEET_LAYERS[2].tint).toBeGreaterThan(SHEET_LAYERS[0].tint);
    expect(sheetAlpha({ u: 0.5, layer: 2, frac: 0.5, speedMS: 9, slope: 0.5, free: false, airM: 0 }))
      .toBeGreaterThan(sheetAlpha({ u: 0.05, layer: 2, frac: 0.5, speedMS: 9, slope: 0.5, free: false, airM: 0 }));
  });
});

describe("shipped cascade geometry", () => {
  const metaPath = fileURLToPath(
    new URL("../../../../../apps/world-studio/public/province/water/water-meta.json", import.meta.url));
  const cascades: Cascade[] = JSON.parse(readFileSync(metaPath, "utf8")).cascades ?? [];

  it("has cascades to build", () => {
    expect(cascades.length).toBeGreaterThan(0);
  });

  it("draws no degenerate quad and no undefined vertex over every shipped cascade", () => {
    const built = buildWaterfallSheetGeometry(cascades);
    expect(built.fallCount).toBeGreaterThan(0);
    const pos = built.geometry.getAttribute("position");
    const uv = built.geometry.getAttribute("aSheetUv");
    const named = ["aSpeed", "aLayer", "aTint", "aFrac", "aAir", "aSlope"] as const;
    // One assertion per attribute, not one per vertex: 60 k+ vertices ship.
    const finite = (a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) =>
      (a.array as ArrayLike<number>).length ===
      Array.prototype.filter.call(a.array, (v: number) => Number.isFinite(v)).length;
    expect(finite(pos)).toBe(true);
    expect(finite(uv)).toBe(true);
    const us = Array.from({ length: uv.count }, (_, i) => uv.getX(i));
    expect(Math.min(...us)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...us)).toBeLessThanOrEqual(1);
    for (const name of named) {
      const a = built.geometry.getAttribute(name);
      expect(a.count).toBe(pos.count);
      expect(finite(a)).toBe(true);
    }
    // every drawn triangle has area, and its per-vertex alpha inputs are in range
    const index = built.geometry.getIndex()!;
    const v = (i: number) => [pos.getX(i), pos.getY(i), pos.getZ(i)] as const;
    let smallest = Infinity;
    for (let t = 0; t < index.count; t += 3) {
      const [a, b, c] = [v(index.getX(t)), v(index.getX(t + 1)), v(index.getX(t + 2))];
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const cross = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
      smallest = Math.min(smallest, 0.5 * Math.hypot(...cross));
    }
    expect(smallest).toBeGreaterThan(MIN_QUAD_LENGTH_M);
    const fracs = Array.from({ length: built.geometry.getAttribute("aFrac").count },
      (_, i) => built.geometry.getAttribute("aFrac").getX(i));
    expect(Math.min(...fracs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...fracs)).toBeLessThanOrEqual(1);
  });

  it("never leaves a chute flying: bed speed is capped and long falls land", () => {
    for (const c of cascades) {
      if (!(c.dropM >= 2.5)) continue;
      const path = traceWaterfallSheet(c);
      for (const p of path.points) {
        if (!p.free) expect(p.speedMS).toBeLessThanOrEqual(MAX_CHUTE_SPEED_MS + 1e-6);
      }
    }
    const fall78 = cascades.find((c) => c.id === "fall-78");
    if (fall78) {
      const path = traceWaterfallSheet(fall78);
      const last = path.points[path.points.length - 1];
      // it must come back to the bed, not end as a flat plate in mid-air
      expect(last.airM).toBeLessThan(0.5);
    }
  });
});
