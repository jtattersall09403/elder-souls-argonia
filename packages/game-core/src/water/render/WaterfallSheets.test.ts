import { describe, expect, it } from "vitest";
import type * as THREE from "three";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  CREST_BACK_M, CREST_FOAM_M, FREE_FLIGHT_MIN_AIR_M, FREE_FLIGHT_MIN_SPAN_M, GRAVITY_MPS2, GROUND_CLEARANCE_M,
  MAX_CHUTE_SPEED_MS, MAX_SEGMENT_DROP_M, MIN_LIP_SPEED_MS, MIN_QUAD_LENGTH_M, SHEET_DEPTH_FADE_M, SHEET_EMISSIVE,
  SHEET_FACING_FADE, SHEET_LAYERS, SHEET_PIECE_FAMILIES, SHEET_PIECE_OVERLAP, SIDE_STRIP_LAYER, WATERFALL_TEXTURE_ROLES,
  alignCascadeToStrips, buildWaterfallSheetGeometry, chuteStripFromPath, freeFlightSpanM, loadWaterfallTextures,
  sheetAeration, sheetAlpha, sheetCrestBoost, sheetEmissive, sheetLateralOffsets, sheetPieceFamily, sheetPieceSpans,
  sheetWidthProfile, sideStripPinchedU, traceCascades, traceWaterfallSheet, type Cascade,
} from "./WaterfallSheets";
import { Texture } from "three";
import { CASCADE_PATH_LIMIT, WaterCascadeSources, cascadeEmitterKit, cascadePathEmitters } from "./WaterCascadeSources";
import { buildChannelStripGeometry, type ChannelStrip } from "./ChannelStrips";
import { plungeBaseQuadCount } from "./PlungeBase";
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

  it("follows the ground down a 30 degree ramp and hands it to the strip mesh, never a fall body", () => {
    const slope = Math.tan((30 * Math.PI) / 180);
    const profile = Array.from({ length: 60 }, (_, i) => 20 - Math.max(-3 + i, 0) * slope);
    const ramp = cascade({ profile, plunge: { x: 30, y: 20 - 30 * slope, z: 0 }, dropM: 30 * slope });
    const path = traceWaterfallSheet(ramp);
    expect(path.freeFlight).toBe(false);
    expect(path.freeSpanM).toBeLessThan(FREE_FLIGHT_MIN_SPAN_M);
    for (const p of path.points.filter((q) => q.s > 1)) {
      expect(Math.abs(p.y - (20 - p.s * slope + GROUND_CLEARANCE_M))).toBeLessThan(0.25);
    }
    // alignment guard: a pure ramp is not drawn as a free-fall body ...
    const built = buildWaterfallSheetGeometry([ramp]);
    expect(built.fallCount).toBe(0);
    expect(built.triangleCount).toBe(0);
    // ... but as a chute ribbon through the strip builder (ES_STRIP shader)
    expect(built.chutes).toHaveLength(1);
    const strip = built.chutes[0];
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
    // 2 m of air then back on the bed: a hop, not a fall
    expect(freeFlightSpanM([pt(0, 10, 0), pt(1, 9, 0.8), pt(2, 8, 0.9), pt(3, 7, 0), pt(4, 6, 0)])).toBeLessThan(3);
    // a real cliff: 6 m of contiguous air
    expect(freeFlightSpanM([pt(0, 10, 0), pt(0.5, 8, 2), pt(1, 5, 4), pt(1.5, 1, 6), pt(2, -4, 0.6)])).toBeGreaterThan(3);
    const cliff = traceWaterfallSheet(cascade({ profile: cliffProfile(40, 20, 0) }));
    expect(cliff.freeFlight).toBe(true);
    expect(cliff.freeSpanM).toBeGreaterThan(10);
    const traced = traceCascades([cascade({ profile: cliffProfile(40, 20, 0) })]);
    expect(traced.sheets).toHaveLength(1);
    expect(traced.chutes).toHaveLength(0);
  });

  it("snaps the sheet's first lip point onto the strip's lip point when both exist", () => {
    const fall = cascade({ profile: cliffProfile(40, 20, 0) });
    const strip: ChannelStrip = { id: "strip-1", band: 2, points: [
      { x: -10, z: 0.2, y: 20.4, bedY: 19.6, halfWidthM: 2, speedMS: 3, season: 1, kind: "join" },
      { x: -5, z: 0.2, y: 20.3, bedY: 19.5, halfWidthM: 2, speedMS: 3, season: 1, kind: "steep" },
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
    // the crest wrap starts upstream of that same point, at its level
    expect(traced.sheets[0].points[0].y).toBe(20.2);
    expect(traced.sheets[0].points[0].s).toBe(-CREST_BACK_M);
    // a strip lip farther than the tolerance is not the same point
    const far: ChannelStrip = { ...strip, points: strip.points.map((p) => ({ ...p, x: p.x + 40 })) };
    expect(alignCascadeToStrips(fall, [far]).lip).toEqual(fall.lip);
    // no channels at all: unchanged (the shipped v1 data has no lip/plunge ends)
    expect(alignCascadeToStrips(fall, undefined)).toBe(fall);
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

  it("skips cascades below the minimum drop and builds three body layers plus two side strips", () => {
    const tiny = cascade({ profile: cliffProfile(40, 20, 18.5), dropM: 1.5,
      plunge: { x: 4, y: 18.5, z: 0 } });
    expect(buildWaterfallSheetGeometry([tiny]).fallCount).toBe(0);
    const built = buildWaterfallSheetGeometry([cascade({ profile: cliffProfile(40, 20, 0) })]);
    const layers = built.geometry.getAttribute("aLayer");
    const values = Array.from({ length: layers.count }, (_, i) => layers.getX(i));
    const perBodyLayer = values.filter((v) => v === 0).length;
    for (let l = 0; l < SHEET_LAYERS.length; l++) expect(values.filter((v) => v === l).length).toBe(perBodyLayer);
    // two mirrored side strips per fall, running the whole path (2 verts/station)
    expect(built.sideStripCount).toBe(2 * built.fallCount);
    expect(values.filter((v) => v === SIDE_STRIP_LAYER).length).toBe(2 * 2 * built.paths[0].points.length);
    expect(layers.count).toBe(perBodyLayer * SHEET_LAYERS.length + 4 * built.paths[0].points.length);
    // a 20 m drop is one 29 m-family piece; a fall narrower than the piece is one lateral copy
    expect(built.pieceCount).toBe(1);
    expect(built.segmentCount).toBe(1);
    // the core layer is narrower and brighter than the front sheet
    const tint = built.geometry.getAttribute("aTint");
    expect(Math.max(...Array.from({ length: tint.count }, (_, i) => tint.getX(i)))).toBeGreaterThan(1);
    expect(SHEET_LAYERS[2].widthScale).toBeLessThan(1);
  });

  it("pinches the side strips toward the lip and flares them at the foot", () => {
    const built = buildWaterfallSheetGeometry([cascade({ profile: cliffProfile(40, 20, 0) })]);
    const pos = built.geometry.getAttribute("position");
    const layer = built.geometry.getAttribute("aLayer");
    const frac = built.geometry.getAttribute("aFrac");
    const uv = built.geometry.getAttribute("aSheetUv");
    // side strip vertices come in (inner, outer) pairs; width = |outer - inner| across (z here)
    const widths: { frac: number; w: number }[] = [];
    for (let i = 0; i + 1 < pos.count; i += 2) {
      if (layer.getX(i) !== SIDE_STRIP_LAYER) continue;
      expect(uv.getX(i)).toBe(0);
      expect(uv.getX(i + 1)).toBe(1);
      widths.push({ frac: frac.getX(i), w: Math.abs(pos.getZ(i + 1) - pos.getZ(i)) });
    }
    expect(widths.length).toBeGreaterThan(10);
    const top = widths.filter((w) => w.frac < 0.05);
    const foot = widths.filter((w) => w.frac > 0.8);
    expect(Math.max(...top.map((w) => w.w))).toBeLessThan(Math.min(...foot.map((w) => w.w)));
    // and the texture pinch converges the across coordinate at the top
    expect(Math.abs(sideStripPinchedU(1, 0) - 0.5)).toBeLessThan(Math.abs(sideStripPinchedU(1, 1) - 0.5));
    expect(sideStripPinchedU(1, 1)).toBeCloseTo(1, 9);
  });

  it("wraps the crest with boosted foam and shades unlit white x1.0 free / x0.75 chute", () => {
    expect(sheetCrestBoost(0)).toBe(1);
    expect(sheetCrestBoost(CREST_BACK_M)).toBe(1);
    expect(sheetCrestBoost(CREST_BACK_M + CREST_FOAM_M)).toBe(0);
    expect(sheetCrestBoost(CREST_BACK_M + CREST_FOAM_M * 0.5)).toBeGreaterThan(0.3);
    expect(CREST_BACK_M).toBeGreaterThanOrEqual(2);
    expect(CREST_BACK_M).toBeLessThanOrEqual(3);
    expect(sheetEmissive(true)).toBe(1);
    expect(sheetEmissive(false)).toBe(0.75);
    expect(SHEET_EMISSIVE.side).toBeCloseTo(0.7 * 0.75, 1);
    // measured soft-particle depths: 0.57 m sheets, 1.07 m spray
    expect(SHEET_DEPTH_FADE_M.slice(0, 3)).toEqual([0.57, 0.57, 0.57]);
    expect(SHEET_DEPTH_FADE_M[SIDE_STRIP_LAYER]).toBe(1.07);
    // edge-on faces fade out between cos 0.26 and 0.09
    const mid = { u: 0.5, layer: 0, frac: 0.5, speedMS: 20, slope: 1, free: true, airM: 6, depthDeltaM: 6 };
    expect(sheetAlpha({ ...mid, facing: 1 })).toBeGreaterThan(0.5);
    expect(sheetAlpha({ ...mid, facing: SHEET_FACING_FADE.full })).toBeCloseTo(sheetAlpha({ ...mid, facing: 1 }), 9);
    expect(sheetAlpha({ ...mid, facing: SHEET_FACING_FADE.start })).toBe(0);
  });
});

describe("piece-stacked body (owner steer: stack vanilla-sized sheets, not one ribbon)", () => {
  it("picks the vanilla family by drop and stacks pieces at 2/3 of a piece height", () => {
    expect(SHEET_PIECE_FAMILIES.map((f) => f.heightM)).toEqual([7.5, 29, 44, 58]);
    expect(sheetPieceFamily(5).heightM).toBe(7.5);
    expect(sheetPieceFamily(20).heightM).toBe(29);
    expect(sheetPieceFamily(40).heightM).toBe(44);
    expect(sheetPieceFamily(50).heightM).toBe(58);
    expect(sheetPieceFamily(260).heightM).toBe(58);
    expect(SHEET_PIECE_OVERLAP).toBeCloseTo(1 / 3, 9);
    // 100 m of path in 29 m pieces: starts every 19.33 m, neighbours overlap 9.67 m
    const spans = sheetPieceSpans(100, 29);
    expect(spans).toHaveLength(Math.ceil((100 - 29) / (29 * 2 / 3)) + 1);
    expect(spans[0]).toEqual({ startM: 0, endM: 29, overlapTopM: 0, overlapBottomM: expect.closeTo(29 / 3, 6) });
    for (let k = 1; k < spans.length; k++) {
      expect(spans[k].startM).toBeCloseTo(spans[k - 1].startM + 29 * 2 / 3, 6);
      expect(spans[k].overlapTopM).toBeCloseTo(spans[k - 1].endM - spans[k].startM, 9);
      expect(spans[k].overlapTopM).toBeGreaterThan(0);
    }
    expect(spans[spans.length - 1].endM).toBe(100);
    expect(spans[spans.length - 1].overlapBottomM).toBe(0);
    // a path shorter than a piece is one piece, never a stub
    expect(sheetPieceSpans(24, 29)).toEqual([{ startM: 0, endM: 24, overlapTopM: 0, overlapBottomM: 0 }]);
  });

  it("copies pieces laterally, half a piece apart, only when the fall is wider than the piece", () => {
    expect(sheetLateralOffsets(4, 7.3)).toEqual({ offsets: [0], pieceWidthM: 4 });
    const wide = sheetLateralOffsets(15, 7.3);
    expect(wide.pieceWidthM).toBe(7.3);
    expect(wide.offsets.length).toBeGreaterThanOrEqual(3);
    expect(wide.offsets[0]).toBeCloseTo(-(15 - 7.3) / 2, 9);
    expect(wide.offsets[wide.offsets.length - 1]).toBeCloseTo((15 - 7.3) / 2, 9);
    for (let i = 1; i < wide.offsets.length; i++) expect(wide.offsets[i] - wide.offsets[i - 1]).toBeLessThanOrEqual(7.3 / 2 + 1e-9);
  });

  it("gives every piece copy its own UV rectangle, phase and overlap cross-fade", () => {
    // 80 m drop, 15 m wide: 58 m family -> 2 vertical spans x lateral copies
    const fall = cascade({ lip: { x: 0, y: 80, z: 0 }, plunge: { x: 10, y: 0, z: 0 }, dropM: 80, widthM: 15,
      profile: cliffProfile(60, 80, 0) });
    const built = buildWaterfallSheetGeometry([fall]);
    const lateral = sheetLateralOffsets(15, sheetPieceFamily(80).widthM).offsets.length;
    expect(built.segmentCount).toBe(2);
    expect(built.pieceCount).toBe(2 * lateral);
    const piece = built.geometry.getAttribute("aPiece");
    const pieceUv = built.geometry.getAttribute("aPieceUv");
    const fade = built.geometry.getAttribute("aEndFade");
    const layer = built.geometry.getAttribute("aLayer");
    const starts = new Set<number>();
    const phases = new Set<number>();
    let fadedInOverlap = 0;
    for (let i = 0; i < piece.count; i++) {
      if (layer.getX(i) === SIDE_STRIP_LAYER) continue;
      starts.add(Math.round(piece.getX(i) * 1000));
      phases.add(piece.getZ(i));
      expect(pieceUv.getX(i) === 0 || pieceUv.getX(i) === 1).toBe(true);
      expect(pieceUv.getY(i)).toBeGreaterThanOrEqual(0);
      expect(pieceUv.getY(i)).toBeLessThanOrEqual(1);
      expect(fade.getX(i)).toBeGreaterThanOrEqual(0);
      expect(fade.getX(i)).toBeLessThanOrEqual(1);
      if (fade.getX(i) < 1) fadedInOverlap++;
    }
    expect(starts.size).toBe(2);                    // two vertical spans
    expect(phases.size).toBe(2 * lateral);          // every copy scrolls on its own phase
    expect(fadedInOverlap).toBeGreaterThan(0);      // the overlap zone cross-fades
    // outside every overlap the pieces are opaque
    expect(Array.from({ length: fade.count }, (_, i) => fade.getX(i)).filter((v) => v === 1).length).toBeGreaterThan(0);
  });

  it("maps the kit's manifest roles onto the shader slots and tolerates a missing texture", async () => {
    expect(WATERFALL_TEXTURE_ROLES).toEqual({ sheet: "sheet-main", ring: "plunge-ring", skirt: "mist-cloud-strip", mist: "mist-cloud" });
    const loaded: string[] = [];
    const fake = { loadAsync: async (url: string) => { loaded.push(url); if (url.includes("missing")) throw new Error("404"); return new Texture(); } };
    const set = await loadWaterfallTextures({ sheet: "a.png", ring: "missing.png" }, fake);
    expect(loaded.sort()).toEqual(["a.png", "missing.png"]);
    expect(set.sheet).toBeInstanceOf(Texture);
    expect(set.sheet!.wrapS).toBe(1000);            // RepeatWrapping: the offset scrolls forever
    expect(set.ring).toBeNull();
    expect(set.mist).toBeUndefined();
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

  it("sizes the emitter kit 1 / 2 / 4 by drop (the base read is geometry, not particles)", () => {
    expect(cascadeEmitterKit(10)).toEqual({ lip: false, mids: [] });
    expect(cascadeEmitterKit(20).mids).toHaveLength(1);
    expect(cascadeEmitterKit(60).mids).toHaveLength(2);
    expect(cascadeEmitterKit(60).lip).toBe(true);
    // a 20 m fall: one mid emitter on the sheet plus the plunge cloud
    const fall = cascade({ profile: cliffProfile(40, 20, 0) });
    const path = traceWaterfallSheet(fall);
    const emitters = cascadePathEmitters(fall, path.points, query, 0);
    expect(emitters.map((e) => e.id)).toEqual(["fall-test:mid0.6", "fall-test:cloud"]);
    expect(emitters[0].event.sheetContact?.waterBodyId).toBe("pool");
    expect(emitters[1].event.sheetContact).toBeUndefined();
    expect(emitters[1].event.position.y).toBe(0);
    // the biggest falls: lip + two mid + cloud = 4, rates growing down the fall
    const big = cascade({ lip: { x: 0, y: 80, z: 0 }, plunge: { x: 10, y: 0, z: 0 }, dropM: 80,
      profile: cliffProfile(60, 80, 0) });
    const bigEmitters = cascadePathEmitters(big, traceWaterfallSheet(big).points, query, 0);
    expect(bigEmitters.map((e) => e.id)).toEqual(["fall-test:lip", "fall-test:mid0.35", "fall-test:mid0.75", "fall-test:cloud"]);
    expect(bigEmitters[2].ratePerSecond).toBeGreaterThan(bigEmitters[1].ratePerSecond);
    // ... and with width
    const wide = cascadePathEmitters({ ...fall, widthM: 12 }, path.points, query, 0);
    expect(wide[0].ratePerSecond).toBeGreaterThan(emitters[0].ratePerSecond);
    // a small fall keeps only the plunge cloud
    const small = cascade({ dropM: 8, lip: { x: 0, y: 8, z: 0 }, profile: cliffProfile(40, 8, 0) });
    expect(cascadePathEmitters(small, traceWaterfallSheet(small).points, query, 0).map((e) => e.id)).toEqual(["fall-test:cloud"]);
  });

  it("emits nothing when the receiving pool is dry", () => {
    const fall = cascade({ profile: cliffProfile(40, 20, 0) });
    const dry: WorldWaterQuery = { ...query, sample: () => ({ ...query.sample(fall.plunge, 0), waterBodyId: null, depth: 0 }) };
    expect(cascadePathEmitters(fall, traceWaterfallSheet(fall).points, dry, 0)).toEqual([]);
  });

  it("stays inside the particle budget for the nearest falls — and below the old five-emitter kit", () => {
    const budget = (fall: Cascade) => cascadePathEmitters(fall, traceWaterfallSheet(fall).points, query, 0)
      .reduce((n, e) => n + e.ratePerSecond * waterEmissionProfile(e.event).count, 0);
    const perSecond = budget(cascade({ profile: cliffProfile(40, 20, 0), widthM: 12, dropM: 20 }));
    // two full-kit falls plus their plunge splashes must fit 768 particles
    expect(perSecond).toBeLessThan(140);
    expect(perSecond * CASCADE_PATH_LIMIT).toBeLessThan(280);
    // the geometry base took the read, so the accent kit stays well under the
    // per-fall ceiling (the old lip + 3 mid + cloud kit only had to fit 140)
    expect(perSecond).toBeLessThan(100);
    const hero = budget(cascade({ lip: { x: 0, y: 80, z: 0 }, plunge: { x: 10, y: 0, z: 0 }, dropM: 80,
      widthM: 12, profile: cliffProfile(60, 80, 0) }));
    expect(hero).toBeLessThan(140);
    // the base kit itself adds NO particles: 12–19 quads of geometry per fall
    expect(plungeBaseQuadCount(20)).toBeGreaterThanOrEqual(12);
    expect(plungeBaseQuadCount(80)).toBeLessThanOrEqual(19);
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
    // with air behind it the sheet soft-fades over the measured 0.57 m
    expect(sheetAlpha({ ...chute, airM: 6 })).toBeLessThan(0.3);
    expect(sheetAlpha({ ...chute, airM: 6, depthDeltaM: 0.6 })).toBeGreaterThan(0.6);
    // the spray-class side strips fade over the longer 1.07 m
    expect(sheetAlpha({ ...chute, layer: 3, airM: 6, depthDeltaM: 0.6 }))
      .toBeLessThan(sheetAlpha({ ...chute, layer: 0, airM: 6, depthDeltaM: 0.6 }));
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
    // v1 data: slope "falls" exist; only real cliffs become sheets, the rest chutes
    expect(built.fallCount + built.chutes.length).toBe(built.paths.length);
    for (const p of built.paths) expect(p.freeFlight ? p.freeSpanM >= FREE_FLIGHT_MIN_SPAN_M : p.freeSpanM < FREE_FLIGHT_MIN_SPAN_M).toBe(true);
    // the ~154 m cliff fall near x=2530 z=320 is a sheet
    const cliff = built.paths.find((p) => p.id === "fall-8");
    if (cliff) expect(cliff.freeFlight).toBe(true);
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
