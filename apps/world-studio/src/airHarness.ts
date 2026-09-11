/**
 * Ambient-air harness (dev only; served by vite from air-harness.html, never
 * built). Answers the two questions about the air layer in seconds instead
 * of the minutes a full province load costs on a software renderer:
 *
 *  1. PRESENCE — at (x, z, t, d, w), what does `airAmounts` say for every
 *     species? Computed through the same modules the studio uses (clock,
 *     light rig, weather machine, climate rasters), so a number here is the
 *     number WorldSky would feed the layer.
 *  2. PIXELS — does each swarm actually draw, and can it be SEEN? Every
 *     species is rendered from a camera at eye height twice: `draw` is its
 *     lit pixels at amount 1 on black (a shader that does not compile reads
 *     zero here — the reserved-word defect of 2026-09-11); `contrast` is the
 *     count of pixels it visibly changes at the site's own amount, lit by the
 *     site's own sky and sun at the rig's exposure, over a mid-albedo
 *     backdrop. A species that draws but changes nothing is invisible, which
 *     is what the owner saw for midges and dragonflies.
 *
 * Results land on `window.__AIR_HARNESS__` for scripts/probe-air-fast.mjs.
 * URL: air-harness.html?x=2.84&z=3.02&t=22:00&d=6-17&w=clear
 */
import * as THREE from "three";
import {
  AIR_SPECIES,
  AirSwarm,
  airAmounts,
  seededRandom,
} from "@elder-souls/game-core/air/ambientAir";
import { computeLightRig } from "./sky/lightRig";
import { applyTimeParams, worldClock } from "./sky/timeState";
import { climateAirAt } from "./weather/climateSampler";
import { parseWeatherParam, setWeatherOverride, weatherAt } from "./weather/weatherState";
import { PROVINCE_EXTENT_M } from "./provinceScale";
import { waterParticleRadiance } from "@elder-souls/game-core/water/render/waterParticleLighting";
import type { LightRig } from "./sky/lightRig";
import { PRECIP_LAYER } from "@elder-souls/game-core/water/render/waterMaterial";

declare global {
  interface Window {
    __AIR_HARNESS__?: unknown;
  }
}

const params = new URLSearchParams(window.location.search);
const xM = (Number(params.get("x")) || 2.84) * 1000;
const zM = (Number(params.get("z")) || 3.02) * 1000;
applyTimeParams(params);
worldClock.rate = 0;
setWeatherOverride(parseWeatherParam(params.get("w")));
const base = "/";

async function presence() {
  // Rasters decode asynchronously; the first call kicks the fetch off.
  let air = climateAirAt(base, xM, zM, PROVINCE_EXTENT_M);
  for (let i = 0; i < 200 && !air; i++) {
    await new Promise((r) => setTimeout(r, 50));
    air = climateAirAt(base, xM, zM, PROVINCE_EXTENT_M);
  }
  if (!air) throw new Error("climate-air.png never decoded");
  const humidity = air[0];
  const epochMinutes = worldClock.epochMinutes();
  const wx = weatherAt(base, epochMinutes, xM, zM, PROVINCE_EXTENT_M, 10);
  const rig = computeLightRig(epochMinutes, humidity, worldClock.season().s, undefined, {
    sunDim: wx.sunDim,
    ambientLift: wx.profile.ambientLift,
    skyGrey: wx.profile.skyGrey,
    fogMie: wx.mist.weather,
    cloudLow: wx.profile.cloudLow,
    cloudMid: wx.profile.cloudMid,
    cloudHigh: wx.profile.cloudHigh,
    cloudDensity: wx.profile.cloudDensity,
    cloudDark: wx.profile.cloudDark,
  });
  // Same reductions WorldSky applies before calling airAmounts.
  const conditions = {
    sunAltDeg: (rig.sun.altitude * 180) / Math.PI,
    humidity,
    rain: wx.rainIntensity,
    cloud: Math.min(1, rig.cloudCov[0] + rig.cloudCov[1] + 0.5 * rig.cloudCov[2]),
    windSpeed: wx.windSpeedMS,
    aboveGroundM: 2,
  };
  return {
    conditions: { ...conditions, weather: wx.state, canopy: air[2] },
    amounts: airAmounts(conditions),
    rig,
    visibilityM: wx.visibilityM,
  };
}

/** Camera at eye height on flat ground, looking a little down. */
function eyeCamera(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.3, 500);
  camera.position.set(xM, 3, zM);
  camera.lookAt(xM, 1, zM - 10);
  // The swarms live on the post-water layer; a camera that cannot see it
  // would report every species as drawing nothing.
  camera.layers.enable(PRECIP_LAYER);
  camera.updateMatrixWorld();
  return camera;
}

function readLuma(renderer: THREE.WebGLRenderer): Uint8Array {
  const gl = renderer.getContext();
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const buf = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  return buf;
}

/** Render one species at full amount on black and count its lit pixels. */
function draw(renderer: THREE.WebGLRenderer, id: string): { lit: number; bright: number } {
  const swarm = new AirSwarm(AIR_SPECIES[id], seededRandom(0x5eeda12));
  const scene = new THREE.Scene();
  scene.add(swarm.points);
  const camera = eyeCamera();
  swarm.update(
    1, camera, 7.3, 1, new THREE.Vector3(0.3, 0.8, 0.5).normalize(), [1, 0], 1,
    { x: 1, y: 1, z: 1 }, 1, 1200,
  );
  renderer.toneMappingExposure = 1;
  renderer.setClearColor(0x000000, 1);
  renderer.render(scene, camera);
  const buf = readLuma(renderer);
  let lit = 0, bright = 0;
  for (let i = 0; i < buf.length; i += 4) {
    const v = buf[i] + buf[i + 1] + buf[i + 2];
    if (v > 24) lit++;
    if (v > 240) bright++;
  }
  swarm.dispose();
  return { lit, bright };
}

/**
 * Render one species at the site's amount under the site's light, over a
 * backdrop lit by the same sky, and count the pixels it visibly changes.
 * Mirrors WorldSky: light through waterParticleRadiance, exposure from the
 * rig, ACES tone map. The backdrop is a grey card in DISPLAY terms (the haze
 * feeds are not irradiance, so lighting a surface from them reads black):
 * an 18 % card by day, darker through twilight and at night, which is about
 * what reeds or water in shade come out at on screen.
 */
function contrast(
  renderer: THREE.WebGLRenderer, id: string, amount: number, rig: LightRig, visibilityM: number,
): { changed: number; strong: number; backdrop: number } {
  const sp = AIR_SPECIES[id];
  const swarm = new AirSwarm(sp, seededRandom(0x5eeda12));
  const camera = eyeCamera();
  const sunDir = new THREE.Vector3(rig.sun.direction.x, rig.sun.direction.y, rig.sun.direction.z);
  const light = waterParticleRadiance(
    { x: rig.hazeAmbient[0], y: rig.hazeAmbient[1], z: rig.hazeAmbient[2] },
    { x: rig.hazeSunLight[0], y: rig.hazeSunLight[1], z: rig.hazeSunLight[2] },
    sunDir.y,
  );
  const altDeg = (rig.sun.altitude * 180) / Math.PI;
  const grey = altDeg > 3 ? 0.18 : altDeg > -4 ? 0.06 : 0.012;
  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(grey, grey, grey), toneMapped: false }),
  );
  backdrop.position.set(xM, 3, zM - 60);
  backdrop.lookAt(camera.position);
  const scene = new THREE.Scene();
  scene.add(backdrop);
  renderer.toneMappingExposure = rig.exposureTarget;
  renderer.setClearColor(0x000000, 1);
  renderer.render(scene, camera);
  const plain = readLuma(renderer);
  scene.add(swarm.points);
  swarm.update(amount, camera, 7.3, 1, sunDir, [1, 0], 1, light, rig.exposureTarget, visibilityM);
  renderer.render(scene, camera);
  const withAir = readLuma(renderer);
  let changed = 0, strong = 0;
  for (let i = 0; i < plain.length; i += 4) {
    const d = Math.abs(plain[i] - withAir[i]) + Math.abs(plain[i + 1] - withAir[i + 1]) + Math.abs(plain[i + 2] - withAir[i + 2]);
    if (d > 24) changed++;
    if (d > 90) strong++;
  }
  const b = (plain[0] + plain[1] + plain[2]) / 3;
  swarm.dispose();
  backdrop.geometry.dispose();
  (backdrop.material as THREE.Material).dispose();
  return { changed, strong, backdrop: Math.round(b) };
}

async function main() {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 360;
  document.body.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(640, 360, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  const drawn: Record<string, { lit: number; bright: number }> = {};
  for (const id of Object.keys(AIR_SPECIES)) drawn[id] = draw(renderer, id);
  const { rig, visibilityM, ...p } = await presence();
  const seen: Record<string, { changed: number; strong: number; backdrop: number }> = {};
  for (const id of Object.keys(AIR_SPECIES)) {
    seen[id] = contrast(renderer, id, p.amounts[id] ?? 0, rig, visibilityM);
  }
  window.__AIR_HARNESS__ = { done: true, ...p, exposure: rig.exposureTarget, draw: drawn, contrast: seen, frame: [640, 360] };
}

main().catch((e) => {
  window.__AIR_HARNESS__ = { done: true, error: String(e) };
});
