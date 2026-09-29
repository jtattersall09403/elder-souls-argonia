import { createContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { PMREMGenerator, type NodeMaterial, type RenderTarget, type WebGPURenderer } from "three/webgpu";
import type { CSMShadowNode } from "three/examples/jsm/csm/CSMShadowNode.js";
import {
  dayPhaseAt,
  sunAt,
  toHorizontal,
  localSiderealAngle,
  epochDays,
  type MoonState,
} from "@elder-souls/world-time";
import { setWindWaveScale } from "@elder-souls/game-core/water/index";
import { installFixtureLighting } from "@elder-souls/game-core/render/fixtureLights/index";
import { advanceWaveAmplitude } from "@elder-souls/game-core/water/waveWeather";
import { useFrameSegments } from "@elder-souls/game-core/fx/frameSegments";
import { isNodeMaterial } from "@elder-souls/game-core/render/nodes/materialNodes";
import catalogue from "../../../../world/sources/sky/star-catalogue.json";
import {
  aerialRasterLoaded,
  applyMipAlphaBoost,
  createAerialFogNode,
  createAerialUniforms,
  type AerialRasterKey,
  type AerialUniforms,
} from "./aerial";
import {
  cloudAlphaTowards,
  cloudParamsFrom,
  createCloudUniforms,
  type CloudParams,
} from "./cloudField";
import {
  MOON_RADIUS,
  STAR_POOL,
  STAR_RADIUS,
  flattenCatalogue,
  starAttributes,
  aimSun,
  copySkyUniforms,
  createMoonMaterial,
  createSkyDome,
  createStarLayer,
  createSunCascades,
  writeDomeFromRig,
} from "./skyObjects";
import { computeLightRig, type LightRig } from "./lightRig";
import { worldClock, notifyClock } from "./timeState";
import { waterTimeS } from "../water/waterClock";
import { wetnessUniforms } from "../water/groundWetness";
import { lightningNow, weatherAt } from "../weather/weatherState";
import { RainSystem, rainDropBudget } from "../weather/RainSystem";
import { AmbientAir, type AmbientAirConditions } from "@elder-souls/game-core/air/AmbientAir";
import type { AirWaterSurface } from "@elder-souls/game-core/air/ambientAir";
import { STUDIO_TOOLS } from "../studioTools";
import { buriedThresholdM } from "@elder-souls/game-core/water/index";
import { sharedWaterAssets } from "../water/waterAssets";
import { airAmounts } from "@elder-souls/game-core/air/ambientAir";
import { sunShaftIntensity } from "@elder-souls/game-core/air/sunShafts";
import { WHITEOUT_BELT, WHITEOUT_ENABLED, type WeatherSample } from "@elder-souls/world-weather";

/**
 * The natural light and sky system (world module 55, Phase 8a): Preetham sky
 * dome (three's bundled SkyMesh addon, TSL) lifted onto the physical lux scale and
 * crossfaded into an authored night dome; the thirteen canonical
 * constellations, guardian planets, Southron pole star and drifting Serpent;
 * Masser and Secunda as lit spheres (phase falls out of the sun direction);
 * physically-valued sun/moon lights with cascaded shadow maps; throttled
 * PMREM sky IBL; ACES tone mapping with a slow eye-adaptation exposure.
 * Mounted inside both studio canvases so fly and character modes are lit by
 * the same one sun.
 */

/** Shared by both canvases: the same air, the same instant. */
export const sharedAerialUniforms: AerialUniforms = createAerialUniforms();
(window as unknown as { __AERIAL_UNIFORMS__?: AerialUniforms }).__AERIAL_UNIFORMS__ =
  sharedAerialUniforms;

/** The sun's cascaded shadows (CSMShadowNode on the sun's shadow). Node
 * cascades patch nothing: consumers no longer set materials up for them. */
export const SkyContext = createContext<{ csm: CSMShadowNode | null }>({ csm: null });

/** The ONE cloud-field uniform set (cloudField.ts): shared by the main dome,
 * the PMREM bake dome and the star/serpent shaders — one WorldSky write per
 * frame updates every consumer, and the celestial occlusion samples exactly
 * the clouds the dome draws. */
const cloudUniforms = createCloudUniforms();

const DEG = Math.PI / 180;

/** Optional latitude override (studio debug slider; null = package constant). */
let latitudeOverrideRad: number | undefined;
export function setLatitudeOverrideDeg(deg: number | null): void {
  latitudeOverrideRad = deg == null ? undefined : deg * DEG;
}
export function getLatitudeOverrideDeg(): number | null {
  return latitudeOverrideRad == null ? null : latitudeOverrideRad / DEG;
}

// ---------- climate-air CPU raster (humidity at the camera → turbidity) ----------

let airPixels: { data: Uint8ClampedArray; w: number; h: number } | null = null;
let airPending = false;
function ensureAirPixels(base: string): void {
  if (airPixels || airPending) return;
  airPending = true;
  const img = new Image();
  img.src = `${base}province/climate-air.png`;
  img
    .decode()
    .then(() => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const g = c.getContext("2d")!;
      g.drawImage(img, 0, 0);
      airPixels = {
        data: g.getImageData(0, 0, c.width, c.height).data,
        w: c.width,
        h: c.height,
      };
    })
    .catch(() => {
      airPending = false;
    });
}
function humidityAt(xM: number, zM: number, extentM: number): number {
  if (!airPixels) return 0.6;
  const px = Math.max(0, Math.min(airPixels.w - 1, Math.round((xM / extentM) * (airPixels.w - 1))));
  const py = Math.max(0, Math.min(airPixels.h - 1, Math.round((zM / extentM) * (airPixels.h - 1))));
  return airPixels.data[(py * airPixels.w + px) * 4] / 255;
}
/** Canopy closure 0..1 — the BLUE channel of the same climate-air raster
 * humidityAt reads (see climateSampler's header). The sun shafts need to know
 * whether there is a roof overhead; with no raster loaded yet the honest
 * answer is "none", which keeps them off rather than hanging them in open
 * sky. */
function canopyAt(xM: number, zM: number, extentM: number): number {
  if (!airPixels) return 0;
  const px = Math.max(0, Math.min(airPixels.w - 1, Math.round((xM / extentM) * (airPixels.w - 1))));
  const py = Math.max(0, Math.min(airPixels.h - 1, Math.round((zM / extentM) * (airPixels.h - 1))));
  return airPixels.data[(py * airPixels.w + px) * 4 + 2] / 255;
}

// ---------- authored stars (catalogue in skyObjects.ts) ----------

export { STAR_POOL };

let starDensityMult = 0.5;
export function setStarDensityMult(v: number): void {
  starDensityMult = Math.min(2, Math.max(0.1, v));
}
export function getStarDensityMult(): number {
  return starDensityMult;
}

export interface SkyDebugState {
  epochMinutes: number;
  dayPhase: string;
  sunAltitudeDeg: number;
  sunAzimuthDeg: number;
  exposure: number;
  exposureTarget: number;
  sceneIlluminance: number;
  moonPhaseFraction: number;
  turbidity: number;
  mistStrength: number;
  humidityAtCamera: number;
  envBakes: number;
  csmCascades: number;
  /** Phase 8c weather (probe surface). */
  weatherState: string;
  weatherPrev: string;
  weatherBlend: number;
  spellKind: string;
  rainIntensity: number;
  windSpeedMS: number;
  wetness: number;
  visibilityM: number;
  mistRegimes: { radiation: number; advection: number; whiteout: number; whiteoutBase: number; weather: number };
  cloudCover: [number, number, number];
  sunCastsShadows: boolean;
  lightningFlash: number;
  /** Round 2: cloud alpha at the sun (CPU field) and camera-in-fog veil. */
  sunOcclusion: number;
  camFog: number;
  /** Round 3: sunset cloud-light strength [deck, cirrus] (probe surface). */
  cloudSunsetAmt: [number, number];
  /** Ambient air (owner 2026-09-10): canopy closure at the camera, the sun
   * shaft strength, and how present each species is right now — so the layer
   * can be checked by reading a number instead of squinting at the frame. */
  canopyAtCamera: number;
  sunShafts: number;
  airAmounts: Record<string, number>;
}

declare global {
  interface Window {
    __STUDIO_SKY_DEBUG__?: SkyDebugState;
  }
}

/**
 * DEV comparison switch (`?pmrem=0`, decision 0084 round 10), read once at
 * module load: the sky IBL is baked ONCE at mount and never re-baked, so a
 * frame can be measured with the throttled PMREM re-bake removed and nothing
 * else changed.
 */
const PMREM_REBAKE_ENABLED: boolean = (() => {
  if (typeof window === "undefined") return true;
  return new URLSearchParams(window.location.search).get("pmrem") !== "0";
})();

export function WorldSky({
  mode,
  extentM,
  verticalScale = 1,
  hidden = false,
  children,
}: {
  mode: "fly" | "character";
  extentM: number;
  /** Inside an interior cell (0103 decision 4): the sky, its lights, rain and
   * air are not drawn; the rig keeps running so the return is instant. */
  hidden?: boolean;
  /** Live vertical exaggeration — converts camera height back to true metres
   * for the weather machine (whiteout belt, elevation expression). */
  verticalScale?: number;
  children?: React.ReactNode;
}) {
  const { scene, camera, gl } = useThree();
  const segments = useFrameSegments();
  const base = import.meta.env.BASE_URL;
  const rainBudget = useMemo(() => rainDropBudget(), []);
  ensureAirPixels(base);
  // Debug handles for the headless probes (probe-sky, probe-air-diff,
  // diagnose-sky, probe-sampler-count). The studio always carries these
  // globals (STUDIO_TOOLS): deployed and local studio builds are identical
  // (owner 2026-09-22). `__RENDERER__` is studioRenderer.ts's.
  if (STUDIO_TOOLS) {
    (window as unknown as { __SCENE__?: THREE.Scene }).__SCENE__ = scene;
    (window as unknown as { __THREE__?: typeof THREE }).__THREE__ = THREE;
  }

  // Climate rasters as GPU textures for the haze term (shared uniforms):
  // each is a TextureNode whose `.value` swaps from the zero placeholder to
  // the decoded raster, re-pointing every sample of it.
  useEffect(() => {
    const rasters: [AerialRasterKey, string][] = [
      ["uClimateAir", "climate-air"],
      ["uClimateWeather", "climate-weather"],
      ["uClimateVis", "climate-vis"],
    ];
    for (const [key, name] of rasters) {
      if (aerialRasterLoaded(sharedAerialUniforms, key)) continue;
      new THREE.TextureLoader().load(`${base}province/${name}.png`, (t) => {
        t.colorSpace = THREE.NoColorSpace;
        t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
        sharedAerialUniforms[key].value = t;
      });
    }
  }, [base]);

  // THE scene fog is the aerial inscatter (decision 0107): every node
  // material with `fog = true` is hazed by this one node.
  useEffect(() => {
    const fogScene = scene as THREE.Scene & { fogNode?: unknown };
    fogScene.fogNode = createAerialFogNode(sharedAerialUniforms);
    return () => {
      fogScene.fogNode = null;
    };
  }, [scene]);

  // Renderer: physical lights + ACES + soft shadows, one configuration for
  // both modes (module 55 §96 — tone mapping is part of the light system).
  useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1e-4;
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.shadowMap.enabled = true;
    // PCF, not PCFSoft: three r184 deprecates PCFSoft and silently renders
    // PCF anyway; leaving the deprecated value set made materials compile
    // with the wrong shadow sampler type (WaterPipeline.tsx explains).
    gl.shadowMap.type = THREE.PCFShadowMap;
  }, [gl]);

  // Cascaded shadow maps: mandatory for a sun over kilometres of terrain.
  // Character play needs crisp near shadows; the flyover trades texel size for
  // mountain-scale reach.
  const { sun, csm } = useMemo(() => {
    // ?smsize= lets headless probes shrink the cascade maps (software GL).
    const params = new URLSearchParams(window.location.search);
    const smsize = Number(params.get("smsize")) || 2048;
    // Character play: ONE cascade over 120 m (2026-09-21, round 9). Every
    // cascade re-draws every caster in its slice, so a second cascade was a
    // second pass over most of the jungle's 2.5 M caster triangles for
    // shadows past the distance anyone reads; Skyrim's exterior shadow
    // distance is ~114 m (decision 0084). The flyover keeps 3 for
    // mountain-scale reach. ?csm=<cascades>,<maxFar> overrides both in
    // character mode, so the two arrangements can be compared on the same
    // spot (?csm=2,300).
    const csmParam = (params.get("csm") ?? "").split(",").map(Number);
    const csmCascades = Number.isFinite(csmParam[0]) && csmParam[0] > 0
      ? Math.round(csmParam[0]) : null;
    const csmFar = Number.isFinite(csmParam[1]) && csmParam[1] > 0 ? csmParam[1] : null;
    return createSunCascades({
      cascades: mode === "character" ? (csmCascades ?? 1) : 3,
      shadowMapSize: smsize,
      maxFar: mode === "character" ? (csmFar ?? 120) : 6000,
    });
  }, [mode]);
  // The sun joins the scene through JSX below, so a discarded render leaves
  // nothing behind; the cascade proxies are added by the node at first use
  // and removed by dispose().
  useEffect(() => () => {
    csm.dispose();
    sun.dispose();
  }, [csm, sun]);

  // Alpha-tested foliage tagged esAerial keeps the old aerial patch's
  // mip-alpha coverage boost (the haze itself is the scene fog node now);
  // nothing else needs patching since node cascades never reassign a
  // material's shader. Runs before EVERY render (dev 02aaca40, 16k walk 5):
  // a material first drawn unpatched compiled one way and relinked up to a
  // second later, the startup flash. Only new materials cost anything; the
  // walk is a WeakSet look-up per visible mesh.
  const patched = useRef(new WeakSet<THREE.Material>());
  const patchScene = () => {
    // fixture lamps are the renderer's lighting (render/fixtureLights; idempotent, before the first list)
    installFixtureLighting(gl as unknown as WebGPURenderer);
    scene.traverseVisible((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (!m || patched.current.has(m)) continue;
        patched.current.add(m);
        if (m.userData?.esAerial && isNodeMaterial(m)) applyMipAlphaBoost(m as NodeMaterial);
      }
    });
  };
  const patchRef = useRef(patchScene);
  patchRef.current = patchScene;
  const patchFrame = useRef({ frame: 0, patched: -1 });
  // a layout effect: installed at commit, before the first frame renders
  useLayoutEffect(() => {
    const previous = scene.onBeforeRender;
    scene.onBeforeRender = function (...args) {
      previous.apply(this, args);
      // the water pipeline renders the scene several times a frame: patch once
      if (patchFrame.current.patched === patchFrame.current.frame) return;
      patchFrame.current.patched = patchFrame.current.frame;
      patchRef.current();
    };
    return () => { scene.onBeforeRender = previous; };
  }, [scene]);

  const dome = useMemo(() => createSkyDome(STAR_RADIUS * 1.6, sharedAerialUniforms, cloudUniforms), []);
  const { sky, extras } = dome;
  const bake = useMemo(() => {
    const b = createSkyDome(100, sharedAerialUniforms, cloudUniforms);
    const bakeScene = new THREE.Scene();
    bakeScene.add(b.sky);
    return { ...b, scene: bakeScene };
  }, []);
  const pmrem = useMemo(() => new PMREMGenerator(gl as unknown as WebGPURenderer), [gl]);
  const envRT = useRef<RenderTarget | null>(null);
  useEffect(
    () => () => {
      sky.material.dispose();
      bake.sky.material.dispose();
      pmrem.dispose();
      envRT.current?.dispose();
      envRT.current = null;
    },
    [sky, bake, pmrem],
  );

  // Stars.
  const stars = useMemo(() => flattenCatalogue(), []);
  const starLayer = useMemo(
    () => createStarLayer("stars", starAttributes(stars, window.devicePixelRatio || 1), cloudUniforms),
    [stars],
  );

  // The Serpent: four dark "unstars" (canon), drawn as occluding smudges.
  const serpentLayer = useMemo(() => {
    const size = new Float32Array(4).fill(9 * Math.min(2, window.devicePixelRatio || 1));
    const lum = new Float32Array(4).fill(1);
    return createStarLayer("serpent", { size, lum }, cloudUniforms);
  }, []);
  useEffect(
    () => () => {
      starLayer.mesh.material.dispose();
      serpentLayer.mesh.material.dispose();
    },
    [starLayer, serpentLayer],
  );

  // Moons. Display-referred discs (see MOON_FRAGMENT) — tints carry the
  // canon identities: Masser rust-red, Secunda pale.
  const moonDefs = useMemo(
    () => [
      { id: "masser", tint: new THREE.Color(1.0, 0.58, 0.44) },
      { id: "secunda", tint: new THREE.Color(0.86, 0.9, 1.0) },
    ],
    [],
  );
  const moonMats = useMemo(() => moonDefs.map((d) => createMoonMaterial(d.tint)), [moonDefs]);
  const moonRefs = useRef<(THREE.Mesh | null)[]>([]);
  const airRef = useRef<AmbientAirConditions | null>(null);
  // The compiled water surface, so the over-water species hover from the
  // water, never the bed under it (Phase 16c): the same rasters the water
  // runtime holds, bound once the assets are decoded.
  const [airWater, setAirWater] = useState<AirWaterSurface | null>(null);
  useEffect(() => {
    let alive = true;
    sharedWaterAssets(base).then((a) => {
      if (!alive) return;
      const m = a.meta.surface;
      setAirWater({
        texture: a.surfaceTex, size: m.size, metresPerPixel: m.metresPerPixel, minM: m.minM, spanM: m.maxM - m.minM,
        depthMinM: m.depthMinM ?? 0, depthSpanM: m.depthSpanM ?? 25.5, buriedM: buriedThresholdM(a.meta),
        liftM: () => { const o = a.world.levelOffsets(worldClock.epochMinutes()); return o.season * 0.2 + o.tide * 0.5; },
        habitat: a.dressing?.habitatTex,
      });
    }).catch(() => setAirWater(null));
    return () => { alive = false; };
  }, [base]);
  // Probe surfaces for the air layer, so its behaviour can be READ rather
  // than judged by eye (module 85: agents read measurements).
  const lastAirAmounts = useRef<Record<string, number>>({});
  const lastShaftAmount = useRef(0);
  const hemiRef = useRef<THREE.HemisphereLight>(null);
  const moonLightRef = useRef<THREE.DirectionalLight>(null);
  const moonLightTarget = useMemo(() => new THREE.Object3D(), []);

  const state = useRef({
    lastLst: Number.NaN,
    lastBakeSunY: Number.NaN,
    lastBakeCover: Number.NaN,
    lastEpoch: Number.NaN,
    envBakes: 0,
    lastNotify: 0,
    lastFrustumUpdate: 0,
    waterWaveScale: NaN,
    waterWaveResume: false,
  });
  useEffect(() => {
    const visibility = () => { state.current.waterWaveResume = true; };
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, []);

  const updateCelestialBuffers = (epochMinutes: number, rig: LightRig) => {
    const lst = localSiderealAngle(epochMinutes);
    if (Math.abs(lst - state.current.lastLst) < 0.0005) return;
    state.current.lastLst = lst;
    const pos = starLayer.position;
    stars.forEach((s, i) => {
      const h = toHorizontal(s.dec, lst - s.ra, latitudeOverrideRad);
      pos.setXYZ(i, h.direction.x * STAR_RADIUS, h.direction.y * STAR_RADIUS, h.direction.z * STAR_RADIUS);
    });
    pos.needsUpdate = true;
    // Serpent wander: deterministic slow Lissajous over epoch days.
    const w = catalogue.serpent.wander;
    const d = epochDays(epochMinutes);
    const ra = (w.baseRaDeg + w.raAmplitudeDeg * Math.sin((2 * Math.PI * d) / w.raPeriodDays)) * DEG;
    const dec = (w.baseDecDeg + w.decAmplitudeDeg * Math.sin((2 * Math.PI * d) / w.decPeriodDays + 1.3)) * DEG;
    const spos = serpentLayer.position;
    (catalogue.serpent.unstars as [number, number, number][]).forEach(([dRa, dDec], i) => {
      const h = toHorizontal(dec + dDec * DEG, lst - (ra + dRa * DEG), latitudeOverrideRad);
      spos.setXYZ(i, h.direction.x * STAR_RADIUS, h.direction.y * STAR_RADIUS, h.direction.z * STAR_RADIUS);
    });
    spos.needsUpdate = true;
    void rig;
  };

  // Per-frame scratch (walk 5 perf): the sun direction is rewritten, never allocated.
  const sunDirScratch = useMemo(() => new THREE.Vector3(), []);
  useFrame((_s, delta) => {
    patchFrame.current.frame += 1;
    // Sky stage of the frame, the PMREM re-bake included when it fires
    // (decision 0084 round 10).
    segments?.cpuMark("sky");
    segments?.gpuMark("sky");
    const clockRunning = worldClock.rate > 0;
    if (clockRunning) {
      worldClock.advance(Math.min(delta, 0.25));
      const nowMs = performance.now();
      if (nowMs - state.current.lastNotify > 250) {
        state.current.lastNotify = nowMs;
        notifyClock();
      }
    }
    const epochMinutes = worldClock.epochMinutes();
    const humidity = humidityAt(camera.position.x, camera.position.z, extentM);
    // Weather (Phase 8c, decision 0032): the deterministic machine sampled at
    // the camera; its profile modifies the light rig, its regimes drive the
    // aerial fog, its wind drives clouds and water chop.
    const wx: WeatherSample = weatherAt(
      base,
      epochMinutes,
      camera.position.x,
      camera.position.z,
      extentM,
      Math.max(0, camera.position.y / verticalScale),
    );
    const flash = lightningNow(epochMinutes);
    // The cloud field this frame (shared GPU/CPU, cloudField.ts): the CPU
    // side samples it toward the sun and moons, so a cumulus drifting across
    // the sun dims the light and the moons vanish behind thick cloud.
    const cloudParams: CloudParams = cloudParamsFrom(
      wx.profile,
      wx.windDirXZ,
      waterTimeS(),
    );
    const sunPre = sunAt(epochMinutes, latitudeOverrideRad);
    const sunOcclusion = cloudAlphaTowards(
      [sunPre.direction.x, sunPre.direction.y, sunPre.direction.z],
      cloudParams,
    );
    const rig = computeLightRig(
      epochMinutes,
      humidity,
      worldClock.season().s,
      latitudeOverrideRad,
      {
        sunDim: wx.sunDim,
        ambientLift: wx.profile.ambientLift,
        skyGrey: wx.profile.skyGrey,
        fogMie: wx.mist.weather,
        cloudLow: wx.profile.cloudLow,
        cloudMid: wx.profile.cloudMid,
        cloudHigh: wx.profile.cloudHigh,
        cloudDensity: wx.profile.cloudDensity,
        cloudDark: wx.profile.cloudDark,
        // The rig gets the province-wide CONDITION; per-pixel locality comes
        // from the mist raster in the aerial shader (owner round 3).
        radiationMist: wx.mist.radiationBase,
        greenTint: wx.profile.greenTint,
        sunOcclusion,
      },
    );
    const sunDir = sunDirScratch.set(rig.sun.direction.x, rig.sun.direction.y, rig.sun.direction.z);

    // Sky dome follows the camera so the horizon never clips.
    sky.position.copy(camera.position);
    writeDomeFromRig(dome, rig, sunDir, flash);
    // One write updates the dome, the PMREM bake dome and the star shaders.
    cloudUniforms.uCloudCov.value.set(cloudParams.covLow, cloudParams.covMid, cloudParams.covHigh);
    cloudUniforms.uCloudDens.value = cloudParams.density;
    cloudUniforms.uCloudPuff.value = cloudParams.puff;
    cloudUniforms.uCloudScroll.value = cloudParams.scroll;
    cloudUniforms.uCloudFront.value = cloudParams.stormFront;
    cloudUniforms.uCloudDir.value.set(cloudParams.windDir[0], cloudParams.windDir[1]);
    cloudUniforms.uCloudTime.value = cloudParams.timeS;
    // Camera-in-fog measure: optical depth of the mist regimes AT the camera
    // over a nominal ~700 m sky ray. Round 5: no longer a shader uniform —
    // the dome fog march (esSkyFog) veils the sky from the same densities
    // per-ray — but the NUMBER stays: the probe scenarios assert fog
    // locality with it and the IBL re-bake watches it.
    const camYTrue = Math.max(0, camera.position.y / verticalScale);
    const camFogDensity =
      Math.exp(-camYTrue / 16) * wx.mist.radiation * 14 +
      Math.exp(-camYTrue / 22) * wx.mist.advection * 125 +
      wx.mist.whiteout * 550 +
      Math.exp(-camYTrue / 200) * wx.mist.weather * 8 * 0.4;
    const camFogNow = 1 - Math.exp(-9e-5 * camFogDensity * 700);

    // Sun: one light, its shadow the cascade node (CSMShadowNode fits the
    // cascade proxies to the camera frustum every frame by itself).
    aimSun(sun, sunDir, camera.position, rig);
    const nowMs = performance.now();
    if (nowMs - state.current.lastFrustumUpdate > 500) {
      state.current.lastFrustumUpdate = nowMs;
      // Re-split after a projection change (fov/aspect/far); the node is
      // initialised at its first shadow render, so skip until then.
      if (csm.camera) csm.updateFrustums();
    }

    // Moonlight: Masser as a cool, weak key (no shadows at Tier 1).
    const masser = rig.moons[0];
    if (moonLightRef.current) {
      const l = moonLightRef.current;
      l.intensity = rig.moonIntensity;
      l.color.setRGB(...rig.moonColor);
      const d = masser.direction;
      l.position.set(
        camera.position.x + d.x * 2000,
        camera.position.y + d.y * 2000,
        camera.position.z + d.z * 2000,
      );
      moonLightTarget.position.copy(camera.position);
      l.target = moonLightTarget;
    }
    if (hemiRef.current) {
      hemiRef.current.intensity = rig.hemiIntensity;
      hemiRef.current.color.setRGB(...rig.hemiSky);
      hemiRef.current.groundColor.setRGB(...rig.hemiGround);
    }

    // Aerial haze: shared uniforms read by every patched material.
    const a = sharedAerialUniforms;
    const hazeDir =
      rig.sunIntensity > rig.moonIntensity
        ? rig.sun.direction
        : masser.direction;
    a.uSunDirW.value.set(hazeDir.x, hazeDir.y, hazeDir.z);
    a.uHazeSunLight.value.set(...rig.hazeSunLight);
    a.uHazeAmbient.value.set(...rig.hazeAmbient);
    a.uProvinceExtentM.value = extentM;
    a.uMistStrength.value = rig.mistStrength;
    // Weather fog regimes into the ONE inscatter authority (module 55 §97,
    // localized round 3): the uniforms carry province-wide CONDITIONS; the
    // shader applies locality per-pixel from the climate rasters along the
    // view path (fog banks live where their rasters say — never a veil that
    // follows the camera). The whiteout band rides in runtime (scaled)
    // metres; its horizontal mask is the climate-vis orographic channel.
    a.uAdvectionFog.value = wx.mist.advectionBase;
    a.uWhiteout.value.set(
      WHITEOUT_BELT.centreM * verticalScale,
      WHITEOUT_BELT.sigmaBelowM * verticalScale,
      WHITEOUT_BELT.sigmaAboveM * verticalScale,
      // whiteoutBase is published RAW for probes/re-enable even while the cap
      // cloud is off — the renderer must apply the same gate as mist.whiteout,
      // or the belt slab draws for every non-clear deck (owner defect 2026-08-30).
      WHITEOUT_ENABLED ? wx.mist.whiteoutBase : 0,
    );
    // Region ambient haze (round 4): visibility IS local weather now — the
    // live multiplier comes off the weather sample (world-weather
    // regionHazeFactor), the same number that sets wx.visibilityM. The
    // renderer and the published sight distance can no longer disagree.
    a.uRegionHaze.value = wx.regionHaze;
    a.uWeatherMie.value = wx.mist.weather;
    a.uFogLum.value.set(...rig.fogLum);
    a.uFogSunLum.value.set(...rig.fogSunLum);
    // The dome fog march starts here — never from the GLSL cameraPosition,
    // which is the origin-pinned cube camera during the PMREM bake.
    a.uEsFogCam.value.copy(camera.position);
    // Cap cloud drifts downwind in the aerial shader's noise space (round 4),
    // on the same clock as the sky's cloud scroll so the two agree.
    a.uWhiteoutDrift.value.set(
      -wx.windDirXZ[0] * cloudParams.timeS * wx.windSpeedMS * 0.0011,
      -wx.windDirXZ[1] * cloudParams.timeS * wx.windSpeedMS * 0.0011,
    );
    // Rain wetness into the shared ground shader path; wind into the shared
    // wave-energy scale (CPU query + water vertex stage read the same value).
    wetnessUniforms.uRainWet.value = wx.wetness;
    // Round 3: QUADRATIC wind→wave map (wave energy grows with wind², the
    // owner's much-wider calm→storm spectrum): calm ~0.8, rain ~1.1, big
    // storms 2–3, squall coast (~22 m/s) saturates the 6× cap. The same
    // scale speeds the shared water clock and the shore surf (waves.ts).
    const waveTarget = 0.45 + wx.windSpeedMS * 0.13 + wx.windSpeedMS * wx.windSpeedMS * 0.0072;
    // One scene-owned sea response, published to both physics and rendering.
    // Hidden/resume time is not simulated; a slow visible frame still uses
    // its full delta. First frame seeds actual weather. Epoch scrubs alter
    // only the target, never reset phases or smooth authored tide/season.
    const waveDelta = document.hidden || state.current.waterWaveResume ? 0 : delta;
    state.current.waterWaveScale = advanceWaveAmplitude(state.current.waterWaveScale, waveTarget, waveDelta);
    if (!document.hidden) state.current.waterWaveResume = false;
    setWindWaveScale(state.current.waterWaveScale);
    // Lightning also lifts the scene light for the flash frames.
    if (hemiRef.current && flash > 0) hemiRef.current.intensity += 2500 * flash;

    // Night sky elements. Star screen brightness = lum × exposure × boost,
    // i.e. anchored at the full-night level whenever twilight lets a star
    // through (the staged visibility lives in the star vertex stage).
    updateCelestialBuffers(epochMinutes, rig);
    const sunAltDeg = (rig.sun.altitude * 180) / Math.PI;
    // Celestial occlusion is PER-BODY now (round 2): each star samples the
    // cloud field in its vertex stage (gaps keep their stars), and each moon
    // gets a CPU sample toward its direction — it dims behind thin cloud
    // and vanishes behind a storm deck, instead of the old global dim.
    const su = starLayer.uniforms;
    su.uOpacity.value = rig.nightBoost;
    su.uStarFrac.value = Math.min(1, 0.5 * starDensityMult);
    su.uSunAltDeg.value = sunAltDeg;
    su.uDawnDir.value.set(rig.dawnDir[0], rig.dawnDir[1]);
    const pu = serpentLayer.uniforms;
    pu.uOpacity.value = 0.55 * rig.starOpacity;
    pu.uSunAltDeg.value = sunAltDeg;
    pu.uDawnDir.value.set(rig.dawnDir[0], rig.dawnDir[1]);
    rig.moons.forEach((m: MoonState, i) => {
      const mesh = moonRefs.current[i];
      if (!mesh) return;
      mesh.position.set(camera.position.x + m.direction.x * MOON_RADIUS,
        camera.position.y + m.direction.y * MOON_RADIUS, camera.position.z + m.direction.z * MOON_RADIUS);
      const radius = Math.tan(m.angularDiameter / 2) * MOON_RADIUS;
      mesh.scale.setScalar(radius);
      moonMats[i].uniforms.uSunDir.value.copy(sunDir);
      // Day wash (stronger after round 3 — a rising daytime moon must not
      // visibly lighten the sky) × rise/set fade × low-altitude extinction
      // (a moon in the horizon murk is barely there, day or night) × cloud
      // occlusion toward the moon (glows through thin cloud — the shallow
      // curve below — and disappears behind thick).
      const horizonFade = THREE.MathUtils.smoothstep(m.altitude, -0.06, 0.06);
      const extinction = 0.3 + 0.7 * THREE.MathUtils.smoothstep(m.altitude, 0.0, 0.3);
      const moonOcc = cloudAlphaTowards([m.direction.x, m.direction.y, m.direction.z], cloudParams);
      const dayDim =
        (1 - 0.88 * rig.skyFade) * horizonFade * extinction * Math.pow(1 - moonOcc, 1.6);
      moonMats[i].uniforms.uDayDim.value = dayDim;
      mesh.visible = m.altitude > -0.1;

      // Halo (owner 2026-09-10). Rides the disc's own visibility term, so it
      // cannot outlive the moon it belongs to, times the illuminated
      // fraction — a new moon has no glow, which would otherwise read as a
      // bug. Exposure-anchored like dawnLum/beltLum so its SCREEN brightness
      // is the authored number rather than whatever the adaptation is doing.
      // Masser is the larger, dimmer, rust-red body and Secunda the smaller,
      // brighter, pale one, so they take different constants; one shared set
      // makes them read as matched twins, which Tamriel's sky is not.
      const glowK = i === 0 ? 0.9 : 0.55;
      const amt = (glowK / rig.exposureTarget) * dayDim * m.illuminatedFraction;
      const dirU = i === 0 ? extras.uMoonGlowDirA : extras.uMoonGlowDirB;
      const colU = i === 0 ? extras.uMoonGlowColA : extras.uMoonGlowColB;
      dirU.value.set(m.direction.x, m.direction.y, m.direction.z);
      const tint = moonDefs[i].tint;
      colU.value.setRGB(tint.r * amt, tint.g * amt, tint.b * amt);
    });
    // Thin cloud spreads moonlight into a wider, softer ring (a cirrus veil
    // genuinely does this); a clear sky keeps the halo tight. Smaller number
    // = wider skirt. Thick cloud does not widen anything — it removes the
    // glow through the occlusion term above.
    const veil = Math.min(1, rig.cloudCov[2] + 0.6 * rig.cloudCov[1]);
    extras.uMoonGlowWide.value.set(11.5 - 4.0 * veil, 16.0 - 6.0 * veil);

    // Ambient air conditions (owner 2026-09-10). Everything the fireflies,
    // midges, pollen, leaf fall and sun shafts key on is already computed
    // above for the sky and the weather, so the layer derives its own
    // presence rules from world state rather than being switched on by hand.
    // `canopy` is the one value the sky does not hold: without a vegetation
    // density sample it stays 0 and the sun shafts stay off, which is the
    // honest default — a shaft with no canopy casting it is a cone of fog.
    if (!airRef.current) {
      airRef.current = {
        sunDir: new THREE.Vector3(),
        sunAltDeg: 0,
        sunColour: new THREE.Color(),
        humidity: 0.6,
        rain: 0,
        cloud: 0,
        windSpeed: 0,
        windDirXZ: [1, 0],
        canopy: 0,
        exposure: 1,
        hazeAmbient: [0, 0, 0],
        hazeSunLight: [0, 0, 0],
        visibilityM: 1200,
        aboveGroundM: 2,
      };
    }
    {
      const a = airRef.current;
      a.sunDir.copy(sunDir);
      a.sunAltDeg = sunAltDeg;
      a.sunColour.setRGB(...rig.sunColor);
      a.humidity = humidity;
      a.rain = wx.rainIntensity;
      a.cloud = Math.min(1, rig.cloudCov[0] + rig.cloudCov[1] + 0.5 * rig.cloudCov[2]);
      a.windSpeed = wx.windSpeedMS;
      a.windDirXZ = wx.windDirXZ;
      a.canopy = canopyAt(camera.position.x, camera.position.z, extentM);
      a.exposure = rig.exposureTarget;
      // The same air-light feeds the aerial haze uses, so a lit mote is lit
      // by the same air as the terrain behind it.
      a.hazeAmbient = rig.hazeAmbient;
      a.hazeSunLight = rig.hazeSunLight;
      a.visibilityM = wx.visibilityM;
      // Height above the GROUND, not above sea level. On foot the eye is a
      // couple of metres up whatever the terrain's elevation; the flyover is
      // a map tool and wants none of this. Gating on absolute altitude was a
      // defect — it silenced the layer at any marsh above 140 m.
      a.aboveGroundM = mode === "character" ? 2 : Math.max(120, camera.position.y);
      lastAirAmounts.current = airAmounts({
        sunAltDeg: a.sunAltDeg,
        humidity: a.humidity,
        rain: a.rain,
        cloud: a.cloud,
        windSpeed: a.windSpeed,
        aboveGroundM: a.aboveGroundM,
      });
      lastShaftAmount.current = sunShaftIntensity({
        sunAltDeg: a.sunAltDeg,
        cloud: a.cloud,
        rain: a.rain,
        canopy: a.canopy,
        humidity: a.humidity,
        aboveGroundM: a.aboveGroundM,
      });
    }

    // Exposure: ease toward the target (eye adaptation); snap when paused or
    // scrubbed so fixed-instant probes are deterministic.
    const jumped =
      !Number.isFinite(state.current.lastEpoch) ||
      Math.abs(epochMinutes - state.current.lastEpoch) > worldClock.rate * 0.5 + 1;
    state.current.lastEpoch = epochMinutes;
    if (!clockRunning || jumped) {
      gl.toneMappingExposure = rig.exposureTarget;
    } else {
      // Eye adaptation runs in WORLD time (≈2.5 world-minutes ⇒ 2.5 real
      // seconds at rate 1), floored at a responsive real-time constant — at
      // high clock rates the sun brightens orders of magnitude in real
      // seconds, and a fixed real-time ease lags so far behind that dawn
      // whites out the whole frame.
      const tau = Math.min(2.5, 2.5 / Math.max(worldClock.rate, 1));
      const k = 1 - Math.exp(-delta / Math.max(tau, 0.12));
      gl.toneMappingExposure += (rig.exposureTarget - gl.toneMappingExposure) * k;
    }

    // Sky IBL: throttled PMREM re-bake (research doc: never per-frame). The
    // threshold tightens through twilight: sky light falls orders of
    // magnitude across a few degrees there, and coarse re-bake steps against
    // a continuously-adapting exposure read as bright FLASHES at sunset
    // (owner round 2, 18:25–18:34 report).
    const bakeStep = Math.abs(sunDir.y) < 0.25 ? 0.004 : 0.025;
    // Weather transitions also change the ambient (an overcast deck greys the
    // IBL), so cloud-cover movement forces a re-bake too.
    const bakeCover =
      rig.cloudCov[0] + rig.cloudCov[1] + rig.cloudCov[2] * 0.4 + camFogNow * 2;
    if (
      (PMREM_REBAKE_ENABLED || state.current.envBakes === 0) &&
      (!Number.isFinite(state.current.lastBakeSunY) ||
      Math.abs(sunDir.y - state.current.lastBakeSunY) > bakeStep ||
      Math.abs(bakeCover - (state.current.lastBakeCover || 0)) > 0.06)
    ) {
      state.current.lastBakeSunY = sunDir.y;
      state.current.lastBakeCover = bakeCover;
      copySkyUniforms(dome, bake);
      bake.sky.showSunDisc.value = 0;
      bake.extras.uFlash.value = 0; // flashes never tint the IBL
      const rt = pmrem.fromScene(bake.scene, 0, 0.1, 1100);
      scene.environment = rt.texture;
      envRT.current?.dispose();
      envRT.current = rt;
      state.current.envBakes += 1;
    }

    window.__STUDIO_SKY_DEBUG__ = {
      epochMinutes,
      dayPhase: dayPhaseAt(epochMinutes),
      sunAltitudeDeg: rig.sun.altitude / DEG,
      sunAzimuthDeg: rig.sun.azimuth / DEG,
      exposure: gl.toneMappingExposure,
      exposureTarget: rig.exposureTarget,
      sceneIlluminance: rig.sceneIlluminance,
      moonPhaseFraction: masser.illuminatedFraction,
      turbidity: rig.turbidity,
      mistStrength: rig.mistStrength,
      humidityAtCamera: humidity,
      envBakes: state.current.envBakes,
      csmCascades: csm.cascades,
      weatherState: wx.state,
      weatherPrev: wx.prev,
      weatherBlend: wx.blend,
      spellKind: wx.spellKind,
      rainIntensity: wx.rainIntensity,
      windSpeedMS: wx.windSpeedMS,
      wetness: wx.wetness,
      visibilityM: wx.visibilityM,
      mistRegimes: wx.mist,
      cloudCover: rig.cloudCov,
      sunCastsShadows: rig.sunCastsShadows,
      lightningFlash: flash,
      sunOcclusion,
      camFog: camFogNow,
      cloudSunsetAmt: rig.cloudSunsetAmt,
      canopyAtCamera: airRef.current?.canopy ?? 0,
      sunShafts: lastShaftAmount.current,
      airAmounts: lastAirAmounts.current,
      // Whole-frame total published by the DEV frame probe (CharacterMode):
      // `info.autoReset` is off there, so the live counter is mid-frame.
      triangles: (window as unknown as {
        __STUDIO_GPU_MS__?: { lastTris?: number };
      }).__STUDIO_GPU_MS__?.lastTris ?? gl.info.render.triangles,
      sunLightIntensity: sun.intensity,
      shadowMapEnabled: gl.shadowMap.enabled,
      hemiIntensity: hemiRef.current?.intensity ?? -1,
    } as SkyDebugState;
  }, -2);

  return (
    <SkyContext.Provider value={{ csm }}>
      <group visible={!hidden}>
      <primitive object={sky} renderOrder={-10} frustumCulled={false} />
      {/* Stars draw AFTER the moons (−8 > −9), which write depth at a nearer
          radius — so star fragments behind a disc fail the depth test and
          never shine through the moon's body. */}
      <primitive object={starLayer.mesh} renderOrder={-8} />
      <primitive object={serpentLayer.mesh} renderOrder={-7} />
      {moonDefs.map((d, i) => (
        <mesh
          key={d.id}
          ref={(m) => {
            moonRefs.current[i] = m;
          }}
          material={moonMats[i].material}
          renderOrder={-9}
          frustumCulled={false}
        >
          <sphereGeometry args={[1, 48, 24]} />
        </mesh>
      ))}
      <primitive object={sun} />
      <primitive object={sun.target} />
      <hemisphereLight ref={hemiRef} intensity={0} />
      <directionalLight ref={moonLightRef} intensity={0} />
      <primitive object={moonLightTarget} />
      <RainSystem count={rainBudget} extentM={extentM} />
      {/* Ambient air (owner 2026-09-10): fireflies, midges, pollen, leaf
          fall and sun shafts. Mounted HERE rather than in each mode's own
          scene because WorldSky already holds every signal the layer is
          keyed on, and both canvases wrap their world in it. Conditions go
          by ref — they change every frame, and props would re-render the
          React tree at frame rate. */}
      <AmbientAir conditions={airRef} water={airWater} />
      </group>
      {children}
    </SkyContext.Provider>
  );
}
