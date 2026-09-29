/**
 * Harness scene "veg": the vegetation layer's REAL batch materials on the
 * studio's flora kit (decision 0111). The land kit GLB is loaded and
 * indexed by `buildFloraKit` (the loader `useFloraKit` uses), each species'
 * ladder comes from `speciesRings` + `lodLadder` + `cellRungs` exactly as
 * `Vegetation.tsx` builds it, and every rung × part is an InstancedMesh whose
 * material is `makeBatchMaterial` (the renderer's own: wind, LOD fade with the
 * temporal cross-fade, the from-zero shadow band on the casting mid rung,
 * batch data texture + occlusion mask) with a per-batch data texture written
 * by `writeBatchInstance`. Every copy is emitted into every rung, as the
 * renderer does, so the shader picks one rung per copy by distance.
 *
 * Placements are a fixed grid at near (8–30 m), mid (50–120 m) and far
 * (180–420 m) distances, not a province cell: the cell's gating and upload
 * paths are CPU code with their own unit tests; this page proves the node
 * graphs. The flora kit's impostor sidecar is installed as `useFloraKit`
 * does (`impostorPart` + `installImpostors`), so the mangrove's card rung IS
 * its octahedral impostor; a proof row of that rung with its band open from
 * 0 m stands at 22-40 m to the right, big enough on the sheet to judge (on
 * the ladder it only starts where the tree is under its texel height).
 * `frame(t)` drives the wind and walks the camera forward, pushing
 * the LOD history so the cross-fade runs.
 *
 * GPU cull (lane L9b): on the WebGPU backend every draw has a twin
 * registered with `GpuCullPool` exactly as `Vegetation.tsx` registers its
 * meshes (`addDraw` with `cullSphereOf` and the rung band through
 * `unionBand`, one `setCandidate` per copy with its data slot, `update` each
 * frame with the sun sweep). `&cull=gpu|cpu` picks the path drawn (default
 * gpu where supported); `&measure=1` renders both into the same target and
 * publishes the mean absolute pixel difference and CPU ms/frame of each
 * (`measureCullParity`: `window.__CULL_PARITY__` and a `[cull-parity]` line).
 */
import * as THREE from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { createKitDecoders, createKitLoader } from "@elder-souls/game-core/assets/kitLoader";
import { createWindUniforms, updateWindSway, windStiffness } from "@elder-souls/game-core/fx/windSway";
import {
  createLodFadeUniforms, createLodHistory, lodLadder, pushLodHistory,
} from "@elder-souls/game-core/fx/lodFade";
import {
  createBatchDataTexture, createBatchDataUniforms, writeBatchInstance,
} from "@elder-souls/game-core/fx/batchData";
import { cellRungs } from "@elder-souls/game-core/vegetation/cellBuild";
import { makeSlotGeometry } from "@elder-souls/game-core/vegetation/slotGeometry";
import {
  impostorPart, type ImpostorSidecar,
} from "@elder-souls/game-core/vegetation/impostor";
import {
  buildFloraKit, installImpostors, maxDrawDistance, speciesRings, type KitLevel, type KitManifest,
} from "../../vegetation/floraKit";
import { makeBatchMaterial } from "../../vegetation/batchMaterial";
import { castsShadowFor } from "../../vegetation/shadowRule";
import { GpuCullPool, cullSphereOf } from "@elder-souls/game-core/render/gpuCull/GpuCullPool";
import { sunSweepOf, unionBand } from "@elder-souls/game-core/render/gpuCull/cullMath";
import type { WebGPURenderer } from "three/webgpu";
import type { HarnessContext, HarnessScene } from "../types";

/** `&cull=` and `&measure` from the harness page URL. */
export function cullParams(): { cull: "gpu" | "cpu" | null; measure: boolean } {
  const q = new URLSearchParams(globalThis.location?.search ?? "");
  const c = q.get("cull");
  return { cull: c === "gpu" || c === "cpu" ? c : null, measure: q.has("measure") };
}

/**
 * Render the CPU path and the GPU-cull path of one scene into the harness's
 * target and publish their mean absolute pixel difference and CPU ms/frame
 * (step + render submit). SwiftShader: the ms are ratios only.
 */
export async function measureCullParity(
  name: string, renderer: WebGPURenderer, scene: THREE.Scene, camera: THREE.Camera,
  setPath: (p: "cpu" | "gpu") => void, step: () => void, frames = 10,
): Promise<void> {
  const device = (renderer as unknown as { backend: { device: GPUDevice } }).backend.device;
  const target = renderer.getRenderTarget();
  await renderer.compileAsync(scene, camera);
  const run = async (p: "cpu" | "gpu") => {
    setPath(p);
    for (let k = 0; k < 3; k++) {
      step();
      renderer.render(scene, camera);
      await device.queue.onSubmittedWorkDone();
    }
    let cpuMs = 0;
    for (let k = 0; k < frames; k++) {
      const t0 = performance.now();
      step();
      renderer.render(scene, camera);
      cpuMs += performance.now() - t0;
      await device.queue.onSubmittedWorkDone();
    }
    const w = target ? target.width : 0;
    const h = target ? target.height : 0;
    const px = target
      ? new Uint8Array((await renderer.readRenderTargetPixelsAsync(target, 0, 0, w, h)).buffer)
      : null;
    return { cpuMs: +(cpuMs / frames).toFixed(2), px };
  };
  const cpu = await run("cpu");
  const gpu = await run("gpu");
  let diff = 0;
  let over8 = 0;
  if (cpu.px && gpu.px) {
    for (let k = 0; k < cpu.px.length; k++) {
      const d = Math.abs(cpu.px[k] - gpu.px[k]);
      diff += d;
      if (d > 8) over8++;
    }
    diff /= cpu.px.length;
  }
  const metrics = {
    scene: name, pixelMAD: +diff.toFixed(4), channelsOver8: over8,
    cpuMsCpuPath: cpu.cpuMs, cpuMsGpuPath: gpu.cpuMs, target: target !== null,
  };
  (globalThis as unknown as { __CULL_PARITY__: unknown }).__CULL_PARITY__ = metrics;
  console.log(`[cull-parity] ${JSON.stringify(metrics)}`);
}

/** Species drawn: two trees with cards (the mangrove's card is its impostor), a folded shrub, a fern, a rock. */
const SPECIES = [
  "bmv:landscape/trees/gkbtreeaspen05jungle",
  "bmv:landscape/trees/mangrovereachtree0gkb2",
  "bmv:landscape/plants/espfernbraken04st",
  "bmv:landscape/plants/fern01",
  "vanilla:landscape/rocks/rockpiles02",
];
/** Tree draw distance used here (the renderer's `treeDrawDistance` at a 3-chunk ring of 512 m). */
const TREE_DRAW_M = 1500;
/** Distances (m) from the start camera at which each species stands, three per band. */
const DISTANCES = [8, 16, 28, 55, 85, 120, 190, 280, 420];
/** The impostor proof row: distances ahead and the lateral offset (m). */
const IMPOSTOR_ROW = { distances: [22, 30, 40], x: 16 };

const scene: HarnessScene = {
  name: "veg",
  async build(ctx: HarnessContext) {
    const base = import.meta.env.BASE_URL ?? "/";
    const decoders = createKitDecoders(ctx.renderer, base);
    const [gltf, manifest] = await Promise.all([
      createKitLoader(decoders).loadAsync(`${base}kits/flora-province-v1.glb`),
      fetch(`${base}kits/flora-province-v1.kit.json`).then((r) => r.json() as Promise<KitManifest>),
    ]);
    const sidecar = await fetch(`${base}kits/flora-province-v1.impostors.json`)
      .then((r) => (r.ok ? (r.json() as Promise<ImpostorSidecar>) : null));
    const impostors = new Map<string, { part: KitLevel["parts"][number]; contentPx: number }>();
    const loader = createKitLoader(decoders);
    await Promise.all((sidecar?.impostors ?? [])
      .filter((record) => SPECIES.includes(record.id))
      .map(async (record) => {
        const g = await loader.loadAsync(`${base}kits/${record.path}`);
        const part = impostorPart(record, g.scene);
        if (part) impostors.set(record.id, { part, contentPx: record.contentPx });
      }));
    if (impostors.size === 0) throw new Error("veg harness: no impostor loaded for the drawn species");
    const kit = installImpostors(buildFloraKit(gltf, manifest), impostors);

    const s = new THREE.Scene();
    s.background = new THREE.Color(0x9cc4e4);
    s.fog = new THREE.Fog(0x9cc4e4, 150, 900);
    s.add(new THREE.HemisphereLight(0xcfe6ff, 0x5a4a30, 0.9));
    const sun = new THREE.DirectionalLight(0xfff2dd, 2.6);
    sun.position.set(40, 90, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, far: 300 });
    s.add(sun, sun.target);
    ctx.renderer.shadowMap.enabled = true;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(2000, 2000).rotateX(-Math.PI / 2),
      new MeshStandardNodeMaterial({ color: 0x5f7a3a, roughness: 1 }),
    );
    ground.receiveShadow = true;
    s.add(ground);

    const wind = createWindUniforms();
    const lodFade = createLodFadeUniforms();
    const shared = createBatchDataUniforms();
    const history = createLodHistory();

    const matrix = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    // GPU cull twins (WebGPU only), registered as Vegetation.tsx does.
    const { cull, measure } = cullParams();
    const pool = cull !== "cpu" && GpuCullPool.supported(ctx.renderer) ? new GpuCullPool({ lodFade }) : null;
    const cpuMeshes: THREE.InstancedMesh[] = [];
    const gpuMeshes: THREE.InstancedMesh[] = [];
    let drawnSpecies = 0;
    SPECIES.forEach((id, si) => {
      const entry = kit.get(id);
      if (!entry) throw new Error(`veg harness: species ${id} not in the kit`);
      drawnSpecies++;
      const isTree = entry.category === "tree";
      const maxDraw = isTree ? TREE_DRAW_M : maxDrawDistance(entry.heightM);
      const meshLevels = entry.billboardIndex ?? entry.levels.length;
      const rings = speciesRings({
        heightM: entry.heightM, meshLevels, category: entry.category,
        submerged: entry.submerged, folded: entry.folded, impostorPx: entry.impostorPx,
      }, 1, "high");
      const ladder = lodLadder(rings, meshLevels, entry.billboardIndex, maxDraw);
      const rungs = cellRungs(ladder, entry.submerged || !isTree);
      const shadowRungs = rungs.map((r) => ({ level: r.level }));
      // Copies: one per distance, fanned across x by species.
      const places: THREE.Vector3[] = DISTANCES.map((d, k) =>
        new THREE.Vector3((si - 2) * (4 + d * 0.35) + (k % 2) * 2, 0, -d));
      const stiffness = entry.sways && entry.trunkRadiusM !== null
        ? windStiffness(entry.trunkRadiusM, 1) - 1 : entry.sways ? 0 : -1;
      // The impostor proof row: the card (impostor) rung, band open from 0.
      const proof = entry.impostorPx !== undefined && entry.billboardIndex !== null
        ? [{ level: entry.billboardIndex, band: [0, 1e9, 0, 0] as [number, number, number, number], proof: true }]
        : [];
      [...rungs.map((r) => ({ ...r, proof: false })), ...proof].forEach((rung) => {
        const at = rung.proof
          ? IMPOSTOR_ROW.distances.map((d, k) => new THREE.Vector3(IMPOSTOR_ROW.x + k * 7, 0, -d))
          : places;
        const level = Math.min(entry.levels.length - 1, rung.level);
        const isCard = entry.billboardIndex !== null && level === entry.billboardIndex;
        const casts = castsShadowFor(shadowRungs, entry.levels.length - 1, entry.billboardIndex, level);
        const fromZero = casts && level === 1;
        for (const part of entry.levels[level].parts) {
          const owned = makeBatchMaterial(part.material, {
            wind, lodFade, batchUniforms: shared, fromZero,
          });
          const n = at.length;
          const data = createBatchDataTexture(n);
          const slots = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
          for (let i = 0; i < n; i++) {
            slots.setX(i, i);
            writeBatchInstance(data, i, rung.band, isCard ? -1 : stiffness, 0);
          }
          data.needsUpdate = true;
          owned.uniforms.esBatchData.value = data;
          const mesh = new THREE.InstancedMesh(
            makeSlotGeometry(part.geometry, { esSlot: slots }), owned.material, n);
          at.forEach((p, i) => {
            q.setFromAxisAngle(up, i * 1.3 + si);
            matrix.compose(p, q, new THREE.Vector3(1, 1, 1));
            mesh.setMatrixAt(i, matrix);
          });
          mesh.instanceMatrix.needsUpdate = true;
          mesh.frustumCulled = false;
          mesh.castShadow = casts;
          mesh.receiveShadow = !isCard;
          s.add(mesh);
          cpuMeshes.push(mesh);
          if (pool) {
            const twin = new THREE.InstancedMesh(
              makeSlotGeometry(part.geometry, {
                esSlot: new THREE.InstancedBufferAttribute(new Float32Array(n), 1),
              }), owned.material, n);
            twin.castShadow = casts;
            twin.receiveShadow = !isCard;
            const draw = pool.addDraw(twin, {
              capacity: n, sphere: cullSphereOf(part.geometry, part.material),
              band: unionBand(null, rung.band), casts, fromZero,
            });
            for (let i = 0; i < n; i++) {
              mesh.getMatrixAt(i, matrix);
              pool.setCandidate(draw, i, matrix, i);
            }
            s.add(twin);
            gpuMeshes.push(twin);
          }
        }
      });
    });
    if (drawnSpecies === 0) throw new Error("veg harness: no species drawn");

    const camera = new THREE.PerspectiveCamera(55, ctx.width / ctx.height, 0.3, 3000);
    const place = (t: number) => {
      camera.position.set(0, 3.2, 6 - t * 4);
      camera.lookAt(0, 4, -120 - t * 4);
      camera.updateMatrixWorld();
      lodFade.esLodViewPos.value.copy(camera.position);
      pushLodHistory(history, camera.position.x, camera.position.z, t, lodFade.esLodHist.array);
    };
    place(0);
    const sweep = sunSweepOf(
      sun.position.x - sun.target.position.x, sun.position.y - sun.target.position.y,
      sun.position.z - sun.target.position.z);
    const setPath = (p: "cpu" | "gpu") => {
      for (const m of cpuMeshes) m.visible = p === "cpu";
      for (const m of gpuMeshes) m.visible = p === "gpu";
    };
    let path: "cpu" | "gpu" = pool && cull !== "cpu" ? "gpu" : "cpu";
    const step = () => { if (pool && path === "gpu") pool.update(ctx.renderer, camera, sweep); };
    setPath(path);
    if (pool && measure) {
      for (let k = 0; k < 6; k++) place(k * 0.05);
      await measureCullParity("veg", ctx.renderer, s, camera,
        (p) => { path = p; setPath(p); }, step);
      path = cull === "cpu" ? "cpu" : "gpu";
      setPath(path);
    }
    return {
      scene: s,
      camera,
      frame(t: number) {
        updateWindSway(wind, t, { windDirXZ: [0.8, 0.6], windSpeedMS: 9, gustiness: 0.5 });
        place(t);
        step();
      },
    };
  },
};

export default scene;
