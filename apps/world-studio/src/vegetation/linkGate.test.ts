import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { DrawTargetLinker, type LinkingRenderer } from "@elder-souls/game-core/render/drawTargetLinker";
import { setLitPreparer } from "@elder-souls/game-core/render/fixtureLights/fixtureLightField";
import { holdUntilLinked } from "./linkGate";
import { setDrawCount } from "@elder-souls/game-core/vegetation/drawCount";

const instanced = () => new THREE.InstancedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial(), 4);
const flush = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };

describe("holdUntilLinked", () => {
  it("keeps a drawing mesh hidden until its link resolves, then applies its rule", async () => {
    const mesh = instanced();
    let resolve!: () => void;
    const linked = new Promise<void>((r) => { resolve = r; });
    const rule = () => mesh.count > 0;
    holdUntilLinked(mesh, () => linked, () => mesh, rule);
    setDrawCount(mesh, 3, rule);
    await flush();
    expect(mesh.visible).toBe(false);
    resolve();
    await flush();
    expect(mesh.visible).toBe(true);
  });

  it("CPU path: a link that resolves with count 0 leaves the mesh hidden", async () => {
    const mesh = instanced();
    mesh.count = 0;
    holdUntilLinked(mesh, () => Promise.resolve(), () => mesh, () => mesh.count > 0);
    await flush();
    expect(mesh.visible).toBe(false);
  });

  it("GPU path: registered shows on link, released stays hidden", async () => {
    const a = instanced();
    holdUntilLinked(a, () => Promise.resolve(), () => a, () => true);
    const b = instanced();
    holdUntilLinked(b, () => Promise.resolve(), () => b, () => false);
    await flush();
    expect(a.visible).toBe(true);
    expect(b.visible).toBe(false);
  });

  it("a failed link still lifts the hold, so a rung never stays dark", async () => {
    const mesh = instanced();
    mesh.count = 2;
    holdUntilLinked(mesh, () => { throw new Error("lost context"); }, () => mesh, () => mesh.count > 0);
    await flush();
    expect(mesh.visible).toBe(true);
  });

  it("shows the mesh after the settle timeout when compileAsync never settles (perf10 diag 6 C1b)", async () => {
    const scene = new THREE.Scene();
    setLitPreparer(scene, () => undefined);
    // a compile that never settles: the link settles on the timeout
    const gl = {
      getRenderTarget: () => null, setRenderTarget: () => undefined,
      compileAsync: () => new Promise(() => undefined),
    } as unknown as LinkingRenderer;
    const linker = new DrawTargetLinker(gl, scene, 4000, 20);
    const camera = new THREE.PerspectiveCamera();
    const mesh = new THREE.Mesh();
    holdUntilLinked(mesh, (object) => linker.link({ object }, camera), () => mesh, () => true);
    await new Promise((r) => setTimeout(r, 5));
    expect(mesh.visible).toBe(false);
    await new Promise((r) => setTimeout(r, 40));
    expect(mesh.visible).toBe(true);
    linker.detach();
  });
});
