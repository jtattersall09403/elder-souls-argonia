import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { vec3 } from "three/tsl";
import {
  applyWindSway,
  applyWindSwayWithShadow,
  createWindUniforms,
  updateWindSway,
  windOffset,
  windPhase,
  windStiffness,
  WIND_FADE_M,
  WIND_REFERENCE_TRUNK_RADIUS_M,
  WIND_STIFFNESS_RANGE,
} from "./windSway";

describe("wind sway node patch", () => {
  it("wraps the position slot with shared uniform nodes", () => {
    const material = new MeshStandardNodeMaterial();
    const uniforms = createWindUniforms();
    applyWindSway(material, uniforms);
    expect(material.positionNode).not.toBeNull();
    for (const u of Object.values(uniforms)) expect((u as { isNode?: boolean }).isNode).toBe(true);
  });
  it("never bends twice, however many times it is applied", () => {
    const material = new MeshStandardNodeMaterial();
    const uniforms = createWindUniforms();
    applyWindSway(material, uniforms);
    const once = material.positionNode;
    applyWindSway(material, uniforms);
    applyWindSwayWithShadow(material, undefined, uniforms);
    expect(material.positionNode).toBe(once);
  });
  it("sways a separate shadow position too, when a feature set one", () => {
    const material = new MeshStandardNodeMaterial();
    const shadow = vec3(0, 1, 0);
    material.castShadowPositionNode = shadow;
    applyWindSway(material, createWindUniforms());
    expect(material.castShadowPositionNode).not.toBe(shadow);
    const plain = new MeshStandardNodeMaterial();
    applyWindSway(plain, createWindUniforms());
    expect(plain.castShadowPositionNode).toBeNull(); // the shadow reuses positionNode
  });
  it("takes absolute time, so two callers per frame do not double the clock", () => {
    const uniforms = createWindUniforms();
    const wind = { windDirXZ: [1, 0] as const, windSpeedMS: 10, gustiness: 0.5 };
    updateWindSway(uniforms, 4.2, wind);
    updateWindSway(uniforms, 4.2, wind);
    expect(uniforms.esWindTime.value).toBe(4.2);
    expect(uniforms.esWindVec.value.x).toBeCloseTo(0.9);
  });

  it("measures height from the GROUND LINE, not the buried pivot", () => {
    // Terrain species are sunk deliberately; weighting from the pivot left the
    // trunk already displaced where it meets the soil (owner round 6:
    // "trunks look like they're swaying at their base").
    const base = { origin: [5, 0, 7] as const, camera: [0, 2, 0] as const, timeS: 3,
      windVec: [0.9, 0, 0.5] as const };
    expect(windOffset({ ...base, heightM: 0.5, sinkM: 0.5 }).map((v) => v + 0)).toEqual([0, 0, 0]);
    expect(Math.abs(windOffset({ ...base, heightM: 5, sinkM: 0.5 })[0]))
      .toBeLessThan(Math.abs(windOffset({ ...base, heightM: 5 })[0]));
  });
  it("pins the base, swings the crown, and never stretches the plant", () => {
    const base = { origin: [5, 0, 7] as const, camera: [0, 2, 0] as const, timeS: 1.3,
      windVec: [0.9, 0, 0] as const };
    const low = windOffset({ ...base, heightM: 1 });
    const high = windOffset({ ...base, heightM: 12 });
    expect(Math.abs(high[0])).toBeGreaterThan(Math.abs(low[0]));
    // Length-preserving: a leaning crown drops, never rises.
    expect(high[1]).toBeLessThanOrEqual(0);
  });
  it("fades out with camera distance and stops in still air", () => {
    const base = { origin: [0, 0, 0] as const, heightM: 10, timeS: 2, windVec: [0.9, 0, 0.3] as const };
    expect(windOffset({ ...base, camera: [WIND_FADE_M + 1, 0, 0] }).map((v) => v + 0)).toEqual([0, 0, 0]);
    expect(windOffset({ ...base, camera: [10, 0, 0], windVec: [0, 0, 1] })).toEqual([0, 0, 0]);
    expect(windOffset({ ...base, camera: [10, 0, 0] })[0]).not.toBe(0);
  });
  it("phases neighbours differently", () => {
    expect(windPhase(0, 0)).not.toBeCloseTo(windPhase(1, 0), 3);
    expect(windPhase(3, 4)).toBeGreaterThanOrEqual(0);
    expect(windPhase(3, 4)).toBeLessThan(1);
  });
  it("scales sway by the trunk's width, both ways off the reference", () => {
    expect(windStiffness(WIND_REFERENCE_TRUNK_RADIUS_M)).toBeCloseTo(1, 5);
    const [floor, ceiling] = WIND_STIFFNESS_RANGE;
    // A buttressed giant barely stirs; a slender trunk keeps the calibrated
    // amplitude and is never pushed ABOVE it (owner round 7: palms swayed
    // too much once thin trunks were allowed a multiplier over 1).
    expect(windStiffness(1.6)).toBe(floor);
    expect(windStiffness(0.05)).toBe(ceiling);
    expect(ceiling).toBe(1);
    // A 0.26 m palm trunk — the case the owner called out — must not exceed
    // the baseline it was tuned at.
    expect(windStiffness(0.26)).toBe(1);
    // Monotonic in between, and strictly decreasing with width.
    expect(windStiffness(0.25)).toBeGreaterThan(windStiffness(0.45));
    expect(windStiffness(0.45)).toBeLessThan(1);
  });

  it("reads the trunk width AT INSTANCE SCALE", () => {
    // The same species placed at x2 has a trunk twice as thick, so it must
    // sway less than its unscaled neighbour, not the same amount.
    expect(windStiffness(0.3, 2)).toBeLessThan(windStiffness(0.3, 1));
    expect(windStiffness(0.3, 2)).toBeCloseTo(windStiffness(0.6, 1), 6);
  });

  it("treats a species with no trunk capsule as neutral", () => {
    expect(windStiffness(0)).toBe(1);
    expect(windStiffness(Number.NaN)).toBe(1);
  });
});
