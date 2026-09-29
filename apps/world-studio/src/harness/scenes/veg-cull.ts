/**
 * Harness scene "veg-cull": GPU-driven culling and LOD rung selection
 * (`render/gpuCull/GpuCullSystem`, lane L9) against the CPU path, on the
 * vegetation layer's REAL batch materials and flora kit (the `veg` scene's
 * set-up, at a realistic count: every copy of five species, emitted into
 * every rung × part as the renderer does, ~30 k candidates on a treeline strip the camera looks along).
 *
 * Two copies of every draw share the kit geometry, the batch data texture and
 * the uniforms; only the instance source differs:
 *   - CPU path: each frame, per candidate, `candidateKept` (the compute's
 *     TypeScript twin) and a compacted upload of the kept matrices and slots,
 *     the way the renderer's visible prefix is kept (per copy here, per tile
 *     in `Vegetation.tsx`: this is the per-instance upper bound).
 *   - GPU path (WebGPU backend only): the candidates uploaded once, one
 *     compute pass per frame, indirect draws.
 * On the WebGPU backend with `&measure=1` `build` measures both (CPU ms around update+render,
 * wall ms to `onSubmittedWorkDone`, draw calls, kept instances from the
 * indirect buffer read back, triangles) and the mean absolute pixel
 * difference between the two paths' frames, and logs one `[veg-cull]` JSON
 * line (lands in the runner's summary.json). SwiftShader: ratios only.
 * The harness's own frames then draw the GPU path (CPU path on WebGL).
 */
import * as THREE from "three";
import { MeshStandardNodeMaterial, type WebGPURenderer } from "three/webgpu";
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
import { GpuCullSystem, type GpuCullDraw } from "@elder-souls/game-core/render/gpuCull/GpuCullSystem";
import {
  DRAW_CASTS, DRAW_FROM_ZERO, INDIRECT_STRIDE, candidateKept, type CullDraw, type SunSweep,
} from "@elder-souls/game-core/render/gpuCull/cullMath";
import {
  buildFloraKit, maxDrawDistance, speciesRings, type KitManifest,
} from "../../vegetation/floraKit";
import { makeBatchMaterial } from "../../vegetation/batchMaterial";
import { castsShadowFor } from "../../vegetation/shadowRule";
import { toEpochMinutes } from "@elder-souls/world-time";
import { createAerialFogNode, createAerialUniforms } from "../../sky/aerial";
import { computeLightRig } from "../../sky/lightRig";
import { addStudioSky } from "../skyScene";
import type { HarnessContext, HarnessScene } from "../types";

const SPECIES = [
  "bmv:landscape/trees/gkbtreeaspen05jungle",
  "bmv:landscape/trees/mangrovereachtree0gkb3",
  "bmv:landscape/plants/espfernbraken04st",
  "bmv:landscape/plants/fern01",
  "vanilla:landscape/rocks/rockpiles02",
];
const TREE_DRAW_M = 1500;
/** Copies per species, on a treeline strip the camera looks along: 200 m
 * wide, from 30 m behind the camera to 900 m ahead. */
const COPIES = 1000;
const STRIP_W_M = 200;
const STRIP_BACK_M = 30;
const STRIP_AHEAD_M = 900;
/** Frames timed per path. */
const TIMED = 20;

interface Pair {
  cpu: THREE.InstancedMesh;
  gpu: THREE.InstancedMesh | null;
  draw: GpuCullDraw | null;
  cull: CullDraw;
  /** Candidate matrices (column-major, 16 per copy) and slots. */
  mats: Float32Array;
  slots: THREE.InstancedBufferAttribute;
  tris: number;
}

function hash(i: number): number {
  let h = (i * 2654435761) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507) >>> 0;
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

const scene: HarnessScene = {
  name: "veg-cull",
  async build(ctx: HarnessContext) {
    const renderer = ctx.renderer as WebGPURenderer;
    const base = import.meta.env.BASE_URL ?? "/";
    const decoders = createKitDecoders(renderer, base);
    const [gltf, manifest] = await Promise.all([
      createKitLoader(decoders).loadAsync(`${base}kits/flora-province-v1.glb`),
      fetch(`${base}kits/flora-province-v1.kit.json`).then((r) => r.json() as Promise<KitManifest>),
    ]);
    const kit = buildFloraKit(gltf, manifest);

    const s = new THREE.Scene();
    // Lit as the studio lights it at noon (the veg/gc scenes' rig): the rig's
    // sun, the aerial fog node, and the sky dome + PMREM sky IBL + hemisphere
    // from addStudioSky (below, once the camera exists). A bare hemisphere
    // and sun leave the canopy's shaded side at luma ~3-15 on BOTH renderers
    // (lane L15 A/B: the kit's leaf texels are dark; the studio's IBL lifts them).
    const epoch = toEpochMinutes({ era: 4, year: 201, month: 7, day: 17, minuteOfDay: 12 * 60 });
    const rig = computeLightRig(epoch, 0.6, 0.5);
    const sunDir = new THREE.Vector3(rig.sun.direction.x, rig.sun.direction.y, rig.sun.direction.z);
    const aerial = createAerialUniforms();
    aerial.uProvinceExtentM.value = 20_000;
    aerial.uSunDirW.value.copy(sunDir);
    aerial.uHazeSunLight.value.set(...rig.hazeSunLight);
    aerial.uHazeAmbient.value.set(...rig.hazeAmbient);
    aerial.uMistStrength.value = rig.mistStrength;
    aerial.uFogLum.value.set(...rig.fogLum);
    aerial.uFogSunLum.value.set(...rig.fogSunLum);
    (s as THREE.Scene & { fogNode?: unknown }).fogNode = createAerialFogNode(aerial);
    renderer.toneMappingExposure = rig.exposureTarget;
    const sun = new THREE.DirectionalLight(0xffffff, rig.sunIntensity);
    sun.color.setRGB(...rig.sunColor);
    // 100 m out along the rig's sun: inside the 300 m shadow camera.
    sun.position.copy(sunDir).multiplyScalar(100);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, far: 300 });
    s.add(sun, sun.target);
    renderer.shadowMap.enabled = true;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(2000, 2000).rotateX(-Math.PI / 2),
      new MeshStandardNodeMaterial({ color: 0x5f7a3a, roughness: 1 }),
    );
    ground.receiveShadow = true;
    s.add(ground);
    // The sun shadow's horizontal travel and metres of shadow per metre of height.
    const horiz = Math.hypot(sun.position.x, sun.position.z);
    const sweep: SunSweep = {
      x: -sun.position.x / horiz, z: -sun.position.z / horiz, perM: horiz / sun.position.y,
    };

    const wind = createWindUniforms();
    const lodFade = createLodFadeUniforms();
    const shared = createBatchDataUniforms();
    const history = createLodHistory();
    const gpuOk = ctx.backend === "webgpu" && GpuCullSystem.supported(renderer);
    console.log(`[veg-cull] gpu path ${gpuOk}`);

    // Copies: a deterministic scatter on the disc, per species.
    const matrix = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const one = new THREE.Vector3(1, 1, 1);
    const pos = new THREE.Vector3();
    const speciesMats = SPECIES.map((_, si) => {
      const m = new Float32Array(COPIES * 16);
      for (let i = 0; i < COPIES; i++) {
        const k = si * COPIES + i;
        pos.set((hash(k * 3) - 0.5) * STRIP_W_M, 0,
          STRIP_BACK_M - hash(k * 3 + 1) * (STRIP_BACK_M + STRIP_AHEAD_M));
        q.setFromAxisAngle(up, hash(k * 3 + 2) * 6.283);
        matrix.compose(pos, q, one.setScalar(0.85 + 0.3 * hash(k * 7)));
        m.set(matrix.elements, i * 16);
      }
      return m;
    });

    // Draws: per species × rung × part, a CPU mesh and a GPU mesh.
    const pairs: Pair[] = [];
    const specs: Array<{ si: number; geometry: THREE.BufferGeometry; material: THREE.Material;
      band: [number, number, number, number]; isCard: boolean; stiffness: number;
      casts: boolean; fromZero: boolean }> = [];
    SPECIES.forEach((id, si) => {
      const entry = kit.get(id);
      if (!entry) throw new Error(`veg-cull harness: species ${id} not in the kit`);
      const isTree = entry.category === "tree";
      const maxDraw = isTree ? TREE_DRAW_M : maxDrawDistance(entry.heightM);
      const meshLevels = entry.billboardIndex ?? entry.levels.length;
      const rings = speciesRings({
        heightM: entry.heightM, meshLevels, category: entry.category,
        submerged: entry.submerged, folded: entry.folded,
      }, 1, "high");
      const ladder = lodLadder(rings, meshLevels, entry.billboardIndex, maxDraw);
      const rungs = cellRungs(ladder, entry.submerged || !isTree);
      const shadowRungs = rungs.map((r) => ({ level: r.level }));
      const stiffness = entry.sways && entry.trunkRadiusM !== null
        ? windStiffness(entry.trunkRadiusM, 1) - 1 : entry.sways ? 0 : -1;
      rungs.forEach((rung) => {
        const level = Math.min(entry.levels.length - 1, rung.level);
        const isCard = entry.billboardIndex !== null && level === entry.billboardIndex;
        const casts = castsShadowFor(shadowRungs, entry.levels.length - 1, entry.billboardIndex, level);
        for (const part of entry.levels[level].parts) {
          specs.push({
            si, geometry: part.geometry, material: part.material,
            band: [...rung.band] as [number, number, number, number],
            isCard, stiffness, casts, fromZero: casts && level === 1,
          });
        }
      });
    });
    const totalRows = specs.length * COPIES;
    const sys = gpuOk
      ? new GpuCullSystem({ rows: totalRows, maxDraws: specs.length, lodFade })
      : null;
    for (const sp of specs) {
      const n = COPIES;
      const data = createBatchDataTexture(n);
      const slots = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
      for (let i = 0; i < n; i++) writeBatchInstance(data, i, sp.band, sp.isCard ? -1 : sp.stiffness, 0);
      data.needsUpdate = true;
      const mk = () => {
        const owned = makeBatchMaterial(sp.material as never, {
          wind, lodFade, batchUniforms: shared, fromZero: sp.fromZero,
        });
        owned.uniforms.esBatchData.value = data;
        return owned.material;
      };
      const cpu = new THREE.InstancedMesh(makeSlotGeometry(sp.geometry, { esSlot: slots }), mk(), n);
      cpu.count = 0;
      cpu.frustumCulled = false;
      cpu.castShadow = sp.casts;
      cpu.receiveShadow = !sp.isCard;
      s.add(cpu);
      if (!sp.geometry.boundingSphere) sp.geometry.computeBoundingSphere();
      const sphere = sp.geometry.boundingSphere!;
      const cull: CullDraw = {
        radius: sphere.radius + Math.hypot(sphere.center.x, sphere.center.z),
        centreY: sphere.center.y,
        flags: (sp.casts ? DRAW_CASTS : 0) | (sp.fromZero ? DRAW_FROM_ZERO : 0),
        band: sp.band,
      };
      const index = sp.geometry.index;
      const tris = (index ? index.count : sp.geometry.getAttribute("position").count) / 3;
      let gpu: THREE.InstancedMesh | null = null;
      let draw: GpuCullDraw | null = null;
      if (sys) {
        gpu = new THREE.InstancedMesh(makeSlotGeometry(sp.geometry, { esSlot: slots }), mk(), n);
        draw = sys.addDraw(gpu, {
          capacity: n, sphere, band: sp.band, casts: sp.casts, fromZero: sp.fromZero,
        });
        if (!draw) throw new Error("veg-cull harness: GPU cull arena full");
        for (let i = 0; i < n; i++) {
          matrix.fromArray(speciesMats[sp.si], i * 16);
          sys.setCandidate(draw, i, matrix, i);
        }
        gpu.castShadow = sp.casts;
        gpu.receiveShadow = !sp.isCard;
        gpu.visible = false;
        s.add(gpu);
      }
      pairs.push({ cpu, gpu, draw, cull, mats: speciesMats[sp.si], slots, tris });
    }

    const camera = new THREE.PerspectiveCamera(55, ctx.width / ctx.height, 0.3, 3000);
    const place = (t: number) => {
      camera.position.set(0, 3.2, 6 - t * 4);
      camera.lookAt(0, 4, -120 - t * 4);
      camera.updateMatrixWorld();
      lodFade.esLodViewPos.value.copy(camera.position);
      pushLodHistory(history, camera.position.x, camera.position.z, t, lodFade.esLodHist.array);
    };
    place(0);
    const sky = addStudioSky(renderer, s, camera, rig, sunDir, aerial, { bakeAtBuild: true });
    aerial.uEsFogCam.value.copy(camera.position);

    // The CPU path's per-frame work: cull every candidate, compact, upload.
    const planes = new Float32Array(24);
    const frustum = new THREE.Frustum();
    const pv = new THREE.Matrix4();
    const offsets = new Float32Array(16);
    let cpuKept = 0;
    const cpuStep = () => {
      pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(pv, (camera as unknown as { coordinateSystem: number }).coordinateSystem as never);
      frustum.planes.forEach((pl, p) => {
        planes.set([pl.normal.x, pl.normal.y, pl.normal.z, pl.constant], p * 4);
      });
      lodFade.esLodHist.array.forEach((v: THREE.Vector2, k: number) => { offsets[k * 2] = v.x; offsets[k * 2 + 1] = v.y; });
      const vx = camera.position.x;
      const vz = camera.position.z;
      cpuKept = 0;
      for (const pr of pairs) {
        const out = pr.cpu.instanceMatrix.array as Float32Array;
        const outSlot = pr.slots.array as Float32Array;
        let c = 0;
        for (let i = 0; i < COPIES; i++) {
          const m = pr.mats.subarray(i * 16, i * 16 + 16);
          if (!candidateKept(planes, m, pr.cull, vx, vz, offsets, sweep)) continue;
          out.set(m, c * 16);
          outSlot[c] = i;
          c++;
        }
        pr.cpu.count = c;
        cpuKept += c;
        pr.cpu.instanceMatrix.clearUpdateRanges();
        pr.cpu.instanceMatrix.addUpdateRange(0, c * 16);
        pr.cpu.instanceMatrix.needsUpdate = true;
        pr.slots.clearUpdateRanges();
        pr.slots.addUpdateRange(0, c);
        pr.slots.needsUpdate = true;
      }
    };
    // `gpuDrawOnly` below: the GPU path's draws with the compute skipped (the
    // last cull's kept set stays valid for a still camera), isolating the
    // cull's cost from the indirect draws'.
    let skipCull = false;
    const gpuStep = () => { if (!skipCull) sys!.update(renderer, camera, sweep); };
    let path: "cpu" | "gpu" = "cpu";
    const setPath = (p: "cpu" | "gpu") => {
      path = p;
      for (const pr of pairs) {
        pr.cpu.visible = p === "cpu";
        if (pr.gpu) pr.gpu.visible = p === "gpu";
      }
    };
    const step = () => (path === "gpu" ? gpuStep() : cpuStep());

    // The measurement (~3 min on SwiftShader) runs only with `&measure=1`
    // (tmp/vegcull-measure.mjs); the runner's pass draws the GPU path.
    const measureOn = new URLSearchParams(globalThis.location?.search ?? "").has("measure");
    if (sys && measureOn) {
      // Settle a history with a recent move so the cross-fade is live.
      for (let k = 0; k < 6; k++) place(k * 0.05);
      const device = (renderer as unknown as { backend: { device: GPUDevice } }).backend.device;
      const target = renderer.getRenderTarget();
      await renderer.compileAsync(s, camera);
      const measure = async (p: "cpu" | "gpu") => {
        console.log(`[veg-cull] measuring ${p}`);
        setPath(p);
        for (let k = 0; k < 3; k++) {
          step();
          renderer.render(s, camera);
          await device.queue.onSubmittedWorkDone();
        }
        let cpuMs = 0;
        let wallMs = 0;
        renderer.info.reset();
        for (let k = 0; k < TIMED; k++) {
          const t0 = performance.now();
          step();
          renderer.render(s, camera);
          const t1 = performance.now();
          await device.queue.onSubmittedWorkDone();
          cpuMs += t1 - t0;
          wallMs += performance.now() - t0;
        }
        const calls = renderer.info.render.calls / TIMED;
        let kept = cpuKept;
        let tris = 0;
        if (p === "gpu") {
          const ind = new Uint32Array(await renderer.getArrayBufferAsync(sys.indirect as never));
          kept = 0;
          for (const pr of pairs) {
            const n = ind[pr.draw!.index * INDIRECT_STRIDE + 1];
            kept += n;
            tris += n * pr.tris;
          }
        } else {
          for (const pr of pairs) tris += pr.cpu.count * pr.tris;
        }
        const px = target
          ? new Uint8Array((await renderer.readRenderTargetPixelsAsync(target, 0, 0, ctx.width, ctx.height)).buffer)
          : null;
        return {
          cpuMs: +(cpuMs / TIMED).toFixed(2), wallMs: +(wallMs / TIMED).toFixed(2),
          calls, kept, tris: Math.round(tris), px,
        };
      };
      const cpu = await measure("cpu");
      const gpu = await measure("gpu");
      skipCull = true;
      const gpuDraw = await measure("gpu");
      skipCull = false;
      let diff = 0;
      let differing = 0;
      if (cpu.px && gpu.px) {
        for (let k = 0; k < cpu.px.length; k++) {
          const d = Math.abs(cpu.px[k] - gpu.px[k]);
          diff += d;
          if (d > 8) differing++;
        }
        diff /= cpu.px.length;
      }
      const strip = ({ px: _px, ...rest }: typeof cpu) => rest;
      const metrics = {
        candidates: totalRows, draws: pairs.length,
        cpu: strip(cpu), gpu: strip(gpu), gpuDrawOnly: strip(gpuDraw),
        pixelMAD: +diff.toFixed(4), channelsOver8: differing,
        culledPct: +(100 * (1 - cpu.kept / totalRows)).toFixed(1),
      };
      // Read by the measurement script (the runner keeps warnings/errors only).
      (globalThis as unknown as { __VEG_CULL__: unknown }).__VEG_CULL__ = metrics;
      console.log(`[veg-cull] ${JSON.stringify(metrics)}`);
      setPath("gpu");
    } else {
      setPath(sys ? "gpu" : "cpu");
    }

    return {
      scene: s,
      camera,
      frame(t: number) {
        updateWindSway(wind, t, { windDirXZ: [0.8, 0.6], windSpeedMS: 9, gustiness: 0.5 });
        place(t);
        aerial.uEsFogCam.value.copy(camera.position);
        sky.frame(t);
        step();
      },
    };
  },
};

export default scene;
