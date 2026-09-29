import { describe, expect, it } from "vitest";
import { MeshStandardNodeMaterial } from "three/webgpu";
import {
  applyCylindricalBillboard,
  billboardRightVector,
} from "./billboardQuad";
import { applyLodFade, createLodFadeUniforms } from "./lodFade";

describe("billboardRightVector", () => {
  it("is perpendicular to the view direction and unit length", () => {
    for (const [vx, vz] of [[1, 0], [0, 1], [-3, 4], [7, -2]] as const) {
      const [rx, rz] = billboardRightVector(vx, vz);
      expect(Math.hypot(rx, rz)).toBeCloseTo(1, 6);
      expect(rx * vx + rz * vz).toBeCloseTo(0, 6);
    }
  });

  it("turns with the viewer: a viewer to the north gives a west-east card", () => {
    const north = billboardRightVector(0, -10);
    expect(north[0]).toBeCloseTo(-1, 6);
    expect(north[1]).toBeCloseTo(0, 6);
    const south = billboardRightVector(0, 10);
    expect(south[0]).toBeCloseTo(1, 6);
    expect(south[1]).toBeCloseTo(0, 6);
  });

  it("falls back to world +X when the viewer is directly overhead", () => {
    expect(billboardRightVector(0, 0)).toEqual([1, 0]);
  });
});


describe("applyCylindricalBillboard", () => {
  it("wraps the position slot once", () => {
    const uniforms = createLodFadeUniforms();
    const material = new MeshStandardNodeMaterial();
    applyCylindricalBillboard(material, uniforms);
    const once = material.positionNode;
    expect(once).not.toBeNull();
    applyCylindricalBillboard(material, uniforms); // idempotent
    expect(material.positionNode).toBe(once);
  });

  it("composes with the LOD fade in either order on one view uniform", () => {
    const uniforms = createLodFadeUniforms();
    const material = new MeshStandardNodeMaterial();
    applyLodFade(material, uniforms);
    const faded = material.positionNode;
    applyCylindricalBillboard(material, uniforms);
    // The billboard wraps the fade's position; the fade's mask survives.
    expect(material.positionNode).not.toBe(faded);
    expect(material.maskNode).not.toBeNull();
    const reversed = new MeshStandardNodeMaterial();
    applyCylindricalBillboard(reversed, uniforms);
    applyLodFade(reversed, uniforms);
    expect(reversed.maskNode).not.toBeNull();
  });
});
