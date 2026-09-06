import { describe, expect, it } from "vitest";
import { channelCurrentSpeed, CHANNEL_CURRENT_MAX_MPS } from "./channelCurrent";

describe("depth/resistance and gravity-driven channel current", () => {
  it("approaches Manning equilibrium on a long gradual bed-supported reach", () => {
    const radius = 0.3, grade = 0.005, n = 0.045;
    const speed = channelCurrentSpeed({ hydraulicRadiusM: radius, dropM: 5,
      horizontalLengthM: 1000, upstreamSpeedMps: 0.35, roughnessN: n });
    const alongSurfaceGrade = grade / Math.hypot(1, grade);
    expect(speed).toBeCloseTo(radius ** (2 / 3) / n * Math.sqrt(alongSurfaceGrade), 6);
  });
  it("retains upstream momentum and accelerates a falling jet by its actual drop", () => {
    const speed = channelCurrentSpeed({ hydraulicRadiusM: 0.05, dropM: 4,
      horizontalLengthM: 0.5, upstreamSpeedMps: 2 });
    expect(speed).toBeCloseTo(Math.sqrt(4 + 2 * 9.81 * 4));
    const short = channelCurrentSpeed({ hydraulicRadiusM: 0.1, dropM: 0,
      horizontalLengthM: 0.1, upstreamSpeedMps: 2 });
    expect(short).toBeGreaterThan(1.9);
    expect(short).toBeLessThan(2);
  });
  it("distinguishes shallow rough creeks from deeper currents without an arbitrary 3 m/s plateau", () => {
    const reach = { dropM: 3, horizontalLengthM: 8, upstreamSpeedMps: 2 };
    const shallow = channelCurrentSpeed({ ...reach, hydraulicRadiusM: 0.03 });
    const deep = channelCurrentSpeed({ ...reach, hydraulicRadiusM: 0.5 });
    expect(deep).toBeGreaterThan(3);
    expect(deep).toBeGreaterThan(shallow);
    expect(channelCurrentSpeed({ ...reach, hydraulicRadiusM: 0.5, roughnessN: 0.08 })).toBeLessThan(deep);
    expect(channelCurrentSpeed({ hydraulicRadiusM: 1, dropM: 1000,
      horizontalLengthM: 1, upstreamSpeedMps: 5 })).toBe(CHANNEL_CURRENT_MAX_MPS);
  });
});
