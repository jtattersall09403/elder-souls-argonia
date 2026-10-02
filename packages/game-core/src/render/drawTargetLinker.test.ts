import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { DrawTargetLinker } from "./drawTargetLinker";
import { setLitPreparer } from "./fixtureLights/fixtureLightField";

function fakeGl() {
  let bound: THREE.WebGLRenderTarget | null = null;
  const seen: (THREE.WebGLRenderTarget | null)[] = [];
  const gl = {
    getRenderTarget: () => bound,
    setRenderTarget: (t: THREE.WebGLRenderTarget | null) => { bound = t; },
    compile: () => { seen.push(bound); return new Set(); },
    extensions: { has: () => true },
  } as unknown as THREE.WebGLRenderer;
  return { gl, seen, bound: () => bound };
}

describe("DrawTargetLinker (review 2026-09-30: settlement pre-link keys)", () => {
  const camera = new THREE.PerspectiveCamera();
  const pass = (scene: THREE.Scene, target: THREE.WebGLRenderTarget | null) =>
    scene.onBeforeRender({} as never, scene, camera, target as never, undefined as never, undefined as never);

  it("links against a linear half-float target when the scene pass draws into the water target", async () => {
    const scene = new THREE.Scene();
    setLitPreparer(scene, () => undefined);
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
    setLitPreparer(scene, () => undefined);
    const { gl, seen } = fakeGl();
    const linker = new DrawTargetLinker(gl, scene).attach();
    pass(scene, null);
    await linker.compileAsync(new THREE.Group(), camera);
    expect(seen[0]).toBeNull();
    linker.detach();
    expect(scene.onBeforeRender).toBe(THREE.Scene.prototype.onBeforeRender);
  });

  it("links late-drawn meshes once, only after the scene pass is seen (16k walk 10)", () => {
    const scene = new THREE.Scene();
    setLitPreparer(scene, () => undefined);
    const { gl, seen } = fakeGl();
    const linker = new DrawTargetLinker(gl, scene).attach();
    const queue: (() => void)[] = [];
    linker.linkWhenObserved([new THREE.Group(), new THREE.Group()], camera, 60_000, (f) => queue.push(f));
    queue.shift()!();
    expect(seen.length).toBe(0); // not observed yet: polls again
    expect(queue.length).toBe(1);
    pass(scene, null);
    queue.shift()!();
    expect(seen.length).toBe(2);
    expect(queue.length).toBe(0);
    const cancel = linker.linkWhenObserved([new THREE.Group()], camera, 60_000, (f) => queue.push(f));
    cancel();
    queue.shift()!();
    expect(seen.length).toBe(2);
    linker.detach();
  });

  // 16k walk 10 E3: warm and draw must compile the same program key, so the
  // sky's CSM preparer has run on the material by the time compileAsync runs.
  function csmGl() {
    const atCompile: (string | undefined)[] = [];
    const gl = {
      getRenderTarget: () => null,
      setRenderTarget: () => undefined,
      compile: (object: THREE.Mesh) => {
        atCompile.push((object.material as THREE.Material).defines?.USE_CSM as string | undefined);
        return new Set();
      },
      extensions: { has: () => true },
    } as unknown as THREE.WebGLRenderer;
    return { gl, atCompile };
  }

  it("a material disposed or left without a program mid-link leaves the wait, never throws (perf-diag9 E2)", async () => {
    const scene = new THREE.Scene();
    setLitPreparer(scene, () => undefined);
    const disposed = new THREE.MeshBasicMaterial(), regrown = new THREE.MeshBasicMaterial();
    const programs = new Map<THREE.Material, { isReady(): boolean } | undefined>([[disposed, { isReady: () => false }], [regrown, undefined]]);
    const gl = {
      getRenderTarget: () => null, setRenderTarget: () => undefined,
      compile: () => new Set([disposed, regrown]),
      properties: { get: (m: THREE.Material) => ({ currentProgram: programs.get(m) }) },
      extensions: { has: () => true },
    } as unknown as THREE.WebGLRenderer;
    const linker = new DrawTargetLinker(gl, scene, 4000, 10_000);
    const t0 = performance.now();
    const link = linker.link({ object: new THREE.Mesh() }, camera);
    setTimeout(() => disposed.dispose(), 25);
    await expect(link).resolves.toBeDefined();
    expect(performance.now() - t0).toBeLessThan(500); // settled by the dispose, not the 10 s timeout
  });
  const csmPreparer = (root: THREE.Object3D) => root.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | undefined;
    if (m) m.defines = { ...m.defines, USE_CSM: "" };
  });

  it("compiles with the lit preparer's patch (USE_CSM) applied, every material variant", async () => {
    const scene = new THREE.Scene();
    setLitPreparer(scene, csmPreparer);
    const { gl, atCompile } = csmGl();
    const linker = new DrawTargetLinker(gl, scene);
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial());
    await linker.link({ object: mesh, materials: [new THREE.MeshStandardMaterial(), new THREE.MeshStandardMaterial()] }, camera);
    expect(atCompile).toEqual(["", ""]);
  });

  it("a link asked before the preparer registers compiles only after registration", async () => {
    const scene = new THREE.Scene();
    const { gl, atCompile } = csmGl();
    const linker = new DrawTargetLinker(gl, scene, 60_000);
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial());
    const linking = linker.link({ object: mesh }, camera);
    await Promise.resolve();
    expect(atCompile.length).toBe(0);
    setLitPreparer(scene, csmPreparer);
    await linking;
    expect(atCompile).toEqual([""]);
  });
});
