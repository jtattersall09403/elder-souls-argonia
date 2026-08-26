import { createContext, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { CSM } from "three/examples/jsm/csm/CSM.js";
import {
  dayPhaseAt,
  toHorizontal,
  localSiderealAngle,
  epochDays,
  type MoonState,
} from "@elder-souls/world-time";
import catalogue from "../../../../world/sources/sky/star-catalogue.json";
import { createAerialUniforms, type AerialUniforms } from "./aerial";
import { computeLightRig, type LightRig } from "./lightRig";
import { worldClock, notifyClock } from "./timeState";

/**
 * The natural light and sky system (world module 55, Phase 8a): Preetham sky
 * dome (three's bundled Sky addon) lifted onto the physical lux scale and
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

export const SkyContext = createContext<{ csm: CSM | null }>({ csm: null });

const STAR_RADIUS = 28_000;
const MOON_RADIUS = 26_000;
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

// ---------- sky dome (Preetham day + authored night, one patched shader) ----------

interface SkyExtras {
  uSkyLum: { value: number };
  uSkyFade: { value: number };
  uSunAltDeg: { value: number };
  uNightBoost: { value: number };
  uBeltLum: { value: number };
  uNightZenith: { value: THREE.Color };
  uNightHorizon: { value: THREE.Color };
  uGroundLum: { value: THREE.Color };
  uHorizonLum: { value: THREE.Color };
  uDawnLum: { value: number };
  uDawnDir: { value: THREE.Vector2 };
}

function createSkyDome(scale: number): { sky: Sky; extras: SkyExtras } {
  const sky = new Sky();
  sky.scale.setScalar(scale);
  const mat = sky.material;
  const extras: SkyExtras = {
    uSkyLum: { value: 16_000 },
    uSkyFade: { value: 1 },
    uSunAltDeg: { value: 45 },
    uNightBoost: { value: 1 },
    uBeltLum: { value: 0 },
    uNightZenith: { value: new THREE.Color(0, 0, 0) },
    uNightHorizon: { value: new THREE.Color(0, 0, 0) },
    uGroundLum: { value: new THREE.Color(0, 0, 0) },
    uHorizonLum: { value: new THREE.Color(0, 0, 0) },
    uDawnLum: { value: 0 },
    uDawnDir: { value: new THREE.Vector2(0, 1) },
  };
  Object.assign(mat.uniforms, extras);
  mat.uniforms.cloudCoverage.value = 0; // clouds are Phase 8c
  mat.fragmentShader =
    "uniform float uSkyLum;\nuniform float uSkyFade;\nuniform float uSunAltDeg;\nuniform float uNightBoost;\nuniform float uBeltLum;\nuniform vec3 uNightZenith;\nuniform vec3 uNightHorizon;\nuniform vec3 uGroundLum;\nuniform vec3 uHorizonLum;\nuniform float uDawnLum;\nuniform vec2 uDawnDir;\n" +
    mat.fragmentShader.replace(
      "gl_FragColor = vec4( texColor, 1.0 );",
      /* glsl */ `
      // Preetham emits NaN/negatives/INFINITIES at and below the horizon; the
      // PMREM env bake integrates the whole sphere, and one bad texel poisons
      // the env map and wrecks every lit material. Do NOT trust isnan() — real
      // drivers (ANGLE/Metal fast-math) often optimise it away (owner gate
      // 2026-08-25: driver-dependent white-out). Instead the below-horizon
      // half is REPLACED deterministically with a CPU-computed ground-bounce
      // colour (which also gives the IBL a sane lower hemisphere), and the
      // above-horizon values are clamped through a NaN-collapsing min/max
      // chain (max(NaN, x) selects x on every mainstream GPU).
      texColor = min(max(texColor, vec3(0.0)), vec3(50.0));
      // Lift the Preetham dome's relative HDR onto the scene's lux scale.
      texColor *= uSkyLum;
      // DIRECTIONAL twilight (research doc §8c): the anti-solar sky runs
      // ~3.5° "later" into dusk than the solar side, so night sweeps across
      // the dome from opposite the sunset instead of arriving as one rim.
      vec2 esAzDir = direction.xz;
      float esAzLen = max(length(esAzDir), 1e-4);
      float esCosAz = clamp(dot(esAzDir / esAzLen, uDawnDir), -1.0, 1.0);
      float esD = -uSunAltDeg;
      float esA = 3.5 * (1.0 - smoothstep(5.0, 9.0, esD));
      float esAltEff = uSunAltDeg - esA * (1.0 - esCosAz) * 0.5;
      float esFade = smoothstep(-9.0, -1.0, esAltEff);
      // Night dome, boosted so its SCREEN brightness is already the night
      // level whenever it shows (uNightBoost — kills the black gap between
      // sunset and starlight).
      vec3 esNight = (uNightZenith
        + (uNightHorizon - uNightZenith) * pow(1.0 - clamp(direction.y, 0.0, 1.0), 3.0))
        * uNightBoost;
      texColor = mix(esNight, texColor, esFade);
      // Earth's shadow (anti-solar dark blue-grey segment, top climbing
      // ~1.4°/° of sun depression) with the Belt of Venus rose band above,
      // both dissolving by ~7° depression (research §8c).
      float esWAnti = max(0.0, -esCosAz);
      float esElevDeg = degrees(asin(clamp(direction.y, -1.0, 1.0)));
      float esShadowIn = smoothstep(0.3, 1.2, esD) * (1.0 - smoothstep(5.0, 7.5, esD));
      float esTop = 1.4 * esD;
      float esBelow = 1.0 - smoothstep(esTop - 2.0, esTop + 1.5, esElevDeg);
      texColor *= 1.0 - 0.4 * esWAnti * esShadowIn * esBelow;
      float esBelt = exp(-pow((esElevDeg - esTop - 4.0) / 4.0, 2.0));
      texColor += vec3(0.95, 0.45, 0.42) * uBeltLum * esWAnti * esBelt;
      // Twilight glow (owner round 3): tropical dawn/dusk gradient anchored
      // at the sun's azimuth — molten orange core, coral/magenta spread,
      // violet-indigo wash opposite. uDawnLum is exposure-anchored on the
      // CPU so the on-screen brightness follows one smooth authored bell.
      {
        float esAz = esCosAz * 0.5 + 0.5;
        float esHz = pow(1.0 - clamp(direction.y, 0.0, 1.0), 3.0);
        // Palette re-tuned round 6 to the owner's tropical references:
        // golden-peach core, coral-pink spread, lavender wash — pastel and
        // light, never a saturated crimson band.
        texColor += uDawnLum * esHz * (
            vec3(1.00, 0.58, 0.28) * pow(esAz, 5.0) * 1.05
          + vec3(1.00, 0.45, 0.50) * pow(esAz, 2.0) * 0.55
          + vec3(0.55, 0.35, 0.62) * 0.20);
      }
      // Below the horizon (hard branch, not mix(): mix(x, NaN, 0.0) is still
      // NaN): first a distance-haze band — so looking off the province edge
      // reads as hazy distance, not a flat brown void (owner round 3) — then
      // the ground-bounce colour for the IBL's deep lower hemisphere.
      if (direction.y < -0.02) {
        float esToGround = 1.0 - smoothstep(-0.34, -0.08, direction.y);
        texColor = mix(uHorizonLum, uGroundLum, esToGround);
      } else {
        texColor = mix(uHorizonLum, texColor, smoothstep(-0.02, 0.012, direction.y));
      }
      // Stay below the half-float ceiling (65504): the PMREM env bake renders
      // into a HalfFloat target, and any overflow becomes Infinity there and
      // poisons the environment lighting.
      texColor = min(texColor, vec3(60000.0));
      gl_FragColor = vec4( texColor, 1.0 );`,
    );
  return { sky, extras };
}

function copySkyUniforms(from: Sky & { material: THREE.ShaderMaterial }, to: Sky): void {
  const a = from.material.uniforms;
  const b = to.material.uniforms;
  for (const k of ["turbidity", "rayleigh", "mieCoefficient", "mieDirectionalG", "uSkyLum", "uSkyFade", "uSunAltDeg", "uNightBoost", "uBeltLum", "uDawnLum"]) {
    b[k].value = a[k].value;
  }
  (b.uDawnDir.value as THREE.Vector2).copy(a.uDawnDir.value as THREE.Vector2);
  (b.sunPosition.value as THREE.Vector3).copy(a.sunPosition.value as THREE.Vector3);
  (b.uNightZenith.value as THREE.Color).copy(a.uNightZenith.value as THREE.Color);
  (b.uNightHorizon.value as THREE.Color).copy(a.uNightHorizon.value as THREE.Color);
  (b.uGroundLum.value as THREE.Color).copy(a.uGroundLum.value as THREE.Color);
  (b.uHorizonLum.value as THREE.Color).copy(a.uHorizonLum.value as THREE.Color);
}

// ---------- authored stars ----------

interface FlatStar {
  ra: number; // radians
  dec: number;
  mag: number;
  /** Density rank 0..1: the star shows when rank ≤ the density uniform.
   * Authored constellation stars are 0 (always shown). */
  rank: number;
}

/** Background-star pool size; the density slider reveals a fraction of it.
 * Default multiplier 1 shows half the pool (≈ double round 5's count). */
export const STAR_POOL = 13_200;
let starDensityMult = 1;
export function setStarDensityMult(v: number): void {
  starDensityMult = Math.min(2, Math.max(0.1, v));
}
export function getStarDensityMult(): number {
  return starDensityMult;
}

function flattenCatalogue(): FlatStar[] {
  const out: FlatStar[] = [];
  for (const c of catalogue.constellations) {
    const cosDec = Math.max(0.2, Math.cos(c.decDeg * DEG));
    for (const [dRa, dDec, mag] of c.stars as [number, number, number][]) {
      out.push({ ra: (c.raDeg + dRa / cosDec) * DEG, dec: (c.decDeg + dDec) * DEG, mag, rank: 0 });
    }
    const p = (c as { planet?: { dRaDeg: number; dDecDeg: number; magnitude: number } }).planet;
    if (p) {
      out.push({
        ra: (c.raDeg + p.dRaDeg / cosDec) * DEG,
        dec: (c.decDeg + p.dDecDeg) * DEG,
        mag: p.magnitude,
        rank: 0,
      });
    }
  }
  out.push({
    ra: catalogue.poleStar.raDeg * DEG,
    dec: catalogue.poleStar.decDeg * DEG,
    mag: catalogue.poleStar.magnitude,
    rank: 0,
  });
  // Background field (owner round 3, count raised rounds 4–5): the sky
  // between the thirteen authored constellations must not be empty. Faint
  // stars from a SEEDED generator (deterministic — same sky every night),
  // magnitudes below the constellation stars so the authored figures still
  // lead. They share the buffer, so they wheel with the constellations.
  let seed = 0x5eed5;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < STAR_POOL; i++) {
    out.push({
      ra: 2 * Math.PI * rnd(),
      dec: Math.asin(2 * rnd() - 1), // uniform on the sphere
      mag: 2.6 + 2.8 * Math.pow(rnd(), 0.7),
      rank: (i + 1) / STAR_POOL, // density slider reveals in this order
    });
  }
  return out;
}

const STAR_VERTEX = /* glsl */ `
attribute float aSize;
attribute float aLum;
attribute float aMag;
attribute float aRank;
uniform float uSunAltDeg;
uniform float uStarFrac;
uniform vec2 uDawnDir;
varying float vLum;
void main() {
  // Density slider: background stars beyond the revealed fraction vanish.
  float esDensity = aRank <= uStarFrac ? 1.0 : 0.0;
  // Staged star appearance (research §8c): brighter magnitudes switch on at
  // shallower sun depressions (mag -1 by ~3°, mag 6 by ~18°), and the
  // anti-solar sky — which darkens first — shows its stars first.
  float esD = -uSunAltDeg;
  vec2 esAz = normalize(position.xz + vec2(1e-5, 0.0));
  float esCosAz = clamp(dot(esAz, uDawnDir), -1.0, 1.0);
  float esDEff = esD + 3.5 * (1.0 - smoothstep(5.0, 9.0, esD)) * (1.0 - esCosAz) * 0.5;
  float esOn = 3.0 + 2.14 * (aMag + 1.0);
  vLum = aLum * esDensity * smoothstep(esOn - 2.0, esOn, esDEff);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize;
  gl_Position = projectionMatrix * mv;
}`;

const STAR_FRAGMENT = /* glsl */ `
uniform float uOpacity;
varying float vLum;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float falloff = smoothstep(0.5, 0.12, length(d));
  gl_FragColor = vec4(vec3(vLum) * falloff * uOpacity, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ---------- moons as lit spheres ----------

const MOON_VERTEX = /* glsl */ `
varying vec3 vN;
varying vec3 vWp;
void main() {
  vN = normalize(position);
  vWp = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const MOON_FRAGMENT = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uTint;
uniform float uDayDim;
varying vec3 vN;
varying vec3 vWp;

float esMoonHash(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}
float esMoonNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = esMoonHash(i);
  float n100 = esMoonHash(i + vec3(1, 0, 0));
  float n010 = esMoonHash(i + vec3(0, 1, 0));
  float n110 = esMoonHash(i + vec3(1, 1, 0));
  float n001 = esMoonHash(i + vec3(0, 0, 1));
  float n101 = esMoonHash(i + vec3(1, 0, 1));
  float n011 = esMoonHash(i + vec3(0, 1, 1));
  float n111 = esMoonHash(i + vec3(1, 1, 1));
  return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
             mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
}

void main() {
  // Real sun direction (even below the local horizon — the moons are in
  // space), so phase and terminator are correct by construction (§95). The
  // disc is DISPLAY-REFERRED (scene tone mapping deliberately skipped): the
  // night exposure floor clips any physically-scaled luminance to a flat
  // white circle (owner round 3), so the moon is authored in output space
  // like most games do. Additive blend: the dark side melts into daylight,
  // the lit side glows over the night dome. uDayDim washes the disc against
  // the bright day dome (round 2's "moons add light" report).
  vec3 n = normalize(vN);
  // pow > 1 SHARPENS the terminator: the round-3 report "moons always look
  // full at night" was gibbous phases washing out under the old softening —
  // the ephemeris itself is verified correct (crescents pre-dawn, halves at
  // midnight rise/set, ~51 min/night rise drift).
  float lit = pow(max(dot(n, uSunDir), 0.0), 1.35);
  // Procedural maria/highlands mottling, stable on the sphere; limb
  // darkening from the view angle so the disc reads as a globe.
  float esMar = esMoonNoise(n * 3.1) + 0.5 * esMoonNoise(n * 7.7) + 0.25 * esMoonNoise(n * 16.3);
  float esPat = 0.68 + 0.32 * smoothstep(0.55, 1.15, esMar);
  vec3 esView = normalize(cameraPosition - vWp);
  float esLimb = 0.45 + 0.55 * pow(max(dot(n, esView), 0.0), 0.6);
  gl_FragColor = vec4(uTint * (0.005 + 0.68 * lit) * esPat * esLimb * uDayDim, 1.0);
  #include <colorspace_fragment>
}`;

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
}

declare global {
  interface Window {
    __STUDIO_SKY_DEBUG__?: SkyDebugState;
  }
}

export function WorldSky({
  mode,
  extentM,
  children,
}: {
  mode: "fly" | "character";
  extentM: number;
  children?: React.ReactNode;
}) {
  const { scene, camera, gl } = useThree();
  const base = import.meta.env.BASE_URL;
  ensureAirPixels(base);
  (window as unknown as { __SCENE__?: THREE.Scene }).__SCENE__ = scene;
  (window as unknown as { __THREE__?: typeof THREE }).__THREE__ = THREE;

  // Climate-air raster as a GPU texture for the haze term (shared uniforms).
  useEffect(() => {
    if (sharedAerialUniforms.uClimateAir.value) return;
    new THREE.TextureLoader().load(`${base}province/climate-air.png`, (t) => {
      t.colorSpace = THREE.NoColorSpace;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      sharedAerialUniforms.uClimateAir.value = t;
    });
  }, [base]);

  // Renderer: physical lights + ACES + soft shadows, one configuration for
  // both modes (module 55 §96 — tone mapping is part of the light system).
  useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1e-4;
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
  }, [gl]);

  // Cascaded shadow maps: mandatory for a sun over kilometres of terrain.
  // Character play needs crisp near shadows; the flyover trades texel size for
  // mountain-scale reach.
  const csm = useMemo(() => {
    // ?smsize= lets headless probes shrink the cascade maps (software GL).
    const smsize = Number(new URLSearchParams(window.location.search).get("smsize")) || 2048;
    // Character play: 2 cascades cover 300 m fine and shave a whole shadow
    // pass per frame (load/perf, owner round 2). The flyover keeps 3 for
    // mountain-scale reach.
    const c = new CSM({
      camera: camera as THREE.PerspectiveCamera,
      parent: scene,
      cascades: mode === "character" ? 2 : 3,
      shadowMapSize: smsize,
      maxFar: mode === "character" ? 300 : 6000,
      mode: "practical",
      // Small depth bias + normal-offset bias: the old large depth bias
      // pushed shadows off their casters (~0.5 m "hovering character" gap,
      // owner round 5). Normal bias fights acne without detaching contacts.
      shadowBias: -6e-5,
      lightMargin: 400,
    });
    c.fade = true;
    for (const l of c.lights) l.shadow.normalBias = 0.05;
    // Tag the cascade lights so discarded-render orphans are identifiable:
    // constructing CSM mutates the scene (adds lights) during render, and
    // React may throw a suspended render away WITHOUT running any cleanup.
    for (const l of c.lights) l.name = "csm-cascade";
    return c;
  }, [camera, scene, mode]);
  useEffect(() => {
    // Sweep orphaned cascade lights from discarded renders (owner gate defect
    // 2026-08-25: suspense retries leaked 8 CSMs = 24 stray shadow-casting
    // intensity-3 white lights — night terrain lit like day, frame rate dead).
    const live = new Set<THREE.Object3D>(csm.lights);
    const strays = scene.children.filter(
      (o) => o.name === "csm-cascade" && !live.has(o),
    );
    for (const s of strays) {
      scene.remove((s as THREE.DirectionalLight).target);
      scene.remove(s);
    }
    return () => {
      // BOTH calls: CSM.dispose() restores materials but does NOT detach the
      // cascade lights — that is remove()'s job.
      csm.remove();
      csm.dispose();
    };
  }, [csm, scene]);

  // Any lit material that enters the scene (character GLBs, sea, props) must
  // be CSM-patched or the per-cascade lights each add full-strength lighting.
  const patched = useRef(new WeakSet<THREE.Material>());
  const patchScene = () => {
    let anyNew = false;
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        const lit = m as THREE.MeshStandardMaterial;
        if (!lit || patched.current.has(m) || csm.shaders.has(m)) {
          patched.current.add(m);
          continue;
        }
        if (lit.isMeshStandardMaterial || (m as THREE.MeshLambertMaterial).isMeshLambertMaterial) {
          csm.setupMaterial(m);
          m.needsUpdate = true;
          anyNew = true;
        }
        patched.current.add(m);
      }
    });
    // Newly patched programs compile off the main thread where the driver
    // supports it (KHR_parallel_shader_compile) — synchronous first-use
    // compiles of the big CSM shaders are the load-time frame stalls.
    if (anyNew) void gl.compileAsync(scene, camera).catch(() => {});
  };

  const { sky, extras } = useMemo(() => createSkyDome(STAR_RADIUS * 1.6), []);
  const bake = useMemo(() => {
    const b = createSkyDome(100);
    const bakeScene = new THREE.Scene();
    bakeScene.add(b.sky);
    return { ...b, scene: bakeScene };
  }, []);
  const pmrem = useMemo(() => new THREE.PMREMGenerator(gl), [gl]);
  const envRT = useRef<THREE.WebGLRenderTarget | null>(null);
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
  const starGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(stars.length * 3), 3));
    const size = new Float32Array(stars.length);
    const lum = new Float32Array(stars.length);
    const mag = new Float32Array(stars.length);
    const rank = new Float32Array(stars.length);
    stars.forEach((s, i) => {
      rank[i] = s.rank;
      size[i] = Math.max(1.4, 5.2 - s.mag) * Math.min(2, window.devicePixelRatio || 1);
      // Bright enough to read as constellations under the night exposures
      // (owner round 2, brightened round 5); day is handled by the staged
      // twilight visibility in the vertex stage.
      lum[i] = 1.5 * Math.pow(10, -0.4 * s.mag);
      mag[i] = s.mag;
    });
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    g.setAttribute("aLum", new THREE.BufferAttribute(lum, 1));
    g.setAttribute("aMag", new THREE.BufferAttribute(mag, 1));
    g.setAttribute("aRank", new THREE.BufferAttribute(rank, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), STAR_RADIUS * 2);
    return g;
  }, [stars]);
  const starMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uOpacity: { value: 0 },
          uSunAltDeg: { value: 45 },
          uStarFrac: { value: 0.5 },
          uDawnDir: { value: new THREE.Vector2(0, 1) },
        },
        vertexShader: STAR_VERTEX,
        fragmentShader: STAR_FRAGMENT,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    [],
  );

  // The Serpent: four dark "unstars" (canon), drawn as occluding smudges.
  const serpentGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(4 * 3), 3));
    const size = new Float32Array(4).fill(9 * Math.min(2, window.devicePixelRatio || 1));
    const lum = new Float32Array(4).fill(1);
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    g.setAttribute("aLum", new THREE.BufferAttribute(lum, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), STAR_RADIUS * 2);
    return g;
  }, []);
  const serpentMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uOpacity: { value: 0 },
          uSunAltDeg: { value: 45 },
          uStarFrac: { value: 1 },
          uDawnDir: { value: new THREE.Vector2(0, 1) },
        },
        vertexShader: STAR_VERTEX,
        fragmentShader: /* glsl */ `
uniform float uOpacity;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float falloff = smoothstep(0.5, 0.2, length(d));
  gl_FragColor = vec4(vec3(0.0), falloff * uOpacity);
}`,
        blending: THREE.NormalBlending,
        depthWrite: false,
        transparent: true,
      }),
    [],
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
  const moonMats = useMemo(
    () =>
      moonDefs.map(
        (d) =>
          new THREE.ShaderMaterial({
            uniforms: {
              uSunDir: { value: new THREE.Vector3(0, 1, 0) },
              uTint: { value: d.tint },
              uDayDim: { value: 1 },
            },
            vertexShader: MOON_VERTEX,
            fragmentShader: MOON_FRAGMENT,
            blending: THREE.AdditiveBlending,
            transparent: true,
            depthWrite: false,
          }),
      ),
    [moonDefs],
  );
  const moonRefs = useRef<(THREE.Mesh | null)[]>([]);
  const starsRef = useRef<THREE.Points>(null);
  const serpentRef = useRef<THREE.Points>(null);
  const hemiRef = useRef<THREE.HemisphereLight>(null);
  const moonLightRef = useRef<THREE.DirectionalLight>(null);
  const moonLightTarget = useMemo(() => new THREE.Object3D(), []);

  const state = useRef({
    lastLst: Number.NaN,
    lastBakeSunY: Number.NaN,
    lastEpoch: Number.NaN,
    envBakes: 0,
    lastNotify: 0,
    lastPatch: 0,
    lastFrustumUpdate: 0,
  });

  const updateCelestialBuffers = (epochMinutes: number, rig: LightRig) => {
    const lst = localSiderealAngle(epochMinutes);
    if (Math.abs(lst - state.current.lastLst) < 0.0005) return;
    state.current.lastLst = lst;
    const pos = starGeom.getAttribute("position") as THREE.BufferAttribute;
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
    const spos = serpentGeom.getAttribute("position") as THREE.BufferAttribute;
    (catalogue.serpent.unstars as [number, number, number][]).forEach(([dRa, dDec], i) => {
      const h = toHorizontal(dec + dDec * DEG, lst - (ra + dRa * DEG), latitudeOverrideRad);
      spos.setXYZ(i, h.direction.x * STAR_RADIUS, h.direction.y * STAR_RADIUS, h.direction.z * STAR_RADIUS);
    });
    spos.needsUpdate = true;
    void rig;
  };

  useFrame((_s, delta) => {
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
    const rig = computeLightRig(
      epochMinutes,
      humidity,
      worldClock.season().s,
      latitudeOverrideRad,
    );
    const sunDir = new THREE.Vector3(rig.sun.direction.x, rig.sun.direction.y, rig.sun.direction.z);

    // Sky dome follows the camera so the horizon never clips.
    sky.position.copy(camera.position);
    const u = sky.material.uniforms;
    (u.sunPosition.value as THREE.Vector3).copy(sunDir);
    u.turbidity.value = rig.turbidity;
    u.rayleigh.value = rig.rayleigh;
    u.mieCoefficient.value = rig.mieCoefficient;
    u.mieDirectionalG.value = rig.mieDirectionalG;
    extras.uSkyLum.value = rig.skyLuminance;
    extras.uSkyFade.value = rig.skyFade;
    extras.uSunAltDeg.value = (rig.sun.altitude * 180) / Math.PI;
    extras.uNightBoost.value = rig.nightBoost;
    extras.uBeltLum.value = rig.beltLum;
    extras.uNightZenith.value.setRGB(...rig.nightZenith);
    extras.uNightHorizon.value.setRGB(...rig.nightHorizon);
    extras.uGroundLum.value.setRGB(...rig.groundBounce);
    extras.uHorizonLum.value.setRGB(...rig.horizonHaze);
    extras.uDawnLum.value = rig.dawnLum;
    extras.uDawnDir.value.set(rig.dawnDir[0], rig.dawnDir[1]);

    // Sun (CSM's cascade lights ARE the sun).
    csm.lightDirection.copy(sunDir).negate();
    for (const light of csm.lights) {
      light.color.setRGB(...rig.sunColor);
      light.intensity = rig.sunIntensity;
      light.castShadow = rig.sunIntensity > 1;
    }
    csm.update();
    const nowMs = performance.now();
    if (nowMs - state.current.lastFrustumUpdate > 500) {
      state.current.lastFrustumUpdate = nowMs;
      csm.updateFrustums();
      if (nowMs - state.current.lastPatch > 1000) {
        state.current.lastPatch = nowMs;
        patchScene();
      }
    }

    // Moonlight: Masser as a cool, weak key (no shadows at Tier 1).
    const masser = rig.moons[0];
    if (moonLightRef.current) {
      const l = moonLightRef.current;
      l.intensity = rig.moonIntensity;
      l.color.setRGB(...rig.moonColor);
      l.position
        .copy(camera.position)
        .addScaledVector(
          new THREE.Vector3(masser.direction.x, masser.direction.y, masser.direction.z),
          2000,
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

    // Night sky elements. Star screen brightness = lum × exposure × boost,
    // i.e. anchored at the full-night level whenever twilight lets a star
    // through (the staged visibility lives in the star vertex stage).
    updateCelestialBuffers(epochMinutes, rig);
    const sunAltDeg = (rig.sun.altitude * 180) / Math.PI;
    (starMat.uniforms.uOpacity as { value: number }).value = rig.nightBoost;
    (starMat.uniforms.uStarFrac as { value: number }).value = Math.min(1, 0.5 * starDensityMult);
    (starMat.uniforms.uSunAltDeg as { value: number }).value = sunAltDeg;
    (starMat.uniforms.uDawnDir.value as THREE.Vector2).set(rig.dawnDir[0], rig.dawnDir[1]);
    (serpentMat.uniforms.uOpacity as { value: number }).value = 0.55 * rig.starOpacity;
    (serpentMat.uniforms.uSunAltDeg as { value: number }).value = sunAltDeg;
    (serpentMat.uniforms.uDawnDir.value as THREE.Vector2).set(rig.dawnDir[0], rig.dawnDir[1]);
    rig.moons.forEach((m: MoonState, i) => {
      const mesh = moonRefs.current[i];
      if (!mesh) return;
      const dir = new THREE.Vector3(m.direction.x, m.direction.y, m.direction.z);
      mesh.position.copy(camera.position).addScaledVector(dir, MOON_RADIUS);
      const radius = Math.tan(m.angularDiameter / 2) * MOON_RADIUS;
      mesh.scale.setScalar(radius);
      (moonMats[i].uniforms.uSunDir.value as THREE.Vector3).copy(sunDir);
      // Day wash (stronger after round 3 — a rising daytime moon must not
      // visibly lighten the sky) × rise/set fade × low-altitude extinction
      // (a moon in the horizon murk is barely there, day or night).
      const horizonFade = THREE.MathUtils.smoothstep(m.altitude, -0.06, 0.06);
      const extinction = 0.3 + 0.7 * THREE.MathUtils.smoothstep(m.altitude, 0.0, 0.3);
      (moonMats[i].uniforms.uDayDim as { value: number }).value =
        (1 - 0.88 * rig.skyFade) * horizonFade * extinction;
      mesh.visible = m.altitude > -0.1;
    });

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
    if (
      !Number.isFinite(state.current.lastBakeSunY) ||
      Math.abs(sunDir.y - state.current.lastBakeSunY) > bakeStep
    ) {
      state.current.lastBakeSunY = sunDir.y;
      copySkyUniforms(sky as Sky & { material: THREE.ShaderMaterial }, bake.sky);
      bake.sky.material.uniforms.showSunDisc.value = 0;
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
      triangles: gl.info.render.triangles,
      sunLightIntensity: csm.lights[0]?.intensity ?? 0,
      shadowMapEnabled: gl.shadowMap.enabled,
      hemiIntensity: hemiRef.current?.intensity ?? -1,
    } as SkyDebugState;
  });

  return (
    <SkyContext.Provider value={{ csm }}>
      <primitive object={sky} renderOrder={-10} frustumCulled={false} />
      <points
        ref={starsRef}
        geometry={starGeom}
        material={starMat}
        renderOrder={-8}
        frustumCulled={false}
      />
      <points
        ref={serpentRef}
        geometry={serpentGeom}
        material={serpentMat}
        renderOrder={-7}
        frustumCulled={false}
      />
      {moonDefs.map((d, i) => (
        <mesh
          key={d.id}
          ref={(m) => {
            moonRefs.current[i] = m;
          }}
          material={moonMats[i]}
          renderOrder={-9}
          frustumCulled={false}
        >
          <sphereGeometry args={[1, 48, 24]} />
        </mesh>
      ))}
      <hemisphereLight ref={hemiRef} intensity={0} />
      <directionalLight ref={moonLightRef} intensity={0} />
      <primitive object={moonLightTarget} />
      {children}
    </SkyContext.Provider>
  );
}
