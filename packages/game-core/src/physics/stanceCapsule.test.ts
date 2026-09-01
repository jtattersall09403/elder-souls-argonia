import { describe, expect, it } from "vitest";

import {
  CHARACTER_CAPSULE_HALF_HEIGHT,
  CHARACTER_CAPSULE_RADIUS,
  CHARACTER_FLOAT_HEIGHT,
} from "./characterPhysics";
import {
  CROUCHED_CROWN_HEIGHT,
  STANCE_CAPSULES,
  STANDING_CROWN_HEIGHT,
  applyStanceCapsule,
  stanceCapsule,
  stanceCrownHeight,
  type ResizableCapsule,
} from "./stanceCapsule";

function recorder() {
  const calls: Record<string, unknown> = {};
  const collider: ResizableCapsule = {
    setHalfHeight: (value) => { calls.halfHeight = value; },
    setRadius: (value) => { calls.radius = value; },
    setTranslationWrtParent: (value) => { calls.translation = value; },
  };
  return { collider, calls };
}

describe("the navigation capsule per stance", () => {
  it("leaves the standing capsule exactly as it was", () => {
    // The whole change has to be invisible while standing: this capsule is the
    // calibration behind suspension, stairs and the capability profiles.
    const standing = STANCE_CAPSULES.standing;
    expect(standing.halfLength).toBeCloseTo(CHARACTER_CAPSULE_HALF_HEIGHT, 9);
    expect(standing.radius).toBeCloseTo(CHARACTER_CAPSULE_RADIUS, 9);
    expect(standing.centerOffset).toBeCloseTo(0, 9);
  });

  it("keeps the soles in the same place when crouching", () => {
    // The point of shrinking upward. If this drifts, a crouching character
    // sinks into or hovers over the floor.
    const soleHeight = (shape: typeof STANCE_CAPSULES.standing) =>
      shape.centerOffset - shape.halfLength - shape.radius;
    expect(soleHeight(STANCE_CAPSULES.crouching))
      .toBeCloseTo(soleHeight(STANCE_CAPSULES.standing), 9);
  });

  it("brings the crown down to the crouched height", () => {
    expect(stanceCrownHeight("standing")).toBeCloseTo(STANDING_CROWN_HEIGHT, 6);
    expect(stanceCrownHeight("crouching")).toBeCloseTo(CROUCHED_CROWN_HEIGHT, 6);
    // A real reduction, not a rounding one: about half a metre of headroom.
    expect(stanceCrownHeight("standing") - stanceCrownHeight("crouching"))
      .toBeGreaterThan(0.45);
    expect(stanceCrownHeight("crouching")).toBeLessThan(stanceCrownHeight("standing"));
  });

  it("never collapses to a degenerate capsule, however low the stance", () => {
    // A capsule shorter than its own diameter is not a shape Rapier can hold.
    const prone = stanceCapsule(0.2);
    expect(prone.halfLength).toBeGreaterThanOrEqual(0);
    expect(prone.radius).toBe(CHARACTER_CAPSULE_RADIUS);
    expect(2 * CHARACTER_CAPSULE_RADIUS + CHARACTER_FLOAT_HEIGHT)
      .toBeGreaterThan(0.2);
  });

  it("writes the shape onto a collider", () => {
    const { collider, calls } = recorder();
    applyStanceCapsule(collider, "crouching");
    expect(calls.halfHeight).toBeCloseTo(STANCE_CAPSULES.crouching.halfLength, 9);
    expect(calls.translation).toEqual({
      x: 0, y: STANCE_CAPSULES.crouching.centerOffset, z: 0,
    });
  });
});
