import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  SHADOW_CASTER_LAYER, aimShadowCameraAtCasters, countCastersMissingLayer,
  setCastShadow, setCastShadowCascades,
} from "./shadowCasters";

describe("shadow caster layer (webgpu10 diag20 E5)", () => {
  it("an object set to cast carries the caster layer and stays on layer 0", () => {
    const m = new THREE.Mesh();
    setCastShadow(m, true);
    expect(m.castShadow).toBe(true);
    expect(m.layers.isEnabled(SHADOW_CASTER_LAYER)).toBe(true);
    expect(m.layers.isEnabled(0)).toBe(true);
    setCastShadow(m, false);
    expect(m.castShadow).toBe(false);
    expect(m.layers.isEnabled(SHADOW_CASTER_LAYER)).toBe(false);
  });

  it("cascade cameras see casters, never non-casters; per-cascade casters only their cascades", () => {
    const cams = [0, 1, 2].map((i) => { const c = new THREE.OrthographicCamera(); aimShadowCameraAtCasters(c, i); return c; });
    const caster = new THREE.Mesh(); setCastShadow(caster, true);
    const plain = new THREE.Mesh();
    const near = new THREE.Mesh(); setCastShadowCascades(near, 0b001);
    for (const c of cams) {
      expect(caster.layers.test(c.layers)).toBe(true);
      expect(plain.layers.test(c.layers)).toBe(false);
    }
    expect(cams.map((c) => near.layers.test(c.layers))).toEqual([true, false, false]);
    expect(near.castShadow).toBe(true);
    setCastShadowCascades(near, 0);
    expect(near.castShadow).toBe(false);
  });

  it("counts flagged casters without the layer", () => {
    const g = new THREE.Group();
    const bad = new THREE.Mesh(); bad.castShadow = true;
    const good = new THREE.Mesh(); setCastShadow(good, true);
    g.add(bad, good);
    expect(countCastersMissingLayer(g)).toBe(1);
  });
});
