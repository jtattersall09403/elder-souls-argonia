/**
 * Harness scene "fx": the shared vegetation node features on real package
 * code (decision 0111) — wind sway, LOD fade (a stepped rung, a dithered
 * vanish, a from-zero shadow rung), the cylindrical billboard and the foliage
 * batch data texture with its occlusion mask. Noon light with shadows so the
 * shadow slots (maskShadowNode / castShadowPositionNode) compile too.
 * `frame(t)` moves the wind and sweeps the camera through the fade edges.
 */
import * as THREE from "three";
import { MeshStandardNodeMaterial, type WebGPURenderer } from "three/webgpu";
import { applyWindSway, createWindUniforms, updateWindSway, WIND_TUNE_ATTRIBUTE } from "@elder-souls/game-core/fx/windSway";
import {
  applyLodFade, createLodFadeUniforms, LOD_BAND_ATTRIBUTE, LOD_CULL_BAND_M, LOD_OPEN_M,
} from "@elder-souls/game-core/fx/lodFade";
import { applyCylindricalBillboard } from "@elder-souls/game-core/fx/billboardQuad";
import {
  applyBatchData, createBatchDataTexture, createBatchDataUniforms, setBatchTexture, writeBatchInstance,
} from "@elder-souls/game-core/fx/batchData";

interface HarnessContext {
  renderer: WebGPURenderer;
  backend: "webgpu" | "webgl";
  width: number;
  height: number;
}

const ROWS = 6;
const COLS = 6;
const SPACING_M = 9;

function instanced(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  count: number,
  place: (i: number, m: THREE.Matrix4) => void,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    place(i, m);
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

function gridMatrix(i: number, m: THREE.Matrix4, x0: number, scale = 1, yawStep = 0.7): void {
  const x = x0 + (i % COLS) * SPACING_M;
  const z = -Math.floor(i / COLS) * SPACING_M * 2;
  m.compose(
    new THREE.Vector3(x, 0, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * yawStep),
    new THREE.Vector3(scale, scale, scale),
  );
}

export default {
  name: "fx",
  async build(ctx: HarnessContext) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9cc4e4);
    scene.fog = new THREE.Fog(0x9cc4e4, 80, 260);
    scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x5a4a30, 0.9));
    const sun = new THREE.DirectionalLight(0xfff2dd, 2.6);
    sun.position.set(30, 80, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, far: 250 });
    scene.add(sun, sun.target);
    ctx.renderer.shadowMap.enabled = true;

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2),
      new MeshStandardNodeMaterial({ color: 0x5f7a3a, roughness: 1 }),
    );
    ground.receiveShadow = true;
    scene.add(ground);

    const wind = createWindUniforms();
    const lod = createLodFadeUniforms();
    const count = ROWS * COLS;

    // 1) Kit-like "trees": tall boxes, sway + a stepped rung band (in at 0,
    //    out at 60 m) and a dithered vanish on alternate rows; per-instance
    //    wind tune on an instanced attribute (stiffness − 1, sink).
    const treeGeo = new THREE.BoxGeometry(0.6, 8, 0.6, 1, 8, 1).translate(0, 4, 0);
    const bands = new Float32Array(count * 4);
    const tunes = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const vanish = Math.floor(i / COLS) % 2 === 1;
      bands.set(vanish ? [0, 70, 0, LOD_CULL_BAND_M] : [0, 60, 0, 0], i * 4);
      tunes.set([-(i % 3) * 0.3, 0.3], i * 2);
    }
    treeGeo.setAttribute(LOD_BAND_ATTRIBUTE, new THREE.InstancedBufferAttribute(bands, 4));
    treeGeo.setAttribute(WIND_TUNE_ATTRIBUTE, new THREE.InstancedBufferAttribute(tunes, 2));
    const treeMat = new MeshStandardNodeMaterial({ color: 0x4d7a2e, roughness: 0.9 });
    applyWindSway(treeMat, wind);
    applyLodFade(treeMat, lod);
    scene.add(instanced(treeGeo, treeMat, count, (i, m) => gridMatrix(i, m, -60)));

    // 2) The far rung of the same species: a box that steps in at 60 m and
    //    casts its shadow from 0 (shadowBandFromZero).
    const farGeo = new THREE.BoxGeometry(1.2, 8, 1.2).translate(0, 4, 0);
    const farBands = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) farBands.set([60, LOD_OPEN_M, 0, 0], i * 4);
    farGeo.setAttribute(LOD_BAND_ATTRIBUTE, new THREE.InstancedBufferAttribute(farBands, 4));
    const farMat = new MeshStandardNodeMaterial({ color: 0x35591f, roughness: 1 });
    applyLodFade(farMat, lod, { shadowBandFromZero: true });
    scene.add(instanced(farGeo, farMat, count, (i, m) => gridMatrix(i, m, -60)));

    // 3) Card quads: cylindrical billboard + wind + a dithered vanish.
    const cardGeo = new THREE.PlaneGeometry(2, 3).translate(0, 1.5, 0);
    const cardBands = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) cardBands.set([0, 90, 0, LOD_CULL_BAND_M], i * 4);
    cardGeo.setAttribute(LOD_BAND_ATTRIBUTE, new THREE.InstancedBufferAttribute(cardBands, 4));
    const cardMat = new MeshStandardNodeMaterial({ color: 0x8fb04a, side: THREE.DoubleSide, roughness: 1 });
    applyWindSway(cardMat, wind);
    applyLodFade(cardMat, lod);
    applyCylindricalBillboard(cardMat, lod);
    scene.add(instanced(cardGeo, cardMat, count, (i, m) => gridMatrix(i, m, 5, 1 + (i % 4) * 0.25)));

    // 4) A foliage batch: band and tune from the per-slot data texture via
    //    `esSlot`, plus the occlusion mask (one cell marked occluded).
    const batchGeo = new THREE.ConeGeometry(1.2, 5, 7).translate(0, 2.5, 0);
    const slots = new Float32Array(count);
    for (let i = 0; i < count; i++) slots[i] = count - 1 - i; // slots are not draw order
    batchGeo.setAttribute("esSlot", new THREE.InstancedBufferAttribute(slots, 1));
    const occlusion = createBatchDataUniforms();
    const batch = createBatchDataUniforms(occlusion);
    const data = createBatchDataTexture(count);
    for (let s = 0; s < count; s++) {
      writeBatchInstance(data, s, s % 5 === 0 ? [0, 45, 0, LOD_CULL_BAND_M] : [0, LOD_OPEN_M, 0, 0],
        -(s % 2) * 0.5, 0);
    }
    data.needsUpdate = true;
    const maskSize = 8;
    const mask = new THREE.DataTexture(new Uint8Array(maskSize * maskSize), maskSize, maskSize,
      THREE.RedFormat, THREE.UnsignedByteType);
    (mask.image.data as Uint8Array)[3 * maskSize + 5] = 255;
    mask.needsUpdate = true;
    occlusion.esOccMask.value = mask;
    occlusion.esOccParams.value.set(-4, -4, maskSize, 32);
    const batchMat = new MeshStandardNodeMaterial({ color: 0x6b8f3a, roughness: 1 });
    applyWindSway(batchMat, wind);
    applyLodFade(batchMat, lod, { shadowBandFromZero: true });
    applyBatchData(batchMat, undefined, batch);
    setBatchTexture(batchMat, data);
    scene.add(instanced(batchGeo, batchMat, count, (i, m) => gridMatrix(i, m, 60, 1.1)));

    const camera = new THREE.PerspectiveCamera(55, ctx.width / ctx.height, 0.5, 600);
    camera.position.set(0, 14, 30);
    camera.lookAt(0, 3, -40);
    lod.esLodViewPos.value.copy(camera.position);

    return {
      scene,
      camera,
      frame(t: number) {
        updateWindSway(wind, t, { windDirXZ: [0.8, 0.6], windSpeedMS: 9, gustiness: 0.6 });
        // Dolly back and forth so rungs step and vanishes dither.
        camera.position.z = 30 + 40 * Math.sin(t * 0.25);
        camera.updateMatrixWorld();
        lod.esLodViewPos.value.copy(camera.position);
      },
    };
  },
};
