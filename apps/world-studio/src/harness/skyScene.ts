/**
 * Shared builder for the sky harness scenes (sky-noon, sky-night): the REAL
 * WorldSky pieces (skyObjects.ts dome, stars, Serpent, moons, sun cascades;
 * aerial.ts fog node; lightRig) over a lit ground plane with boxes from
 * 200 m to 3 km, so the aerial haze and the CSM cascades both show. Values
 * are written by the same helpers WorldSky's frame loop uses.
 */
import * as THREE from "three";
import { MeshStandardNodeMaterial, PMREMGenerator } from "three/webgpu";
import { localSiderealAngle, toEpochMinutes, toHorizontal } from "@elder-souls/world-time";
import { createAerialFogNode, createAerialUniforms } from "../sky/aerial";
import { createCloudUniforms } from "../sky/cloudField";
import { computeLightRig } from "../sky/lightRig";
import {
  MOON_RADIUS,
  STAR_RADIUS,
  aimSun,
  copySkyUniforms,
  createMoonMaterial,
  createSkyDome,
  createStarLayer,
  createSunCascades,
  flattenCatalogue,
  starAttributes,
  writeDomeFromRig,
} from "../sky/skyObjects";
import type { HarnessBuilt, HarnessContext } from "./types";

/** Harness camera: 40 m up at the province centre, looking along +z. */
const EXTENT_M = 20_000;

export function buildSkyScene(ctx: HarnessContext, hour: number, opts: { pmrem?: boolean } = {}): HarnessBuilt {
  const { renderer, width, height } = ctx;
  const epoch = toEpochMinutes({ era: 4, year: 201, month: 7, day: 17, minuteOfDay: hour * 60 });
  const rig = computeLightRig(epoch, 0.6, 0.5);
  const sunDir = new THREE.Vector3(rig.sun.direction.x, rig.sun.direction.y, rig.sun.direction.z);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, width / height, 0.5, 60_000);
  camera.position.set(EXTENT_M / 2, 40, EXTENT_M / 2);
  camera.lookAt(EXTENT_M / 2 + 300, 25, EXTENT_M / 2 + 2000);
  camera.updateMatrixWorld();

  // Aerial haze with a humid, hazy province (no rasters: the region floor is
  // the placeholder's zero, so humidity/mist come from the conditions only).
  const aerial = createAerialUniforms();
  aerial.uProvinceExtentM.value = EXTENT_M;
  aerial.uSunDirW.value.copy(sunDir.y > 0 ? sunDir : new THREE.Vector3(rig.moons[0].direction.x, rig.moons[0].direction.y, rig.moons[0].direction.z));
  aerial.uHazeSunLight.value.set(...rig.hazeSunLight);
  aerial.uHazeAmbient.value.set(...rig.hazeAmbient);
  aerial.uMistStrength.value = rig.mistStrength;
  aerial.uWeatherMie.value = 0.4;
  aerial.uFogLum.value.set(...rig.fogLum);
  aerial.uFogSunLum.value.set(...rig.fogSunLum);
  aerial.uEsFogCam.value.copy(camera.position);
  (scene as THREE.Scene & { fogNode?: unknown }).fogNode = createAerialFogNode(aerial);

  const studioSky = addStudioSky(renderer, scene, camera, rig, sunDir, aerial, { bakeAtBuild: true, ...opts });
  const { clouds } = studioSky;

  // Stars, Serpent, moons.
  const stars = flattenCatalogue();
  const starLayer = createStarLayer("stars", starAttributes(stars, 1), clouds);
  const lst = localSiderealAngle(epoch);
  stars.forEach((s, i) => {
    const h = toHorizontal(s.dec, lst - s.ra);
    starLayer.position.setXYZ(i, h.direction.x * STAR_RADIUS, h.direction.y * STAR_RADIUS, h.direction.z * STAR_RADIUS);
  });
  starLayer.position.needsUpdate = true;
  starLayer.uniforms.uOpacity.value = rig.nightBoost;
  starLayer.uniforms.uSunAltDeg.value = (rig.sun.altitude * 180) / Math.PI;
  starLayer.uniforms.uDawnDir.value.set(rig.dawnDir[0], rig.dawnDir[1]);
  starLayer.mesh.position.copy(camera.position);
  starLayer.mesh.renderOrder = -8;
  scene.add(starLayer.mesh);
  const serpent = createStarLayer("serpent", { size: new Float32Array(4).fill(9), lum: new Float32Array(4).fill(1) }, clouds);
  for (let i = 0; i < 4; i++) serpent.position.setXYZ(i, 0, STAR_RADIUS * (0.8 + 0.05 * i), STAR_RADIUS * 0.4);
  serpent.uniforms.uOpacity.value = 0.55 * rig.starOpacity;
  serpent.mesh.renderOrder = -7;
  serpent.mesh.position.copy(camera.position);
  scene.add(serpent.mesh);
  const tints = [new THREE.Color(1.0, 0.58, 0.44), new THREE.Color(0.86, 0.9, 1.0)];
  rig.moons.forEach((m, i) => {
    const moon = createMoonMaterial(tints[i]);
    moon.uniforms.uSunDir.value.copy(sunDir);
    moon.uniforms.uDayDim.value = 1 - 0.88 * rig.skyFade;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), moon.material);
    // Harness: hang both moons in view whatever the ephemeris says.
    const dir = new THREE.Vector3(0.15 * (i ? -1 : 1), 0.18 + 0.06 * i, 1).normalize();
    mesh.position.copy(camera.position).addScaledVector(dir, MOON_RADIUS);
    mesh.scale.setScalar(Math.tan(m.angularDiameter / 2) * MOON_RADIUS * 3);
    mesh.renderOrder = -9;
    mesh.frustumCulled = false;
    scene.add(mesh);
  });

  // Sun (cascaded shadows, flyover arrangement) + sky ambient + moonlight.
  const { sun } = createSunCascades({ cascades: 3, maxFar: 6000, shadowMapSize: 1024 });
  aimSun(sun, sunDir, camera.position, rig);
  scene.add(sun, sun.target);
  const moonLight = new THREE.DirectionalLight(0xffffff, rig.moonIntensity);
  moonLight.color.setRGB(...rig.moonColor);
  const md = rig.moons[0].direction;
  moonLight.position.copy(camera.position).add(new THREE.Vector3(md.x, md.y, md.z).multiplyScalar(2000));
  moonLight.target.position.copy(camera.position);
  scene.add(moonLight, moonLight.target);
  renderer.toneMappingExposure = rig.exposureTarget;

  // Ground and boxes at 200 m – 3 km (haze by distance, shadows near).
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(EXTENT_M, EXTENT_M),
    new MeshStandardNodeMaterial({ color: 0x6b7a4a, roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(EXTENT_M / 2, 0, EXTENT_M / 2);
  ground.receiveShadow = true;
  scene.add(ground);
  const boxMat = new MeshStandardNodeMaterial({ color: 0xb8a58a, roughness: 0.8 });
  const near = [
    [6, 12, 25], [-8, 6, 40], [14, 20, 70],
  ];
  const far = [
    [60, 80, 200], [-180, 120, 500], [260, 160, 1000], [-500, 240, 2000], [700, 320, 3000],
  ];
  for (const [dx, h, dz] of [...near, ...far]) {
    const w = Math.max(4, h * 0.6);
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), boxMat);
    box.position.set(EXTENT_M / 2 + dx, h / 2, EXTENT_M / 2 + dz);
    box.castShadow = true;
    box.receiveShadow = true;
    scene.add(box);
  }

  return {
    scene,
    camera,
    frame: studioSky.frame,
  };
}

/**
 * The studio's sky light on a harness scene, as WorldSky sets it: the dome
 * as the background (radiance on the scene's lux scale, so it survives the
 * photometric exposure; a plain `scene.background` colour is a clear colour
 * that WebGPURenderer tone-maps with that exposure, ~2.6e-5 at noon, and
 * reads black), the PMREM sky IBL baked from a second dome in the first
 * frame (the studio's main indirect light: without it shadowed ground at
 * noon lies at luma ~1 on BOTH renderers), and the rig's hemisphere light.
 * The sun and its cascades stay with the scene.
 */
export function addStudioSky(
  renderer: HarnessContext["renderer"],
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  rig: ReturnType<typeof computeLightRig>,
  sunDir: THREE.Vector3,
  aerial: ReturnType<typeof createAerialUniforms>,
  opts: { pmrem?: boolean; bakeAtBuild?: boolean } = {},
): { clouds: ReturnType<typeof createCloudUniforms>; frame(t: number): void } {
  const clouds = createCloudUniforms();
  clouds.uCloudCov.value.set(0.15, 0.35, 0.25);
  clouds.uCloudDens.value = 0.9;
  clouds.uCloudDir.value.set(0.8, 0.6);

  // Inside the far plane (the dome shades by view direction, not radius).
  const dome = createSkyDome(Math.min(STAR_RADIUS * 1.6, camera.far * 0.9), aerial, clouds);
  writeDomeFromRig(dome, rig, sunDir, 0);
  dome.sky.position.copy(camera.position);
  dome.sky.renderOrder = -10;
  dome.sky.frustumCulled = false;
  scene.add(dome.sky);

  // PMREM sky IBL from a second dome, as WorldSky bakes it.
  const bake = createSkyDome(100, aerial, clouds);
  copySkyUniforms(dome, bake);
  bake.sky.showSunDisc.value = 0;
  const bakeScene = new THREE.Scene();
  bakeScene.add(bake.sky);
  // Baked in the frame loop, as WorldSky does (never at build time).
  let pmrem: PMREMGenerator | null = opts.pmrem === false ? null : new PMREMGenerator(renderer);
  // `bakeAtBuild`: bake before the harness's compileAsync, so every program
  // is compiled with the environment in place. Baked in frame 0 instead, a
  // heavy material (the ground splat) must recompile inside render(): on
  // WebGPU/SwiftShader the terrain scene then never finished (240 s).
  if (pmrem && opts.bakeAtBuild) {
    scene.environment = pmrem.fromScene(bakeScene, 0, 0.1, 1100).texture;
    pmrem = null;
  }

  const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, rig.hemiIntensity);
  hemi.color.setRGB(...rig.hemiSky);
  hemi.groundColor.setRGB(...rig.hemiGround);
  scene.add(hemi);

  return {
    clouds,
    frame(t: number) {
      clouds.uCloudTime.value = 137 + t * 30;
      if (pmrem) {
        scene.environment = pmrem.fromScene(bakeScene, 0, 0.1, 1100).texture;
        pmrem = null;
      }
    },
  };
}
