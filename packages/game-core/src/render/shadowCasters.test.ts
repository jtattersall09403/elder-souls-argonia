import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  SHADOW_CASTER_LAYER, aimShadowCameraAtCasters, castersMissingLayer,
  setCastShadow, setCastShadowCascades, stabiliseShadowPassMaterials,
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

  it("names flagged casters without the layer, with their owner and kind", () => {
    const g = new THREE.Group(); g.name = "settlements";
    const inner = new THREE.Group();
    const bad = new THREE.Mesh(); bad.castShadow = true; bad.name = "wall"; bad.userData.esSettlementBatch = true;
    const anon = new THREE.Mesh(); anon.castShadow = true;
    const good = new THREE.Mesh(); setCastShadow(good, true);
    inner.add(bad); g.add(inner, anon, good);
    expect(castersMissingLayer(g)).toEqual([
      { name: "wall", owner: "settlements", kind: "Mesh esSettlementBatch" },
      { name: "<unnamed>", owner: "settlements", kind: "Mesh" },
    ]);
  });
});

describe("shadow-pass material never re-keys per caster (webgpu10 c9 H1)", () => {
  // Renderer.renderObject's shadow branch: overrideMaterial.alphaTest = material.alphaTest.
  const casters = [0.5, 0, 0.3, 0, 0, 0.5].map((a) => { const m = new THREE.MeshStandardMaterial(); m.alphaTest = a; return m; });
  const frame = (scene: THREE.Scene, seen: number[]) => {
    const o = scene.overrideMaterial!;
    for (const c of casters) { o.alphaTest = c.alphaTest; seen.push(o.alphaTest); }
  };
  const shadowMat = () => Object.assign(new THREE.MeshBasicMaterial(), { isShadowPassMaterial: true });

  it("stock material bumps version on every cutout/solid flip (the defect)", () => {
    const scene = new THREE.Scene();
    scene.overrideMaterial = shadowMat();
    const v0 = scene.overrideMaterial.version;
    frame(scene, []);
    expect(scene.overrideMaterial.version).toBeGreaterThan(v0);
  });

  it("stabilised: version constant across frames, each caster sees its own alphaTest", () => {
    const scene = new THREE.Scene();
    stabiliseShadowPassMaterials(scene);
    scene.overrideMaterial = shadowMat();
    const seen: number[] = [];
    frame(scene, seen);
    const v = scene.overrideMaterial!.version;
    for (let i = 0; i < 3; i++) frame(scene, seen);
    expect(scene.overrideMaterial!.version).toBe(v);
    expect(seen.slice(0, casters.length)).toEqual(casters.map((c) => c.alphaTest));
    scene.overrideMaterial = null;
    expect(scene.overrideMaterial).toBeNull();
  });

  it("leaves non-shadow override materials stock", () => {
    const scene = new THREE.Scene();
    stabiliseShadowPassMaterials(scene);
    scene.overrideMaterial = new THREE.MeshBasicMaterial();
    const v0 = scene.overrideMaterial!.version;
    frame(scene, []);
    expect(scene.overrideMaterial!.version).toBeGreaterThan(v0);
  });
});
