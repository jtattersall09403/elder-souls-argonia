import { describe, expect, it } from "vitest";
import {
  GROUND_MIST, GROUND_MIST_LIFT_M, GROUND_MIST_SIZE, MIST_ALPHA, MIST_CARDS, MIST_CARD_MIN_M, MIST_CARD_PITCH_DEG,
  MIST_CARD_RADIUS_M, MIST_CARD_SCALE, MIST_DEPTH_FADE_M, MIST_KIND, MIST_SCROLL_UVS, SKIRT_FOAM_M, SKIRT_HEIGHT_MAX_M,
  SKIRT_SCROLL_TS, SKIRT_SEGMENTS, buildMistGeometry, groundMistAlpha, groundMistCount, mistBasinRadiusM, mistBox,
  mistCardAlpha, mistCardCount, mistLayout, skirtAlpha, skirtHeightM, type MistSite,
} from "./WaterfallMist";
import { plungeBaseRadiusM } from "./PlungeBase";

const site = (over: Partial<MistSite> = {}): MistSite => ({
  id: "fall-a", plunge: { x: 100, y: 12, z: 50 }, direction: { x: 1, z: 0 }, widthM: 8, dropM: 20, ...over,
});

describe("waterfall mist kit (vault audit §5: cards + ground mist + skirt as geometry)", () => {
  it("counts scale with drop: 4–8 cards, 10–40 ground-mist discs, one skirt", () => {
    expect(mistCardCount(3)).toBe(MIST_CARDS.min);
    expect(mistCardCount(8)).toBe(4);
    expect(mistCardCount(40)).toBe(8);
    expect(mistCardCount(260)).toBe(MIST_CARDS.max);
    expect(groundMistCount(3)).toBe(GROUND_MIST.min);
    expect(groundMistCount(60)).toBe(40);
    expect(groundMistCount(260)).toBe(GROUND_MIST.max);
    let prevC = 0;
    let prevD = 0;
    for (const d of [3, 8, 12, 20, 30, 45, 60, 130, 220]) {
      const c = mistCardCount(d);
      const g = groundMistCount(d);
      expect(c).toBeGreaterThanOrEqual(prevC);
      expect(g).toBeGreaterThanOrEqual(prevD);
      prevC = c; prevD = g;
    }
    // particle budget untouched: this kit is geometry (see cascadeEmitterKit for emitters)
    const built = buildMistGeometry([site()]);
    expect(built.skirtCount).toBe(1);
    expect(built.cardCount).toBe(mistCardCount(20));
    expect(built.discCount).toBe(groundMistCount(20));
  });

  it("lays mist cards 0.2–0.5 of the fall width, pitched −10°…135°, within 12 m of the impact, seeded", () => {
    const layout = mistLayout(site());
    expect(layout.cards).toHaveLength(mistCardCount(20));
    for (const c of layout.cards) {
      expect(c.sizeM).toBeGreaterThanOrEqual(Math.max(8 * MIST_CARD_SCALE.min, MIST_CARD_MIN_M) - 1e-9);
      expect(c.sizeM).toBeLessThanOrEqual(8 * MIST_CARD_SCALE.max + 1e-9);
      expect(c.distM).toBeGreaterThan(0);
      expect(c.distM).toBeLessThanOrEqual(MIST_CARD_RADIUS_M);
      expect(Math.hypot(c.x - 100, c.z - 50)).toBeCloseTo(c.distM, 6);
      const pitchDeg = (c.pitchRad * 180) / Math.PI;
      expect(pitchDeg).toBeGreaterThanOrEqual(MIST_CARD_PITCH_DEG.min);
      expect(pitchDeg).toBeLessThanOrEqual(MIST_CARD_PITCH_DEG.max);
      expect(c.y).toBeCloseTo(12.1, 6);
    }
    // random-but-seeded: the same fall lays the same cards, another fall differs
    expect(mistLayout(site())).toEqual(layout);
    expect(mistLayout(site({ id: "fall-b" })).cards).not.toEqual(layout.cards);
    const yaws = new Set(layout.cards.map((c) => Math.round(c.yawRad * 100)));
    expect(yaws.size).toBeGreaterThan(1);
    // a 130 m gorge fall: within ~12 m still
    for (const c of mistLayout(site({ dropM: 130, widthM: 9 })).cards) expect(c.distM).toBeLessThanOrEqual(MIST_CARD_RADIUS_M);
  });

  it("fills the plunge basin with level ground-mist discs sized by the pool radius", () => {
    const layout = mistLayout(site({ dropM: 60 }));
    const R = mistBasinRadiusM(8, 60);
    expect(R).toBeCloseTo(plungeBaseRadiusM(8, 60) * 1.25, 9);
    expect(layout.discs).toHaveLength(40);
    for (const d of layout.discs) {
      expect(d.y).toBeCloseTo(12 + GROUND_MIST_LIFT_M, 9);
      expect(d.distM).toBeLessThanOrEqual(R + 1e-9);
      expect(d.radiusM).toBe(R);
      expect(d.sizeM).toBeGreaterThanOrEqual(GROUND_MIST_SIZE.minM - 1e-9);
      expect(d.sizeM).toBeLessThanOrEqual(GROUND_MIST_SIZE.maxM + 1e-9);
    }
    // area-uniform: roughly a quarter of the discs inside half the radius
    const inner = layout.discs.filter((d) => d.distM < R * 0.5).length;
    expect(inner).toBeGreaterThanOrEqual(5);
    expect(inner).toBeLessThanOrEqual(16);
    // every disc vertex is level (the geometry keeps them flat)
    const built = buildMistGeometry([site({ dropM: 60 })]);
    const pos = built.geometry.getAttribute("position");
    const kind = built.geometry.getAttribute("aMistKind");
    for (let i = 0; i < pos.count; i++) {
      if (kind.getX(i) === MIST_KIND.disc) expect(pos.getY(i)).toBeCloseTo(12 + GROUND_MIST_LIFT_M, 6);
      if (kind.getX(i) === MIST_KIND.card) expect(pos.getY(i)).toBeGreaterThanOrEqual(12.1 - 1e-6); // never under the pool
    }
  });

  it("puts a skirt column on the cliff side of the foot with foam only over the bottom 3.5 m", () => {
    expect(skirtHeightM(5)).toBe(SKIRT_FOAM_M);
    expect(skirtHeightM(16)).toBeCloseTo(11.2, 9);
    expect(skirtHeightM(130)).toBe(SKIRT_HEIGHT_MAX_M);
    const layout = mistLayout(site());
    expect(layout.skirt.radiusM).toBeCloseTo(4.8, 9);
    // upstream of a +x flow is −x
    expect(Math.cos(layout.skirt.upstreamRad)).toBeCloseTo(-1, 6);
    const built = buildMistGeometry([site()]);
    const pos = built.geometry.getAttribute("position");
    const kind = built.geometry.getAttribute("aMistKind");
    let skirtVerts = 0;
    for (let i = 0; i < pos.count; i++) {
      if (kind.getX(i) !== MIST_KIND.skirt) continue;
      skirtVerts++;
      expect(pos.getX(i)).toBeLessThan(100 + 4.8 * Math.cos((105 * Math.PI) / 180) + 1e-6);
    }
    expect(skirtVerts).toBe(3 * (SKIRT_SEGMENTS + 1));
    // alpha twin: full foam at the foot, gone (bar a faint fog) above 3.5 m
    expect(skirtAlpha(0.5, 0, 11.2, 1, 1)).toBeCloseTo(MIST_ALPHA.skirt, 6);
    expect(skirtAlpha(0.5, SKIRT_FOAM_M, 11.2, 1, 1)).toBeLessThan(0.2);
    expect(skirtAlpha(0.5, SKIRT_FOAM_M, 11.2, 1, 0)).toBe(0);
    expect(skirtAlpha(0.5, 11.2, 11.2, 1, 1)).toBe(0);
    expect(skirtAlpha(0, 0, 11.2, 1, 1)).toBe(0);
    // the two down layers and the one up layer are the measured rates
    expect(SKIRT_SCROLL_TS).toEqual({ down: 0.545, up: 0.362 });
  });

  it("fades the waterline edge, the soft depth per class, and the ground mist by the foam field", () => {
    expect(mistBox(0.5, 0)).toBe(0);
    expect(mistBox(0.5, 0.15)).toBeGreaterThan(0);
    expect(mistBox(0.5, 0.15)).toBeLessThan(1);
    expect(mistBox(0.5, 0.5)).toBe(1);
    expect(mistBox(0, 0.5)).toBe(0);
    expect(mistCardAlpha(0.5, 0.5, 1)).toBeCloseTo(MIST_ALPHA.card, 6);
    expect(mistCardAlpha(0.5, 0.5, 1, MIST_DEPTH_FADE_M.card)).toBeCloseTo(MIST_ALPHA.card, 6);
    expect(mistCardAlpha(0.5, 0.5, 1, 0)).toBe(0);
    expect(MIST_DEPTH_FADE_M).toEqual({ card: 1.07, disc: 0.6, skirt: 1.07 });
    // ground mist: distance fade and the foam field under it
    expect(groundMistAlpha(0.5, 0.5, 0.2, 1, 0.5)).toBeCloseTo(MIST_ALPHA.disc, 6);
    expect(groundMistAlpha(0.5, 0.5, 0.2, 1, 0)).toBeCloseTo(MIST_ALPHA.disc * 0.3, 6);
    expect(groundMistAlpha(0.5, 0.5, 1.0, 1, 1)).toBe(0);
    expect(groundMistAlpha(0.5, 0.5, 0.2, 1, 1, 0)).toBe(0);
    // the ground-mist drift: +0.030 U (34 s loop), −0.017 V
    expect(MIST_SCROLL_UVS).toEqual({ u: 0.03, v: -0.017 });
  });

  it("merges every fall into one geometry with a small triangle budget", () => {
    const built = buildMistGeometry([site(), site({ id: "fall-b", dropM: 130, plunge: { x: 400, y: 3, z: 9 } })]);
    expect(built.triangleCount).toBe(built.cardCount * 2 + built.discCount * 2 + 2 * SKIRT_SEGMENTS * 2 * 2);
    expect(built.perFall["fall-a"].triangles + built.perFall["fall-b"].triangles).toBe(built.triangleCount);
    // the biggest kit (8 cards, 40 discs, a skirt) is under 140 triangles
    expect(built.perFall["fall-b"].triangles).toBeLessThan(140);
    for (const name of ["aMistUv", "aMistKind", "aMistFade", "aMistSize"]) {
      expect(built.geometry.getAttribute(name).count).toBe(built.geometry.getAttribute("position").count);
    }
  });
});
