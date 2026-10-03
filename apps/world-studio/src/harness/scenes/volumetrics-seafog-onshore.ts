/**
 * Harness shot "volumetrics-seafog-onshore" (vol10 fix C, G2): a shore at dawn with humid air and the
 * wind blowing in off the sea. The onshore component comes from the same path the studio uses
 * (climateSampler OnshoreProbe over a climate-weather B raster, here a synthetic coast whose sea-fog
 * propensity falls inland) into fogRegimes, so the sea-fog regime is computed, never forced. The
 * camera stands on the beach looking out to sea: the bank should sit low over the water and the strand.
 */
import * as THREE from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import * as tsl from "three/tsl";
import type { HarnessContext, HarnessScene } from "../types";
import { Volumetrics } from "@elder-souls/game-core/air/volumetrics/froxelGrid";
import { applyVolumetrics } from "@elder-souls/game-core/air/volumetrics/volumetricNodes";
import { fogRegimes } from "@elder-souls/game-core/air/volumetrics/fogField";
import { OnshoreProbe, type RasterPixels } from "../../weather/climateSampler";

/** Sea for z < 0; the beach rises inland. */
const ground = (_x: number, z: number) => (z < 0 ? -3 : Math.min(12, 0.02 * z));
const EXTENT_M = 4000;
/** 64 x 64 climate-weather raster over EXTENT_M: B (sea-fog propensity) 1 at sea, falling 1 per 800 m inland. */
function coastRaster(): RasterPixels {
  const w = 64, data = new Uint8ClampedArray(w * w * 4);
  for (let iz = 0; iz < w; iz++) for (let ix = 0; ix < w; ix++) {
    const z = (iz / (w - 1)) * EXTENT_M - EXTENT_M / 2;
    data[(iz * w + ix) * 4 + 2] = Math.round(255 * Math.max(0, Math.min(1, 1 - z / 800)));
    data[(iz * w + ix) * 4 + 3] = 255;
  }
  return { data, w, h: w };
}

const scene: HarnessScene = {
  name: "volumetrics-seafog-onshore",
  expectDark: false,
  async build(ctx: HarnessContext) {
    const s = new THREE.Scene();
    // darker than the fog colour so a low bank reads against it (diag7 O10)
    s.background = new THREE.Color(0x5a6878);
    ctx.renderer.toneMappingExposure = 1.2;
    const sunDir = new THREE.Vector3(0.6, 0.08, -0.8).normalize();
    const sun = new THREE.DirectionalLight(new THREE.Color(2.6, 1.6, 0.9), 1);
    sun.position.copy(sunDir).multiplyScalar(100);
    const skyIrr = new THREE.Color(0.5, 0.55, 0.7);
    s.add(sun, new THREE.HemisphereLight(skyIrr.clone(), new THREE.Color(0x3a3222), 1));
    const land = new THREE.Mesh(new THREE.PlaneGeometry(1200, 600).rotateX(-Math.PI / 2).translate(0, 0, 300),
      new MeshStandardNodeMaterial({ color: 0xb8a878, roughness: 1 }));
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(1200, 600).rotateX(-Math.PI / 2).translate(0, -0.2, -300),
      new MeshStandardNodeMaterial({ color: 0x2a4050, roughness: 0.2 }));
    s.add(land, sea);
    const camera = new THREE.PerspectiveCamera(60, ctx.width / ctx.height, 0.3, 3000);
    camera.position.set(0, 1.7, 30);
    camera.lookAt(0, 2, -200);
    camera.updateMatrixWorld();
    // wind travelling inland (+z) off the sea; the probe is centred on the province, so offset the camera
    const windDirXZ: [number, number] = [0, 1];
    const onshore = new OnshoreProbe().atRaster(coastRaster(), EXTENT_M / 2, EXTENT_M / 2 + 30, EXTENT_M, windDirXZ);
    const regimes = fogRegimes({
      minuteOfDay: 400, sunriseMin: 360, sunsetMin: 1110, prevNightClearCalm: 0.3, hoursSinceRain: Infinity, rain: 0,
      windSpeedMS: 4, windDirXZ, humidity: 0.95, wetSeason: 0.8, onshore, regionHaze: 0.9,
    });
    (window as unknown as { __SEAFOG__?: unknown }).__SEAFOG__ = { onshore, seaFog: regimes.seaFog };
    const vol = new Volumetrics({
      renderer: ctx.renderer, backend: ctx.backend,
      terrain: {
        groundHeight: ground,
        water: (_x, z) => ({ height: -0.2, mask: z < 0 ? 1 : 0 }),
        seaMask: (_x, z) => (z < 0 ? 1 : 0),
        wetness: (_x, z) => (z < 20 ? 1 : 0),
      },
      crowns: () => [],
    });
    vol.setBand("high");
    vol.grids.bakeAll(camera.position.x, camera.position.z);
    const V = tsl as unknown as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    (s as THREE.Scene & { fogNode?: unknown }).fogNode = V.Fn(() =>
      applyVolumetrics(vol, V.output, V.positionView.z.negate(), V.screenUV))();
    const sunIrr = new THREE.Color(2.6, 1.6, 0.9);
    const update = (t: number) => vol.update({ camera, timeS: t, sunDir, sunIrradiance: sunIrr, skyIrradiance: skyIrr, regimes, lights: [], mistDepthM: 22 });
    // each step advances the clock (diag7 O10: twelve steps at one timeS never let the field evolve)
    let clock = 0;
    update(clock);
    return { scene: s, camera, frame: () => { for (let k = 0; k < 12; k++) { clock += 1 / 30; update(clock); } } };
  },
};
export default scene;
