/**
 * Harness scene "smoke": the settlement chimney smoke (`SmokeColumns`, a
 * MeshBasicNodeMaterial with the night dim in its colour slot) over three
 * chimneys at the three ladder distances. The puff atlas is fetched from the
 * published works-v1 manifest when the studio serves it; a procedural
 * soft disc stands in otherwise (harness only, never shipped).
 * `frame(t)` advances the puffs, drifts them on the wind and cycles night.
 */
import * as THREE from "three";
import { MeshStandardNodeMaterial, type WebGPURenderer } from "three/webgpu";
import {
  effectTextureFile, SMOKE_COLUMN_ASSET_ID, SmokeColumns,
} from "@elder-souls/game-core/settlement/smokeColumn";

interface HarnessContext {
  renderer: WebGPURenderer;
  backend: "webgpu" | "webgl";
  width: number;
  height: number;
}

async function smokeTexture(): Promise<THREE.Texture> {
  try {
    const manifest = await (await fetch("kits/works-v1/manifest.json")).json();
    const file = effectTextureFile(manifest, SMOKE_COLUMN_ASSET_ID, "works-v1");
    const texture = await new THREE.TextureLoader().loadAsync(`kits/${file}`);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  } catch {
    const size = 64;
    const pixels = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const d = Math.hypot(((x % 16) - 7.5) / 8, ((y % 16) - 7.5) / 8);
        const a = Math.max(0, 1 - d) * 255;
        pixels.set([200, 200, 200, a], (y * size + x) * 4);
      }
    }
    const texture = new THREE.DataTexture(pixels, size, size);
    texture.needsUpdate = true;
    return texture;
  }
}

export default {
  name: "smoke",
  async build(ctx: HarnessContext) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9cc4e4);
    scene.fog = new THREE.Fog(0x9cc4e4, 60, 220);
    scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x5a4a30, 1));
    const sun = new THREE.DirectionalLight(0xfff2dd, 2.5);
    sun.position.set(20, 60, 10);
    scene.add(sun);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2),
      new MeshStandardNodeMaterial({ color: 0x6b7a4a }),
    );
    scene.add(ground);
    const houses = [new THREE.Vector3(0, 6, -20), new THREE.Vector3(-15, 6, -60), new THREE.Vector3(20, 6, -110)];
    for (const at of houses) {
      const house = new THREE.Mesh(new THREE.BoxGeometry(6, 6, 6),
        new MeshStandardNodeMaterial({ color: 0x8a6d4b }));
      house.position.set(at.x, 3, at.z);
      scene.add(house);
    }
    const night = { value: 0 };
    const smoke = new SmokeColumns(await smokeTexture(), night);
    smoke.setAnchors(houses.map((position, i) => ({ id: `harness.smoke.${i}`, position })));
    scene.add(smoke.mesh);
    const camera = new THREE.PerspectiveCamera(55, ctx.width / ctx.height, 0.5, 500);
    camera.position.set(0, 8, 10);
    camera.lookAt(0, 8, -40);
    // The smoke sits on PRECIP_LAYER (drawn after water in the studio); the
    // harness camera sees every layer.
    camera.layers.enableAll();
    camera.updateMatrixWorld();
    smoke.update(0, camera, { dirXZ: [1, 0], speedMS: 3 });
    return {
      scene,
      camera,
      frame(t: number) {
        night.value = 0.5 + 0.5 * Math.sin(t * 0.2);
        smoke.update(t, camera, { dirXZ: [0.8, 0.6], speedMS: 3 });
      },
    };
  },
};
