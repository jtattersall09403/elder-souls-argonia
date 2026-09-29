/**
 * Harness scene "terrain" (decision 0109): the REAL ground splat
 * (`createGroundMaterial`, node material, shore wetness on and primed from
 * the studio's water assets) over real
 * province chunks decoded by the chunk store and meshed by
 * `buildTerrainGridGeometry`, plus the border apron's ring-0 tiles with the
 * apron's near material (sharing the province's albedo array, as
 * ApronTerrain does). Lit at noon by the sun's CSMShadowNode cascades, a box
 * standing on the ground casting a shadow, and hazed by the scene's aerial
 * fog node. The camera sits at the province's NW corner, where upland
 * chunk 0,0 meets the apron.
 */
import * as THREE from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { ChunkStore, type ChunkGrid, type ChunksManifest } from "@elder-souls/game-core/terrain/chunkStore";
import { buildTerrainGridGeometry } from "@elder-souls/game-core/terrain/gridGeometry";
import { paintFrameExtent, type ApronManifest } from "@elder-souls/game-core/terrain/apronManifest";
import { toEpochMinutes } from "@elder-souls/world-time";
import { createGroundMaterial, type GroundIndex, type GroundManifest } from "../../groundMaterial";
import { wetnessUniforms } from "../../water/groundWetness";
import { sharedWaterAssets } from "../../water/waterAssets";
import { createAerialFogNode, createAerialUniforms } from "../../sky/aerial";
import { computeLightRig } from "../../sky/lightRig";
import { aimSun, createSunCascades } from "../../sky/skyObjects";
import type { HarnessBuilt, HarnessContext, HarnessScene } from "../types";

const base = import.meta.env.BASE_URL;

async function json<T>(path: string): Promise<T> {
  const r = await fetch(`${base}${path}`);
  if (!r.ok) throw new Error(`terrain harness: ${path} HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

/** Height (display metres) of the nearest sample of `grid` to world x, z. */
function heightAt(grid: ChunkGrid, x: number, z: number, scale: number): number {
  const [ox, oz] = grid.meta.originM;
  const ix = Math.max(0, Math.min(grid.nx - 1, Math.round((x - ox) / grid.metresPerSample)));
  const iz = Math.max(0, Math.min(grid.ny - 1, Math.round((z - oz) / grid.metresPerSample)));
  return grid.heights[iz * grid.nx + ix] * scale;
}

const terrain: HarnessScene = {
  name: "terrain",
  async build(ctx: HarnessContext): Promise<HarnessBuilt> {
    const { width, height } = ctx;
    const images = new THREE.ImageLoader();
    const textures = new THREE.TextureLoader();

    // Ground set, exactly as useGroundManifest + ChunkTerrain load it.
    const index = await json<GroundIndex>("textures/ground/index.json");
    const set = index.default;
    const ground = await json<GroundManifest>(`textures/ground/${set}/materials.json`);
    const albedo = await Promise.all(ground.materials.map((m) =>
      images.loadAsync(`${base}textures/ground/${set}/${m.file}`)));
    const cliffNrmFiles = ["cliff_rock", "cliff_dirt"]
      .map((name) => ground.materials.find((m) => m.name === name)?.normalFile)
      .filter((f): f is string => !!f);
    const cliffNormals = await Promise.all(cliffNrmFiles.map((f) =>
      images.loadAsync(`${base}textures/ground/${set}/${f}`)));
    const [ctrl, tint, grad, climateAir] = await Promise.all([
      "province/refined/ground-control.png", "province/refined/ground-tint.png",
      "province/chunks/normal-grad.png", "province/climate-air.png",
    ].map((f) => textures.loadAsync(`${base}${f}`)));
    climateAir.colorSpace = THREE.NoColorSpace;

    // Noon light rig and the aerial haze (the scene's one fog node).
    const epoch = toEpochMinutes({ era: 4, year: 201, month: 7, day: 17, minuteOfDay: 12 * 60 });
    const rig = computeLightRig(epoch, 0.6, 0.5);
    const sunDir = new THREE.Vector3(rig.sun.direction.x, rig.sun.direction.y, rig.sun.direction.z);
    const store = new ChunkStore(base);
    const manifest: ChunksManifest = await store.manifest();
    const aerial = createAerialUniforms();
    aerial.uClimateAir.value = climateAir;
    aerial.uProvinceExtentM.value = manifest.extentM;
    aerial.uSunDirW.value.copy(sunDir);
    aerial.uHazeSunLight.value.set(...rig.hazeSunLight);
    aerial.uHazeAmbient.value.set(...rig.hazeAmbient);
    aerial.uMistStrength.value = rig.mistStrength;
    aerial.uFogLum.value.set(...rig.fogLum);
    aerial.uFogSunLum.value.set(...rig.fogSunLum);

    // The shore wet band samples the water rasters: primed by the studio's
    // own water-asset load, as the studio does before the ground is wet.
    await sharedWaterAssets(base);
    wetnessUniforms.uWetSun.value.copy(sunDir);
    const scale = manifest.verticalScaleAtGeometry;
    const material = createGroundMaterial(albedo, cliffNormals, ctrl, tint, grad, ground, scale, aerial,
      { shoreWetness: true });
    let uvExtentM = 0;
    for (const c of manifest.chunks) {
      const lod = c.lods["1"];
      uvExtentM = Math.max(uvExtentM, c.originM[0] + (lod.shape[1] - 1) * lod.metresPerSample);
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9cc4e4);
    (scene as THREE.Scene & { fogNode?: unknown }).fogNode = createAerialFogNode(aerial);
    const chunks: [number, number, string][] = [[0, 0, "1"], [1, 0, "2"], [0, 1, "2"], [1, 1, "4"]];
    const grids = await Promise.all(chunks.map(([cx, cy, lod]) => store.load(cx, cy, lod)));
    for (const grid of grids) {
      const mesh = new THREE.Mesh(buildTerrainGridGeometry(grid, scale, uvExtentM), material);
      mesh.castShadow = grid.lod === "1" || grid.lod === "2";
      mesh.receiveShadow = true;
      scene.add(mesh);
    }

    // The apron's ring-0 tiles beside the corner, with the near apron material.
    const apron = await json<ApronManifest>("province/apron/apron-manifest.json");
    store.register(apron.ring0.chunks, apron.ring0.dir);
    const near = apron.paint.near;
    const [nCtrl, nTint, nGrad] = await Promise.all([near.control, near.tint, near.grad]
      .map((f) => textures.loadAsync(`${base}province/apron/${f}`)));
    const apronMaterial = createGroundMaterial(albedo, cliffNormals, nCtrl, nTint, nGrad, ground, scale, aerial,
      { shoreWetness: false }, material.userData.tex as THREE.DataArrayTexture);
    let apronTiles = 0;
    for (const [cx, cy] of [[-1, 0], [0, -1], [-1, -1]]) {
      const meta = apron.ring0.chunks.find((c) => c.cx === cx && c.cy === cy);
      if (!meta) continue;
      const lod = meta.lods["2"] ? "2" : Object.keys(meta.lods)[0];
      const grid = await store.load(cx, cy, lod);
      const mesh = new THREE.Mesh(
        buildTerrainGridGeometry(grid, scale, paintFrameExtent(near)[0], near.originM), apronMaterial);
      mesh.receiveShadow = true;
      scene.add(mesh);
      apronTiles++;
    }
    if (apronTiles === 0) throw new Error("terrain harness: no ring-0 apron tile beside chunk 0,0");

    // Camera over the corner, looking south-east down into chunk 0,0.
    const g0 = grids[0];
    const focus = new THREE.Vector3(70, 0, 70);
    focus.y = heightAt(g0, focus.x, focus.z, scale);
    const camera = new THREE.PerspectiveCamera(55, width / height, 0.5, 20_000);
    camera.position.set(-15, heightAt(g0, 0, 0, scale) + 45, -15);
    camera.lookAt(focus.x + 60, focus.y - 10, focus.z + 60);
    camera.updateMatrixWorld();

    // A box standing on the ground: its CSM shadow falls on the splat.
    const boxH = 14;
    const box = new THREE.Mesh(new THREE.BoxGeometry(6, boxH, 6),
      new MeshStandardNodeMaterial({ color: 0xb8a58a, roughness: 0.8 }));
    box.position.set(focus.x, focus.y + boxH / 2 - 1, focus.z);
    box.castShadow = true;
    box.receiveShadow = true;
    scene.add(box);

    // Sun (character-mode cascades), sky ambient.
    const { sun } = createSunCascades({ cascades: 2, maxFar: 300, shadowMapSize: 1024 });
    aimSun(sun, sunDir, focus, rig);
    scene.add(sun, sun.target);
    const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, rig.hemiIntensity);
    hemi.color.setRGB(...rig.hemiSky);
    hemi.groundColor.setRGB(...rig.hemiGround);
    scene.add(hemi);
    ctx.renderer.shadowMap.enabled = true;
    ctx.renderer.toneMappingExposure = rig.exposureTarget;
    aerial.uEsFogCam.value.copy(camera.position);

    return { scene, camera };
  },
};
export default terrain;
