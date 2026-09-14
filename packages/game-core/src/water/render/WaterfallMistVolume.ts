import * as THREE from "three";
import type { WaterRuntime } from "./types";
import { WATER_LAYER } from "./waterMaterial";
import { WHITEWATER_GLSL, FALLS_SHADOW_VERTEX_PARS, FALLS_SHADOW_VERTEX, FALLS_SHADOW_FRAGMENT_PARS } from "./whitewaterStreaks";
import type { FallPath } from "./WaterfallSheets";
import type { KitSharedUniforms } from "./WaterfallKitMaterial";

/**
 * A ray-marched mist volume per fall (decision 0064; research
 * `waterfall-mist-and-spray.md`). This is NOT the weather system's froxel
 * fog (cut, owner 2026-09-13): it is a small analytic volume per cascade —
 * a cone that hugs the falling water and fans out downward (spray shed by
 * the jet, growing with the distance fallen) plus an ellipsoid dome over the
 * plunge pool (the cloud the impact throws up) — marched in `MIST_STEPS`
 * jittered steps between the ray's entry into the fall's bounding box and
 * its exit or the scene depth, whichever is first, so the mist wraps rock
 * and water softly instead of ending on a plane. Density is a two-octave
 * value noise drifting up and downstream, scaled by a smooth falloff from
 * each shape's axis; lighting is the shared falls irradiance under the
 * scene's CSM shadow with a Henyey–Greenstein forward-scatter lobe toward
 * the sun (mist glows when backlit). Drawn only within `MIST_DRAW_M`,
 * nothing from under water.
 *
 * One InstancedMesh of unit cubes (one per fall, axis-aligned in world
 * space so the box slab test is trivial), back faces only so the camera may
 * stand inside the volume. Cost is bounded by the box's screen area ×
 * `MIST_STEPS`; a fall seen from its base fills a good part of the frame, so
 * the noise is cheap (value noise, no textures).
 */

export const MIST_STEPS = 20;
/** Volumes fade in from this range and are culled beyond the far figure. */
export const MIST_DRAW_M = { near: 120, far: 150 } as const;
/** Cone radius at the lip and the growth per metre fallen (m). */
export const MIST_CONE = { lipRadiusFrac: 0.35, growPerM: 0.11, maxRadiusM: 12 } as const;
/** Dome radii over the pool: horizontal from the bowl, vertical from the drop. */
export const MIST_DOME = { horizontalScale: 1.15, heightPerDropM: 0.22, minHeightM: 2, maxHeightM: 14 } as const;
/** Extinction per metre at full density (cone at the foot / dome). */
export const MIST_SIGMA = { cone: 0.035, dome: 0.06 } as const;
/** Mist albedo (grey) and the HG forward-scatter asymmetry. */
export const MIST_ALBEDO = 0.86;
export const MIST_HG_G = 0.55;
/** Drift of the density field (m/s): up and downstream. */
export const MIST_DRIFT = { upMS: 0.8, downstreamMS: 0.6 } as const;

export interface MistVolumeSite {
  id: string;
  lip: THREE.Vector3;
  plunge: THREE.Vector3;
  forward: THREE.Vector3;
  widthM: number;
  dropM: number;
  bowlRadiusM: number;
  /** World AABB of the proxy box. */
  min: THREE.Vector3;
  max: THREE.Vector3;
}

/** The analytic volume for one traced fall (pure; the tests read it). */
export function mistVolumeSite(path: FallPath): MistVolumeSite {
  const c = path.cascade;
  const pts = path.points;
  const lipIndex = Math.max(pts.findIndex((p) => p.s >= 0), 0);
  const lip = new THREE.Vector3(pts[lipIndex].x, pts[lipIndex].y, pts[lipIndex].z);
  const plunge = new THREE.Vector3(c.plunge.x, c.plunge.y, c.plunge.z);
  const dl = Math.hypot(c.direction.x, c.direction.z) || 1;
  const forward = new THREE.Vector3(c.direction.x / dl, 0, c.direction.z / dl);
  const widthM = Math.max(c.widthM, 0.5);
  const dropM = Math.max(lip.y - plunge.y, 0.5);
  const bowlRadiusM = Math.max(c.bowlRadiusM ?? widthM, widthM * 0.9, 4);
  const coneFoot = Math.min(widthM * MIST_CONE.lipRadiusFrac + dropM * MIST_CONE.growPerM, MIST_CONE.maxRadiusM);
  const domeR = bowlRadiusM * MIST_DOME.horizontalScale;
  const domeH = Math.min(Math.max(dropM * MIST_DOME.heightPerDropM, MIST_DOME.minHeightM), MIST_DOME.maxHeightM);
  const r = Math.max(coneFoot, domeR) + 1;
  const min = new THREE.Vector3(Math.min(lip.x, plunge.x) - r, plunge.y - 1, Math.min(lip.z, plunge.z) - r);
  const max = new THREE.Vector3(Math.max(lip.x, plunge.x) + r, Math.max(lip.y + 1, plunge.y + domeH + 1), Math.max(lip.z, plunge.z) + r);
  return { id: path.id, lip, plunge, forward, widthM, dropM, bowlRadiusM, min, max };
}

const VERTEX = /* glsl */ `
attribute vec3 aLip;
attribute vec3 aPlunge;
attribute vec4 aParams;   // width, drop, bowl radius, phase
attribute vec4 aForward;  // forward xz, unused
attribute vec3 aBoxMin;
attribute vec3 aBoxMax;
varying vec3 vWorldPos;
varying vec3 vLip;
varying vec3 vPlunge;
varying vec4 vParams;
varying vec2 vForward;
varying vec3 vBoxMin;
varying vec3 vBoxMax;
uniform float uVerticalScale;
uniform float uLift;
${FALLS_SHADOW_VERTEX_PARS}
void main() {
  vec4 wp = instanceMatrix * vec4(position, 1.0);
  wp.y = (wp.y + uLift) * uVerticalScale;
  vec3 esShadowVertex = wp.xyz;
  vec3 transformedNormal = normalize(normalMatrix * (mat3(instanceMatrix) * normal));
  ${FALLS_SHADOW_VERTEX}
  vWorldPos = worldPosition.xyz;
  vLip = vec3(aLip.x, (aLip.y + uLift) * uVerticalScale, aLip.z);
  vPlunge = vec3(aPlunge.x, (aPlunge.y + uLift) * uVerticalScale, aPlunge.z);
  vParams = aParams;
  vForward = aForward.xy;
  vBoxMin = vec3(aBoxMin.x, (aBoxMin.y + uLift) * uVerticalScale, aBoxMin.z);
  vBoxMax = vec3(aBoxMax.x, (aBoxMax.y + uLift) * uVerticalScale, aBoxMax.z);
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const FRAGMENT = /* glsl */ `
precision highp float;
varying vec3 vWorldPos;
varying vec3 vLip;
varying vec3 vPlunge;
varying vec4 vParams;
varying vec2 vForward;
varying vec3 vBoxMin;
varying vec3 vBoxMax;
uniform float uTime;
uniform vec3 uAmbient;
uniform vec3 uSunLight;
uniform vec3 uSunDir;
uniform sampler2D uSceneDepth;
uniform float uHasDepth;
uniform float uCamNear;
uniform float uCamFar;
uniform vec2 uResolution;
uniform float uOpacity;
uniform float uUnderwater;
uniform float uVerticalScale;
uniform vec3 uCamForward;
#include <common>
${FALLS_SHADOW_FRAGMENT_PARS}
${WHITEWATER_GLSL}

float esMistHash(vec3 p){
  p = fract(p * 0.3183099 + vec3(0.1, 0.17, 0.23));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float esMistNoise(vec3 p){
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(esMistHash(i), esMistHash(i + vec3(1,0,0)), f.x), mix(esMistHash(i + vec3(0,1,0)), esMistHash(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(esMistHash(i + vec3(0,0,1)), esMistHash(i + vec3(1,0,1)), f.x), mix(esMistHash(i + vec3(0,1,1)), esMistHash(i + vec3(1,1,1)), f.x), f.y),
    f.z);
}
// density 0..1 at a world point: the cone hugging the fall + the dome over the pool
float esMistDensity(vec3 p, float t){
  vec3 axis = vPlunge - vLip;
  float len = max(length(axis), 0.5);
  vec3 ad = axis / len;
  float f = clamp(dot(p - vLip, ad) / len, 0.0, 1.0);          // 0 at the lip, 1 at the plunge
  vec3 onAxis = vLip + ad * f * len;
  float width = vParams.x;
  float drop = vParams.y;
  float radius = min(width * ${MIST_CONE.lipRadiusFrac.toFixed(2)} + f * drop * ${MIST_CONE.growPerM.toFixed(2)}, ${MIST_CONE.maxRadiusM.toFixed(1)});
  float q = length(p - onAxis) / max(radius, 0.3);
  float cone = q < 1.0 ? (1.0 - q * q) * (1.0 - q * q) * (0.15 + 0.85 * f) : 0.0;
  float domeR = vParams.z * ${MIST_DOME.horizontalScale.toFixed(2)};
  float domeH = clamp(drop * ${MIST_DOME.heightPerDropM.toFixed(2)}, ${MIST_DOME.minHeightM.toFixed(1)}, ${MIST_DOME.maxHeightM.toFixed(1)}) * uVerticalScale;
  vec3 dc = vPlunge + vec3(vForward.x, 0.0, vForward.y) * domeR * 0.25;
  vec3 dd = (p - dc) / vec3(domeR, domeH, domeR);
  float qd = dot(dd, dd);
  float dome = qd < 1.0 && p.y >= vPlunge.y - 0.5 ? (1.0 - qd) * (1.0 - qd) : 0.0;
  // a drifting, breathing density: two octaves, rising and going downstream
  vec3 drift = vec3(vForward.x * ${MIST_DRIFT.downstreamMS.toFixed(2)}, -${MIST_DRIFT.upMS.toFixed(2)}, vForward.y * ${MIST_DRIFT.downstreamMS.toFixed(2)}) * t;
  vec3 np = p + drift;
  float n = esMistNoise(np * 0.35) * 0.65 + esMistNoise(np * 0.9 + 7.3) * 0.35;
  n = smoothstep(0.25, 0.85, n);
  return (cone * ${MIST_SIGMA.cone.toFixed(2)} + dome * ${MIST_SIGMA.dome.toFixed(2)}) * (0.35 + 0.65 * n);
}
void main() {
  vec3 ro = cameraPosition;
  vec3 rd = normalize(vWorldPos - ro);
  // slab test against the fall's world box
  vec3 inv = 1.0 / rd;
  vec3 t0 = (vBoxMin - ro) * inv;
  vec3 t1 = (vBoxMax - ro) * inv;
  vec3 tmin = min(t0, t1);
  vec3 tmax = max(t0, t1);
  float tEnter = max(max(tmin.x, tmin.y), max(tmin.z, 0.0));
  float tExit = min(min(tmax.x, tmax.y), tmax.z);
  // never march past what is in front of the mist
  if (uHasDepth > 0.5) {
    vec2 suv = gl_FragCoord.xy / uResolution;
    float d = texture2D(uSceneDepth, suv).x;
    float sceneEye = (uCamNear * uCamFar) / (uCamFar - d * (uCamFar - uCamNear));
    float along = max(dot(rd, uCamForward), 0.05);
    tExit = min(tExit, sceneEye / along);
  }
  if (tExit <= tEnter) discard;
  float dist = distance(ro, (vBoxMin + vBoxMax) * 0.5);
  float range = 1.0 - smoothstep(${MIST_DRAW_M.near.toFixed(1)}, ${MIST_DRAW_M.far.toFixed(1)}, dist);
  if (range <= 0.001 || uUnderwater > 0.5) discard;
  float span = tExit - tEnter;
  float ds = span / float(${MIST_STEPS});
  // jitter the start per pixel so the steps never band
  float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  float t = uTime + vParams.w;
  float T = 1.0;
  float L = 0.0;
  float vis = esFallsSunVisibility();
  vec3 irr = esFallsIrradianceG(uAmbient, uSunLight, uSunDir, 0.5, vis);
  // Henyey-Greenstein forward lobe toward the sun, on top of the isotropic term
  float mu = dot(rd, uSunDir);
  float g = ${MIST_HG_G.toFixed(2)};
  float hg = (1.0 - g * g) / (4.0 * PI * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
  float sunGlow = 0.85 + 2.4 * hg * vis;
  for (int i = 0; i < ${MIST_STEPS}; i++) {
    float tt = tEnter + (float(i) + jitter) * ds;
    vec3 p = ro + rd * tt;
    float sigma = esMistDensity(p, t);
    if (sigma > 1e-4) {
      float a = 1.0 - exp(-sigma * ds);
      L += T * a;
      T *= 1.0 - a;
      if (T < 0.02) break;
    }
  }
  float alpha = (1.0 - T) * range * uOpacity;
  if (alpha < 0.004) discard;
  vec3 color = vec3(${MIST_ALBEDO.toFixed(2)}) * irr * sunGlow;
  gl_FragColor = vec4(color, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export interface MistVolumeDiagnostics {
  count: number;
  steps: number;
  perFall: Record<string, { coneFootRadiusM: number; domeRadiusM: number }>;
}

export class WaterfallMistVolume {
  readonly mesh: THREE.InstancedMesh;
  readonly material: THREE.ShaderMaterial;
  readonly diagnostics: MistVolumeDiagnostics;
  private readonly camForward = new THREE.Vector3(0, 0, -1);

  constructor(paths: readonly FallPath[], shared: KitSharedUniforms, applyAerial: (m: THREE.Material) => void) {
    const sites = paths.map(mistVolumeSite);
    const n = sites.length;
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const lip = new Float32Array(n * 3);
    const plunge = new Float32Array(n * 3);
    const params = new Float32Array(n * 4);
    const forward = new Float32Array(n * 4);
    const bmin = new Float32Array(n * 3);
    const bmax = new Float32Array(n * 3);
    const perFall: MistVolumeDiagnostics["perFall"] = {};
    const mesh = new THREE.InstancedMesh(geometry, undefined as unknown as THREE.Material, Math.max(n, 1));
    mesh.count = n;
    const m = new THREE.Matrix4();
    sites.forEach((s, i) => {
      lip.set([s.lip.x, s.lip.y, s.lip.z], i * 3);
      plunge.set([s.plunge.x, s.plunge.y, s.plunge.z], i * 3);
      params.set([s.widthM, s.dropM, s.bowlRadiusM, (i * 37) % 100], i * 4);
      forward.set([s.forward.x, s.forward.z, 0, 0], i * 4);
      bmin.set([s.min.x, s.min.y, s.min.z], i * 3);
      bmax.set([s.max.x, s.max.y, s.max.z], i * 3);
      const size = s.max.clone().sub(s.min);
      m.makeScale(size.x, size.y, size.z).setPosition(s.min.clone().add(s.max).multiplyScalar(0.5));
      mesh.setMatrixAt(i, m);
      perFall[s.id] = {
        coneFootRadiusM: Math.min(s.widthM * MIST_CONE.lipRadiusFrac + s.dropM * MIST_CONE.growPerM, MIST_CONE.maxRadiusM),
        domeRadiusM: s.bowlRadiusM * MIST_DOME.horizontalScale,
      };
    });
    geometry.setAttribute("aLip", new THREE.InstancedBufferAttribute(lip, 3));
    geometry.setAttribute("aPlunge", new THREE.InstancedBufferAttribute(plunge, 3));
    geometry.setAttribute("aParams", new THREE.InstancedBufferAttribute(params, 4));
    geometry.setAttribute("aForward", new THREE.InstancedBufferAttribute(forward, 4));
    geometry.setAttribute("aBoxMin", new THREE.InstancedBufferAttribute(bmin, 3));
    geometry.setAttribute("aBoxMax", new THREE.InstancedBufferAttribute(bmax, 3));
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        ...THREE.UniformsUtils.merge([THREE.UniformsLib.lights]) as Record<string, THREE.IUniform>,
        ...shared,
        uCamForward: { value: this.camForward },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      lights: true,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.BackSide,
    });
    this.material.name = "es-waterfall-mist-volume";
    applyAerial(this.material);
    this.material.customProgramCacheKey = () => "es-waterfall-mist-volume";
    mesh.material = this.material;
    mesh.name = "water-waterfall-mist-volume";
    mesh.layers.set(WATER_LAYER);
    mesh.frustumCulled = false;
    mesh.instanceMatrix.needsUpdate = true;
    // after every kit piece: the volume composites over the fall and the pool
    mesh.renderOrder = 6;
    this.mesh = mesh;
    this.diagnostics = { count: n, steps: MIST_STEPS, perFall };
  }

  /** The camera's forward axis (world), for the depth clamp along the ray. */
  setCamera(camera: THREE.Camera): void {
    camera.getWorldDirection(this.camForward);
  }

  update(_runtime: WaterRuntime): void { /* shared uniforms carry time and light */ }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mesh.removeFromParent();
  }
}
