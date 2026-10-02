import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { DrawTargetLinker } from "@elder-souls/game-core/render/drawTargetLinker";
import { setLitPreparer } from "@elder-souls/game-core/render/fixtureLights/fixtureLightField";
import { holdUntilLinked } from "./linkGate";

describe("holdUntilLinked", () => {
  it("keeps a new rung mesh hidden until its link resolves", async () => {
    const mesh = new THREE.Mesh();
    let resolve!: () => void;
    const linked = new Promise<void>((r) => { resolve = r; });
    let linkedObject: THREE.Object3D | null = null;
    holdUntilLinked(mesh, (o) => { linkedObject = o; return linked; }, () => { mesh.visible = true; });
    expect(linkedObject).toBe(mesh);
    await Promise.resolve(); await Promise.resolve();
    expect(mesh.visible).toBe(false);
    resolve();
    await linked; await Promise.resolve();
    expect(mesh.visible).toBe(true);
  });

  it("shows the mesh when the link fails, so a rung never stays dark", async () => {
    const mesh = new THREE.Mesh();
    holdUntilLinked(mesh, () => { throw new Error("lost context"); }, () => { mesh.visible = true; });
    await Promise.resolve(); await Promise.resolve();
    expect(mesh.visible).toBe(true);
  });

  it("shows the mesh after the settle timeout when compileAsync never settles (perf10 diag 6 C1b)", async () => {
    const scene = new THREE.Scene();
    setLitPreparer(scene, () => undefined);
    // three 0.184: a material with no currentProgram throws inside compileAsync's
    // setTimeout, so its promise never settles.
    const gl = {
      getRenderTarget: () => null, setRenderTarget: () => undefined,
      compileAsync: () => new Promise(() => undefined),
    } as unknown as THREE.WebGLRenderer;
    const linker = new DrawTargetLinker(gl, scene, 4000, 20);
    const camera = new THREE.PerspectiveCamera();
    const mesh = new THREE.Mesh();
    holdUntilLinked(mesh, (object) => linker.link({ object }, camera), () => { mesh.visible = true; });
    await new Promise((r) => setTimeout(r, 5));
    expect(mesh.visible).toBe(false);
    await new Promise((r) => setTimeout(r, 40));
    expect(mesh.visible).toBe(true);
    linker.detach();
  });
});
