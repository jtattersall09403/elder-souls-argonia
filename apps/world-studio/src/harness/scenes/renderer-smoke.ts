/**
 * Harness renderer smoke test (decision 0109): proves the page, the renderer
 * and the runner end to end. A lit node-material cube casts a shadow on a
 * plane under a noon sun, with one point light; nothing subsystem-specific.
 * (Named apart from "smoke", which is the settlement chimney-smoke scene.)
 */
import * as THREE from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import type { HarnessScene } from "../types";

const rendererSmoke: HarnessScene = {
  name: "renderer-smoke",
  build({ width, height }) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x6f8fb0);
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    camera.position.set(4, 3.2, 5);
    camera.lookAt(0, 0.5, 0);

    const cube = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 1.2, 1.2),
      new MeshStandardNodeMaterial({ color: 0xb04a2a, roughness: 0.6, metalness: 0 }),
    );
    cube.position.y = 0.8;
    cube.castShadow = true;
    scene.add(cube);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 12),
      new MeshStandardNodeMaterial({ color: 0x8a8a78, roughness: 0.95 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const sun = new THREE.DirectionalLight(0xfff4e0, 2.6);
    sun.position.set(3, 8, 2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -6; sun.shadow.camera.right = 6;
    sun.shadow.camera.top = 6; sun.shadow.camera.bottom = -6;
    scene.add(sun);
    scene.add(new THREE.HemisphereLight(0xbcd4ff, 0x3a3428, 0.6));

    const point = new THREE.PointLight(0xffa040, 6, 8, 2);
    point.position.set(-1.5, 1.2, 1.2);
    scene.add(point);

    return {
      scene,
      camera,
      frame(t) { cube.rotation.y = 0.6 + t; },
    };
  },
};

export default rendererSmoke;
