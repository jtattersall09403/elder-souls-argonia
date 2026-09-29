/**
 * Harness scene "water": the REAL water surface material (game-core
 * water/render/waterMaterial.ts, field + above, high tier) over a 128 m lake
 * at noon, with a sloping shore that carries the real ground wetness and
 * caustic receiver helpers, and the real persistent foam field pass. The
 * scene colour/depth the water refracts and soft-edges against is rendered
 * each frame into a RenderTarget exactly as WaterPipeline does (opaque layer
 * first, then the water layer).
 *
 * The rasters are synthetic and minimal (one lake, level 0 m, a bank rising
 * west to east): the surface encodes W and SIGNED depth like the compiled
 * water-surface.png, the shore raster the shore distance, the flow raster no
 * current, the class raster "lake".
 */
import * as THREE from "three";
import { MeshStandardNodeMaterial, RenderTarget } from "three/webgpu";
import type { HarnessContext, HarnessScene } from "../types";
import {
  WATER_LAYER, WATER_TIERS, createWaterMaterial, createWaterUniforms,
} from "@elder-souls/game-core/water/render/waterMaterial";
import { FoamField } from "@elder-souls/game-core/water/render/FoamField";
import {
  applyGroundWetness, createGroundWetnessUniforms, primeGroundWetnessUniforms, type GroundWetnessAssets,
} from "@elder-souls/game-core/water/render/groundWetness";
import { applyCausticReceiver } from "@elder-souls/game-core/water/render/causticReceiver";
import type { WaterAssets } from "@elder-souls/game-core/water/render/types";

const SIZE = 64;          // texels a side
const MPP = 2;            // metres per texel → a 128 m province
const W_MIN = -10, W_MAX = 10;
const D_MIN = -6, D_SPAN = 30.6;
const SHORE_MAX = 160;
const CLASSES = ["none", "coast", "estuary", "river", "lake", "marsh"];

/** Ground height (m) along x: −3 m at the west edge rising to +2 m in the east. */
const groundAt = (x: number) => -3 + (5 * x) / (SIZE * MPP);
const SHORE_X = (3 / 5) * SIZE * MPP;   // where the ground meets level 0

function rgba(fill: (i: number, j: number, out: number[]) => void): THREE.DataTexture {
  const data = new Uint8Array(SIZE * SIZE * 4);
  const px = [0, 0, 0, 0];
  for (let j = 0; j < SIZE; j++) for (let i = 0; i < SIZE; i++) {
    fill(i, j, px);
    data.set(px.map((v) => Math.max(0, Math.min(255, Math.round(v)))), (j * SIZE + i) * 4);
  }
  const tex = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function syntheticAssets(): WaterAssets {
  const level16 = Math.round(((0 - W_MIN) / (W_MAX - W_MIN)) * 65535);
  const surfaceTex = rgba((i, _j, o) => {
    const x = (i + 0.5) * MPP;
    const depth = 0 - groundAt(x);
    o[0] = level16 >> 8; o[1] = level16 & 255;
    o[2] = ((depth - D_MIN) / D_SPAN) * 255; o[3] = 0;   // A = owner mask: the field owns every cell
  });
  surfaceTex.magFilter = THREE.NearestFilter;
  surfaceTex.minFilter = THREE.NearestFilter;
  const shoreTex = rgba((i, _j, o) => {
    const x = (i + 0.5) * MPP;
    o[0] = (Math.abs(SHORE_X - x) / SHORE_MAX) * 255; o[1] = 0; o[2] = 0; o[3] = 0;
  });
  // flow: no current; B = sqrt(fetch / fetchMax), a sheltered lake
  const flowTex = rgba((_i, _j, o) => { o[0] = 128; o[1] = 128; o[2] = 0.05 * 255; o[3] = 255; });
  const klassTex = rgba((_i, _j, o) => { o[0] = 4; o[1] = 0.1 * 255; o[2] = 0; o[3] = 0; });
  const meta = {
    schemaVersion: 2,
    surface: { file: "s.png", size: SIZE, metresPerPixel: MPP, minM: W_MIN, maxM: W_MAX, buryM: 3,
      depthMinM: D_MIN, depthSpanM: D_SPAN, shoreMaxM: SHORE_MAX },
    flow: { file: "f.png", size: SIZE, metresPerPixel: MPP, flowMax: 3, shoreMaxM: SHORE_MAX },
    klass: { file: "k.png", size: SIZE, metresPerPixel: MPP, classes: CLASSES },
  };
  return {
    meta, surfaceTex, shoreTex, flowTex, klassTex, hasOwner: false, bedRocks: [],
    tidalAmplitudeM: 0, seasonalAmplitudeM: 0,
  } as unknown as WaterAssets;
}

const harnessScene: HarnessScene = {
  name: "water",
  async build(ctx: HarnessContext) {
    const { renderer } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x8fb4d8);
    const sunDir = new THREE.Vector3(0.35, 0.9, 0.25).normalize();
    const sun = new THREE.DirectionalLight(0xfff4e0, 3);
    sun.position.copy(sunDir).multiplyScalar(100);
    sun.layers.enable(WATER_LAYER);
    const hemi = new THREE.HemisphereLight(0xbcd4ee, 0x4a4030, 1.2);
    hemi.layers.enable(WATER_LAYER);
    scene.add(sun, hemi);

    const assets = syntheticAssets();
    const extent = SIZE * MPP;

    // The shore: a sloping ground mesh with the real wetness + caustic helpers.
    const wet = createGroundWetnessUniforms();
    primeGroundWetnessUniforms(wet, assets as unknown as GroundWetnessAssets);
    wet.uWetSun.value.copy(sunDir);
    const groundMat = new MeshStandardNodeMaterial({ color: 0x8a7a58, roughness: 0.95 });
    applyGroundWetness(groundMat, wet);
    applyCausticReceiver(groundMat, wet);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(extent, extent, 64, 64).rotateX(-Math.PI / 2), groundMat);
    const gp = ground.geometry.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < gp.count; k++) gp.setY(k, groundAt(gp.getX(k) + extent / 2));
    ground.geometry.computeVertexNormals();
    ground.position.set(extent / 2, 0, extent / 2);
    scene.add(ground);

    // The water: the field material on a flat grid (the vertex stage lifts it
    // to the raster's level, adds waves and cuts nothing; the terrain depth
    // test trims the shoreline).
    const tier = WATER_TIERS.high;
    const uniforms = createWaterUniforms(assets);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(extent, extent, 128, 128).rotateX(-Math.PI / 2),
      createWaterMaterial("above", { assets, uniforms, tier }, "field"));
    water.position.set(extent / 2, 0, extent / 2);
    water.layers.set(WATER_LAYER);
    water.frustumCulled = false;
    scene.add(water);
    uniforms.uWaterSunDir.value.copy(sunDir);
    uniforms.uWaterSunLight.value.set(3, 2.9, 2.7);
    uniforms.uWaterAmbient.value.set(0.3, 0.35, 0.4);
    uniforms.uWindMS.value = 5;

    const foam = new FoamField({ size: 128, uniforms, waveBands: tier.waveBands, classes: CLASSES });
    foam.inject(40, 64, 3, 1);

    const camera = new THREE.PerspectiveCamera(55, ctx.width / ctx.height, 0.3, 2000);
    camera.position.set(20, 6, 20);
    camera.lookAt(70, 0, 70);
    camera.layers.enable(WATER_LAYER);

    // Scene colour + depth behind the water, as WaterPipeline renders it.
    const depthTexture = new THREE.DepthTexture(ctx.width, ctx.height);
    depthTexture.type = THREE.UnsignedIntType;
    const rt = new RenderTarget(ctx.width, ctx.height, {
      type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      depthBuffer: true, depthTexture,
    });
    uniforms.uResolution.value.set(ctx.width, ctx.height);

    let last = 0;
    const frame = (t: number) => {
      const dt = Math.max(0, Math.min(t - last, 0.1)) || 1 / 60;
      last = t;
      uniforms.uWaveTime.value = t;
      uniforms.uTransportTime.value = t;
      wet.uWetTime.value = t;
      // advance the foam field a few steps
      for (let s = 0; s < 3; s++) foam.update(renderer, camera.position.x, camera.position.z, dt / 3);
      uniforms.uFoamField.value = foam.texture;
      uniforms.uFoamFieldInfo.value.copy(foam.info);
      // opaque layer → RT (the water samples it)
      const prevTarget = renderer.getRenderTarget();
      const layers = camera.layers.mask;
      camera.layers.mask = 1;
      renderer.setRenderTarget(rt);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.setRenderTarget(prevTarget);
      camera.layers.mask = layers;
      uniforms.uSceneColor.value = rt.texture;
      uniforms.uSceneDepth.value = depthTexture;
      uniforms.uCamNear.value = camera.near;
      uniforms.uCamFar.value = camera.far;
      uniforms.uProjMatrix.value.copy(camera.projectionMatrix);
    };
    return { scene, camera, frame };
  },
};

export default harnessScene;
