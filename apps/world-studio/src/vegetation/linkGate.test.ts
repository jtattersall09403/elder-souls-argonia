import { describe, expect, it } from "vitest";
import * as THREE from "three";
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
});
