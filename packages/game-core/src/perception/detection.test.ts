import { describe, expect, it } from "vitest";
import {
  AWARENESS_TUNING,
  directionMultiplier,
  elusiveness,
  initialAwareness,
  perceive,
  stepAwareness,
  type AwarenessState,
  type DetectionTarget,
  type Observer,
} from "./detection";

/**
 * Expected answers, written before the code (combat-sandbox lane round 4).
 * Module 76 §118 Sneak row: Elusiveness = (Sneak + Agi/5 − boot weight) ×
 * (0.5 + distance/500 units), against the observer's spot score × canon's
 * direction multiplier (×1.5 front, ×0.5 behind); compared, never rolled.
 * 500 Morrowind units are 7.14 m (1 unit = 1.428 cm).
 */
const guard: Observer = {
  position: { x: 0, y: 0, z: 0 },
  facingYaw: 0, // looking down +Z
  viewHalfAngle: Math.PI / 3,
  viewRange: 30,
  spotScore: 40,
};

const sneak = (over: Partial<DetectionTarget> = {}): DetectionTarget => ({
  position: { x: 0, y: 0, z: 5 },
  sneakSkill: 50,
  agility: 50,
  bootWeightKg: 0,
  sneaking: true,
  ...over,
});

describe("elusiveness (module 76 §118)", () => {
  it("is Morrowind's sneak term times its distance term", () => {
    // (50 + 10 − 0) × (0.5 + 7.14/7.14) = 60 × 1.5 = 90
    expect(elusiveness(sneak(), 500 * 0.01428)).toBeCloseTo(90, 6);
    // Heavy boots count against it, kilogram for kilogram.
    expect(elusiveness(sneak({ bootWeightKg: 6 }), 0)).toBeCloseTo(27, 6);
  });
  it("is zero for a target that is not sneaking", () => {
    expect(elusiveness(sneak({ sneaking: false }), 5)).toBe(0);
  });
});

describe("direction", () => {
  it("is ×1.5 inside the view cone and ×0.5 outside it", () => {
    expect(directionMultiplier(guard, { x: 0, y: 0, z: 5 })).toBe(1.5);
    expect(directionMultiplier(guard, { x: 0, y: 0, z: -5 })).toBe(0.5);
    // 70° off the facing, outside a 60° half-angle cone.
    expect(directionMultiplier(guard, { x: Math.sin(70 * Math.PI / 180) * 5, y: 0, z: Math.cos(70 * Math.PI / 180) * 5 })).toBe(0.5);
  });
});

describe("perceive: seen or not, no dice", () => {
  it("sees a walking target in front at any distance inside range", () => {
    expect(perceive(guard, sneak({ sneaking: false, position: { x: 0, y: 0, z: 25 } }), { lineOfSight: true }).seen).toBe(true);
  });
  it("never sees through a wall or past its range", () => {
    expect(perceive(guard, sneak({ sneaking: false }), { lineOfSight: false }).seen).toBe(false);
    expect(perceive(guard, sneak({ sneaking: false, position: { x: 0, y: 0, z: 31 } }), { lineOfSight: true }).seen).toBe(false);
  });
  it("misses a skilled sneak behind it and catches the same sneak in front, close", () => {
    // Behind at 2 m: spot 40 × 0.5 = 20 against (60) × (0.5 + 2/7.14) = 46.8 → unseen.
    expect(perceive(guard, sneak({ position: { x: 0, y: 0, z: -2 } }), { lineOfSight: true }).seen).toBe(false);
    // In front at 0.5 m: 40 × 1.5 = 60 against 60 × 0.57 = 34.2 → seen.
    expect(perceive(guard, sneak({ position: { x: 0, y: 0, z: 0.5 } }), { lineOfSight: true }).seen).toBe(true);
  });
  it("takes light as an input: in darkness the spot score halves", () => {
    // In front at 3 m: elusiveness 60 × 0.92 = 55.2; spot 60 lit, 30 dark.
    const at3 = sneak({ position: { x: 0, y: 0, z: 3 } });
    expect(perceive(guard, at3, { lineOfSight: true }).seen).toBe(true);
    expect(perceive(guard, { ...at3, lightLevel: 0 }, { lineOfSight: true }).seen).toBe(false);
  });
});

describe("awareness: unaware → suspicious → engaged", () => {
  it("engages after a continuous sighting of the engage time, not on the first frame", () => {
    let state = initialAwareness();
    state = stepAwareness(state, { seen: true, noise: 0 }, 0.1);
    expect(state.awareness).toBe("suspicious");
    const frames = Math.ceil(AWARENESS_TUNING.engageSeconds / 0.1);
    for (let i = 0; i < frames; i++) state = stepAwareness(state, { seen: true, noise: 0 }, 0.1);
    expect(state.awareness).toBe("engaged");
  });
  it("turns suspicious on a loud noise without a sighting, and settles back when nothing follows", () => {
    let state = stepAwareness(initialAwareness(), { seen: false, noise: 1 }, 0.1);
    expect(state.awareness).toBe("suspicious");
    for (let i = 0; i < 100; i++) state = stepAwareness(state, { seen: false, noise: 0 }, 0.1);
    expect(state.awareness).toBe("unaware");
  });
  it("loses an engaged target only after the lose time out of sight, and then searches", () => {
    let state: AwarenessState = { ...initialAwareness(), awareness: "engaged", suspicion: 1 };
    state = stepAwareness(state, { seen: false, noise: 0 }, AWARENESS_TUNING.loseTargetSeconds - 0.1);
    expect(state.awareness).toBe("engaged");
    state = stepAwareness(state, { seen: false, noise: 0 }, 0.2);
    expect(state.awareness).toBe("suspicious");
  });
  it("is being hit: a blow always engages", () => {
    const state = stepAwareness(initialAwareness(), { seen: false, noise: 0, struck: true }, 0.016);
    expect(state.awareness).toBe("engaged");
  });
});
