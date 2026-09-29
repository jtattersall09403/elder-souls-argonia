/**
 * The flame and ember materials (16k walk 5): WebGL `ShaderMaterial`s over
 * instanced unit quads, consuming `FireConfig` (fireTypes.ts).
 *
 * Why it reads by day and by night (the walk-4 defect: invisible by day, a
 * white blob at night). The scene's exposure spans 3.9e-5 (noon) to 22
 * (night) (world-studio sky/lightRig.ts EXPOSURE_CURVE), so a flame drawn
 * as scene radiance through the tone mapper is crushed to black by day and
 * clips by night. These materials are `toneMapped: false`: they write
 * display-referred colour on the post-water layer (like rain), and the
 * renderer's exposure only picks the day/night blend (`uNight`, from
 * `renderer.toneMappingExposure`, the same source the water surface reads).
 * The blend is premultiplied alpha (`ONE, ONE_MINUS_SRC_ALPHA`): the flame's
 * core carries alpha, so it COVERS the background (an orange shape in full
 * sun), while the fringe carries colour with no alpha, so it ADDS glow
 * (visible halo at night).
 *
 * Instance attributes (FlameSystem.ts writes them):
 *   iPosSeed  vec4  emitter world position (m), seed 0..1
 *   iShape    vec4  width m, height m, turbulence 0..1, rise (heights/s)
 *   iParams   vec4  intensity 0..1, palette row, layer (0 core, 1 outer), taper
 *   iAnim     vec4  flicker Hz, flicker share, wind response, unused
 *
 * ---- TSL MIRROR CANDIDATE ------------------------------------------------
 * Everything between the TSL-MIRROR markers below (`FIRE_GLSL_COMMON`: hash,
 * value noise, fbm, the teardrop mask, the 3-stop ramp, the flicker) is the
 * part a WebGPU NodeMaterial port writes 1:1 as TSL `Fn`s; the vertex
 * billboard maps to `positionLocal` + `instancedBufferAttribute` nodes, and
 * the premultiplied blend and `toneMapped: false` are material flags there
 * too. fireTypes.ts is renderer-agnostic, so the port changes nothing else.
 * ---------------------------------------------------------------------------
 *
 * HERO VOLUME SLOT (not built; WebGPU only, the PERF lane's branch): the
 * 1-3 fires nearest the camera within ~8 m would swap their card instances
 * for a box drawn with a raymarched `VolumeNodeMaterial` over a small
 * density grid (~32 x 32 x 64, a port of three.js webgpu_volume_fire), using
 * `fireRamp` for colour. It slots in at `FlameSystem.update` (the per-frame
 * distance pass that already knows the nearest fires): hide those fires'
 * card instances and place the volume boxes at their emitters.
 */
import * as THREE from "three";
import { FIRE_PRESETS, FIRE_PRESET_ORDER } from "./fireTypes";

/** A flame never draws narrower than this angle (radians, ~4 px at 1080p),
 * so a 3.5 cm candle flame still reads as a point of fire at 50 m. */
export const FLAME_MIN_ANGLE_RAD = 0.004;
/** Flames fade out over the last `FLAME_FADE_M` before `FLAME_MAX_DISTANCE_M`. */
export const FLAME_MAX_DISTANCE_M = 250;
export const FLAME_FADE_M = 30;
/** Embers are drawn only this close (m). */
export const EMBER_MAX_DISTANCE_M = 60;
/** The card's root stands this share of its height below the emitter: the
 * flame's dark base wraps the wick, it does not float above it. */
export const FLAME_ROOT_SHARE = 0.12;

// <TSL-MIRROR>
const FIRE_GLSL_COMMON = /* glsl */ `
float fireHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float fireNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(fireHash(i), fireHash(i + vec2(1.0, 0.0)), u.x),
             mix(fireHash(i + vec2(0.0, 1.0)), fireHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
// 1-3 octaves: the vertex stage drops octaves with distance
float fireFbm(vec2 p, float octaves) {
  float v = 0.5 * fireNoise(p);
  if (octaves > 1.5) v += 0.25 * fireNoise(p * 2.03 + 17.1);
  if (octaves > 2.5) v += 0.125 * fireNoise(p * 4.01 + 31.7);
  return v / (octaves > 2.5 ? 0.875 : octaves > 1.5 ? 0.75 : 0.5);
}
// teardrop: widest a third of the way up, rounded root, tip narrowed by taper
float fireMask(vec2 p, float taper) {
  float y = clamp(p.y, 0.0, 1.0);
  float width = 0.5 * sqrt(clamp(y * 3.0, 0.0, 1.0)) * pow(1.0 - y, mix(0.6, 1.6, taper));
  float d = abs(p.x) / max(width, 1e-3);
  return (1.0 - smoothstep(0.55, 1.0, d)) * smoothstep(-0.02, 0.1, p.y) * (1.0 - smoothstep(0.85, 1.0, p.y));
}
// the 3-stop temperature ramp (webgpu_volume_fire): base -> mid -> tip
vec3 fireRamp(float t, vec3 base, vec3 mid, vec3 tip) {
  vec3 low = mix(base, mid, smoothstep(0.0, 0.5, t));
  return mix(low, tip, smoothstep(0.45, 1.0, t));
}
float fireFlicker(float t, float seed, float rateHz, float amount) {
  float phase = seed * 6.2831853;
  float w = rateHz * 6.2831853;
  return 1.0 + amount * (0.6 * sin(t * w + phase) + 0.4 * sin(t * w * 1.73 + phase * 2.3));
}
`;
// </TSL-MIRROR>

const PALETTES = FIRE_PRESET_ORDER.length;

const FLAME_VERTEX = /* glsl */ `
attribute vec4 iPosSeed;
attribute vec4 iShape;
attribute vec4 iParams;
attribute vec4 iAnim;
uniform float uTime;
uniform vec2 uWind;
uniform float uMinAngle;
uniform float uMaxDistance;
uniform float uFade;
varying vec2 vUv;
varying float vSeed;
varying float vIntensity;
varying float vPalette;
varying float vLayer;
varying float vTaper;
varying float vTurb;
varying float vRise;
varying float vOctaves;
void main() {
  vec3 at = iPosSeed.xyz;
  vec3 toCam = cameraPosition - at;
  float dist = length(toCam);
  // Y-locked billboard: the card turns about the vertical only, like
  // Skyrim's and BotW's fire cards, so it never tips edge-on from the side
  vec3 flat = vec3(toCam.x, 0.0, toCam.z);
  vec3 right = length(flat) > 1e-4 ? normalize(vec3(flat.z, 0.0, -flat.x)) : vec3(1.0, 0.0, 0.0);
  float w = iShape.x;
  float h = iShape.y;
  float grow = max(1.0, dist * uMinAngle / max(w, 1e-4));
  w *= grow; h *= grow;
  // the outer layer is wider and a little shorter
  if (iParams.z > 0.5) { w *= 1.45; h *= 0.9; }
  float y = position.y; // 0 root .. 1 tip
  vec3 p = at + right * position.x * w + vec3(0.0, (y - ${FLAME_ROOT_SHARE.toFixed(3)}) * h, 0.0);
  // wind leans the upper body, quadratic in height
  p.xz += uWind * iAnim.z * h * y * y;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  vUv = vec2(position.x, y);
  vSeed = iPosSeed.w;
  float fade = clamp((uMaxDistance - dist) / uFade, 0.0, 1.0);
  vIntensity = iParams.x * fade * fireFlicker(uTime, iPosSeed.w, iAnim.x, iAnim.y);
  vPalette = iParams.y;
  vLayer = iParams.z;
  vTaper = iParams.w;
  vTurb = iShape.z;
  vRise = iShape.w;
  vOctaves = dist < 40.0 ? 3.0 : dist < 120.0 ? 2.0 : 1.0;
  if (vIntensity <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`;

const FLAME_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uNight;
uniform vec3 uRamp[${PALETTES * 3}];
uniform vec2 uGain[${PALETTES}];
varying vec2 vUv;
varying float vSeed;
varying float vIntensity;
varying float vPalette;
varying float vLayer;
varying float vTaper;
varying float vTurb;
varying float vRise;
varying float vOctaves;
${FIRE_GLSL_COMMON}
void main() {
  int row = int(vPalette + 0.5);
  float outer = step(0.5, vLayer);
  float turb = vTurb * (1.0 + 0.6 * outer);
  vec2 q = vec2(vUv.x * 3.0, vUv.y * 2.2 - uTime * vRise) + vSeed * 37.0;
  float n = fireFbm(q, vOctaves);
  float n2 = fireFbm(q * 1.7 + 9.3, max(1.0, vOctaves - 1.0));
  // distort more toward the tip: the root is steady, the tongues lick
  vec2 p = vUv;
  p.x += (n - 0.5) * turb * 0.9 * vUv.y;
  p.y += (n2 - 0.5) * turb * 0.35;
  float mask = fireMask(p, vTaper);
  // heat: hottest low in the core, cooling up and out
  float heat = mask * (1.0 - 0.55 * vUv.y) * (0.75 + 0.5 * n);
  heat *= mix(1.0, 0.55, outer);
  if (heat < 0.01) discard;
  vec3 base = uRamp[row * 3];
  vec3 mid = uRamp[row * 3 + 1];
  vec3 tip = uRamp[row * 3 + 2];
  vec3 col = fireRamp(clamp(heat * 1.25, 0.0, 1.0), base, mid, tip);
  vec2 gainDN = uGain[row];
  float gain = mix(gainDN.x, gainDN.y, uNight);
  // core covers (alpha), fringe adds (colour with no alpha)
  float core = smoothstep(0.25, 0.65, heat) * (1.0 - outer * 0.6);
  float fringe = heat * mix(0.25, 0.9, uNight);
  float a = clamp(core * mix(0.92, 0.6, uNight) * vIntensity, 0.0, 1.0);
  vec3 enc = linearToOutputTexel(vec4(min(col * gain, vec3(1.0)), 1.0)).rgb;
  vec3 rgb = enc * clamp((core + fringe) * vIntensity, 0.0, 1.0);
  gl_FragColor = vec4(rgb, a);
}
`;

const EMBER_VERTEX = /* glsl */ `
attribute vec4 iPosSeed;   // emitter, seed
attribute vec4 iEmber;     // rise m, size m, life s, spread m
attribute vec4 iParams;    // intensity, palette, index, unused
uniform float uTime;
uniform vec2 uWind;
uniform float uMaxDistance;
varying vec2 vUv;
varying float vAlpha;
varying float vPalette;
float h1(float x) { return fract(sin(x * 91.3458) * 47453.5453); }
void main() {
  float k = iPosSeed.w * 97.0 + iParams.z * 13.7;
  float life = max(iEmber.z, 0.1);
  float t = fract(uTime / life + h1(k));
  vec3 at = iPosSeed.xyz;
  float ang = h1(k + 1.0) * 6.2831853;
  vec3 drift = vec3(cos(ang + t * 3.0), 0.0, sin(ang + t * 3.0)) * iEmber.w * (0.4 + t);
  vec3 p = at + drift + vec3(0.0, t * iEmber.x, 0.0);
  p.xz += uWind * t * t * iEmber.x * 0.5;
  vec3 toCam = cameraPosition - p;
  float dist = length(toCam);
  vec3 f = normalize(toCam);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), f) + vec3(1e-5, 0.0, 0.0));
  vec3 up = cross(f, right);
  float s = iEmber.y * max(1.0, dist * 0.002 / max(iEmber.y, 1e-4));
  p += (right * position.x + up * (position.y - 0.5)) * s;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  vUv = vec2(position.x, position.y - 0.5);
  vAlpha = iParams.x * (1.0 - t) * smoothstep(0.0, 0.1, t) * step(dist, uMaxDistance);
  vPalette = iParams.y;
  if (vAlpha <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`;

const EMBER_FRAGMENT = /* glsl */ `
uniform vec3 uRamp[${PALETTES * 3}];
varying vec2 vUv;
varying float vAlpha;
varying float vPalette;
void main() {
  float d = length(vUv) * 2.0;
  float glow = 1.0 - smoothstep(0.2, 1.0, d);
  if (glow <= 0.0) discard;
  int row = int(vPalette + 0.5);
  vec3 col = mix(uRamp[row * 3 + 1], uRamp[row * 3 + 2], glow);
  vec3 enc = linearToOutputTexel(vec4(col, 1.0)).rgb;
  // pure glow: colour, no alpha (adds under the premultiplied blend)
  gl_FragColor = vec4(enc * glow * vAlpha, 0.0);
}
`;

/** Uniforms the flame and ember materials share (one object, by reference). */
export interface FireUniforms {
  uTime: THREE.IUniform<number>;
  /** 0 day .. 1 night, from the renderer's exposure (`nightShareOfExposure`). */
  uNight: THREE.IUniform<number>;
  uWind: THREE.IUniform<THREE.Vector2>;
  uMinAngle: THREE.IUniform<number>;
  uMaxDistance: THREE.IUniform<number>;
  uFade: THREE.IUniform<number>;
  uRamp: THREE.IUniform<THREE.Vector3[]>;
  uGain: THREE.IUniform<THREE.Vector2[]>;
}

/** The palette tables from the presets, in `FIRE_PRESET_ORDER`. */
export function makeFireUniforms(): FireUniforms {
  const ramp: THREE.Vector3[] = [];
  const gain: THREE.Vector2[] = [];
  for (const id of FIRE_PRESET_ORDER) {
    const c = FIRE_PRESETS[id];
    ramp.push(new THREE.Vector3(...c.ramp.base), new THREE.Vector3(...c.ramp.mid), new THREE.Vector3(...c.ramp.tip));
    gain.push(new THREE.Vector2(c.gain.day, c.gain.night));
  }
  return {
    uTime: { value: 0 }, uNight: { value: 0 }, uWind: { value: new THREE.Vector2() },
    uMinAngle: { value: FLAME_MIN_ANGLE_RAD }, uMaxDistance: { value: FLAME_MAX_DISTANCE_M },
    uFade: { value: FLAME_FADE_M }, uRamp: { value: ramp }, uGain: { value: gain },
  };
}

function premultiplied(material: THREE.ShaderMaterial): THREE.ShaderMaterial {
  material.transparent = true;
  material.depthWrite = false;
  material.depthTest = true;
  material.toneMapped = false;
  material.fog = false;
  material.side = THREE.DoubleSide;
  material.blending = THREE.CustomBlending;
  material.blendEquation = THREE.AddEquation;
  material.blendSrc = THREE.OneFactor;
  material.blendDst = THREE.OneMinusSrcAlphaFactor;
  material.blendSrcAlpha = THREE.OneFactor;
  material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  material.premultipliedAlpha = true;
  return material;
}

export function makeFlameMaterial(uniforms: FireUniforms): THREE.ShaderMaterial {
  const material = premultiplied(new THREE.ShaderMaterial({
    name: "fire-flame", uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
    vertexShader: FLAME_VERTEX, fragmentShader: FLAME_FRAGMENT,
  }));
  return material;
}

export function makeEmberMaterial(uniforms: FireUniforms): THREE.ShaderMaterial {
  return premultiplied(new THREE.ShaderMaterial({
    name: "fire-ember", uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
    vertexShader: EMBER_VERTEX, fragmentShader: EMBER_FRAGMENT,
  }));
}

/** The flame card: x -0.5..0.5, y 0 (root) .. 1 (tip). */
export function makeFlameQuad(): THREE.InstancedBufferGeometry {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

/** Exported for tests: the shader sources (so a test can assert the TSL-mirror functions exist). */
export const FIRE_SHADER_SOURCES = { common: FIRE_GLSL_COMMON, flameVertex: FLAME_VERTEX,
  flameFragment: FLAME_FRAGMENT, emberVertex: EMBER_VERTEX, emberFragment: EMBER_FRAGMENT } as const;
