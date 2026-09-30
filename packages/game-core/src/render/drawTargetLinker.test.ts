import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { DrawTargetLinker } from "./drawTargetLinker";

function fakeGl() {
  let bound: THREE.WebGLRenderTarget | null = null;
  const seen: (THREE.WebGLRenderTarget | null)[] = [];
  const gl = {
    getRenderTarget: () => bound,
    setRenderTarget: (t: THREE.WebGLRenderTarget | null) => { bound = t; },
    compileAsync: () => { seen.push(bound); return Promise.resolve(); },
  } as unknown as THREE.WebGLRenderer;
  return { gl, seen, bound: () => bound };
}

describe("DrawTargetLinker (review 2026-09-30: settlement pre-link keys)", () => {
  const camera = new THREE.PerspectiveCamera();
  const pass = (scene: THREE.Scene, target: THREE.WebGLRenderTarget | null) =>
    scene.onBeforeRender({} as never, scene, camera, target as never, undefined as never, undefined as never);

  it("links against a linear half-float target when the scene pass draws into the water target", async () => {
    const scene = new THREE.Scene();
    const { gl, seen, bound } = fakeGl();
    const linker = new DrawTargetLinker(gl, scene).attach();
    expect(linker.observed).toBe(false);
    const water = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
    water.texture.colorSpace = THREE.NoColorSpace;
    pass(scene, water);
    await linker.compileAsync(new THREE.Group(), camera);
    expect(linker.observed).toBe(true);
    expect(seen[0]).not.toBeNull();
    expect(seen[0]!.texture.type).toBe(THREE.HalfFloatType);
    expect(seen[0]!.texture.colorSpace).toBe(water.texture.colorSpace);
    expect(bound()).toBeNull(); // restored
    linker.detach();
  });

  it("links against the screen when the bare scene draws to the screen", async () => {
    const scene = new THREE.Scene();
    const { gl, seen } = fakeGl();
    const linker = new DrawTargetLinker(gl, scene).attach();
    pass(scene, null);
    await linker.compileAsync(new THREE.Group(), camera);
    expect(seen[0]).toBeNull();
    linker.detach();
    expect(scene.onBeforeRender).toBe(THREE.Scene.prototype.onBeforeRender);
  });
});
