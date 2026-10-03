/**
 * Vegetation wind harness (dev only; served by vite from wind-harness.html,
 * never built). Proves the wind patch (`game-core/fx/windSway.ts`) in seconds
 * on a software renderer instead of a province load:
 *
 *  1. DISPLACEMENT: a jungle stand (emergent canopy tree, tree fern, shrub,
 *     grass from flora-province-v1) is drawn at wind strength 0, 0.5 and 1
 *     (0, 6.5, 13 m/s) at one clock time; `changed` is the share of pixels
 *     that differ from the calm frame, per species and for the whole stand.
 *     `motion` compares two clock times 0.4 s apart at the same strength.
 *  2. COST: ms per frame of the whole stand, patched against unpatched (same
 *     meshes, same materials without the wind injection); the ratio is what
 *     to compare across shader versions on the same machine.
 *
 * Results land on `window.__WIND_HARNESS__` for scripts/probe-wind.mjs.
 */
import * as THREE from "three";
import { RenderTarget, type WebGPURenderer } from "three/webgpu";
import { createKitPartLoader, kitDecodersFor } from "@elder-souls/game-core/assets/kitLoader";
import { loadKitParts } from "@elder-souls/game-core/assets/loadKitParts";
import { KitCache } from "@elder-souls/game-core/settlement/kitCache";
import { createRenderer, requestedBackend } from "@elder-souls/game-core/render/createRenderer";
import { toNodeMaterial } from "@elder-souls/game-core/render/nodes/materialNodes";
import {
  applyWindSway,
  createWindUniforms,
  updateWindSway,
  WIND_TUNE_ATTRIBUTE,
} from "@elder-souls/game-core/fx/windSway";

declare global {
  interface Window { __WIND_HARNESS__?: unknown }
}

const W = 480;
const H = 270;
const STAND: { id: string; count: number; spacing: number; scale: number }[] = [
  { id: "composite:jungle/anvil-canopy-tree", count: 9, spacing: 22, scale: 1 },
  { id: "tropical:plants/tropical/manfern", count: 25, spacing: 9, scale: 1 },
  { id: "bmv:landscape/trees/ztgorsebush02lightyellow", count: 36, spacing: 6, scale: 1 },
  { id: "bmv:vvardenfell/flora/algrass03b", count: 400, spacing: 2.2, scale: 1 },
];
const GUSTINESS = 0.6;

async function main(): Promise<void> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  document.body.appendChild(canvas);
  // ?renderer=webgl|webgpu, as every harness (decision 0111)
  const renderer: WebGPURenderer = await createRenderer({
    canvas, antialias: false, shaderBuildsInFlight: 0,
    backend: requestedBackend(window.location.search, Boolean((navigator as { gpu?: unknown }).gpu)),
  });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  const target = new RenderTarget(W, H, { depthBuffer: true });
  const kit = await (await fetch("/kits/flora-province-v1.kit.json")).json() as {
    assets: { id: string; node: string; sizeM: number[] }[];
  };
  const decoders = kitDecodersFor(renderer, "/");
  const loader = createKitPartLoader(decoders);
  const gltf = await loadKitParts("flora-province-v1", "all", { baseUrl: "/", kitCache: new KitCache(), loader });
  gltf.scene.updateMatrixWorld(true);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87a0b8);
  scene.add(new THREE.HemisphereLight(0xdde8ff, 0x445533, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 2.0);
  sun.position.set(30, 60, 20);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(55, W / H, 0.5, 600);
  camera.position.set(0, 9, 48);
  camera.lookAt(0, 12, 0);

  const wind = createWindUniforms();
  const species: { id: string; patched: THREE.Group; plain: THREE.Group }[] = [];
  for (const s of STAND) {
    const asset = kit.assets.find((a) => a.id === s.id);
    if (!asset) throw new Error(`no asset ${s.id}`);
    let node: THREE.Object3D | undefined;
    gltf.scene.traverse((o) => { if (!node && (o.name === asset.node || o.userData.name === asset.node)) node = o; });
    if (!node) throw new Error(`no node ${asset.node}`);
    const inv = node.matrixWorld.clone().invert();
    const side = Math.ceil(Math.sqrt(s.count));
    const matrices: THREE.Matrix4[] = [];
    for (let i = 0; i < s.count; i++) {
      const gx = (i % side) - (side - 1) / 2;
      const gz = Math.floor(i / side) - (side - 1) / 2;
      const yaw = (i * 2.399) % (Math.PI * 2);
      matrices.push(new THREE.Matrix4().compose(
        new THREE.Vector3(gx * s.spacing, 0, gz * s.spacing - 10),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
        new THREE.Vector3(s.scale, s.scale, s.scale)));
    }
    const tune = new Float32Array(s.count * 3);
    for (let i = 0; i < s.count; i++) tune[i * 3 + 2] = asset.sizeM[2] * s.scale;
    const patched = new THREE.Group();
    const plain = new THREE.Group();
    node.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const geo = mesh.geometry.clone();
      geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld));
      geo.setAttribute(WIND_TUNE_ATTRIBUTE, new THREE.InstancedBufferAttribute(tune, 3));
      for (const [group, patch] of [[patched, true], [plain, false]] as const) {
        const material = toNodeMaterial((mesh.material as THREE.Material).clone());
        if (patch) applyWindSway(material, wind);
        const inst = new THREE.InstancedMesh(geo, material, s.count);
        matrices.forEach((m, i) => inst.setMatrixAt(i, m));
        inst.frustumCulled = false;
        group.add(inst);
      }
    });
    scene.add(patched, plain);
    species.push({ id: s.id, patched, plain });
  }

  /** Render into the harness target and read it back (RGBA8); awaiting the
   * read also waits for the frame to finish. */
  const read = async (w: number, h: number): Promise<Uint8Array> => {
    renderer.setOutputRenderTarget(target);
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    const px = await renderer.readRenderTargetPixelsAsync(target, 0, 0, w, h);
    renderer.setRenderTarget(null);
    renderer.setOutputRenderTarget(null);
    return new Uint8Array(px.buffer, px.byteOffset, px.byteLength);
  };
  const pixels = (): Promise<Uint8Array> => read(W, H);
  const changed = (a: Uint8Array, b: Uint8Array): number => {
    let n = 0;
    for (let i = 0; i < a.length; i += 4) {
      if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 24) n++;
    }
    return +(n / (W * H)).toFixed(4);
  };
  const setWind = (strength: number, t: number): void =>
    updateWindSway(wind, t, { windDirXZ: [1, 0], windSpeedMS: 13 * strength, gustiness: GUSTINESS }, camera.position);
  const show = (only: string | null, patched: boolean): void => {
    for (const s of species) {
      s.patched.visible = patched && (only === null || only === s.id);
      s.plain.visible = !patched && (only === null || only === s.id);
    }
  };

  const displacement: Record<string, Record<string, number>> = {};
  for (const only of [null, ...species.map((s) => s.id)]) {
    show(only, true);
    setWind(0, 3); const calm = await pixels();
    setWind(0.5, 3); const half = await pixels();
    setWind(1, 3); const full = await pixels();
    setWind(1, 3.4); const later = await pixels();
    displacement[only ?? "stand"] = {
      "0.5": changed(calm, half), "1": changed(calm, full), motion: changed(full, later),
    };
  }

  const time = async (patched: boolean): Promise<number> => {
    show(null, patched);
    setWind(1, 0); await pixels(); // compile + warm
    const frames = 20;
    const t0 = performance.now();
    for (let f = 0; f < frames; f++) {
      setWind(1, f / 30);
      await read(1, 1); // forces the frame to finish
    }
    return (performance.now() - t0) / frames;
  };
  await time(true); await time(false);
  // Alternate and keep the best of three: SwiftShader timings jitter.
  let patchedMs = Infinity, plainMs = Infinity;
  for (let r = 0; r < 3; r++) { patchedMs = Math.min(patchedMs, await time(true)); plainMs = Math.min(plainMs, await time(false)); }
  window.__WIND_HARNESS__ = {
    done: true, displacement,
    cost: { patchedMs: +patchedMs.toFixed(1), plainMs: +plainMs.toFixed(1), ratio: +(patchedMs / plainMs).toFixed(3) },
  };
}

main().catch((e) => { window.__WIND_HARNESS__ = { done: true, error: String(e?.stack ?? e) }; });
