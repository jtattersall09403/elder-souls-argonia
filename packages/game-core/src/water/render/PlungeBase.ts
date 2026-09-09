import * as THREE from "three";
import type { WaterRuntime } from "./types";
import { WATER_LAYER } from "./waterMaterial";
import { WHITEWATER_GLSL, FALLS_SHADOW_VERTEX_PARS, FALLS_SHADOW_VERTEX,
  FALLS_SHADOW_FRAGMENT_PARS } from "./whitewaterStreaks";

/**
 * The base of a waterfall as GEOMETRY, not particles (research
 * `waterfalls-realtime.md` §2.5/§4.1.5, measured): Bethesda's `bodytall` puts
 * 12 flat 4-vert `CurrentPlane` quads sized 2.9–5.7 m on the pool under a
 * 16 m fall, `bodytall02` 19 under a 34 m fall, and only ONE particle system
 * behind them. "A dozen flat quads spreading out on the pool is what sells
 * it; particles are the accent."
 *
 * Each quad lies on the receiving surface, its own v axis pointing radially
 * OUT from the impact so the shared whitewater streak function scrolls
 * outward; alpha fades with distance from the impact, at the quad's own soft
 * edges, and with a 0.5 m soft depth fade against the pool bed/banks. All
 * sites share one merged geometry and one material (one draw call). The
 * field shader's `esPlungeFoam` disc stays as the wet ring under them.
 */

/** What the base needs to know about a fall (no dependency on the tracer). */
export interface PlungeSite {
  id: string;
  plunge: { x: number; y: number; z: number };
  direction: { x: number; z: number };
  widthM: number;
  dropM: number;
}

/** Measured: 12 quads under a 16 m body, 19 under a 34 m body. */
export const BASE_QUADS = { min: 12, max: 19 } as const;
export const BASE_QUAD_SIZE_M = { min: 2.9, max: 5.7 } as const;
/** Soft depth fade (m) for the base quads: the ground-mist 42 u = 0.60 m
 * (vault audit §4 rule 5). */
export const BASE_DEPTH_FADE_M = 0.6;
/** Emissive multiple of the foam layer (measured (1,1,1,0.8) x 0.90). */
export const BASE_EMISSIVE = 0.9;
/** Height the quads sit above the compiled receiving surface (m). */
export const BASE_LIFT_M = 0.05;
/** Outward scroll gain: the plunge ring's counter-scrolling foam layer runs
 * at +0.375 tiles/s (vault audit §4), i.e. 0.375 / 0.313 of the body rate. */
export const BASE_SCROLL_GAIN = 1.2;

/** Quad count for a drop: 12 at ≤ 16 m rising to 19 at ≥ 34 m. */
export function plungeBaseQuadCount(dropM: number): number {
  const t = Math.min(Math.max((dropM - 16) / (34 - 16), 0), 1);
  const s = t * t * (3 - 2 * t);
  return Math.min(Math.max(Math.round(BASE_QUADS.min + (BASE_QUADS.max - BASE_QUADS.min) * s), BASE_QUADS.min), BASE_QUADS.max);
}

/** Spread radius (m) of the base kit: the fall's width, a little more for a tall one. */
export function plungeBaseRadiusM(widthM: number, dropM: number): number {
  return Math.min(Math.max(widthM * 0.9, 4) + Math.min(dropM, 60) * 0.06, 14);
}

export interface BaseQuad {
  x: number; z: number;
  sizeM: number;
  /** Unit radial (outward) direction from the impact point. */
  rx: number; rz: number;
  /** Distance of the quad centre from the impact (m), and the kit radius. */
  distM: number;
  radiusM: number;
  phase: number;
}

function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Deterministic layout (seeded by the site id): quads spread outward from
 * the impact, denser downstream (the upstream sector is the cliff), sizes
 * 2.9–5.7 m, closer quads larger. Pure function; the tests read it.
 */
export function plungeBaseLayout(site: PlungeSite): BaseQuad[] {
  const n = plungeBaseQuadCount(site.dropM);
  const R = plungeBaseRadiusM(site.widthM, site.dropM);
  let state = hashString(site.id) || 1;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const dl = Math.hypot(site.direction.x, site.direction.z);
  const dx = dl > 1e-6 ? site.direction.x / dl : 1;
  const dz = dl > 1e-6 ? site.direction.z / dl : 0;
  const downstream = Math.atan2(dz, dx);
  const out: BaseQuad[] = [];
  for (let i = 0; i < n; i++) {
    // fan over ±0.85π around downstream, concentrated toward it (|off|^1.5
    // puts ~70 % of the quads in the downstream half), jittered
    const off = ((i + 0.5) / n - 0.5) * 2;
    const a = downstream + Math.sign(off) * Math.pow(Math.abs(off), 1.5) * Math.PI * 0.85 + (random() - 0.5) * 0.5;
    const t = 0.25 + 0.75 * Math.sqrt((i + random()) / n);   // area-uniform, none at the exact centre
    const dist = t * R;
    const size = BASE_QUAD_SIZE_M.max - (BASE_QUAD_SIZE_M.max - BASE_QUAD_SIZE_M.min) * (0.4 * t + 0.6 * random());
    const rx = Math.cos(a);
    const rz = Math.sin(a);
    out.push({
      x: site.plunge.x + rx * dist, z: site.plunge.z + rz * dist,
      sizeM: size, rx, rz, distM: dist, radiusM: R, phase: random() * 100,
    });
  }
  return out;
}

export interface PlungeBaseGeometry {
  geometry: THREE.BufferGeometry;
  quadCount: number;
  triangleCount: number;
  quadsPerFall: Record<string, number>;
}

/** One merged geometry for every site's base kit. */
export function buildPlungeBaseGeometry(sites: readonly PlungeSite[]): PlungeBaseGeometry {
  const position: number[] = [];
  const uv: number[] = [];      // u across the quad 0..1, v = metres out from the impact
  const fade: number[] = [];    // (dist/R, phase)
  const local: number[] = [];   // quad-local (u, v) 0..1 for the soft box edges
  const index: number[] = [];
  const quadsPerFall: Record<string, number> = {};
  let quadCount = 0;
  for (const site of sites) {
    const quads = plungeBaseLayout(site);
    quadsPerFall[site.id] = quads.length;
    for (const q of quads) {
      const ax = -q.rz;
      const az = q.rx;
      const h = q.sizeM * 0.5;
      const base = position.length / 3;
      const y = site.plunge.y + BASE_LIFT_M;
      for (const [su, sv] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        position.push(q.x + ax * h * su + q.rx * h * sv, y, q.z + az * h * su + q.rz * h * sv);
        uv.push(su * 0.5 + 0.5, q.distM + h * sv);
        fade.push((q.distM + h * sv) / q.radiusM, q.phase);
        local.push(su * 0.5 + 0.5, sv * 0.5 + 0.5);
      }
      index.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
      quadCount++;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute("aBaseUv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute("aBaseFade", new THREE.Float32BufferAttribute(fade, 2));
  geometry.setAttribute("aBaseLocal", new THREE.Float32BufferAttribute(local, 2));
  geometry.setIndex(index);
  geometry.computeBoundingSphere();
  return { geometry, quadCount, triangleCount: index.length / 3, quadsPerFall };
}

/** Alpha twin of the base fragment (minus depth): soft box edges x radial fade. */
export function plungeBaseAlpha(u: number, vLocal: number, distFrac: number, streak: number, depthDeltaM = 10,
  underwater = false): number {
  const sm = (e0: number, e1: number, x: number) => {
    const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
    return t * t * (3 - 2 * t);
  };
  const box = sm(0, 0.35, u) * sm(1, 0.65, u) * sm(0, 0.35, vLocal) * sm(1, 0.65, vLocal);
  const radial = 1 - sm(0.55, 1.05, distFrac);
  const depth = sm(0, BASE_DEPTH_FADE_M, depthDeltaM);
  const below = underwater ? 0 : 1;
  return Math.min(Math.max(box * radial * (0.35 + 0.65 * streak) * depth * below * 0.85, 0), 1);
}

const BASE_VERTEX = /* glsl */ `
attribute vec2 aBaseUv;
attribute vec2 aBaseFade;
attribute vec2 aBaseLocal;
varying vec2 vBaseUv;
varying vec2 vBaseFade;
varying vec2 vLocal;
uniform float uVerticalScale;
uniform float uLift;
${FALLS_SHADOW_VERTEX_PARS}
void main() {
  vBaseUv = aBaseUv;
  vBaseFade = aBaseFade;
  vLocal = aBaseLocal;
  vec3 transformed = vec3(position.x, (position.y + uLift) * uVerticalScale, position.z);
  vec3 esShadowVertex = transformed;
  ${FALLS_SHADOW_VERTEX}
  vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const BASE_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vBaseUv;
varying vec2 vBaseFade;
varying vec2 vLocal;
uniform float uTime;
uniform float uUnderwater;
uniform vec3 uAmbient;
uniform vec3 uSunLight;
uniform vec3 uSunDir;
uniform sampler2D uSceneDepth;
uniform float uHasDepth;
uniform float uCamNear;
uniform float uCamFar;
uniform vec2 uResolution;
uniform float uOpacity;
#include <common>
${FALLS_SHADOW_FRAGMENT_PARS}
${WHITEWATER_GLSL}
void main() {
  // streaks scroll OUTWARD from the impact: aBaseUv.y is metres from it
  float foam;
  float streak = esWhitewater(vBaseUv.x, vBaseUv.y, uTime + vBaseFade.y, ${BASE_SCROLL_GAIN.toFixed(2)}, 0.3, foam);
  float box = smoothstep(0.0, 0.35, vLocal.x) * smoothstep(1.0, 0.65, vLocal.x)
            * smoothstep(0.0, 0.35, vLocal.y) * smoothstep(1.0, 0.65, vLocal.y);
  float radial = 1.0 - smoothstep(0.55, 1.05, vBaseFade.x);
  float alpha = uOpacity * box * radial * (0.35 + 0.65 * streak) * 0.85;
  // Seen from under the pool: these quads are foam lying ON the surface, and
  // from below there is no foam to see — the underside of the surface is the
  // field shader's below variant's job. The base kit was the one child of the
  // falls layer with NO submerged handling at all, and 16 sites' worth of
  // bright quads painted the submerged frame (probe fall-gorge-under, mean
  // |dRGB| 5.83). Same rule as the sheet and the mist.
  alpha *= 1.0 - clamp(uUnderwater, 0.0, 1.0);
  if (uHasDepth > 0.5) {
    vec2 suv = gl_FragCoord.xy / uResolution;
    float d = texture2D(uSceneDepth, suv).x;
    float sceneEye = (uCamNear * uCamFar) / (uCamFar - d * (uCamFar - uCamNear));
    float fragEye = 1.0 / gl_FragCoord.w;
    alpha *= smoothstep(0.0, ${BASE_DEPTH_FADE_M.toFixed(2)}, sceneEye - fragEye);
  }
  if (alpha < 0.004) discard;
  vec3 color = vec3(${BASE_EMISSIVE.toFixed(2)}) * (0.8 + 0.2 * foam)
    // pool foam is a HORIZONTAL body (upness 1) and takes the scene's sun shadow
    * esFallsIrradianceG(uAmbient, uSunLight, uSunDir, 1.0, esFallsSunVisibility());
  gl_FragColor = vec4(color, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class PlungeBase {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  readonly uniforms: Record<string, THREE.IUniform>;
  readonly quadCount: number;
  readonly triangleCount: number;
  readonly quadsPerFall: Record<string, number>;

  constructor(sites: readonly (PlungeSite | { id: string; cascade: PlungeSite; dropM: number })[],
    applyAerial: (m: THREE.Material) => void, options: { streakTexture?: THREE.Texture | null } = {}) {
    const flat: PlungeSite[] = sites.map((s) => "cascade" in s
      ? { id: s.id, plunge: s.cascade.plunge, direction: s.cascade.direction, widthM: s.cascade.widthM, dropM: s.dropM }
      : s);
    const built = buildPlungeBaseGeometry(flat);
    this.quadCount = built.quadCount;
    this.triangleCount = built.triangleCount;
    this.quadsPerFall = built.quadsPerFall;
    this.uniforms = {
      uTime: { value: 0 },
      uVerticalScale: { value: 1 },
      uLift: { value: 0 },
      uAmbient: { value: new THREE.Vector3(0.2, 0.2, 0.2) },
      uSunLight: { value: new THREE.Vector3(1, 1, 1) },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSceneDepth: { value: null },
      uHasDepth: { value: 0 },
      uCamNear: { value: 0.3 },
      uCamFar: { value: 60000 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uOpacity: { value: 1 },
      uUnderwater: { value: 0 },
      uStreakTex: { value: options.streakTexture ?? null },
    };
    this.material = new THREE.ShaderMaterial({
      // lights: true only to pull in three's directional SHADOW block — see
      // whitewaterStreaks `FALLS_SHADOW_*`; no light chunk is evaluated.
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.lights]) as Record<string, THREE.IUniform>,
      lights: true,
      vertexShader: BASE_VERTEX,
      fragmentShader: BASE_FRAGMENT,
      defines: options.streakTexture ? { ES_STREAK_TEX: 1 } : {},
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    Object.assign(this.material.uniforms, this.uniforms);
    applyAerial(this.material);
    this.material.customProgramCacheKey = () => `es-plunge-base${options.streakTexture ? "-tex" : ""}`;
    this.mesh = new THREE.Mesh(built.geometry, this.material);
    this.mesh.name = "water-plunge-base";
    this.mesh.layers.set(WATER_LAYER);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
  }

  setStreakTexture(texture: THREE.Texture | null): void {
    this.uniforms.uStreakTex.value = texture;
    this.material.defines = texture ? { ES_STREAK_TEX: 1 } : {};
    this.material.customProgramCacheKey = () => `es-plunge-base${texture ? "-tex" : ""}`;
    this.material.needsUpdate = true;
  }

  update(runtime: WaterRuntime, timeS: number, verticalScale: number, seasonLiftM: number): void {
    this.uniforms.uTime.value = timeS;
    // the sheet mesh is the parent and already applies the vertical scale
    // through its own vertex shader; the child receives world coordinates
    // untouched, so it scales itself the same way
    this.uniforms.uVerticalScale.value = verticalScale;
    this.uniforms.uLift.value = seasonLiftM;
    (this.uniforms.uAmbient.value as THREE.Vector3).copy(runtime.ambient.value);
    (this.uniforms.uSunLight.value as THREE.Vector3).copy(runtime.sunLight.value);
    (this.uniforms.uSunDir.value as THREE.Vector3).copy(runtime.sunDirection.value);
  }

  /** Submerged camera: the base kit draws nothing (see the fragment). */
  setUnderwater(underwater: boolean): void {
    this.uniforms.uUnderwater.value = underwater ? 1 : 0;
  }

  setDepth(texture: THREE.Texture | null, near: number, far: number, width: number, height: number): void {
    this.uniforms.uSceneDepth.value = texture;
    this.uniforms.uHasDepth.value = texture && near > 0 && far > near ? 1 : 0;
    this.uniforms.uCamNear.value = near;
    this.uniforms.uCamFar.value = far;
    this.uniforms.uResolution.value.set(width, height);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mesh.removeFromParent();
  }
}
