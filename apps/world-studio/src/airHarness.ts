/**
 * Ambient-air harness (dev only; served by vite from air-harness.html, never
 * built). Answers the two questions about the air layer in seconds instead
 * of the minutes a full province load costs on a software renderer:
 *
 *  1. PRESENCE — at (x, z, t, d, w), what does `airAmounts` say for every
 *     species? Computed through the same modules the studio uses (clock,
 *     light rig, weather machine, climate rasters), so a number here is the
 *     number WorldSky would feed the layer.
 *  2. PIXELS — does each swarm actually draw? Every species is rendered at
 *     amount 1 on a blank canvas from a camera at eye height, and the lit
 *     pixels are counted with readPixels. A shader that compiles but writes
 *     nothing (the sin-hash defect of 2026-09-11) shows up here as zero.
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
  };
}

/** Render one species at full amount on black and count its lit pixels. */
function pixels(renderer: THREE.WebGLRenderer, id: string): { lit: number; bright: number } {
  const species = AIR_SPECIES[id];
  const swarm = new AirSwarm(species, seededRandom(0x5eeda12));
  const scene = new THREE.Scene();
  scene.add(swarm.points);
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.3, 500);
  camera.position.set(xM, 3, zM);
  camera.lookAt(xM, 1, zM - 10);
  camera.updateMatrixWorld();
  // A lit species needs light; an emissive one ignores it. Exposure 1 keeps
  // the emissive colour at its authored screen value.
  swarm.update(
    1, camera, 7.3, 1, new THREE.Vector3(0.3, 0.8, 0.5).normalize(), [1, 0], 1,
    { x: 1, y: 1, z: 1 }, 1, 1200,
  );
  renderer.setClearColor(0x000000, 1);
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const buf = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  let lit = 0, bright = 0;
  for (let i = 0; i < buf.length; i += 4) {
    const v = buf[i] + buf[i + 1] + buf[i + 2];
    if (v > 24) lit++;
    if (v > 240) bright++;
  }
  swarm.dispose();
  return { lit, bright };
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
  const draw: Record<string, { lit: number; bright: number }> = {};
  for (const id of Object.keys(AIR_SPECIES)) draw[id] = pixels(renderer, id);
  const p = await presence();
  window.__AIR_HARNESS__ = { done: true, ...p, draw, frame: [640, 360] };
}

main().catch((e) => {
  window.__AIR_HARNESS__ = { done: true, error: String(e) };
});
