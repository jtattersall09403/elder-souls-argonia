import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  CREST_BACK_M, FREE_FLIGHT_MIN_AIR_M, FREE_FLIGHT_MIN_SPAN_M, GRAVITY_MPS2, GROUND_CLEARANCE_M,
  MAX_CHUTE_SPEED_MS, MAX_TRACE_RUN_M, MAX_TRACE_STEPS, MIN_LIP_SPEED_MS, WATERFALL_TEXTURE_ROLES,
  alignCascadeToStrips, chuteStripFromPath, freeFlightSpanM, loadWaterfallTextures, kitTextureIds,
  traceCascades, traceWaterfallSheet, fallSiteMarks, type Cascade,
  BRINK_FLAT_M, BRINK_MAX_ARC_M, BRINK_STATIONS, brinkAt, measureBrink,
} from "./WaterfallSheets";
import { Texture } from "three";
import { CASCADE_PATH_LIMIT, SPRAY_MAX_MIDS, WaterCascadeSources, cascadeEmitterKit, cascadeImpactBursts,
  cascadePathEmitters } from "./WaterCascadeSources";
import { buildChannelStripGeometry, type ChannelStrip } from "./ChannelStrips";
import { stackFall, KIT_SCALE } from "./WaterfallKitStack";
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

describe("waterfall sheet paths (the spine, decision 0064)", () => {
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

  it("starts the trace upstream of the lip at lip level", () => {
    const path = traceWaterfallSheet(cascade({ profile: cliffProfile(40, 20, 0) }));
    expect(path.points[0].s).toBe(-CREST_BACK_M);
    expect(path.points[0].y).toBeCloseTo(20, 6);
  });

  it("follows the ground down a 30 degree ramp and hands it to the strip mesh, never a fall", () => {
    const slope = Math.tan((30 * Math.PI) / 180);
    const profile = Array.from({ length: 60 }, (_, i) => 20 - Math.max(-3 + i, 0) * slope);
    const ramp = cascade({ profile, plunge: { x: 30, y: 20 - 30 * slope, z: 0 }, dropM: 30 * slope });
    const path = traceWaterfallSheet(ramp);
    expect(path.freeFlight).toBe(false);
    expect(path.freeSpanM).toBeLessThan(FREE_FLIGHT_MIN_SPAN_M);
    for (const p of path.points.filter((q) => q.s > 1)) {
      expect(Math.abs(p.y - (20 - p.s * slope + GROUND_CLEARANCE_M))).toBeLessThan(0.25);
    }
    const traced = traceCascades([ramp]);
    expect(traced.sheets).toHaveLength(0);
    expect(traced.chutes).toHaveLength(1);
    const strip = traced.chutes[0];
    expect(strip.id).toBe("fall-test:chute");
    expect(strip.points[0].kind).toBe("join");
    expect(strip.points[strip.points.length - 1].kind).toBe("join");
    expect(strip.points.every((p) => p.halfWidthM === 2)).toBe(true);
    const ribbon = buildChannelStripGeometry([strip]);
    expect(ribbon.stripCount).toBe(1);
    expect(ribbon.triangleCount).toBeGreaterThan(0);
    expect(chuteStripFromPath(path)).toEqual(strip);
  });

  it("classifies free flight by 0.5 m of air over a contiguous 3 m, not by a single hop", () => {
    expect(FREE_FLIGHT_MIN_AIR_M).toBe(0.5);
    expect(FREE_FLIGHT_MIN_SPAN_M).toBe(3);
    const pt = (x: number, y: number, airM: number) => ({ s: x, x, y, z: 0, speedMS: 3, free: airM > 0, airM });
    expect(freeFlightSpanM([pt(0, 10, 0), pt(1, 9, 0.8), pt(2, 8, 0.9), pt(3, 7, 0), pt(4, 6, 0)])).toBeLessThan(3);
    expect(freeFlightSpanM([pt(0, 10, 0), pt(0.5, 8, 2), pt(1, 5, 4), pt(1.5, 1, 6), pt(2, -4, 0.6)])).toBeGreaterThan(3);
    const traced = traceCascades([cascade({ profile: cliffProfile(40, 20, 0) })]);
    expect(traced.sheets).toHaveLength(1);
    expect(traced.chutes).toHaveLength(0);
  });

  it("snaps the trace's lip point onto the strip's lip point when both exist", () => {
    const fall = cascade({ profile: cliffProfile(40, 20, 0) });
    const strip: ChannelStrip = { id: "strip-1", band: 2, points: [
      { x: -10, z: 0.2, y: 20.4, bedY: 19.6, halfWidthM: 2, speedMS: 3, season: 1, kind: "join" },
      { x: 0.4, z: 0.3, y: 20.2, bedY: 19.4, halfWidthM: 2, speedMS: 3, season: 1, kind: "lip" },
    ] };
    const resume: ChannelStrip = { id: "strip-2", band: 2, points: [
      { x: 8.3, z: 0.2, y: -0.1, bedY: -1, halfWidthM: 2, speedMS: 3, season: 1, kind: "plunge" },
      { x: 14, z: 0.2, y: -0.4, bedY: -1.2, halfWidthM: 2, speedMS: 3, season: 1, kind: "join" },
    ] };
    const aligned = alignCascadeToStrips(fall, [strip, resume]);
    expect(aligned.lip).toEqual({ x: 0.4, y: 20.2, z: 0.3 });
    expect(aligned.plunge).toEqual({ x: 8.3, y: -0.1, z: 0.2 });
    const traced = traceCascades([fall], { channels: [strip, resume] });
    const lipPoint = traced.sheets[0].points.find((p) => p.s === 0)!;
    expect([lipPoint.x, lipPoint.y, lipPoint.z]).toEqual([0.4, 20.2, 0.3]);
    const far: ChannelStrip = { ...strip, points: strip.points.map((p) => ({ ...p, x: p.x + 40 })) };
    expect(alignCascadeToStrips(fall, [far]).lip).toEqual(fall.lip);
    expect(alignCascadeToStrips(fall, undefined)).toBe(fall);
  });

  it("marks the lip, 2 m past it, the foot, 2 m before it and body samples for the probe", () => {
    const path = traceWaterfallSheet(cascade({ profile: cliffProfile(40, 20, 0) }));
    const m = fallSiteMarks(path);
    expect(m.lip).toEqual([0, 20, 0]);
    const d = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    expect(d(m.lipPlus2M, m.lip)).toBeGreaterThan(1.7);
    expect(d(m.lipPlus2M, m.lip)).toBeLessThanOrEqual(2 + 1e-6);
    expect(m.lipPlus2M[1]).toBeLessThan(20);
    const last = path.points[path.points.length - 1];
    expect(m.foot).toEqual([last.x, last.y, last.z]);
    expect(m.footMinus2M[1]).toBeGreaterThan(m.foot[1]);
    expect(m.plunge).toEqual([8, 0, 0]);
    expect(m.samples).toHaveLength(5);
    for (let i = 1; i < m.samples.length; i++) expect(m.samples[i][1]).toBeLessThan(m.samples[i - 1][1]);
    expect(m.basinRadiusM).toBeGreaterThan(0);
  });

  it("skips cascades below the minimum drop", () => {
    const tiny = cascade({ profile: cliffProfile(40, 20, 18.5), dropM: 1.5, plunge: { x: 4, y: 18.5, z: 0 } });
    expect(traceCascades([tiny]).paths).toHaveLength(0);
  });

  it("draws the water's width at the lip: widthM is bankfull, wettedWidthM is ignored", () => {
    const path = traceWaterfallSheet(cascade({ profile: cliffProfile(40, 20, 0), widthM: 12, wettedWidthM: 4.5 }));
    expect(path.widthM).toBe(12);
    expect(path.trenchWidthM).toBe(12);
  });

  it("maps the kit's manifest roles onto the shader slots, loads piece textures by id, tolerates a missing one", async () => {
    expect(WATERFALL_TEXTURE_ROLES.sheet).toBe("sheet-main");
    expect(kitTextureIds()).toContain("fxwatertile01_n");
    const loader = { loadAsync: async (url: string) => { if (url.includes("missing")) throw new Error("404"); return new Texture(); } };
    const set = await loadWaterfallTextures({ sheet: "a/sheet.png", ring: "a/missing.png", fxwhitewater01: "a/w.png", cloudtile: "a/missing.png" }, loader);
    expect(set.sheet).toBeInstanceOf(Texture);
    expect(set.ring).toBeNull();
    expect(set.byId?.fxwhitewater01).toBeInstanceOf(Texture);
    expect(set.byId?.cloudtile).toBeUndefined();
  });
});

describe("cascade wiring", () => {
  it("hands the same compiled meta list to the falls and the particle sources", () => {
    const meta = [
      cascade({ profile: cliffProfile(40, 20, 0) }),
      cascade({ id: "fall-b", lip: { x: 500, y: 20, z: 0 }, plunge: { x: 508, y: 0, z: 0 }, profile: cliffProfile(40, 20, 0) }),
    ];
    expect(traceCascades(meta).sheets).toHaveLength(2);
    const sources = new WaterCascadeSources(meta);
    expect(sources.nearby({ x: 4, y: 10, z: 0 }, 100, 16).map((c) => c.id)).toEqual(["fall-test"]);
    expect(sources.nearby({ x: 504, y: 10, z: 0 }, 100, 16).map((c) => c.id)).toEqual(["fall-b"]);
  });
});

describe("spray, mist and splash along the fall (decision 0064: budgets that are SEEN)", () => {
  const query: WorldWaterQuery = {
    sample: () => ({ waterBodyId: "pool", surfaceHeight: 0, depth: 2,
      surfaceNormal: { x: 0, y: 1, z: 0 }, flowVelocity: { x: 0, y: 0, z: 0 },
      immersion: 0, turbidity: 0, salinity: 0, temperature: 20, hazardIds: [] }),
    emitInteraction() {},
  };

  it("spaces emitters down the fall every ~6 m of drop, rates growing with the distance fallen", () => {
    expect(cascadeEmitterKit(8).mids).toHaveLength(1);
    expect(cascadeEmitterKit(20).mids).toHaveLength(3);
    expect(cascadeEmitterKit(80).mids).toHaveLength(SPRAY_MAX_MIDS);
    expect(cascadeEmitterKit(80).lip).toBe(true);
    expect(cascadeEmitterKit(20).lip).toBe(false);
    const fall = cascade({ profile: cliffProfile(40, 20, 0) });
    const path = traceWaterfallSheet(fall);
    const emitters = cascadePathEmitters(fall, path.points, query, 0);
    const mids = emitters.filter((e) => e.id.includes(":mid"));
    expect(mids).toHaveLength(3);
    for (let i = 1; i < mids.length; i++) expect(mids[i].ratePerSecond).toBeGreaterThan(mids[i - 1].ratePerSecond);
    expect(mids[0].event.sheetContact?.waterBodyId).toBe("pool");
    expect(mids[0].event.radius).toBeGreaterThan(0.5);
    const cloud = emitters[emitters.length - 1];
    expect(cloud.id).toBe("fall-test:cloud");
    expect(cloud.event.sheetContact).toBeUndefined();
    expect(cloud.event.position.y).toBe(0);
    expect(cloud.ratePerSecond * waterEmissionProfile(cloud.event).count).toBeGreaterThanOrEqual(30);
    const wide = cascadePathEmitters({ ...fall, widthM: 12 }, path.points, query, 0);
    expect(wide[0].ratePerSecond).toBeGreaterThan(emitters[0].ratePerSecond);
  });

  it("emits nothing when the receiving pool is dry", () => {
    const fall = cascade({ profile: cliffProfile(40, 20, 0) });
    const dry: WorldWaterQuery = { ...query, sample: () => ({ ...query.sample(fall.plunge, 0), waterBodyId: null, depth: 0 }) };
    expect(cascadePathEmitters(fall, traceWaterfallSheet(fall).points, dry, 0)).toEqual([]);
    expect(cascadeImpactBursts(fall, dry, 0, 0, 1)).toEqual([]);
  });

  it("bursts a discrete impact splash at the plunge a few times a second, phased per fall", () => {
    const fall = cascade({ profile: cliffProfile(40, 20, 0) });
    const bursts = cascadeImpactBursts(fall, query, 0, 10, 12);
    expect(bursts.length).toBeGreaterThanOrEqual(4);
    for (const b of bursts) {
      expect(b.actorId).toBe("fall-test:impact");
      expect(b.position.y).toBe(0);
      expect(b.velocity!.y).toBeLessThan(-10);
      expect(b.radius!).toBeGreaterThan(0.15);
    }
    // a 16 ms frame gets at most one; a paused clock gets none
    expect(cascadeImpactBursts(fall, query, 0, 10, 10.016).length).toBeLessThanOrEqual(1);
    expect(cascadeImpactBursts(fall, query, 0, 10, 10)).toEqual([]);
    // one burst per period, whatever the frame boundaries
    let total = 0;
    for (let t = 0; t < 10; t += 0.017) total += cascadeImpactBursts(fall, query, 0, t, t + 0.017).length;
    expect(total).toBe(25);
  });

  it("stays inside the particle pool for the nearest falls", () => {
    const budget = (fall: Cascade) => cascadePathEmitters(fall, traceWaterfallSheet(fall).points, query, 0)
      .reduce((n, e) => n + e.ratePerSecond * waterEmissionProfile(e.event).count, 0);
    const perSecond = budget(cascade({ lip: { x: 0, y: 80, z: 0 }, plunge: { x: 10, y: 0, z: 0 }, dropM: 80,
      widthM: 12, profile: cliffProfile(60, 80, 0) }));
    // the nearest CASCADE_PATH_LIMIT hero falls at ~1.5 s particle lifetimes
    // must fit the high-tier pool of 768 with room for the player's own splashes
    expect(perSecond * CASCADE_PATH_LIMIT * 1.5).toBeLessThan(700);
    expect(perSecond).toBeGreaterThan(60);   // and it is not the old invisible accent
  });
});

describe("bounded tracer on synthetic worst cases", () => {
  const ramp = (runM: number, slope: number, stepM: number, extraM = 0) => {
    const top = runM * slope;
    const length = Math.ceil((runM + extraM + 3) / stepM) + 1;
    const profile = Array.from({ length }, (_, i) => top - Math.max(-3 + i * stepM, 0) * slope);
    return cascade({
      id: "ramp", lip: { x: 0, y: top, z: 0 }, plunge: { x: runM, y: 0, z: 0 }, dropM: top,
      profile, profileStepM: stepM, profileStartM: -3, widthM: 6, lipSpeedMS: 2,
    });
  };

  it("traces a 500 m ramp with a 4 k-sample profile in bounded steps and hands it over as one chute", () => {
    const fall = ramp(500, Math.tan((25 * Math.PI) / 180), 0.125);
    expect(fall.profile!.length).toBeGreaterThan(4000);
    const path = traceWaterfallSheet(fall);
    expect(path.points.length).toBeLessThanOrEqual(MAX_TRACE_STEPS + 2);
    expect(path.freeFlight).toBe(false);
    const last = path.points[path.points.length - 1];
    expect(last.s).toBeGreaterThan(400);
    expect(last.s).toBeLessThanOrEqual(MAX_TRACE_RUN_M);
    for (const p of path.points) expect(Number.isFinite(p.y)).toBe(true);
    const traced = traceCascades([fall]);
    expect(traced.sheets).toHaveLength(0);
    expect(traced.chutes).toHaveLength(1);
    expect(buildChannelStripGeometry(traced.chutes).triangleCount).toBeGreaterThan(0);
  });

  it("caps the path in metres and steps when the profile runs for kilometres and the plunge is never reached", () => {
    const fall = { ...ramp(3000, 0.05, 1), plunge: { x: 3000, y: -500, z: 0 } };
    const path = traceWaterfallSheet(fall);
    expect(path.points.length).toBeLessThanOrEqual(MAX_TRACE_STEPS + 2);
    expect(path.points[path.points.length - 1].s).toBeLessThanOrEqual(MAX_TRACE_RUN_M + 5);
    const cliff = cascade({ lip: { x: 0, y: 500, z: 0 }, plunge: { x: 30, y: 0, z: 0 }, dropM: 500,
      profile: cliffProfile(400, 500, -20), lipSpeedMS: 1 });
    const sheet = traceWaterfallSheet(cliff);
    expect(sheet.freeFlight).toBe(true);
    expect(sheet.points.length).toBeLessThanOrEqual(MAX_TRACE_STEPS + 2);
    // and the kit stack over it is finite and inside Bethesda's scale range
    const stack = stackFall(sheet);
    for (const i of stack.instances) {
      expect(i.matrix.elements.every((v) => Number.isFinite(v))).toBe(true);
      expect(i.scale).toBeGreaterThanOrEqual(i.piece === "mistCard" ? 0.08 : i.piece === "groundMist" ? 0.2 : KIT_SCALE.min);
      expect(i.scale).toBeLessThanOrEqual(KIT_SCALE.max);
    }
  });
});

// The Phase 16 ladder (province/ladder.json): the shipped water is judged
// only once its chunk (16c) has delivered it.
function waterDelivered(): boolean {
  try {
    const ladder = JSON.parse(readFileSync(fileURLToPath(
      new URL("../../../../../apps/world-studio/public/province/ladder.json", import.meta.url)), "utf8"));
    return !(ladder.hiddenLayers ?? []).includes("water");
  } catch { return true; }
}

const metaPath = process.env.WATER_META_PATH ?? fileURLToPath(
  new URL("../../../../../apps/world-studio/public/province/water/water-meta.json", import.meta.url));

describe.skipIf(!waterDelivered())("shipped cascades (smoke over whatever water-meta.json ships)", () => {
  const meta = JSON.parse(readFileSync(metaPath, "utf8")) as { schemaVersion?: number; cascades?: Cascade[]; channels?: ChannelStrip[] };
  const cascades: Cascade[] = meta.cascades ?? [];

  it("has cascades to build, in a schema the tracer reads", () => {
    expect([1, 2, 3]).toContain(meta.schemaVersion);
    expect(cascades.length).toBeGreaterThan(0);
    for (const c of cascades) {
      expect(typeof c.id).toBe("string");
      expect(Array.isArray(c.profile)).toBe(true);
      expect(Number.isFinite(c.dropM)).toBe(true);
    }
  });

  it("stacks every shipped fall from finite, uniformly scaled pieces whose top is the lip and foot is the plunge", () => {
    const traced = traceCascades(cascades, { channels: meta.channels ?? [] });
    expect(traced.sheets.length).toBeGreaterThan(0);
    expect(traced.sheets.length + traced.chutes.length).toBe(traced.paths.length);
    for (const p of traced.paths) expect(p.freeFlight ? p.freeSpanM >= FREE_FLIGHT_MIN_SPAN_M : p.freeSpanM < FREE_FLIGHT_MIN_SPAN_M).toBe(true);
    for (const path of traced.sheets) {
      const stack = stackFall(path);
      expect(stack.instances.length).toBeGreaterThanOrEqual(18);
      expect(stack.counts.crest).toBeGreaterThanOrEqual(1);
      expect(stack.counts.ring).toBe(1);
      expect(stack.counts.skirt).toBe(1);
      expect(stack.counts.mistCard).toBeGreaterThanOrEqual(4);
      expect(stack.counts.mistCard).toBeLessThanOrEqual(8);
      expect(stack.counts.groundMist).toBeGreaterThanOrEqual(10);
      expect(stack.counts.groundMist).toBeLessThanOrEqual(40);
      for (const i of stack.instances) {
        expect(i.matrix.elements.every((v) => Number.isFinite(v))).toBe(true);
        // Bethesda's range for bodies (0.35–2.28); mist cards go down to 0.08 and ground mist to 0.2 in vanilla
        expect(i.scale).toBeGreaterThanOrEqual(i.piece === "mistCard" ? 0.08 : i.piece === "groundMist" ? 0.2 : KIT_SCALE.min);
        expect(i.scale).toBeLessThanOrEqual(KIT_SCALE.max);
      }
      expect(Math.abs(stack.body.topY - path.cascade.lip.y)).toBeLessThan(0.05);
    }
  });

  it("never leaves a chute flying: bed speed is capped", () => {
    for (const c of cascades) {
      if (!(c.dropM >= 2.5)) continue;
      const path = traceWaterfallSheet(c);
      for (const p of path.points) if (!p.free) expect(p.speedMS).toBeLessThanOrEqual(MAX_CHUTE_SPEED_MS + 1e-6);
    }
  });
});

/**
 * THE LIP SEAM (owner 2026-09-14: "seam between sloped water and start of
 * waterfall — whatever test you have for this, if it's passing, it's a bad
 * test"). Measured on the shipped data, per fall that has a strip ending at
 * its lip: the first body piece's top edge sits at the strip's last station
 * level within 0.25 m, and the body stack covers at least 0.8 × the water's
 * width at the lip. The 2026-09-14 ribbon failed the width check (a jet
 * contracted to 0.7 × the wetted width: 2.66 m of an 8.73 m channel at the
 * gorge, 0.31 ×; 6.1 m / 0.70 × on bankfull data).
 */
describe.skipIf(!waterDelivered())("the lip seam (gate)", () => {
  const meta = JSON.parse(readFileSync(metaPath, "utf8")) as { cascades?: Cascade[]; channels?: ChannelStrip[] };
  const channels = meta.channels ?? [];
  const traced = traceCascades(meta.cascades ?? [], { channels });
  const stripLip = (lip: { x: number; z: number }) => {
    let best: ChannelStrip["points"][number] | null = null;
    let bestD = 3;
    for (const ch of channels) {
      const last = ch.points[ch.points.length - 1];
      if (last?.kind !== "lip") continue;
      const d = Math.hypot(last.x - lip.x, last.z - lip.z);
      if (d < bestD) { bestD = d; best = last; }
    }
    return best;
  };
  const withStrip = traced.sheets.map((p) => ({ path: p, strip: stripLip(p.cascade.lip) })).filter((s) => s.strip);

  it("has falls whose strip ends at their lip", () => {
    expect(withStrip.length).toBeGreaterThan(0);
  });

  it("meets the strip's last station within 0.25 m and covers ≥ 0.8 × widthM at the lip, on every such fall", () => {
    const failures: string[] = [];
    for (const { path, strip } of withStrip) {
      const stack = stackFall(path);
      const dy = Math.abs(stack.body.topY - strip!.y);
      const ratio = stack.body.topWidthM / path.cascade.widthM;
      if (dy > 0.25 || ratio < 0.8) failures.push(`${path.id}: top-edge dy ${dy.toFixed(2)} m, width ${stack.body.topWidthM.toFixed(2)} / ${path.cascade.widthM.toFixed(2)} = x${ratio.toFixed(2)}`);
    }
    expect(failures).toEqual([]);
  });

  it("puts a crest piece over the lip: its scrolling end past the lip, the rest on the strip", () => {
    for (const { path } of withStrip) {
      const stack = stackFall(path);
      const crest = stack.instances.find((i) => i.piece === "crest")!;
      const pos = [crest.matrix.elements[12], crest.matrix.elements[13], crest.matrix.elements[14]];
      const c = path.cascade;
      const dl = Math.hypot(c.direction.x, c.direction.z) || 1;
      const along = ((pos[0] - c.lip.x) * c.direction.x + (pos[2] - c.lip.z) * c.direction.z) / dl;
      expect(along).toBeLessThan(0);                 // origin upstream of the lip
      expect(along + 10 * crest.scale).toBeCloseTo(1, 1);   // its far end 1 m past the lip
      expect(pos[1]).toBeCloseTo(c.lip.y, 0);
    }
  });
});

describe("the brink is measured, not assumed flat", () => {
  const fall = cascade({ profile: cliffProfile(40, 20, 0), widthM: 8 });
  const notch = (x: number, z: number) => (x < 0.5 ? 20 + Math.min(Math.abs(z), 3) : 0);
  const sill = () => 20;

  it("measures the relief across the lip, not the height against lip.y", () => {
    const b = measureBrink(fall, notch)!;
    expect(b.acrossM).toHaveLength(BRINK_STATIONS);
    expect(b.groundRangeM).toBeCloseTo(3, 1);
    expect(brinkAt(b, "crestArcM", 0)).toBeCloseTo(0, 2);
    expect(brinkAt(b, "crestArcM", 4)).toBeGreaterThan(2);
  });
  it("reports a lip flat to a few centimetres as a clean sill, with no delay", () => {
    const b = measureBrink(fall, sill)!;
    expect(b.groundRangeM).toBeLessThanOrEqual(BRINK_FLAT_M);
    expect(b.crestArcM.every((v) => v === 0)).toBe(true);
    expect(b.notchCentreM).toBe(0);
  });
  it("caps the delay a very proud shoulder can impose", () => {
    const b = measureBrink(fall, (x, z) => (x < 0.5 ? 20 + Math.abs(z) * 40 : 0))!;
    expect(Math.max(...b.crestArcM)).toBeLessThanOrEqual(BRINK_MAX_ARC_M);
  });
  it("carries the measurement on the traced path for the probe", () => {
    const traced = traceCascades([fall], { groundHeightM: notch });
    expect(traced.sheets[0].brink?.groundRangeM).toBeCloseTo(3, 1);
    expect(traceCascades([fall]).sheets[0].brink).toBeUndefined();
  });
});
