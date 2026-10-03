import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { compileInBatches, precompileScene, precompileShadowVariants } from "./precompileScene";
import { SHADOW_CASTER_LAYER, stabiliseShadowPassMaterials } from "./shadowCasters";

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

  it("compiles the casters into every shadow map with the shadow-pass material, restoring the override", async () => {
    const scene = new THREE.Scene();
    stabiliseShadowPassMaterials(scene);
    const pass = Object.assign(new THREE.MeshBasicMaterial(), { isShadowPassMaterial: true });
    scene.overrideMaterial = pass; scene.overrideMaterial = null;
    const maps = [new THREE.RenderTarget(2, 2), new THREE.RenderTarget(2, 2)];
    for (const map of maps) {
      const light = new THREE.DirectionalLight(); light.castShadow = true;
      (light.shadow as unknown as { map: THREE.RenderTarget }).map = map; scene.add(light);
    }
    let bound: THREE.RenderTarget | null = null;
    const seen: { target: unknown; override: unknown; casterLayer: boolean }[] = [];
    const renderer = {
      getRenderTarget: () => bound, setRenderTarget: (t: THREE.RenderTarget | null) => { bound = t; },
      compileAsync: (_r: THREE.Object3D, cam: THREE.Camera, s?: THREE.Scene | null) => {
        seen.push({ target: bound, override: s?.overrideMaterial, casterLayer: cam.layers.isEnabled(SHADOW_CASTER_LAYER) });
        return Promise.resolve();
      },
    };
    expect(await precompileShadowVariants(renderer, scene, scene, 4)).toBe(2);
    expect(seen).toEqual(maps.map((target) => ({ target, override: pass, casterLayer: true })));
    expect(scene.overrideMaterial).toBe(null);
    expect(bound).toBe(null);
  });

  it("compileInBatches never has more than inFlight calls pending", async () => {
    let pending = 0, peak = 0;
    const renderer = { getRenderTarget: () => null, setRenderTarget: () => {}, compileAsync: () => {
      pending++; peak = Math.max(peak, pending);
      return new Promise<void>((r) => setTimeout(() => { pending--; r(); }, 1));
    } };
    const jobs = Array.from({ length: 20 }, () => ({ root: new THREE.Object3D(), target: null }));
    expect(await compileInBatches(renderer, new THREE.Scene(), new THREE.Camera(), jobs, 8)).toBe(20);
    expect(peak).toBe(8);
  });

  it("settles a compile that never resolves", async () => {
    const renderer = { getRenderTarget: () => null, setRenderTarget: () => {}, compileAsync: () => new Promise<unknown>(() => {}) };
    await expect(precompileScene(renderer, new THREE.Scene(), new THREE.PerspectiveCamera(), [null], 2, 10)).resolves.toBe(2);
  });
});
