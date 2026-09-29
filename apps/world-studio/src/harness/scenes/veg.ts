/**
 * Harness scene "veg": the vegetation layer's REAL batch materials on the
 * studio's flora kit (decision 0109). The land kit GLB is loaded and
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
 * graphs. `frame(t)` drives the wind and walks the camera forward, pushing
 * the LOD history so the cross-fade runs.
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
  buildFloraKit, maxDrawDistance, speciesRings, type KitManifest,
} from "../../vegetation/floraKit";
import { makeBatchMaterial } from "../../vegetation/batchMaterial";
import { castsShadowFor } from "../../vegetation/shadowRule";
import type { HarnessContext, HarnessScene } from "../types";

/** Species drawn: two trees with cards, a folded shrub, a fern, a rock. */
const SPECIES = [
  "bmv:landscape/trees/gkbtreeaspen05jungle",
  "bmv:landscape/trees/mangrovereachtree0gkb3",
  "bmv:landscape/plants/espfernbraken04st",
  "bmv:landscape/plants/fern01",
  "vanilla:landscape/rocks/rockpiles02",
];
/** Tree draw distance used here (the renderer's `treeDrawDistance` at a 3-chunk ring of 512 m). */
const TREE_DRAW_M = 1500;
/** Distances (m) from the start camera at which each species stands, three per band. */
const DISTANCES = [8, 16, 28, 55, 85, 120, 190, 280, 420];

const scene: HarnessScene = {
  name: "veg",
  async build(ctx: HarnessContext) {
    const base = import.meta.env.BASE_URL ?? "/";
    const decoders = createKitDecoders(ctx.renderer, base);
    const [gltf, manifest] = await Promise.all([
      createKitLoader(decoders).loadAsync(`${base}kits/flora-province-v1.glb`),
      fetch(`${base}kits/flora-province-v1.kit.json`).then((r) => r.json() as Promise<KitManifest>),
    ]);
    const kit = buildFloraKit(gltf, manifest);

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
        submerged: entry.submerged, folded: entry.folded,
      }, 1, "high");
      const ladder = lodLadder(rings, meshLevels, entry.billboardIndex, maxDraw);
      const rungs = cellRungs(ladder, entry.submerged || !isTree);
      const shadowRungs = rungs.map((r) => ({ level: r.level }));
      // Copies: one per distance, fanned across x by species.
      const places: THREE.Vector3[] = DISTANCES.map((d, k) =>
        new THREE.Vector3((si - 2) * (4 + d * 0.35) + (k % 2) * 2, 0, -d));
      const stiffness = entry.sways && entry.trunkRadiusM !== null
        ? windStiffness(entry.trunkRadiusM, 1) - 1 : entry.sways ? 0 : -1;
      rungs.forEach((rung) => {
        const level = Math.min(entry.levels.length - 1, rung.level);
        const isCard = entry.billboardIndex !== null && level === entry.billboardIndex;
        const casts = castsShadowFor(shadowRungs, entry.levels.length - 1, entry.billboardIndex, level);
        const fromZero = casts && level === 1;
        for (const part of entry.levels[level].parts) {
          const owned = makeBatchMaterial(part.material, {
            wind, lodFade, batchUniforms: shared, fromZero,
          });
          const n = places.length;
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
          places.forEach((p, i) => {
            q.setFromAxisAngle(up, i * 1.3 + si);
            matrix.compose(p, q, new THREE.Vector3(1, 1, 1));
            mesh.setMatrixAt(i, matrix);
          });
          mesh.instanceMatrix.needsUpdate = true;
          mesh.frustumCulled = false;
          mesh.castShadow = casts;
          mesh.receiveShadow = !isCard;
          s.add(mesh);
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
    return {
      scene: s,
      camera,
      frame(t: number) {
        updateWindSway(wind, t, { windDirXZ: [0.8, 0.6], windSpeedMS: 9, gustiness: 0.5 });
        place(t);
      },
    };
  },
};

export default scene;
