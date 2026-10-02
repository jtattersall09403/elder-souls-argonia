/**
 * Shared builder for the settlement harness scenes (settlement-day,
 * settlement-night; decision 0111): REAL kit pieces from the published mud
 * kit (public/kits/settlement-mud-v1), loaded through the settlement kit
 * loader (assets/kitLoader createKitLoader + settlement/kit
 * buildArchitectureKit, which converts each glTF material to its node twin
 * once) and drawn the way SettlementLayer draws a batch: one merged mesh
 * (`mergeTransformedGeometry`, with the ground-line attribute) with the material
 * through `prepareSettlementMaterial`. Night adds the lanterns' fixture
 * lights through the scene's FixtureLightField (the same `fixtureFromPiece`
 * position, colour and radius, candela), lit by the renderer's
 * fixture lighting (`installFixtureLighting`).
 *
 * `?lighting=field|tiled|plain` overrides the lighting mode and `?bench=N`
 * renders N timed frames after the harness frames and publishes
 * `window.__FIXTURE_BENCH__` (driver: packages/game-core/src/render/fixtureLights/harness/run.mjs).
 */
import * as THREE from "three";
import { MeshStandardNodeMaterial, type WebGPURenderer } from "three/webgpu";
import { createKitDecoders, createKitLoader } from "@elder-souls/game-core/assets/kitLoader";
import { buildArchitectureKit, kitAssetMetaFromManifest, type ArchitecturePart } from "@elder-souls/game-core/settlement/kit";
import {
  createSettlementMaterialUniforms,
  isSettlementGlowMaterial,
  prepareSettlementMaterial,
} from "@elder-souls/game-core/settlement/materials";
import { mergeTransformedGeometry } from "@elder-souls/game-core/settlement/lod";
import { fixtureFromPiece } from "@elder-souls/game-core/settlement/lighting";
import {
  FIXTURE_LIGHTS_MAX,
  fixtureLightFieldOf,
  installFixtureLighting,
  type FixtureLightingMode,
} from "@elder-souls/game-core/render/fixtureLights/index";
import type { HarnessBuilt, HarnessContext } from "./types";

const KIT = "settlement-mud-v1";
const HUT = "mudmother:gv_meshes/argoniannest/mudhut01";
const HUT_BMV = "bmv:architecture/huts/exterior/hutexterior";
const PLATFORM = "mudmother:gv_meshes/argoniannest/argonianplatform";
const FENCE = "mudmother:gv_meshes/argoniannest/argonianfence01";
const LANTERN = "mudmother:gv_meshes/argoniannest/argonianlanterns03";
/** argonianlanterns03 is a hanging piece: its origin is the hook and it
 * hangs 2.15 m down, its flame 2.57 m below the hook. Hung at 4.5 m, the
 * flame sits about 1.9 m above the ground. */
const LANTERN_HANG_Y = 4.5;

/** The bench result the bench runner reads. */
export interface FixtureBench {
  mode: FixtureLightingMode;
  backend: "webgpu" | "webgl";
  lamps: number;
  frames: number;
  cpuMsPerFrame: number;
  /** GPU ms per frame from the renderer's timestamp queries; null when the adapter has none. */
  gpuMsPerFrame: number | null;
  drawCalls: number;
}

declare global {
  interface Window { __FIXTURE_BENCH__?: FixtureBench | { error: string } }
}

interface Placed { assetId: string; matrix: THREE.Matrix4 }

function at(x: number, z: number, yawDeg = 0, y = 0): THREE.Matrix4 {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(yawDeg)),
    new THREE.Vector3(1, 1, 1));
}

/** The settlement: 3 x 3 huts on a 16 m grid with platforms between, a
 * fence run, and 100 lanterns on a ring and down the lanes. */
function layout(): { pieces: Placed[]; lanterns: THREE.Matrix4[] } {
  const pieces: Placed[] = [];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const x = (i - 1) * 16; const z = (j - 1) * 16;
      pieces.push({ assetId: (i + j) % 2 ? HUT_BMV : HUT, matrix: at(x, z, (i * 3 + j) * 40) });
      if (i < 2) pieces.push({ assetId: PLATFORM, matrix: at(x + 8, z + 4, 90) });
    }
  }
  for (let k = 0; k < 8; k++) pieces.push({ assetId: FENCE, matrix: at(-26 + k * 3.2, 26, 0) });
  const lanterns: THREE.Matrix4[] = [];
  // 100 lamps: 40 on a 30 m ring, 60 along the lanes between the huts
  for (let k = 0; k < 40; k++) {
    const a = (k / 40) * Math.PI * 2;
    lanterns.push(at(Math.cos(a) * 30, Math.sin(a) * 30, (a * 180) / Math.PI, LANTERN_HANG_Y));
  }
  for (let k = 0; k < 60; k++) {
    const lane = k % 4; const t = Math.floor(k / 4);
    const x = lane < 2 ? (lane === 0 ? -8 : 8) : -24 + t * 3.4;
    const z = lane < 2 ? -24 + t * 3.4 : (lane === 2 ? -8 : 8);
    lanterns.push(at(x + 2.2, z + 2.2, k * 17, LANTERN_HANG_Y));
  }
  return { pieces, lanterns: lanterns.slice(0, FIXTURE_LIGHTS_MAX) };
}

export async function buildSettlementScene(ctx: HarnessContext, night: boolean): Promise<HarnessBuilt> {
  const { renderer, width, height, backend } = ctx;
  const params = new URLSearchParams(window.location.search);
  const asked = params.get("lighting");
  const mode = installFixtureLighting(renderer,
    asked === "field" || asked === "tiled" || asked === "plain" ? asked : undefined);

  const base = import.meta.env.BASE_URL ?? "/";
  const decoders = createKitDecoders(renderer as WebGPURenderer, base);
  const loader = createKitLoader(decoders);
  const [gltf, manifest] = await Promise.all([
    loader.loadAsync(`${base}kits/${KIT}.glb`),
    fetch(`${base}kits/${KIT}.kit.json`).then((r) => r.json()),
  ]);
  const kit = buildArchitectureKit(gltf);
  const meta = kitAssetMetaFromManifest(manifest, KIT);

  // the game's night exposure (fire.ts FIRE_NIGHT, 22): the lamps' 6 cd are
  // calibrated against it; the day keeps exposure 1 with its unit sun
  renderer.toneMappingExposure = night ? 22 : 1;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(night ? 0x000102 : 0x8fb4d8);
  const uniforms = createSettlementMaterialUniforms();
  uniforms.esSettlementNight.value = night ? 1 : 0;
  uniforms.esSettlementRain.value = night ? 0 : 0.3;

  // ground: 10 m tiles, as terrain tiles are (the field picks lamps per
  // object; terrain objects take 16, their material's esFixtureLightsPerObject)
  const groundMaterial = new MeshStandardNodeMaterial({ color: 0x5b5242, roughness: 0.95 });
  groundMaterial.userData.esFixtureLightsPerObject = 16;
  const tile = new THREE.PlaneGeometry(10, 10).rotateX(-Math.PI / 2);
  // 70 m square: the lamp ring (30 m) and its 6-7 m reach
  for (let i = 0; i < 7; i++) {
    for (let j = 0; j < 7; j++) {
      const ground = new THREE.Mesh(tile, groundMaterial);
      ground.position.set(-30 + i * 10, 0, -30 + j * 10);
      ground.receiveShadow = true;
      scene.add(ground);
    }
  }

  const { pieces, lanterns } = layout();
  const all: Placed[] = [...pieces, ...lanterns.map((matrix) => ({ assetId: LANTERN, matrix }))];
  // one merged mesh per (asset, part, 16 m cell), as the layer's per-cell
  // buckets are (the field picks lamps per drawn object)
  const byPart = new Map<string, { part: ArchitecturePart; matrices: THREE.Matrix4[] }>();
  for (const placed of all) {
    const asset = kit.get(placed.assetId);
    if (!asset) throw new Error(`harness: ${KIT} has no asset ${placed.assetId}`);
    asset.levels[0].forEach((part, i) => {
      const e = placed.matrix.elements;
      const key = `${placed.assetId}#${i}@${Math.floor(e[12] / 16)},${Math.floor(e[14] / 16)}`;
      let bucket = byPart.get(key);
      if (!bucket) { bucket = { part, matrices: [] }; byPart.set(key, bucket); }
      bucket.matrices.push(placed.matrix.clone().multiply(part.localMatrix));
    });
  }
  for (const { part, matrices } of byPart.values()) {
    const material = part.material;
    const flags = prepareSettlementMaterial(material, uniforms, isSettlementGlowMaterial(material), false);
    const geometry = mergeTransformedGeometry(part.geometry, matrices, matrices.map(() => 0));
    if (!geometry) continue;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = flags.castShadow; mesh.receiveShadow = true;
    mesh.renderOrder = flags.renderOrder;
    scene.add(mesh);
  }

  // sun or a faint moon (unlit ground reads just above black at exposure 22), and sky fill
  const key = new THREE.DirectionalLight(night ? 0x8aa0c8 : 0xfff2dd, night ? 0.008 : 3.0);
  key.position.set(30, night ? 40 : 60, 20);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 200 });
  scene.add(key, key.target);
  scene.add(new THREE.HemisphereLight(night ? 0x223355 : 0xbfd7ff, night ? 0x0a0806 : 0x4a3f30, night ? 0.004 : 0.8));

  // the lamps: the lantern pieces' own fixture lights, at full night
  const field = fixtureLightFieldOf(scene);
  const lantern = kit.get(LANTERN)!;
  const box = new THREE.Box3();
  for (const part of lantern.levels[0]) {
    part.geometry.computeBoundingBox();
    box.union(part.geometry.boundingBox!.clone().applyMatrix4(part.localMatrix));
  }
  const fixtures = night ? lanterns.map((m, i) => fixtureFromPiece(`lamp${i}`, meta.get(LANTERN), m, box)) : [];
  field.setLights(fixtures);
  fixtures.forEach((f, i) => field.setIntensity(i, f.colour, f.candela));
  field.commit();

  const camera = new THREE.PerspectiveCamera(55, width / height, 0.3, 500);
  camera.position.set(-34, 14, -38);
  camera.lookAt(2, 0, 4);
  camera.updateMatrixWorld();

  const benchFrames = Number(params.get("bench")) || 0;
  if (benchFrames > 0) {
    // after the harness's own frames (build returns first): timed frames
    queueMicrotask(() => { void runBench(renderer as WebGPURenderer, scene, camera, mode, backend, fixtures.length, benchFrames); });
  }
  return { scene, camera };
}

async function runBench(
  renderer: WebGPURenderer, scene: THREE.Scene, camera: THREE.Camera, mode: FixtureLightingMode,
  backend: "webgpu" | "webgl", lamps: number, frames: number,
): Promise<void> {
  try {
    // wait for the harness to publish its result (its frames compile everything)
    while (!(window as { __HARNESS__?: { done?: boolean } }).__HARNESS__?.done) {
      await new Promise((r) => setTimeout(r, 50));
    }
    const target = new (await import("three/webgpu")).RenderTarget(512, 288, { depthBuffer: true });
    renderer.setRenderTarget(target);
    const backendObj = (renderer as unknown as { backend: { trackTimestamp: boolean } }).backend;
    // WebGL on SwiftShader has no timer query: its resolve never settles
    const timed = backend === "webgpu";
    backendObj.trackTimestamp = timed;
    let cpu = 0; let gpu = 0; let gpuFrames = 0; let calls = 0;
    for (let i = 0; i < frames + 2; i++) {
      renderer.info.reset();
      const t0 = performance.now();
      renderer.render(scene, camera);
      const dt = performance.now() - t0;
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      let ts: number | null = null;
      if (timed) {
        try {
          await renderer.resolveTimestampsAsync("render");
          const v = renderer.info.render.timestamp;
          ts = typeof v === "number" && v > 0 ? v : null;
        } catch { ts = null; }
      }
      if (i < 2) continue; // warm-up
      cpu += dt; calls = renderer.info.render.drawCalls;
      if (ts !== null) { gpu += ts; gpuFrames += 1; }
    }
    target.dispose();
    window.__FIXTURE_BENCH__ = {
      mode, backend, lamps, frames,
      cpuMsPerFrame: Math.round((cpu / frames) * 100) / 100,
      gpuMsPerFrame: gpuFrames ? Math.round((gpu / gpuFrames) * 100) / 100 : null,
      drawCalls: calls,
    };
  } catch (e) {
    window.__FIXTURE_BENCH__ = { error: String(e) };
  }
}
