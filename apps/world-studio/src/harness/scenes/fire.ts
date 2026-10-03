/**
 * Harness scene "fire": every fire preset in a row by day (noon exposure,
 * 3.9e-5), drawn by the REAL fire module (`FlameSystem`: TSL flame cards on
 * both backends, the raymarched volume for the large presets on WebGPU).
 * Each fire is scaled to the same 0.8 m height so the eight read side by
 * side; left to right: candle, lanternStanding, lanternHanging, torchGround,
 * torchHandheld, brazier, hearth, campfire, on a lit ground under their own fire light
 * (`addLitGroundAndFireLights`). The sky backdrop is written through
 * the fire's own `displayToScene`, so it shows the display colours the old
 * fire sheets used (tools/fire-sheet.mjs, retired) under the frame's tone map.
 * fire-night.ts and fire-close.ts reuse `buildFireScene`.
 *
 * Readiness (vol-diag1 row 14: the first shot was black): `build` resolves
 * only after `compileAsync` of the whole scene has settled and, on WebGPU,
 * every volume field has run its prewarm (`FlameSystem.warmVolumes`), so the
 * first drawn frame already burns. `window.__FIRE_READY__` turns true after
 * that first frame has been rendered and presented; a gpu-lane capture waits
 * on it before its first shot (`fireReady`).
 */
import * as THREE from "three";
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial } from "three/webgpu";
import { uniform, vec3 } from "three/tsl";
import { FlameSystem } from "@elder-souls/game-core/fx/fire/FlameSystem";
import { FIRE_LIGHTS, FIRE_PRESETS, FIRE_PRESET_ORDER, type FirePresetId } from "@elder-souls/game-core/fx/fire/fireTypes";
import { fixtureLightFieldOf, installFixtureLighting } from "@elder-souls/game-core/render/fixtureLights/index";
import { displayToScene } from "@elder-souls/game-core/fx/fire/fireNodes";
import type { WebGPURenderer } from "three/webgpu";
import type { HarnessContext } from "../types";

declare global {
  interface Window { __FIRE_READY__?: boolean }
}

/**
 * Compile the scene, prewarm the fire's volume fields, and return the frame
 * hook that raises `window.__FIRE_READY__` once a frame has been drawn after
 * both (the frame hook runs before each render, so its second call follows
 * the first presented frame).
 */
export async function fireReady(ctx: HarnessContext, scene: THREE.Scene, camera: THREE.Camera, fire: FlameSystem):
  Promise<() => void> {
  window.__FIRE_READY__ = false;
  // bounded as main.ts bounds its own compile: a hang here would hang the page before main.ts names it
  await Promise.race([ctx.renderer.compileAsync(scene, camera), new Promise((r) => setTimeout(r, 60_000))]);
  if (ctx.backend === "webgpu") fire.warmVolumes(ctx.renderer as unknown as WebGPURenderer);
  let calls = 0;
  return () => { if (++calls === 2) window.__FIRE_READY__ = true; };
}

export interface FireLook {
  exposure: number;
  /** Display-referred sRGB hex of the sky and the ground behind the fires. */
  sky: number;
  ground: number;
}

export const FIRE_DAY: FireLook = { exposure: 3.9e-5, sky: 0x9fb8d0, ground: 0x6b6247 };
export const FIRE_NIGHT: FireLook = { exposure: 22, sky: 0x05070d, ground: 0x0b0a08 };

function backdropMaterial(hex: number, exposure: number): MeshBasicNodeMaterial {
  const c = new THREE.Color(hex); // linear display value of the sRGB hex
  const m = new MeshBasicNodeMaterial();
  m.colorNode = displayToScene(vec3(c.r, c.g, c.b), uniform(exposure), uniform(1));
  m.fog = false;
  return m;
}

/** The fire's light when its record names none: Skyrim's Torch01 LIGH (0001d4ec), 512 units, colour 250/190/131. */
const FIRE_LIGHT_RADIUS_M = 512 * 0.01428;
const FIRE_LIGHT_SRGB = 0xfabe83;
/** Height of the light over the emitter's base (the flame body, not the fuel bed). */
const FIRE_LIGHT_LIFT_M = 0.3;
/** The emitters' base height over y 0, and how far the ground plane sits under it (vol10 c8 L1). */
export const FIRE_EMITTER_Y_M = 0.02;
export const FIRE_GROUND_BELOW_M = 0.03;

/**
 * A lit ground (the backdrop's colour as albedo, roughness 1) and the game's fire light: the scene's
 * fixture light field (render/fixtureLights, the settlement's own model), one slot per emitter at
 * its base + 0.3 m with FIRE_LIGHTS' candela and radius cap (vol10 diag6 F1). The look's sky light
 * is a directional from above at the display-to-scene scale (fireNodes `displayToScene`: 0.6 / exposure),
 * so the ground reads near its backdrop colour where no fire reaches.
 */
export function addLitGroundAndFireLights(ctx: HarnessContext, scene: THREE.Scene, look: FireLook, sizeM: number,
  emitters: readonly { position: THREE.Vector3; preset: FirePresetId }[]): void {
  // vol10 c8 L1 split: `?lighting=field|tiled|plain` (plain: real PointLights, same numbers), `?firelights=0` (fire lights dark)
  const q = new URLSearchParams(window.location.search);
  const asked = q.get("lighting");
  installFixtureLighting(ctx.renderer as unknown as WebGPURenderer,
    asked === "field" || asked === "tiled" || asked === "plain" ? asked : undefined);
  const fireLightsOn = q.get("firelights") !== "0";
  const groundMat = new MeshStandardNodeMaterial({ color: new THREE.Color(look.ground), roughness: 1, metalness: 0 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(sizeM, sizeM).rotateX(-Math.PI / 2), groundMat);
  ground.name = "fire-ground";
  // under the emitters' bases (y = FIRE_EMITTER_Y_M) so a flat-cut flame base never meets the plane's depth
  ground.position.y = FIRE_EMITTER_Y_M - FIRE_GROUND_BELOW_M;
  scene.add(ground);
  // diag7 O9: 0.15 pi (was 0.6 pi, which blew the ground glow out); the fire lights are FIRE_LIGHTS candela as-is
  const skyLight = new THREE.DirectionalLight(0xffffff, (Math.PI * 0.15) / look.exposure);
  skyLight.position.set(0.3, 1, 0.4);
  scene.add(skyLight);
  const field = fixtureLightFieldOf(scene);
  field.setLights(emitters.map((e) => ({
    position: e.position.clone().add(new THREE.Vector3(0, FIRE_LIGHT_LIFT_M, 0)),
    radiusM: FIRE_LIGHTS[e.preset].maxRadiusM ?? FIRE_LIGHT_RADIUS_M, fire: true,
  })));
  const colour = new THREE.Color(FIRE_LIGHT_SRGB);
  emitters.forEach((e, i) => field.setIntensity(i, colour, fireLightsOn ? FIRE_LIGHTS[e.preset].candela : 0));
  field.commit();
}

/** A row of fires over a sky/ground backdrop at one exposure. */
export async function buildFireScene(ctx: HarnessContext, look: FireLook, presets: readonly FirePresetId[], heightM: number,
  spacingM: number, opts: { seeds?: readonly number[]; show?: (name: string) => boolean; cardsOnly?: boolean } = {}) {
  ctx.renderer.toneMappingExposure = look.exposure;
  const scene = new THREE.Scene();
  const width = spacingM * (presets.length + 1);
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(width * 4, heightM * 12), backdropMaterial(look.sky, look.exposure));
  sky.position.set(0, heightM * 6, -spacingM * 2);
  scene.add(sky);
  const fire = new FlameSystem();
  // cardsOnly: the card path as WebGL draws it, on both backends. Hiding the
  // volume meshes is not enough: on WebGPU the cards of a volume preset yield
  // to the volume inside its reach (flameMaterial.ts cardShare), so hidden
  // volumes left the WebGPU cards faded (the ~9 luma backend gap, L19 round)
  fire.setBackend(opts.cardsOnly ? "webgl" : ctx.backend);
  const emitters = presets.map((preset, i) => ({
    position: new THREE.Vector3((i - (presets.length - 1) / 2) * spacingM, FIRE_EMITTER_Y_M, 0),
    preset, scale: heightM / FIRE_PRESETS[preset].shape.heightM, seed: opts.seeds?.[i] ?? (0.37 + i * 0.13) % 1, owner: i,
  }));
  fire.setEmitters(emitters);
  addLitGroundAndFireLights(ctx, scene, look, Math.max(width * 4, spacingM * 8), emitters);
  scene.add(fire.group);
  const fov = 36;
  const aspect = ctx.width / ctx.height;
  const halfW = (spacingM * presets.length) / 2;
  const dist = Math.max(halfW / (Math.tan((fov * Math.PI) / 360) * aspect), heightM * 1.4 / Math.tan((fov * Math.PI) / 360));
  const camera = new THREE.PerspectiveCamera(fov, aspect, 0.05, 200);
  camera.position.set(0, heightM * 0.55, dist);
  camera.lookAt(0, heightM * 0.5, 0);
  camera.layers.enableAll();
  camera.updateMatrixWorld();
  fire.update(3.7, () => 1);
  const drawn = await fireReady(ctx, scene, camera, fire);
  return {
    scene,
    camera,
    frame(t: number) {
      drawn();
      fire.update(3.7 + t, () => 1, { x: 0.3, y: 0 });
      // diagnostic layer isolation (fire-diag-*.ts): hide the draws `show` rejects
      if (opts.show) for (const o of fire.group.children) o.visible = opts.show(o.name);
    },
  };
}

export default {
  name: "fire",
  build(ctx: HarnessContext) {
    return buildFireScene(ctx, FIRE_DAY, FIRE_PRESET_ORDER, 0.8, 1.3);
  },
};
