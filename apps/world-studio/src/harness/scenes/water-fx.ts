/**
 * Harness scene "water-fx": the waterfall and water-interaction effects on
 * the REAL package code (decision 0107) — kit piece materials for four real
 * shape roles (the lit inner shell with its normal map, a two-layer
 * whitewater foam, a breathing thin sheet, a luminance-coverage mist card)
 * on a synthetic 20 m fall, the ray-marched mist volume over that fall (its
 * path traced by the real tracer), the spray/mist/foam sprites and impact
 * crowns (WaterEffects) and the underwater bubbles drawn through their own
 * half-resolution pass (UnderwaterBubblePass) and shown on a screen quad.
 *
 * Noon sun with cascaded shadows (CSMShadowNode, as the sky sets it) so the
 * kit's and the mist's sun-visibility read compiles on the real node. An
 * opaque depth target (the ground) feeds every soft-depth fade, as
 * WaterPipeline does. `frame(t)` advances time, keeps the sources emitting
 * and re-renders the bubble target.
 */
import * as THREE from "three";
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial, RenderTarget } from "three/webgpu";
import { CSMShadowNode } from "three/examples/jsm/csm/CSMShadowNode.js";
import type { Vec3, WaterInteractionEvent, WaterSample, WorldWaterQuery } from "@elder-souls/contracts";
import type { HarnessContext, HarnessScene } from "../types";
import { WATER_LAYER } from "@elder-souls/game-core/water/render/waterMaterial";
import { KIT_SHAPE_ROLES, type KitShapeRole } from "@elder-souls/game-core/water/render/WaterfallKit";
import {
  createKitPieceMaterial, createKitSharedUniforms, prepareKitTexture,
} from "@elder-souls/game-core/water/render/WaterfallKitMaterial";
import { WaterfallMistVolume } from "@elder-souls/game-core/water/render/WaterfallMistVolume";
import { traceWaterfallSheet, type Cascade } from "@elder-souls/game-core/water/render/WaterfallSheets";
import { WaterEffects } from "@elder-souls/game-core/water/render/WaterEffects";
import { UnderwaterBubbles } from "@elder-souls/game-core/water/render/UnderwaterBubbles";
import { UnderwaterBubblePass } from "@elder-souls/game-core/water/render/UnderwaterBubblePass";

const EFFECTS_LAYER = 5;
const OPAQUE_LAYER = 1;
const DROP_M = 20;

/** A still pool, level 0 m, 2 m deep everywhere. */
const pool: WorldWaterQuery = {
  sample: (): WaterSample => ({
    waterBodyId: "pool", surfaceHeight: 0, surfaceNormal: { x: 0, y: 1, z: 0 }, flowVelocity: { x: 0, y: 0, z: 0 },
    depth: 2, immersion: 0, turbidity: 0, salinity: 0, temperature: 12, hazardIds: [],
  } as unknown as WaterSample),
  emitInteraction: () => {},
} as unknown as WorldWaterQuery;

/** Greyscale streak texture, coverage in alpha (like the vanilla FX tiles). */
function streakTexture(): THREE.Texture {
  const n = 64;
  const data = new Uint8Array(n * n * 4);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const s = 0.5 + 0.5 * Math.sin(i * 0.9 + Math.sin(j * 0.21) * 3);
    const v = Math.round(255 * (0.55 + 0.45 * s));
    data.set([v, v, v, Math.round(255 * s)], (j * n + i) * 4);
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  return prepareKitTexture(tex);
}

function flatNormal(): THREE.Texture {
  const data = new Uint8Array([128, 128, 255, 255]);
  return prepareKitTexture(new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat));
}

function findRole(test: (r: KitShapeRole) => boolean): KitShapeRole {
  for (const roles of Object.values(KIT_SHAPE_ROLES)) for (const r of roles) if (test(r)) return r;
  throw new Error("water-fx harness: no kit role matches");
}

const scene: HarnessScene = {
  name: "water-fx",
  async build(ctx: HarnessContext) {
    const { renderer } = ctx;
    // `&parts=kit,mist,fx,bubbles` limits the scene (bisecting a slow compile)
    const partsParam = new URLSearchParams(globalThis.location?.search ?? "").get("parts");
    const want = (part: string) => !partsParam || partsParam.split(",").includes(part);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9cc4e4);
    const camera = new THREE.PerspectiveCamera(55, ctx.width / ctx.height, 0.3, 600);
    camera.position.set(0, 9, 32);
    camera.lookAt(0, 8, 0);
    camera.layers.enable(WATER_LAYER);
    camera.layers.enable(EFFECTS_LAYER);
    camera.updateMatrixWorld();

    renderer.shadowMap.enabled = true;
    const sunDir = new THREE.Vector3(0.35, 0.9, 0.25).normalize();
    const sun = new THREE.DirectionalLight(0xfff4e0, 3);
    sun.position.copy(sunDir).multiplyScalar(100);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const csm = new CSMShadowNode(sun, { cascades: 2, maxFar: 200 });
    sun.shadow.shadowNode = csm;
    sun.layers.enableAll();
    const hemi = new THREE.HemisphereLight(0xbcd4ee, 0x4a4030, 1.2);
    hemi.layers.enableAll();
    scene.add(sun, sun.target, hemi);

    // Opaque ground + cliff (casts the shadow the kit reads), also drawn into
    // the opaque depth target every soft fade samples.
    const opaque = new THREE.Group();
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2).translate(0, -1.5, 0),
      new MeshStandardNodeMaterial({ color: 0x5f6a4a, roughness: 1 }));
    ground.receiveShadow = true;
    const cliff = new THREE.Mesh(new THREE.BoxGeometry(40, DROP_M, 6).translate(0, DROP_M / 2, -3.2),
      new MeshStandardNodeMaterial({ color: 0x6d655a, roughness: 1 }));
    cliff.castShadow = true;
    cliff.receiveShadow = true;
    opaque.add(ground, cliff);
    for (const m of [ground, cliff]) m.layers.set(OPAQUE_LAYER);
    camera.layers.enable(OPAQUE_LAYER);
    scene.add(opaque);
    const depthRT = new RenderTarget(ctx.width, ctx.height, { depthTexture: new THREE.DepthTexture(ctx.width, ctx.height) });

    // --- The kit: four real shape roles on vertical sheets, instanced 3 wide.
    const shared = createKitSharedUniforms();
    shared.sunShadow.node = csm;
    shared.uSunDir.value.copy(sunDir);
    shared.uAmbient.value.set(0.09, 0.11, 0.14);     // aerial feeds (sky x 0.1, sun x 0.06)
    shared.uSunLight.value.set(0.42, 0.38, 0.32);
    const tex = streakTexture();
    const normal = flatNormal();
    const roles = [
      findRole((r) => r.kind === "lit" && !!r.normal),
      findRole((r) => !!r.scroll2),
      findRole((r) => !!r.breathe),
      findRole((r) => !!r.covFromLum),
    ];
    const sheetGeo = new THREE.PlaneGeometry(6, DROP_M, 1, 8).translate(0, DROP_M / 2, 0);
    const falls = new THREE.Group();
    roles.forEach((role, k) => {
      const geo = sheetGeo.clone();
      const count = 3;
      const inst = new Float32Array(count * 4);
      const mesh = new THREE.InstancedMesh(geo, createKitPieceMaterial(role, tex, role.normal ? normal : null, shared), count);
      const m = new THREE.Matrix4();
      for (let i = 0; i < count; i++) {
        // a little yaw and a non-uniform scale so the lifted-position inverse is exercised
        m.compose(new THREE.Vector3(-14 + i * 14, 0, k * 0.15),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (i - 1) * 0.25),
          new THREE.Vector3(1 + i * 0.2, 1, 1));
        mesh.setMatrixAt(i, m);
        inst.set([i * 1.7, 0, 0, 1], i * 4);
      }
      geo.setAttribute("aInst", new THREE.InstancedBufferAttribute(inst, 4));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.layers.set(WATER_LAYER);
      mesh.frustumCulled = false;
      mesh.renderOrder = role.upness >= 1 ? 3 : role.kind === "mist" ? 5 : 4;
      falls.add(mesh);
    });
    if (want("kit")) scene.add(falls);

    // --- The mist volume over a traced 20 m fall.
    const profile = Array.from({ length: 40 }, (_, i) => (i < 1 ? DROP_M - 0.5 : -1.5));
    const cascade = {
      id: "harness-fall", lip: { x: 0, y: DROP_M, z: 0 }, plunge: { x: 0, y: 0, z: 4 },
      direction: { x: 0, z: 1 }, widthM: 8, dropM: DROP_M, riverBand: 0, bodyIndex: 0,
      profile, profileStepM: 1, profileStartM: 0, lipSpeedMS: 3, bowlRadiusM: 6,
    } as Cascade;
    const mist = new WaterfallMistVolume([traceWaterfallSheet(cascade)], shared);
    if (want("mist")) scene.add(mist.mesh);

    // --- Spray, mist and foam sprites + the impact crowns.
    const effects = new WaterEffects({ layer: EFFECTS_LAYER, seed: 7 });
    effects.setIllumination({ x: 0.9, y: 0.95, z: 1.0 }, { x: 3, y: 2.8, z: 2.5 }, 0.9, 1);
    if (want("fx")) scene.add(effects.object3d);
    const focus: Vec3 = { x: 0, y: 1.6, z: 12 };
    const splash: WaterInteractionEvent = {
      kind: "enter", actorId: "actor.player", position: { x: 2, y: 0, z: 8 },
      velocity: { x: 0, y: -7, z: 0 }, radius: 0.6, magnitude: 900,
    };
    const plunge: WaterInteractionEvent = {
      kind: "splash", position: { x: 0, y: 0, z: 4 }, velocity: { x: 0, y: -12, z: 1 }, radius: 1.5, magnitude: 400,
    };

    // --- Underwater bubbles, through their own target, shown on a quad.
    const bubbles = new UnderwaterBubbles(false);
    bubbles.setIllumination({ x: 0.3, y: 0.4, z: 0.5 }, { x: 1.2, y: 1.2, z: 1.1 }, 0.9);
    const bubblePass = new UnderwaterBubblePass(false);
    const underwaterEye: Vec3 = { x: 0, y: -0.35, z: 11.2 };
    // the bubbles are 1-5 cm: a camera just below the surface, a metre off,
    // with its own opaque depth, as WaterPipeline gives the submerged view
    const bubbleCam = new THREE.PerspectiveCamera(50, ctx.width / ctx.height, 0.05, 200);
    bubbleCam.position.set(0, -0.35, 11.2);
    bubbleCam.lookAt(0, -0.3, 9);
    bubbleCam.updateMatrixWorld();
    const bubbleDepthRT = new RenderTarget(ctx.width, ctx.height, { depthTexture: new THREE.DepthTexture(ctx.width, ctx.height) });
    const bubbleQuadMat = new MeshBasicNodeMaterial({ transparent: true, depthTest: false, depthWrite: false });
    bubbleQuadMat.toneMapped = false;
    bubbleQuadMat.premultipliedAlpha = true;
    const bubbleQuad = new THREE.Mesh(new THREE.PlaneGeometry(10, 5.6), bubbleQuadMat);
    bubbleQuad.position.set(16, 3, 8);
    bubbleQuad.renderOrder = 10;
    bubbleQuad.frustumCulled = false;
    if (want("bubbles")) scene.add(bubbleQuad);

    let last = 0;
    const step = (t: number) => {
      const dt = Math.max(t - last, 1 / 60);
      last = t;
      shared.uTime.value = t;
      mist.setCamera(camera);
      effects.emit(splash);
      effects.emitContinuous("harness-plunge", plunge, 6, dt, { mist: 0.8, fallFrom: { x: 0, y: DROP_M, z: 1 } });
      effects.update(dt, t, pool, 0, focus, { x: 1, y: 0, z: 0.4 });
      bubbles.emit({ ...splash, position: { x: 0, y: 0, z: 10 }, velocity: { x: 0, y: -4, z: 0 }, radius: 0.4 });
      bubbles.update(dt, pool, 0, underwaterEye);
    };
    step(0);

    const renderDepthAndBubbles = () => {
      const prev = renderer.getRenderTarget();
      const opaqueDepth = (cam: THREE.PerspectiveCamera, target: RenderTarget) => {
        const mask = cam.layers.mask;
        cam.layers.set(OPAQUE_LAYER);
        renderer.setRenderTarget(target);
        renderer.render(scene, cam);
        cam.layers.mask = mask;
      };
      opaqueDepth(camera, depthRT);
      if (want("bubbles")) opaqueDepth(bubbleCam, bubbleDepthRT);
      renderer.setRenderTarget(prev);
      const depth = depthRT.depthTexture as THREE.Texture;
      shared.uSceneDepth.value = depth;
      shared.uHasDepth.value = 1;
      shared.uCamNear.value = camera.near;
      shared.uCamFar.value = camera.far;
      shared.uResolution.value.set(ctx.width, ctx.height);
      effects.setDepth(depth, camera.near, camera.far, ctx.width, ctx.height);
      if (!want("bubbles")) return;
      const bubbleTex = bubblePass.render(renderer, bubbleCam, bubbles, true, bubbleDepthRT.depthTexture as THREE.Texture, ctx.width, ctx.height,
        new THREE.Vector3(0.12, 0.05, 0.03), new THREE.Vector3(0.02, 0.05, 0.06));
      if (bubbleQuadMat.map !== bubbleTex) {
        bubbleQuadMat.map = bubbleTex;
        bubbleQuadMat.needsUpdate = true;
      }
    };
    renderDepthAndBubbles();

    return {
      scene,
      camera,
      frame(t: number) {
        step(t);
        renderDepthAndBubbles();
      },
    };
  },
};

export default scene;
