import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { fallbackFlameAnchorLocal } from "./flameAnchors";

describe("fallbackFlameAnchorLocal: lantern", () => {
  // townlantern04's shape: a 0.74 m tall standing lantern, handle at the top.
  const box = new THREE.Box3(new THREE.Vector3(-0.15, 0, -0.15), new THREE.Vector3(0.15, 0.74, 0.15));
  it("burns at the light record's offset, inside the globe, not on the handle", () => {
    const a = fallbackFlameAnchorLocal({ light: { fixtureKind: "lantern", offsetM: [0, 0.2, 0] } }, box);
    expect(a.toArray()).toEqual([0, 0.2, 0]);
  });
  it("burns on the box top when the lantern has no offset", () => {
    expect(fallbackFlameAnchorLocal({ light: { fixtureKind: "lantern" } }, box).y).toBeCloseTo(0.74);
  });
  it("ignores the offset for a non-lantern", () => {
    expect(fallbackFlameAnchorLocal({ light: { fixtureKind: "candle", offsetM: [0, 0.2, 0] } }, box).y).toBeCloseTo(0.74);
  });
});
