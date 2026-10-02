import { createContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { NodeMaterial, WebGPURenderer } from "three/webgpu";
import { createSkyEnvironment, type SkyEnvironment } from "./skyEnvironment";
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
import { installFixtureLighting, setLitPreparer } from "@elder-souls/game-core/render/fixtureLights/index";
import { advanceWaveAmplitude } from "@elder-souls/game-core/water/waveWeather";
import { useFrameSegments } from "@elder-souls/game-core/fx/frameSegments";
import { applyCascadeRota } from "@elder-souls/game-core/render/lightSwitch";
import { QUALITY_PRESETS } from "@elder-souls/game-core/core/quality";

/** The flyover has no quality preset: it takes the presets' shared rota. */
const DEFAULT_CASCADE_ROTA = QUALITY_PRESETS.medium.shadowCascadeRota;
import { isNodeMaterial } from "@elder-souls/game-core/render/nodes/materialNodes";
import { adaptExposure, stepShadowSun } from "@elder-souls/game-core/render/lightAdaptation";
import catalogue from "../../../../world/sources/sky/star-catalogue.json";
import {
  aerialRasterLoaded,
  applyMipAlphaBoost,
  createMipAlphaShare,
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
import {
  computeLightRig,
  createLightRig,
  setDrawnLightRig,
  type LightRig,
  type WeatherLightIn,
} from "./lightRig";
import { worldClock, notifyClock } from "./timeState";
import { waterTimeS, waterTransportDeltaS, waterTransportTimeS } from "../water/waterClock";
import { wetnessUniforms } from "../water/groundWetness";
import { lightningNow, weatherAt } from "../weather/weatherState";
import { CLIMATE_MAX_TEXELS, loadSmoothRaster } from "@elder-souls/game-core/terrain/groundRasters";
import { RainSystem, rainDropBudget } from "../weather/RainSystem";
import { AmbientAir, type AmbientAirConditions } from "@elder-souls/game-core/air/AmbientAir";
import type { FireVolumeTier } from "@elder-souls/game-core/fx/fire/fireTypes";
import type { AirWaterSurface } from "@elder-souls/game-core/air/ambientAir";
import { STUDIO_TOOLS } from "../studioTools";
import { climateAirAt, ONSHORE, OnshoreProbe, RegionFogProbe, type RegionClimateMeta } from "../weather/climateSampler";
import { buriedThresholdM } from "@elder-souls/game-core/water/index";
import { sharedWaterAssets } from "../water/waterAssets";
import { airAmounts } from "@elder-souls/game-core/air/ambientAir";
import * as TSL_V from "three/tsl";
import { Volumetrics, MAX_VOLUME_LIGHTS, SKY_INSCATTER, type VolumeLight } from "@elder-souls/game-core/air/volumetrics/froxelGrid";
import { BandGovernor, VOLUMETRIC_BANDS, volBandOverride, type VolumetricTier } from "@elder-souls/game-core/air/volumetrics/bandGovernor";
import {
  FogClockHistory, nearestVolumeLights, studioTerrainSamplers, sunriseSunsetMin,
  type CrownSource, type WaterRecordQuery, type WeatherProbe,
} from "@elder-souls/game-core/air/volumetrics/studioSamplers";
import { fixtureLightFieldOf } from "@elder-souls/game-core/render/fixtureLights/index";
import { applyVolumetrics } from "@elder-souls/game-core/air/volumetrics/volumetricNodes";
import { activeBackend } from "@elder-souls/game-core/render/createRenderer";
import { WHITEOUT_BELT, type WeatherSample } from "@elder-souls/world-weather";
import { DATA_BASE } from "../dataBase";
import { INITIAL_SWITCHES } from "../studioSwitches";

/**
 * The natural light and sky system (world module 55, Phase 8a): Preetham sky
 * dome (three's bundled SkyMesh addon, TSL) lifted onto the physical lux scale and
 * crossfaded into an authored night dome; the thirteen canonical
 * constellations, guardian planets, Southron pole star and drifting Serpent;
 * Masser and Secunda as lit spheres (phase falls out of the sun direction);
 * physically-valued sun/moon lights with cascaded shadow maps; throttled
 * PMREM sky IBL; ACES tone mapping with log-space eye adaptation on real seconds.
 * Mounted inside both studio canvases so fly and character modes are lit by
 * the same one sun.
 */

/** Shared by both canvases: the same air, the same instant. */
export const sharedAerialUniforms: AerialUniforms = createAerialUniforms();
(window as unknown as { __AERIAL_UNIFORMS__?: AerialUniforms }).__AERIAL_UNIFORMS__ =
  sharedAerialUniforms;

/** The sun's cascaded shadows (CSMShadowNode on the sun's shadow). Node
 * cascades patch nothing: consumers no longer set materials up for them. */
/** What the sky shares with the world under it: the sun's shadow node, and
 * the froxel medium (0112) an interior host drives while the sky is hidden. */
export interface SunLighting { dir: THREE.Vector3; sunIrradiance: THREE.Color; skyIrradiance: THREE.Color }
export const SkyContext = createContext<{ csm: CSMShadowNode | null; volumetrics: Volumetrics | null; sunLighting: SunLighting | null }>(
  { csm: null, volumetrics: null, sunLighting: null });

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

// Humidity at the camera -> turbidity: read through the shared climate
// sampler (decoded in a worker); 0.6 until the raster lands.
function humidityAt(base: string, xM: number, zM: number, extentM: number): number {
  return climateAirAt(base, xM, zM, extentM)?.[0] ?? 0.6;
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
  /** Ambient air (owner 2026-09-10): the volumetric band (0112) and how
   * present each species is right now — so the layer
   * can be checked by reading a number instead of squinting at the frame. */
  volumetricBand: string;
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
  groundHeight,
  crowns,
  sunLightingOut,
  tier,
  fireTierOut,
  shadowMapSize = 2048,
  shadowCascadeRota = DEFAULT_CASCADE_ROTA,
  children,
}: {
  /** Cascade map edge from the quality preset; `?smsize=` still overrides. */
  shadowMapSize?: number;
  /** Frames between cascade map updates, nearest first (quality `shadowCascadeRota`). */
  shadowCascadeRota?: readonly number[];
  /** Tree crowns near the camera for the canopy map (decision 0112 §5); the
   * vegetation layer fills it (Vegetation `crownsRef`). */
  crowns?: React.MutableRefObject<CrownSource | null>;
  /** Receives this sky's sun lighting object, for a parent that builds the settlement environment outside the provider. */
  sunLightingOut?: React.MutableRefObject<SunLighting | null>;
  /** The renderer's volumetric tier (bandGovernor `volumetricTier`): the band ceiling and the mobile rows; absent, medium. */
  tier?: VolumetricTier;
  /** Receives the fire volume tier of the current band, for the parent that hands it to its FlameSystems. */
  fireTierOut?: React.MutableRefObject<FireVolumeTier>;
  /** Terrain height at x,z (m), for the volumetric fog field's terrain grids
   * (decision 0112); absent, the medium sits on a flat 0 m ground. */
  groundHeight?: (x: number, z: number) => number | null;
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
  // The froxel medium (decision 0112): WebGPU only; the band follows the
  // renderer tier (every WebGPU session is "high" until a tier source exists).
  const groundRef = useRef(groundHeight);
  groundRef.current = groundHeight;
  const crownsRef = useRef(crowns);
  crownsRef.current = crowns;
  // The water record (the same shared assets the water renderer and the
  // character's buoyancy read): surface, mask, sea and marsh classes.
  const waterRef = useRef<WaterRecordQuery | null>(null);
  const volumetrics = useMemo(() => {
    const renderer = gl as unknown as WebGPURenderer;
    const backend = activeBackend(renderer);
    const v = new Volumetrics({
      renderer, backend,
      terrain: studioTerrainSamplers({
        groundHeight: (x, z) => groundRef.current?.(x, z),
        water: () => waterRef.current,
        epochMinutes: () => worldClock.epochMinutes(),
      }),
      crowns: (x, z, r) => crownsRef.current?.current?.crowns(x, z, r) ?? [],
      tier,
    });
    return v;
  }, [gl, extentM, tier]);
  const governor = useMemo(() => new BandGovernor({
    backend: activeBackend(gl as unknown as WebGPURenderer),
    tier,
    override: typeof location === "undefined" ? null : volBandOverride(location.search),
  }), [gl, tier]);
  useEffect(() => {
    let live = true;
    void sharedWaterAssets(DATA_BASE).then((a) => {
      if (!live) return;
      waterRef.current = a.world;
      // the grids baked before the record arrived hold no water: rebake them
      volumetrics.grids.near.origin.set(Number.NaN, Number.NaN);
      volumetrics.grids.far.origin.set(Number.NaN, Number.NaN);
    }).catch(() => undefined);
    return () => { live = false; };
  }, [volumetrics]);
  const fogClock = useMemo(() => new FogClockHistory(), []);
  const volLights = useRef<VolumeLight[]>([]);
  const crownVersion = useRef(-1);
  useEffect(() => () => volumetrics.dispose(), [volumetrics]);
  const volSun = useRef(new THREE.Color());
  const volSky = useRef(new THREE.Color());
  // onshore component of the wind for the sea-fog regime: climate-weather B's gradient, per camera cell
  const onshoreProbe = useMemo(() => new OnshoreProbe(tier === "mobile" ? ONSHORE.mobile : ONSHORE.high), [tier]);
  /** The sun and sky the lit effects (chimney smoke) read; refreshed every frame, owned by this sky. */
  const sunLighting = useMemo<SunLighting>(() => ({ dir: new THREE.Vector3(0, 1, 0), sunIrradiance: volSun.current, skyIrradiance: volSky.current }), []);
  useEffect(() => { if (sunLightingOut) sunLightingOut.current = sunLighting; }, [sunLightingOut, sunLighting]);
  const segments = useFrameSegments();
  const base = DATA_BASE;
  // fog profile of the region under the camera (climate-regions home table via hydrology-meta)
  const regionFog = useRef<RegionFogProbe | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`${base}province/hydrology-meta.json`).then((r) => r.json())
      .then((m: RegionClimateMeta) => { if (live) regionFog.current = new RegionFogProbe(m); })
      .catch(() => { /* the fog stays neutral */ });
    return () => { live = false; };
  }, [base]);
  const rainBudget = useMemo(() => rainDropBudget(), []);
  // Debug handles for the headless probes (probe-sky, probe-air-diff,
  // diagnose-sky, probe-sampler-count). The studio always carries these
  // globals (STUDIO_TOOLS): deployed and local studio builds are identical
  // (owner 2026-09-22). `__RENDERER__` is studioRenderer.ts's.
  if (STUDIO_TOOLS) {
    (window as unknown as { __SCENE__?: THREE.Scene }).__SCENE__ = scene;
    (window as unknown as { __THREE__?: typeof THREE }).__THREE__ = THREE;
    (window as unknown as { __AERIAL__?: AerialUniforms }).__AERIAL__ = sharedAerialUniforms;
  }

  // Climate rasters as GPU textures for the haze term (shared uniforms):
  // each is a TextureNode whose `.value` swaps from the zero placeholder to
  // the decoded raster, re-pointing every sample of it.
  useEffect(() => {
    // Smooth fields: decoded exactly and halved before upload (groundRasters).
    const rasters: [AerialRasterKey, string][] = [
      ["uClimateAir", "climate-air"],
      ["uClimateWeather", "climate-weather"],
      ["uClimateVis", "climate-vis"],
    ];
    for (const [key, name] of rasters) {
      if (aerialRasterLoaded(sharedAerialUniforms, key)) continue;
      loadSmoothRaster(`${base}province/${name}.png`, CLIMATE_MAX_TEXELS)
        .then((t) => {
          sharedAerialUniforms[key].value = t;
          const img = t.image as { width?: number; height?: number } | undefined;
          if (key === "uClimateVis" && img?.width && img.height) sharedAerialUniforms.uClimateVisTexel.value.set(1 / img.width, 1 / img.height);
        })
        .catch((e) => console.error(`climate raster ${name}`, e));
    }
  }, [base]);

  // THE scene fog is the aerial inscatter (decision 0107): every node
  // material with `fog = true` is hazed by this one node.
  // A layout effect, so the first frame's programs compile with it (a fog
  // node set after them changes their cache key and recompiles them).
  useLayoutEffect(() => {
    const fogScene = scene as THREE.Scene & { fogNode?: unknown };
    const V = TSL_V as unknown as Record<string, { z: { negate(): unknown } }>;
    fogScene.fogNode = createAerialFogNode(sharedAerialUniforms, (lit) =>
      applyVolumetrics(volumetrics, lit, V.positionView.z.negate() as never, V.screenUV as never));
    return () => {
      fogScene.fogNode = null;
    };
  }, [scene, volumetrics]);

  // Renderer: physical lights + ACES + soft shadows, one configuration for
  // both modes (module 55 §96 — tone mapping is part of the light system).
  // Layout effect: shadowMap.enabled/type are in every program's cache key.
  useLayoutEffect(() => {
    // `?tone=0` (diagnosis, studioSwitches.ts): no tone mapping, linear output.
    const tone0 = INITIAL_SWITCHES.tone0;
    gl.toneMapping = tone0 ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1e-4;
    gl.outputColorSpace = tone0 ? THREE.LinearSRGBColorSpace : THREE.SRGBColorSpace;
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
    const smsize = Number(params.get("smsize")) || shadowMapSize;
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
    // shadowMapSize is read at creation only: the effect below resizes the
    // live cascades in place (a rebuild would recompile every lit material).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
  useEffect(() => {
    // Quality change: the shadow node re-sizes each cascade's map from its
    // shadow's mapSize on the next shadow pass (ShadowNode.updateShadow).
    const s = Number(new URLSearchParams(window.location.search).get("smsize")) || shadowMapSize;
    sun.shadow.mapSize.set(s, s);
    for (const l of csm.lights) l.shadow?.mapSize.set(s, s);
  }, [sun, csm, shadowMapSize]);
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
  // one shared mip-boost graph for every alpha-tested map (one shader build)
  const mipShare = useMemo(() => createMipAlphaShare(), []);
  // `root` is the scene each frame, or a detached/held layer the linker
  // warms before its first draw (the lit preparer, drawTargetLinker)
  const patchRoot = (root: THREE.Object3D, visibleOnly: boolean) => {
    // fixture lamps are the renderer's lighting (render/fixtureLights; idempotent, before the first list)
    installFixtureLighting(gl as unknown as WebGPURenderer);
    const patchOne = (m: THREE.Material | undefined) => {
      if (!m || patched.current.has(m)) return;
      patched.current.add(m);
      if (m.userData?.esAerial && isNodeMaterial(m)) applyMipAlphaBoost(m as NodeMaterial, mipShare);
    };
    const visit = (obj: THREE.Object3D) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (Array.isArray(mesh.material)) for (const m of mesh.material) patchOne(m);
      else patchOne(mesh.material);
    };
    if (visibleOnly) root.traverseVisible(visit); else root.traverse(visit);
  };
  const patchRef = useRef(patchRoot);
  patchRef.current = patchRoot;
  const patchFrame = useRef({ frame: 0, patched: -1 });
  // a layout effect: installed at commit, before the first frame renders
  useLayoutEffect(() => {
    const previous = scene.onBeforeRender;
    scene.onBeforeRender = function (...args) {
      previous.apply(this, args);
      // the water pipeline renders the scene several times a frame: patch once
      if (patchFrame.current.patched === patchFrame.current.frame) return;
      patchFrame.current.patched = patchFrame.current.frame;
      patchRef.current(scene, true);
    };
    // a rung held hidden until linked is patched before its warm (decision 0108)
    const unregister = setLitPreparer(scene, (root) => { patchRef.current(root, false); });
    return () => { scene.onBeforeRender = previous; unregister(); };
  }, [scene]);

  const dome = useMemo(() => createSkyDome(STAR_RADIUS * 1.6, sharedAerialUniforms, cloudUniforms), []);
  const { sky, extras } = dome;
  const bake = useMemo(() => {
    const b = createSkyDome(100, sharedAerialUniforms, cloudUniforms);
    const bakeScene = new THREE.Scene();
    bakeScene.add(b.sky);
    return { ...b, scene: bakeScene };
  }, []);
  // The sky IBL exists before the first frame: baked here at commit (a
  // layout effect runs before R3F renders), assigned to scene.environment
  // once, and re-baked in place by the frame loop (skyEnvironment.ts says
  // why the texture identity must never change).
  const envRef = useRef<SkyEnvironment | null>(null);
  useLayoutEffect(() => {
    bake.sky.showSunDisc.value = 0;
    const env = createSkyEnvironment(gl as unknown as WebGPURenderer, bake.scene);
    envRef.current = env;
    scene.environment = env.texture;
    return () => {
      if (scene.environment === env.texture) scene.environment = null;
      env.dispose();
      envRef.current = null;
    };
  }, [gl, scene, bake]);
  useEffect(
    () => () => {
      sky.material.dispose();
      bake.sky.material.dispose();
    },
    [sky, bake],
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
  const hemiRef = useRef<THREE.HemisphereLight>(null);
  const moonLightRef = useRef<THREE.DirectionalLight>(null);
  const moonLightTarget = useMemo(() => new THREE.Object3D(), []);

  const state = useRef({
    lastLst: Number.NaN,
    lastBakeSunY: Number.NaN,
    lastBakeCover: Number.NaN,
    lastEpoch: Number.NaN,
    exposure: Number.NaN,
    shadowSun: new THREE.Vector3(),
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
  const heldRig = useMemo(createLightRig, []);
  const rigWeather = useMemo<WeatherLightIn>(
    () => ({ sunDim: 0, ambientLift: 0, skyGrey: 0, fogMie: 0, cloudLow: 0, cloudMid: 0,
      cloudHigh: 0, cloudDensity: 0, cloudDark: 0 }),
    [],
  );
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
    const humidity = humidityAt(base, camera.position.x, camera.position.z, extentM);
    // Weather (Phase 8c, decision 0032): the deterministic machine sampled at
    // the camera; its profile modifies the light rig, its regimes drive the
    // aerial fog, its wind drives clouds and water chop.
    // The fog clock's look-backs (0112 §4), once per 15 world-minutes and
    // BEFORE this frame's sample: they call the same cached machine at other
    // instants, and the frame's own call below must be the one left cached.
    if (volumetrics.band !== "off") {
      const cx = camera.position.x, cz = camera.position.z, ce = Math.max(0, camera.position.y / verticalScale);
      fogClock.update(epochMinutes, (t): WeatherProbe => {
        const w = weatherAt(base, t, cx, cz, extentM, ce);
        const p = w.profile;
        return { rain: w.rainIntensity, cloud: Math.min(1, p.cloudLow + p.cloudMid + 0.5 * p.cloudHigh), windSpeedMS: w.windSpeedMS };
      });
    }
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
    const wxIn = rigWeather;
    wxIn.sunDim = wx.sunDim;
    wxIn.ambientLift = wx.profile.ambientLift;
    wxIn.skyGrey = wx.profile.skyGrey;
    wxIn.fogMie = wx.mist.weather;
    wxIn.cloudLow = wx.profile.cloudLow;
    wxIn.cloudMid = wx.profile.cloudMid;
    wxIn.cloudHigh = wx.profile.cloudHigh;
    wxIn.cloudDensity = wx.profile.cloudDensity;
    wxIn.cloudDark = wx.profile.cloudDark;
    // The rig gets the province-wide CONDITION; per-pixel locality comes
    // from the mist raster in the aerial shader (owner round 3).
    wxIn.radiationMist = wx.mist.radiationBase;
    wxIn.greenTint = wx.profile.greenTint;
    wxIn.sunOcclusion = sunOcclusion;
    // Written in place into the held rig: no per-frame allocation. Readers
    // (setDrawnLightRig consumers) read it fresh every frame.
    const rig = computeLightRig(
      epochMinutes,
      humidity,
      worldClock.season().s,
      latitudeOverrideRad,
      wxIn,
      heldRig,
    );
    setDrawnLightRig(scene, rig);
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
    // cascade proxies to the camera frustum every frame by itself). The
    // shadow sun steps only past SHADOW_SUN_STEP_DEG: a light rotated every
    // frame re-rasterises every edge on a new texel grid (walk 6 flicker).
    stepShadowSun(state.current.shadowSun, sunDir);
    aimSun(sun, state.current.shadowSun, camera.position, rig);
    applyCascadeRota(sun, patchFrame.current.frame, shadowCascadeRota);
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
      wx.mist.whiteoutBase,
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
    // midges, pollen and leaf fall key on is already computed
    // above for the sky and the weather, so the layer derives its own
    // presence rules from world state rather than being switched on by hand.
    if (!airRef.current) {
      airRef.current = {
        sunDir: new THREE.Vector3(),
        sunAltDeg: 0,
        humidity: 0.6,
        rain: 0,
        cloud: 0,
        windSpeed: 0,
        windDirXZ: [1, 0],
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
      a.humidity = humidity;
      a.rain = wx.rainIntensity;
      a.cloud = Math.min(1, rig.cloudCov[0] + rig.cloudCov[1] + 0.5 * rig.cloudCov[2]);
      a.windSpeed = wx.windSpeedMS;
      a.windDirXZ = wx.windDirXZ;
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
    }

    // The froxel medium (decision 0112): lit by the same sun and sky as the
    // scene, its regimes from the clock, weather and climate here.
    const band = governor.frame(delta * 1000);
    if (band !== volumetrics.band) volumetrics.setBand(band);
    if (fireTierOut) fireTierOut.current = governor.spec?.fireTier ?? VOLUMETRIC_BANDS[governor.tier].fireTier;
    const crownSrc = crowns?.current;
    if (crownSrc && crownSrc.version !== crownVersion.current) {
      crownVersion.current = crownSrc.version;
      volumetrics.canopy.update(camera.position.x, camera.position.z, true);
    }
    sunLighting.dir.copy(sunDir);
    volSun.current.setRGB(...rig.sunColor).multiplyScalar(rig.sunIntensity);
    // The medium's sky light is the dome's horizon as WebGL's anchored fog sees it (0112 §3):
    // the irradiance whose in-scatter (x SKY_INSCATTER) is the sky-lit bank radiance fogSkyLum,
    // night floor included. The hemisphere light is a surface-ambient term, far below it.
    volSky.current.setRGB(...rig.fogSkyLum).multiplyScalar(1 / SKY_INSCATTER);
    // Outside only: inside a cell the interior host drives the medium
    // (InteriorDoors, with the cell's profile and no sun).
    if (volumetrics.band !== "off" && !hidden) {
      const persp = camera as THREE.PerspectiveCamera;
      const irr = volSun.current;
      const field = fixtureLightFieldOf(scene);
      nearestVolumeLights((v) => field.forEachLight(v), camera.position.x, camera.position.y, camera.position.z,
        MAX_VOLUME_LIGHTS, volLights.current);
      const { sunriseMin, sunsetMin } = sunriseSunsetMin(epochMinutes, latitudeOverrideRad);
      volumetrics.update({
        camera: persp, timeS: waterTransportTimeS(), deltaS: waterTransportDeltaS(), sunDir, sunIrradiance: irr, skyIrradiance: volSky.current,
        lights: volLights.current,
        fog: {
          minuteOfDay: ((epochMinutes % 1440) + 1440) % 1440, sunriseMin, sunsetMin,
          prevNightClearCalm: fogClock.prevNightClearCalm,
          hoursSinceRain: fogClock.hoursSinceRain(epochMinutes, wx.rainIntensity > 0.02),
          rain: wx.rainIntensity,
          windSpeedMS: wx.windSpeedMS, windDirXZ: wx.windDirXZ, humidity, wetSeason: (worldClock.season().s + 1) / 2,
          weatherRadiation: wx.mist.radiation, weatherAdvection: wx.mist.advection,
          onshore: onshoreProbe.at(base, camera.position.x, camera.position.z, extentM, wx.windDirXZ),
          regionHaze: wx.regionHaze,
          dayIndex: Math.floor(epochMinutes / 1440),
          profile: regionFog.current?.at(base, camera.position.x, camera.position.z, extentM),
        },
      });
    }

    // Exposure: eye adaptation in log space on REAL seconds (adaptExposure);
    // snap when paused or scrubbed so fixed-instant probes are deterministic.
    // The adapted value lives here, not in gl.toneMappingExposure: inside a
    // cell InteriorEnvironment overwrites the renderer's value with 1 every
    // frame, and reading it back made the exit start from 1 (walk 6 white-out).
    const jumped =
      !Number.isFinite(state.current.lastEpoch) ||
      Math.abs(epochMinutes - state.current.lastEpoch) > worldClock.rate * 0.5 + 1;
    state.current.lastEpoch = epochMinutes;
    state.current.exposure = !clockRunning || jumped
      ? rig.exposureTarget
      : adaptExposure(state.current.exposure, rig.exposureTarget, delta);
    gl.toneMappingExposure = state.current.exposure;

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
      envRef.current?.rebake();
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
      volumetricBand: volumetrics.band,
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
    <SkyContext.Provider value={{ csm, volumetrics, sunLighting }}>
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
