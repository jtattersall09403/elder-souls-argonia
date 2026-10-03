/**
 * Harness scene "gc": one ground-cover tile's REAL materials on the studio's
 * ground-cover kit (decision 0111). The kit GLB is indexed by
 * `buildFloraKit` and `buildCardIndex` (the loaders `Groundcover.tsx` uses) and
 * every part is patched by `patchGroundcoverPart` (the ring's own: wind on the
 * mesh tiers, the LOD fade on every tier, the cylindrical billboard on the
 * card tiers). Three tiers, as the ring draws them: the near mesh, then the
 * mid and far card copies, each with its `esLodBand` tier band on its own slot
 * geometry view and a per-instance ground tint through `instanceColor`.
 *
 * The plants are a dense jittered patch in front of the camera (near) and
 * further out (mid, far), not a streamed province tile; the tile generation
 * and budget thin are CPU code with their own unit tests. Lit at noon like
 * the game: the rig's sun, the studio sky dome, PMREM sky light and
 * hemisphere (harness/skyScene.ts addStudioSky), hazed by the aerial fog node.
 *
 * GPU cull (lane L9b): on the WebGPU backend every mesh has a twin registered
 * through the studio's own `registerGcDraw` / `fillGcDraw` (Groundcover.tsx)
 * with its tier band set as the ring sets it; `&cull=gpu|cpu` and
 * `&measure=1` as in the veg scene (`measureCullParity`).
 */
import * as THREE from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { createKitLoader, kitDecodersFor } from "@elder-souls/game-core/assets/kitLoader";
import { loadKitParts } from "@elder-souls/game-core/assets/loadKitParts";
import { KitCache } from "@elder-souls/game-core/settlement/kitCache";
import { createWindUniforms, updateWindSway } from "@elder-souls/game-core/fx/windSway";
import { createLodFadeUniforms, LOD_BAND_ATTRIBUTE } from "@elder-souls/game-core/fx/lodFade";
import { makeSlotGeometry } from "@elder-souls/game-core/vegetation/slotGeometry";
import { buildFloraKit, type KitManifest } from "../../vegetation/floraKit";
import { buildCardIndex, patchGroundcoverPart } from "../../vegetation/groundcoverMaterials";
import { toEpochMinutes } from "@elder-souls/world-time";
import { createAerialFogNode, createAerialUniforms } from "../../sky/aerial";
import { computeLightRig } from "../../sky/lightRig";
import { aimSun } from "../../sky/skyObjects";
import { addStudioSky } from "../skyScene";
import { GpuCullPool } from "@elder-souls/game-core/render/gpuCull/GpuCullPool";
import { fillGcDraw, registerGcDraw } from "../../vegetation/Groundcover";
import { cullParams, measureCullParity } from "./veg";
import type { HarnessContext, HarnessScene } from "../types";

const SPECIES = [
  "tropical:landscape/grass/grassplant01",
  "tropical:landscape/grass/ferngrass01",
  "bmv:landscape/grass/solojunco",
];
/** Tier radii (m) and the ring's dither half-widths (Groundcover TIER_BAND_M). */
const NEAR_M = 18;
const MID_M = 45;
const FAR_M = 110;
const TIER_BAND_M: [number, number][] = [[0, 4], [4, 6], [6, 10]];

/** Deterministic 0..1 hash. */
function rand(i: number, salt: number): number {
  const v = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

const scene: HarnessScene = {
  name: "gc",
  async build(ctx: HarnessContext) {
    const base = import.meta.env.BASE_URL ?? "/";
    const decoders = kitDecodersFor(ctx.renderer, base);
    const [gltf, manifest] = await Promise.all([
      loadKitParts("groundcover-province-v1", "all", { baseUrl: base, kitCache: new KitCache(), loader: createKitLoader(decoders) }),
      fetch(`${base}kits/groundcover-province-v1.kit.json`).then((r) => r.json() as Promise<KitManifest>),
    ]);
    const kit = buildFloraKit(gltf, manifest);
    const cards = buildCardIndex(gltf, kit);

    const s = new THREE.Scene();
    // Noon rig, aerial haze (the scene's one fog node) and the rig's sun.
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
    const sun = new THREE.DirectionalLight(0xffffff, 0);
    aimSun(sun, sunDir, new THREE.Vector3(0, 0, -30), rig);
    sun.castShadow = false;
    s.add(sun, sun.target);
    ctx.renderer.toneMappingExposure = rig.exposureTarget;
    s.add(new THREE.Mesh(
      new THREE.PlaneGeometry(600, 600).rotateX(-Math.PI / 2),
      new MeshStandardNodeMaterial({ color: 0x5a6e34, roughness: 1 }),
    ));

    const wind = createWindUniforms();
    const lodFade = createLodFadeUniforms();
    const memo = new Map();
    const matrix = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const scale = new THREE.Vector3();
    const tiers = [
      { band: [0, NEAR_M, TIER_BAND_M[0][0], TIER_BAND_M[0][1]], lo: 1, hi: NEAR_M + 4, count: 900 },
      { band: [NEAR_M, MID_M, TIER_BAND_M[1][0], TIER_BAND_M[1][1]], lo: NEAR_M - 4, hi: MID_M + 6, count: 900 },
      { band: [MID_M, FAR_M, TIER_BAND_M[2][0], TIER_BAND_M[2][1]], lo: MID_M - 6, hi: FAR_M + 10, count: 900 },
    ] as const;
    const { cull, measure } = cullParams();
    const pool = cull !== "cpu" && GpuCullPool.supported(ctx.renderer)
      ? new GpuCullPool({ lodFade, payloads: 2 }) : null;
    const cpuMeshes: THREE.InstancedMesh[] = [];
    const gpuMeshes: THREE.InstancedMesh[] = [];
    let species = 0;
    SPECIES.forEach((id, si) => {
      const entry = kit.get(id);
      if (!entry) throw new Error(`gc harness: species ${id} not in the kit`);
      species++;
      const card = cards.get(id) ?? null;
      tiers.forEach((tier, ti) => {
        const near = ti === 0;
        const parts = near || !card ? entry.levels[0].parts : [card];
        parts.forEach((part, pi) => {
          patchGroundcoverPart(part.material, { wind, lodFade, memo, billboard: !near && card !== null });
          const n = tier.count;
          const bands = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
          for (let i = 0; i < n; i++) bands.setXYZW(i, tier.band[0], tier.band[1], tier.band[2], tier.band[3]);
          const geometry = makeSlotGeometry(part.geometry, { [LOD_BAND_ATTRIBUTE]: bands });
          const mesh = new THREE.InstancedMesh(geometry, part.material, n);
          mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
          for (let i = 0; i < n; i++) {
            // A wedge in front of the camera, species side by side.
            const r = tier.lo + (tier.hi - tier.lo) * Math.sqrt(rand(i, si * 7 + ti));
            const a = (rand(i, si * 13 + ti + 3) - 0.5) * 1.1 + (si - 1) * 0.35;
            const k = 0.8 + rand(i, 5 + si) * 0.5;
            q.setFromAxisAngle(up, rand(i, 9) * Math.PI * 2);
            matrix.compose(new THREE.Vector3(Math.sin(a) * r, 0, -Math.cos(a) * r), q, scale.set(k, k, k));
            mesh.setMatrixAt(i, matrix);
            const tint = 0.75 + rand(i, 11 + pi) * 0.35;
            mesh.setColorAt(i, new THREE.Color(tint * 0.95, tint, tint * 0.8));
          }
          mesh.instanceMatrix.needsUpdate = true;
          mesh.instanceColor.needsUpdate = true;
          mesh.frustumCulled = false;
          s.add(mesh);
          cpuMeshes.push(mesh);
          if (pool) {
            const twin = new THREE.InstancedMesh(makeSlotGeometry(part.geometry, {}), part.material, n);
            twin.frustumCulled = false;
            const gc = registerGcDraw(pool, twin, part.geometry, n);
            gc.matrices.set(mesh.instanceMatrix.array as Float32Array);
            gc.colours.set(mesh.instanceColor.array as Float32Array);
            gc.bands.set(bands.array as Float32Array);
            pool.setBand(gc.draw, [tier.band[0], tier.band[1], tier.band[2], tier.band[3]]);
            fillGcDraw(pool, gc, n);
            s.add(twin);
            gpuMeshes.push(twin);
          }
        });
      });
    });
    if (species === 0) throw new Error("gc harness: no species drawn");

    const camera = new THREE.PerspectiveCamera(55, ctx.width / ctx.height, 0.1, 1000);
    const place = (t: number) => {
      camera.position.set(0, 1.7, 2 - t * 2);
      camera.lookAt(0, 0.6, -30 - t * 2);
      camera.updateMatrixWorld();
      lodFade.esLodViewPos.value.copy(camera.position);
    };
    place(0);
    const sky = addStudioSky(ctx.renderer, s, camera, rig, sunDir, aerial, { bakeAtBuild: true });
    const setPath = (p: "cpu" | "gpu") => {
      for (const m of cpuMeshes) m.visible = p === "cpu";
      for (const m of gpuMeshes) m.visible = p === "gpu";
    };
    let path: "cpu" | "gpu" = pool && cull !== "cpu" ? "gpu" : "cpu";
    const step = () => { if (pool && path === "gpu") pool.update(ctx.renderer, camera, null); };
    setPath(path);
    if (pool && measure) {
      aerial.uEsFogCam.value.copy(camera.position);
      await measureCullParity("gc", ctx.renderer, s, camera,
        (p) => { path = p; setPath(p); }, step);
      path = cull === "cpu" ? "cpu" : "gpu";
      setPath(path);
    }
    return {
      scene: s,
      camera,
      frame(t: number) {
        updateWindSway(wind, t, { windDirXZ: [0.8, 0.6], windSpeedMS: 9, gustiness: 0.5 }, camera.position);
        place(t);
        aerial.uEsFogCam.value.copy(camera.position);
        sky.frame(t);
        step();
      },
    };
  },
};

export default scene;
