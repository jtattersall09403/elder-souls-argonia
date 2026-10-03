import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { precompileScene } from "./precompileScene";

describe("precompileScene", () => {
  it("compiles every target from six headings around the camera, each against its target, and restores the bound target", async () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 1.5, 0.1, 1000);
    const water = new THREE.RenderTarget(4, 4, { samples: 4 });
    const own = new THREE.RenderTarget(1, 1);
    let bound: THREE.RenderTarget | null = own;
    const seen: { target: THREE.RenderTarget | null; yaw: number }[] = [];
    const renderer = {
      getRenderTarget: () => bound,
      setRenderTarget: (t: THREE.RenderTarget | null) => { bound = t; },
      compileAsync: (_s: THREE.Object3D, cam: THREE.Camera) => {
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
        seen.push({ target: bound, yaw: Math.round(THREE.MathUtils.radToDeg(Math.atan2(-fwd.x, -fwd.z)) + 360) % 360 });
        return Promise.resolve();
      },
    };
    const n = await precompileScene(renderer, scene, camera, [water, null]);
    expect(n).toBe(12);
    expect(bound).toBe(own);
    expect(new Set(seen.map((s) => s.yaw))).toEqual(new Set([0, 60, 120, 180, 240, 300]));
    expect(seen.filter((s) => s.target === water)).toHaveLength(6);
    expect(camera.quaternion.equals(new THREE.Quaternion())).toBe(true); // the real camera never moved
  });

  it("settles a compile that never resolves", async () => {
    const renderer = { getRenderTarget: () => null, setRenderTarget: () => {}, compileAsync: () => new Promise<unknown>(() => {}) };
    await expect(precompileScene(renderer, new THREE.Scene(), new THREE.PerspectiveCamera(), [null], 2, 10)).resolves.toBe(2);
  });
});
