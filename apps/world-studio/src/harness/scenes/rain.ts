/**
 * Harness scene "rain": the real rain streaks (weather/rainMaterial.ts, the
 * builder RainSystem mounts), both nested volumes, at a steady downpour over
 * a lit ground plane under an overcast sky.
 */
import * as THREE from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import type { HarnessContext, HarnessScene } from "../types";
import { PRECIP_LAYER } from "@elder-souls/game-core/water/render/waterMaterial";
import { createRainStreaks } from "../../weather/rainMaterial";


const harnessScene: HarnessScene = {
  name: "rain",
  async build(ctx: HarnessContext) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x59616b);
    const sun = new THREE.DirectionalLight(0xdfe6ee, 1.5);
    sun.position.set(20, 40, 10);
    scene.add(sun, new THREE.HemisphereLight(0x9aa6b4, 0x2e2a24, 1));
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2),
      new MeshStandardNodeMaterial({ color: 0x4a4d3a, roughness: 1 }),
    );
    scene.add(ground);

    const camera = new THREE.PerspectiveCamera(60, ctx.width / ctx.height, 0.1, 1000);
    camera.position.set(0, 1.7, 0);
    camera.lookAt(0, 1.5, -10);
    camera.layers.enable(PRECIP_LAYER);

    // The same two volumes RainSystem mounts (core and far shell).
    const count = 12000;
    const volumes = [
      createRainStreaks({ count, extentM: 4096, span: new THREE.Vector3(72, 26, 72), opacityScale: 1 }),
      createRainStreaks({
        count: Math.round(count * 0.75), extentM: 4096, span: new THREE.Vector3(300, 60, 300), opacityScale: 0.85,
      }),
    ];
    const rain = 0.8;
    const windMS = 4;
    for (const v of volumes) {
      v.mesh.layers.set(PRECIP_LAYER);
      scene.add(v.mesh);
      const u = v.uniforms;
      u.uIntensity.value = rain;
      u.uWindV.value.set(0.35 * windMS, 0);
      u.uFall.value = 8 + 6 * rain + 0.12 * windMS;
      u.uPixelWorld.value = (2 * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(ctx.height, 1);
      u.uColor.value.setRGB(0.62, 0.66, 0.72);
    }
    const frame = (t: number) => {
      for (const v of volumes) v.uniforms.uTime.value = t;
    };
    frame(0);
    return { scene, camera, frame };
  },
};

export default harnessScene;
