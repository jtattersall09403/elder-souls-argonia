import { describe, expect, it } from "vitest";
import {
  LOCKED_STRIDE_RATE,
  MIN_STRIDE_FRACTION,
  lockedStrideClip,
  lockedStrideRateFor,
  strideRateForMagnitude,
} from "./lockedStride";

describe("lockedStrideClip", () => {
  it("leaves forward movement to the ordinary locomotion selection", () => {
    expect(lockedStrideClip({ x: 0, y: 1 }, 1)).toBeNull();
    expect(lockedStrideClip({ x: 0.2, y: 1 }, 1)).toBeNull();
  });

  it("keeps the locked clips for lateral and backward movement", () => {
    expect(lockedStrideClip({ x: -1, y: 0 }, 1)).toBe("STRAFE_LEFT");
    expect(lockedStrideClip({ x: 1, y: 0 }, 1)).toBe("STRAFE_RIGHT");
    expect(lockedStrideClip({ x: 0, y: -1 }, 1, true)).toBe("RUN_BACK");
    expect(lockedStrideClip({ x: 0, y: -0.42 }, 0.42, true)).toBe("WALK_BACK");
  });

  it("stands still inside the dead zone", () => {
    expect(lockedStrideClip({ x: 0.02, y: 0 }, 0.02)).toBeNull();
  });
});

describe("strideRateForMagnitude", () => {
  it("stands inside the dead zone", () => {
    expect(strideRateForMagnitude(0)).toBe(0);
    expect(strideRateForMagnitude(0.05)).toBe(0);
  });

  it("is proportional to the stick above the floor", () => {
    expect(strideRateForMagnitude(1)).toBeCloseTo(LOCKED_STRIDE_RATE);
    expect(strideRateForMagnitude(0.5)).toBeCloseTo(LOCKED_STRIDE_RATE * 0.5);
    expect(strideRateForMagnitude(0.75)).toBeCloseTo(LOCKED_STRIDE_RATE * 0.75);
  });

  it("floors a barely-pushed stick rather than crawling", () => {
    expect(strideRateForMagnitude(0.1)).toBeCloseTo(LOCKED_STRIDE_RATE * MIN_STRIDE_FRACTION);
  });

  it("clamps an over-range magnitude and takes a caller's maximum", () => {
    expect(strideRateForMagnitude(1.4)).toBeCloseTo(LOCKED_STRIDE_RATE);
    expect(strideRateForMagnitude(0.6, 1)).toBeCloseTo(0.6);
  });

  it("uses the owner's 1.55 stride rate", () => {
    expect(LOCKED_STRIDE_RATE).toBeCloseTo(1.55);
  });
});

it("runs backward at the source cadence and keeps the selected strafe rate", () => {
  expect(lockedStrideRateFor("RUN_BACK", 1)).toBe(1);
  expect(lockedStrideRateFor("STRAFE_LEFT", 1)).toBe(1.55);
  expect(lockedStrideRateFor("RUN_BACK", 0.5)).toBe(0.5);
  expect(lockedStrideRateFor("RUN_BACK", 1, 3.1)).toBe(2);
});
