import { describe, expect, it } from "vitest";
import { selectLandingAnimation } from "./landing";

describe("velocity-aware landing selection", () => {
  it("keeps the full stationary compression for a soft vertical landing", () => {
    expect(selectLandingAnimation({
      velocity: { x: 0.2, z: 0.1 },
      impactSpeed: 3,
    })).toMatchObject({ animation: "JUMP_LAND", kind: "stationary", duration: 0.58 });
  });

  it("cuts a moving landing short so the planted pose cannot skate", () => {
    const moving = selectLandingAnimation({
      velocity: { x: 0, z: 2.5 },
      impactSpeed: 4,
    });
    const sprint = selectLandingAnimation({
      velocity: { x: 0, z: 5.2 },
      impactSpeed: 4,
    });
    expect(moving).toMatchObject({ animation: "JUMP_LAND", kind: "moving", duration: 0.24 });
    expect(sprint).toMatchObject({ animation: "JUMP_LAND", kind: "sprint", duration: 0.18 });
    // Faster than a stationary plant, but capped so it stays legible rather
    // than fitting the whole authored clip into the shortened window.
    const stationary = selectLandingAnimation({ velocity: { x: 0, z: 0 }, impactSpeed: 3 });
    expect(moving.animationSpeed).toBe(2);
    expect(sprint.animationSpeed).toBe(2);
    expect(moving.duration).toBeLessThan(stationary.duration);
    expect(sprint.duration).toBeLessThan(moving.duration);
  });

  it("keeps neutral facing for lateral velocity and flags hard impacts", () => {
    expect(selectLandingAnimation({
      velocity: { x: -2, z: 1 },
      impactSpeed: 7,
    })).toMatchObject({ animation: "JUMP_LAND", kind: "hard", duration: 0.46 });
  });
});
