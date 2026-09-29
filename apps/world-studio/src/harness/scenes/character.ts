/**
 * Harness scene "character": the actor colouring (`applyAppearance`: the
 * FaceGen RGB overlay as a node twin on a SKINNED mesh, so the colour slot is
 * proven to compose with skinning, and the plain multiply on a second mesh)
 * and the off-hand glow (`createGlowMaterial`, the additive torch-flame
 * material OffHandItem mounts; built outside React). Noon light.
 * `frame(t)` bends the skinned mesh's bone and flickers the glow.
 */
import * as THREE from "three";
import { MeshStandardNodeMaterial, type WebGPURenderer } from "three/webgpu";
import { applyAppearance } from "@elder-souls/game-core/actors/appearance";
import { createGlowMaterial } from "@elder-souls/character";

interface HarnessContext {
  renderer: WebGPURenderer;
  backend: "webgpu" | "webgl";
  width: number;
  height: number;
}

/** A two-bone skinned cylinder named like a body mesh. */
function skinnedBody(): { mesh: THREE.SkinnedMesh; bend: THREE.Bone } {
  const height = 2;
  const geometry = new THREE.CylinderGeometry(0.35, 0.4, height, 16, 8).translate(0, height / 2, 0);
  const position = geometry.getAttribute("position");
  const indices: number[] = [];
  const weights: number[] = [];
  for (let i = 0; i < position.count; i++) {
    const w = Math.min(1, Math.max(0, position.getY(i) / height));
    indices.push(0, 1, 0, 0);
    weights.push(1 - w, w, 0, 0);
  }
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(indices, 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weights, 4));
  const root = new THREE.Bone();
  const bend = new THREE.Bone();
  bend.position.y = height / 2;
  root.add(bend);
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial({ color: 0xd9b89a, roughness: 0.8 }));
  mesh.name = "Body";
  mesh.add(root);
  mesh.bind(new THREE.Skeleton([root, bend]));
  mesh.castShadow = true;
  return { mesh, bend };
}

export default {
  name: "character",
  async build(ctx: HarnessContext) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9cc4e4);
    scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x5a4a30, 0.9));
    const sun = new THREE.DirectionalLight(0xfff2dd, 2.6);
    sun.position.set(4, 10, 6);
    sun.castShadow = true;
    scene.add(sun);
    ctx.renderer.shadowMap.enabled = true;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20).rotateX(-Math.PI / 2),
      new MeshStandardNodeMaterial({ color: 0x6b7a4a }),
    );
    ground.receiveShadow = true;
    scene.add(ground);

    const actor = new THREE.Group();
    const { mesh: body, bend } = skinnedBody();
    actor.add(body);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }));
    hair.name = "Hair";
    hair.position.set(1.2, 1.4, 0);
    actor.add(hair);
    scene.add(actor);
    applyAppearance(actor, {
      skinTint: [0.55, 0.42, 0.33],
      hairTint: [0.2, 0.12, 0.06],
      skinMeshes: ["Body"],
      hairMeshes: ["Hair"],
      skinTintMode: "skyrim-rgb-tint",
    });

    // The torch flame: vertex-coloured (rgba) quad cross with the glow material.
    const flameGeo = new THREE.PlaneGeometry(0.4, 0.8, 1, 2);
    const colors = new Float32Array(flameGeo.getAttribute("position").count * 4);
    for (let i = 0; i < colors.length / 4; i++) colors.set([1, 0.6, 0.2, i < 2 ? 0.2 : 1], i * 4);
    flameGeo.setAttribute("color", new THREE.BufferAttribute(colors, 4));
    const flameMap = new THREE.DataTexture(new Uint8Array([255, 230, 180, 255]), 1, 1);
    flameMap.needsUpdate = true;
    const glow = createGlowMaterial(flameMap);
    const flame = new THREE.Group();
    for (const yaw of [0, Math.PI / 2]) {
      const quad = new THREE.Mesh(flameGeo, glow.material);
      quad.rotation.y = yaw;
      flame.add(quad);
    }
    flame.position.set(-1.2, 1.4, 0);
    scene.add(flame);

    const camera = new THREE.PerspectiveCamera(45, ctx.width / ctx.height, 0.1, 100);
    camera.position.set(0, 1.6, 5);
    camera.lookAt(0, 1, 0);
    return {
      scene,
      camera,
      frame(t: number) {
        bend.rotation.z = 0.5 * Math.sin(t);
        glow.intensity.value = 0.75 + 0.25 * Math.sin(t * 7);
      },
    };
  },
};
