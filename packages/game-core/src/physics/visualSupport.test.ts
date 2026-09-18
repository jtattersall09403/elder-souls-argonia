import { describe, expect, it } from "vitest";

import { resolveSupportCorrection } from "../anim/grounding";
import { CHARACTER_BODY_CENTER_HEIGHT } from "./characterPhysics";
import { visualSupportY } from "./visualSupport";

/**
 * Owner report, 16f round 4: jumping onto a rock clipped the model into it and
 * then snapped it out. The physics was fine (a headless drop of the player
 * capsule onto a trimesh rock top sinks <= 0.16 m transiently and settles on
 * the top face, identical to a solid cuboid); the defect was the VISUAL
 * support plane being the terrain under the rock, not the rock top.
 */
describe("the visual support plane under the character", () => {
  const rockTopY = 1.2;
  const terrainY = 0;
  const bodyCentreY = rockTopY + CHARACTER_BODY_CENTER_HEIGHT;

  it("is the surface the controller stands on, not the terrain beneath it", () => {
    expect(visualSupportY(rockTopY, terrainY, bodyCentreY)).toBe(rockTopY);
  });

  it("never draws a landing on a rock down into the stone", () => {
    // JUMP_LAND is authored floor-contact: the model follows the plane
    // exactly, downward included. With the plane on the rock top the
    // correction is zero; with it on the terrain it was -rockTop (the clip).
    const supportY = visualSupportY(rockTopY, terrainY, bodyCentreY);
    const visibleSoleY = rockTopY; // the clip's sole sits at the actor base
    const target = resolveSupportCorrection("floor-contact", supportY, rockTopY, visibleSoleY);
    expect(target.correction).toBeCloseTo(0, 6);
    expect(target.correction).toBeGreaterThanOrEqual(-0.001);
  });

  it("falls back to the terrain while airborne, and to the feet off the built ground", () => {
    expect(visualSupportY(null, terrainY, bodyCentreY)).toBe(terrainY);
    expect(visualSupportY(null, null, bodyCentreY)).toBeCloseTo(rockTopY, 9);
  });
});
