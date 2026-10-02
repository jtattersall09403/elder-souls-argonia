import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { installDrawPatcher } from "./drawPatcher";

describe("installDrawPatcher (perf10 f3: patch before the first draw, no scene walk)", () => {
  it("prepares each draw of its scene before the real draw, skips other scenes, uninstalls", () => {
    const order: string[] = [];
    const renderer = {
      renderBufferDirect: (_c: unknown, _s: unknown, _g: unknown, m: THREE.Material) => {
        order.push(`draw:${m.name}:${m.userData.patched ? "patched" : "unpatched"}`);
      },
    } as unknown as THREE.WebGLRenderer;
    const original = renderer.renderBufferDirect;
    const scene = new THREE.Scene();
    const material = new THREE.MeshStandardMaterial({ name: "m" });
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    const uninstall = installDrawPatcher(renderer, scene, (_o, m) => { m.userData.patched = true; order.push("prepare"); });
    const camera = new THREE.PerspectiveCamera();
    const none = null as never;
    renderer.renderBufferDirect(camera, scene, mesh.geometry, material, mesh, none);
    renderer.renderBufferDirect(camera, none, mesh.geometry, new THREE.MeshDepthMaterial({ name: "d" }), mesh, none);
    // the probe's measure: no draw of the scene reaches the renderer unpatched
    expect(order).toEqual(["prepare", "draw:m:patched", "draw:d:unpatched"]);
    uninstall();
    expect(renderer.renderBufferDirect).toBe(original);
  });
});
