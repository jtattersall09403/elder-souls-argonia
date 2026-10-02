import * as THREE from "three";
import { describe, expect, it } from "vitest";
// three's own per-render light state: the version a lit material's program is
// checked against on every draw (WebGLRenderer needsProgramChange).
import { WebGLLights } from "three/src/renderers/webgl/WebGLLights.js";
import { BLOOM_SOURCE_LAYER } from "../../render/post/BloomPass";
import { lightEveryLayer } from "./lightLayers";
import { OVERLAY_LAYER, PRECIP_LAYER, WATER_LAYER } from "./waterMaterial";

/** The water pipeline's render() sequence of one frame, as camera masks. */
const PASS_MASKS = [1, 1 << WATER_LAYER, 1 << PRECIP_LAYER, 1 << OVERLAY_LAYER, 1 << BLOOM_SOURCE_LAYER];

function versionsOverFrames(scene: THREE.Scene, frames: number): number[] {
  const lights = new WebGLLights({ has: () => true } as unknown as ConstructorParameters<typeof WebGLLights>[0]);
  const all: THREE.Light[] = [];
  scene.traverse((o) => { if ((o as THREE.Light).isLight) all.push(o as THREE.Light); });
  const cam = new THREE.Layers();
  const versions: number[] = [];
  for (let f = 0; f < frames; f++) {
    for (const mask of PASS_MASKS) {
      cam.mask = mask;
      lights.setup(all.filter((l) => l.layers.test(cam)));
      versions.push(lights.state.version);
    }
  }
  return versions;
}

function litScene(): THREE.Scene {
  const scene = new THREE.Scene();
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.castShadow = true;
  scene.add(sun, new THREE.HemisphereLight(0xffffff, 0x444444, 1));
  return scene;
}

describe("lightEveryLayer", () => {
  it("keeps three's lights-state version fixed over the pipeline's passes", () => {
    const scene = litScene();
    lightEveryLayer(scene);
    const v = versionsOverFrames(scene, 4);
    expect(new Set(v).size).toBe(1);
  });

  it("the old water-layer-only rule bumped it every pass change (the defect)", () => {
    const scene = litScene();
    scene.traverse((o) => { if ((o as THREE.Light).isLight) o.layers.enable(WATER_LAYER); });
    const v = versionsOverFrames(scene, 4);
    expect(new Set(v).size).toBeGreaterThan(4);
  });
});
