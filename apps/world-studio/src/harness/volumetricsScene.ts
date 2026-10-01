/**
 * The `volumetrics-*` harness scenes (decision 0112 §8): one small synthetic
 * world (a valley and a hill, a pond, a wet valley floor, ~40 trees (an open canopy, ~35 % sky) with
 * crowns, lanterns, a chimney smoke column, a stone room with a window) with
 * the real `Volumetrics` from game-core composed into `scene.fogNode`, shot
 * from the named cameras below. Lit at exposure 1 (harness units: sun
 * irradiance ~3), so fog and scene share one set of units as in the studio.
 */
import * as THREE from "three";
import { MeshStandardNodeMaterial, MeshBasicNodeMaterial } from "three/webgpu";
import * as tsl from "three/tsl";
import type { HarnessContext, HarnessScene } from "./types";
import { Volumetrics, type ApertureLight, type InteriorFogProfile, type VolumeLight } from "@elder-souls/game-core/air/volumetrics/froxelGrid";
import { applyVolumetrics } from "@elder-souls/game-core/air/volumetrics/volumetricNodes";
import { fogRegimes, type FogFieldInput, type FogRegimes } from "@elder-souls/game-core/air/volumetrics/fogField";
import type { Crown } from "@elder-souls/game-core/air/volumetrics/canopyMap";
import { effectTextureFile, SMOKE_COLUMN_ASSET_ID, SmokeColumns } from "@elder-souls/game-core/settlement/smokeColumn";


// ---- the synthetic world -------------------------------------------------
const POND = { x: 60, z: -40, r: 18 };
function ground(x: number, z: number): number {
  const valley = Math.min(40, 0.0035 * x * x); // valley floor along z at x = 0
  const hill = 45 * Math.exp(-((x + 150) ** 2 + (z - 40) ** 2) / (2 * 60 * 60));
  const pondD = Math.hypot(x - POND.x, z - POND.z);
  const pond = pondD < POND.r * 1.3 ? -2.5 * (1 - pondD / (POND.r * 1.3)) : 0;
  return valley + hill + pond;
}
const pondSurface = ground(POND.x + POND.r * 1.3, POND.z) - 0.6;
const FOREST: Crown[] = [];
{
  let s = 0x7ee5;
  const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
  for (let i = 0; i < 40; i++) {
    const x = -30 + rnd() * 60, z = -240 + rnd() * 80;
    const g = ground(x, z), r = 4 + rnd() * 2.5;
    FOREST.push({ x, z, radiusM: r, bottomM: g + 7, topM: g + 7 + r * 1.6 });
  }
}
const LANTERNS = [[-10, 120], [-4, 128], [4, 116], [10, 126], [0, 136]].map(([x, z]) => new THREE.Vector3(x, ground(x, z) + 2.2, z));
const ROOM = { x: 400, z: 400, y: 0, w: 10, h: 4, d: 8 };

type ShotName = "valley-dawn-from-hill" | "valley-noon" | "forest-looking-away" | "pond-dawn-steam" | "marsh-dusk-groundfog" | "forest-morning-shafts"
  | "lanterns-night-mist" | "noon-haze-smoke" | "cave-floor-mist" | "window-beams";
interface Shot {
  eye: [number, number, number]; look: [number, number, number];
  sunAltDeg: number; sunAzDeg: number; sun: [number, number, number]; sky: [number, number, number];
  bg: number; exposure: number; regimes: Partial<FogRegimes>;
  /** When given, the regimes come from the fog field at this clock (the where/when proof shots). */
  fog?: Partial<FogFieldInput>; lanterns?: boolean; interior?: InteriorFogProfile; window?: boolean;
}
const R0: FogRegimes = { radiationMist: 0, steamFog: 0, marshFog: 0, seaFog: 0, canopyHaze: 0.25, air: 1, windXZ: [0.6, 0.2] };
const DAWN_SUN: [number, number, number] = [2.6, 1.5, 0.8];
const VALLEY_CLIMATE: FogFieldInput = {
  minuteOfDay: 360, sunriseMin: 360, sunsetMin: 1110, prevNightClearCalm: 1, hoursSinceRain: Infinity, rain: 0,
  windSpeedMS: 0.5, windDirXZ: [0.95, 0.3], humidity: 0.8, wetSeason: 0.6,
};
const FOREST_EYE: [number, number, number] = [0, ground(0, -175) + 1.7, -175];
export const SHOTS: Record<ShotName, Shot> = {
  "valley-dawn-from-hill": { eye: [-150, ground(-150, 40) + 25, 40], look: [0, 5, -60], sunAltDeg: 3, sunAzDeg: 80, sun: DAWN_SUN, sky: [0.5, 0.55, 0.7], bg: 0xc9b8a8, exposure: 1.2, regimes: {}, fog: { minuteOfDay: 360 } },
  "valley-noon": { eye: [-150, ground(-150, 40) + 25, 40], look: [0, 5, -60], sunAltDeg: 65, sunAzDeg: 150, sun: [3.2, 3.1, 2.9], sky: [0.8, 0.9, 1.1], bg: 0x9cc4e4, exposure: 1, regimes: {}, fog: { minuteOfDay: 720 } },
  "pond-dawn-steam": { eye: [POND.x - 34, pondSurface + 1.6, POND.z + 12], look: [POND.x + 10, pondSurface + 1.2, POND.z - 4], sunAltDeg: 4, sunAzDeg: 70, sun: DAWN_SUN, sky: [0.5, 0.55, 0.7], bg: 0xc9b8a8, exposure: 1.2, regimes: { steamFog: 1, radiationMist: 0.1 } },
  "marsh-dusk-groundfog": { eye: [0, ground(0, 40) + 1.7, 40], look: [0, 1, -40], sunAltDeg: 2, sunAzDeg: 260, sun: [2.2, 1.0, 0.5], sky: [0.35, 0.35, 0.5], bg: 0x8a7a8a, exposure: 1.6, regimes: { marshFog: 1 } },
  "forest-morning-shafts": { eye: FOREST_EYE, look: [0, 9, -240], sunAltDeg: 22, sunAzDeg: 0, sun: [3.2, 2.9, 2.4], sky: [0.7, 0.8, 1.0], bg: 0xa8c0d8, exposure: 1, regimes: { canopyHaze: 0.7, air: 0.3 } },
  "forest-looking-away": { eye: FOREST_EYE, look: [0, 9, -240], sunAltDeg: 22, sunAzDeg: 180, sun: [3.2, 2.9, 2.4], sky: [0.7, 0.8, 1.0], bg: 0xa8c0d8, exposure: 1, regimes: { canopyHaze: 0.7, air: 0.3 } },
  "lanterns-night-mist": { eye: [0, ground(0, 100) + 1.7, 100], look: [0, 2, 126], sunAltDeg: -20, sunAzDeg: 0, sun: [0, 0, 0], sky: [0.012, 0.022, 0.05], bg: 0x070b14, exposure: 3, regimes: { marshFog: 1, radiationMist: 0.5 }, lanterns: true },
  "noon-haze-smoke": { eye: [-14, ground(-14, 42) + 3, 42], look: [0, 11, 20], sunAltDeg: 65, sunAzDeg: 150, sun: [3.2, 3.1, 2.9], sky: [0.8, 0.9, 1.1], bg: 0x9cc4e4, exposure: 1, regimes: { air: 3 } },
  "cave-floor-mist": { eye: [ROOM.x - 4, 1.6, ROOM.z + 3], look: [ROOM.x + 4, 0.3, ROOM.z - 3], sunAltDeg: -20, sunAzDeg: 0, sun: [0, 0, 0], sky: [0.004, 0.004, 0.005], bg: 0x000000, exposure: 3, regimes: {}, lanterns: true, interior: { floorY: 0, floorMistTopM: 0.9, floorMistDensity: 0.9, dustDensity: 0.006 } },
  "window-beams": { eye: [ROOM.x - 4, 1.6, ROOM.z - 3], look: [ROOM.x + 2, 1.0, ROOM.z + 3], sunAltDeg: 35, sunAzDeg: 0, sun: [3.2, 3.0, 2.6], sky: [0.1, 0.1, 0.11], bg: 0x000000, exposure: 2, regimes: {}, interior: { floorY: 0, floorMistTopM: 0, floorMistDensity: 0, dustDensity: 0.008 }, window: true },
};

async function smokeTexture(): Promise<THREE.Texture> {
  const manifestUrl = `${import.meta.env.BASE_URL ?? "/"}kits/works-v1.kit.json`;
  const res = await fetch(manifestUrl);
  const file = effectTextureFile(await res.json(), SMOKE_COLUMN_ASSET_ID, manifestUrl);
  const tex = await new THREE.TextureLoader().loadAsync(`${manifestUrl.replace(/[^/]*$/, "")}${file}`);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** The pond: dark water whose normal carries two octaves of wind ripples, so a low sun's glint
 * breaks into a glitter path instead of one smooth column. */
function pondMaterial(): MeshStandardNodeMaterial {
  const V = tsl as unknown as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const m = new MeshStandardNodeMaterial({ color: 0x1d3140, roughness: 0.12, metalness: 0 });
  const xz = V.positionWorld.xz;
  const a = V.mx_noise_vec3(V.vec3(xz.mul(1.3), 0.5));
  const b = V.mx_noise_vec3(V.vec3(xz.mul(4.1).add(7), 1.5));
  const nW = V.normalize(V.vec3(a.x.mul(0.22).add(b.x.mul(0.12)), 1, a.y.mul(0.22).add(b.y.mul(0.12))));
  m.normalNode = V.transformNormalToView(nW);
  return m;
}

function buildWorld(scene: THREE.Scene): void {
  const geo = new THREE.PlaneGeometry(1400, 1400, 175, 175).rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, ground(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  scene.add(new THREE.Mesh(geo, new MeshStandardNodeMaterial({ color: 0x55653a, roughness: 1 })));
  const pond = new THREE.Mesh(new THREE.CircleGeometry(POND.r * 1.25, 48).rotateX(-Math.PI / 2),
    pondMaterial());
  pond.position.set(POND.x, pondSurface, POND.z);
  scene.add(pond);
  const trunkM = new MeshStandardNodeMaterial({ color: 0x3b2c20, roughness: 1 });
  const crownM = new MeshStandardNodeMaterial({ color: 0x2c4a22, roughness: 1 });
  for (const c of FOREST) {
    const g = ground(c.x, c.z);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, c.bottomM - g + 1, 8), trunkM);
    trunk.position.set(c.x, (c.bottomM + g) / 2, c.z);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), crownM);
    crown.scale.set(c.radiusM, (c.topM - c.bottomM) / 2, c.radiusM);
    crown.position.set(c.x, (c.topM + c.bottomM) / 2, c.z);
    scene.add(trunk, crown);
  }
  const houseM = new MeshStandardNodeMaterial({ color: 0x8a6d4b });
  const house = new THREE.Mesh(new THREE.BoxGeometry(6, 6, 6), houseM);
  house.position.set(0, ground(0, 20) + 3, 20);
  scene.add(house);
  // the stone room: floor, ceiling, four walls; the +z wall holds a window
  const stone = new MeshStandardNodeMaterial({ color: 0x77706a, roughness: 1 });
  const slab = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stone);
    m.position.set(ROOM.x + x, ROOM.y + y, ROOM.z + z);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  };
  const { w, h, d } = ROOM;
  slab(w, 0.3, d, 0, -0.15, 0); slab(w, 0.3, d, 0, h + 0.15, 0);
  slab(0.3, h, d, -w / 2, h / 2, 0); slab(0.3, h, d, w / 2, h / 2, 0);
  slab(w, h, 0.3, 0, h / 2, -d / 2);
  // window 1.2 x 1.2 at x 0, y 2.4 in the +z wall
  slab(w / 2 - 0.6, h, 0.3, -(w / 4 + 0.3), h / 2, d / 2); slab(w / 2 - 0.6, h, 0.3, w / 4 + 0.3, h / 2, d / 2);
  slab(1.2, 1.8, 0.3, 0, 0.9, d / 2); slab(1.2, h - 3.0, 0.3, 0, 3.0 + (h - 3.0) / 2, d / 2);
}

export function volumetricsShot(name: ShotName, expectDark = false): HarnessScene {
  return {
    name: `volumetrics-${name}`,
    expectDark,
    async build(ctx: HarnessContext) {
      const shot = SHOTS[name];
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(shot.bg);
      ctx.renderer.toneMappingExposure = shot.exposure;
      const alt = THREE.MathUtils.degToRad(shot.sunAltDeg), az = THREE.MathUtils.degToRad(shot.sunAzDeg);
      const sunDir = new THREE.Vector3(Math.sin(az) * Math.cos(alt), Math.sin(alt), -Math.cos(az) * Math.cos(alt));
      const sun = new THREE.DirectionalLight(new THREE.Color(...shot.sun), 1);
      sun.position.copy(sunDir).multiplyScalar(100);
      sun.target.position.set(0, 0, 0);
      const outdoor = !shot.interior;
      if (outdoor || shot.window) scene.add(sun, sun.target);
      if (shot.window) {
        sun.position.set(ROOM.x, 30, ROOM.z + 30);
        sun.target.position.set(ROOM.x, 0, ROOM.z);
        sun.castShadow = true;
        Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 80 });
        sun.shadow.mapSize.set(1024, 1024);
      }
      const skyIrr = new THREE.Color(...shot.sky);
      scene.add(new THREE.HemisphereLight(skyIrr.clone(), new THREE.Color(0x3a3222).multiplyScalar(skyIrr.g), 1));
      buildWorld(scene);
      const lights: VolumeLight[] = [];
      if (shot.lanterns) {
        const lanterns = shot.interior ? [new THREE.Vector3(ROOM.x + 3, 1.5, ROOM.z - 2.5)] : LANTERNS;
        const glowM = new MeshBasicNodeMaterial({ color: new THREE.Color(1, 0.6, 0.25).multiplyScalar(4) });
        for (const p of lanterns) {
          const col = new THREE.Color(1, 0.55, 0.22);
          const pl = new THREE.PointLight(col, 8, 18, 2);
          pl.position.copy(p);
          const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), glowM);
          bulb.position.copy(p);
          scene.add(pl, bulb);
          lights.push({ position: p, radiance: col.clone().multiplyScalar(shot.interior ? 35 : 60), radiusM: shot.interior ? 18 : 11 });
        }
      }
      const apertures: ApertureLight[] = [];
      if (shot.window) {
        const dir = new THREE.Vector3(0, -30, -30).normalize();
        apertures.push({ position: new THREE.Vector3(ROOM.x, 2.4, ROOM.z + ROOM.d / 2 + 0.2), direction: dir, radiusM: 0.6, lengthM: 6,
          irradiance: new THREE.Color(...shot.sun) });
      }
      let smoke: SmokeColumns | null = null;
      if (name === "noon-haze-smoke") {
        smoke = new SmokeColumns(await smokeTexture(), { value: 0 });
        smoke.setAnchors([{ id: "harness.vol.smoke", position: new THREE.Vector3(0, ground(0, 20) + 6, 20) }]);
        scene.add(smoke.mesh);
      }
      const camera = new THREE.PerspectiveCamera(60, ctx.width / ctx.height, 0.3, 3000);
      camera.position.set(...shot.eye);
      camera.lookAt(...shot.look);
      camera.layers.enableAll();
      camera.updateMatrixWorld();
      const vol = new Volumetrics({
        renderer: ctx.renderer, backend: ctx.backend,
        terrain: {
          groundHeight: ground,
          water: (x, z) => ({ height: pondSurface, mask: Math.hypot(x - POND.x, z - POND.z) < POND.r * 1.25 ? 1 : 0 }),
          seaMask: () => 0,
          wetness: (x, z) => (ground(x, z) < 4 && Math.hypot(x - POND.x, z - POND.z) > POND.r * 1.3 ? 1 : 0),
        },
        crowns: () => FOREST,
      });
      vol.setBand("high");
      vol.grids.bakeAll(camera.position.x, camera.position.z);
      vol.canopy.update(camera.position.x, camera.position.z, true);
      const V = tsl as unknown as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      (scene as THREE.Scene & { fogNode?: unknown }).fogNode = V.Fn(() =>
        applyVolumetrics(vol, V.output, V.positionView.z.negate(), V.screenUV))();
      const regimes: FogRegimes = shot.fog ? fogRegimes({ ...VALLEY_CLIMATE, ...shot.fog }) : { ...R0, ...shot.regimes };
      const sunIrr = outdoor || shot.window ? new THREE.Color(...shot.sun) : new THREE.Color(0, 0, 0);
      (window as unknown as { __VOLUMETRICS__?: unknown }).__VOLUMETRICS__ = { band: vol.band, dispatch: vol.dispatch };
      const update = (t: number) => {
        vol.update({
          camera, timeS: t, sunDir, sunIrradiance: sunIrr, skyIrradiance: skyIrr, regimes, lights, apertures,
          interior: shot.interior ?? null, mistDepthM: 22,
        });
        smoke?.setLighting(sunDir, sunIrr, skyIrr);
        smoke?.update(t, camera, { dirXZ: [0.8, 0.6], speedMS: 2 });
      };
      update(0);
      // the harness presents three frames: settle the temporal history (jitter) with 12 updates each
      return { scene, camera, frame: (t: number) => { for (let k = 0; k < 12; k++) update(t + 1); } };
    },
  };
}
