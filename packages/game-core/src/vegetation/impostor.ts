/**
 * Octahedral impostors: the far rung of a heavy tree (walk-5 perf lane,
 * decision 0108 §5). One quad per instance, facing the camera; its pixels
 * come from an atlas of the tree's own mesh rendered from a hemi-octahedral
 * grid of directions (`pipeline/impostor_bake.py`, agargaro's
 * octahedral-impostor method). The vertex shader picks the three baked views
 * around the current view direction and projects the quad onto each of them;
 * the fragment shader blends the three taps by alpha-weighted barycentric
 * weights (the cell's split diagonal follows the grid's axis diagonals, see
 * `selectFrames`), and lights the pixel through the object-space normal atlas with
 * the material's own lights (sun, ambient, CSM, fixture lights: it IS a
 * `MeshStandardMaterial`, so WorldSky's per-frame patch walk treats it like
 * every other lit plant).
 *
 * THE SHARED GEOMETRY. `frameBasis`, `gridDir` and `selectFrames` below are
 * the same arithmetic as the GLSL and as `impostor_bake.py` (whose judge
 * reconstructs the impostor with them); `impostor.test.ts` pins the three
 * copies to the same numbers.
 *
 * Survival rules, the same contract as `fx/billboardQuad.ts`: the hook is
 * chained (`previous?.call` first), re-installed by `reapplyImpostor` after
 * CSM overwrites `onBeforeCompile`, and carries a stable
 * `customProgramCacheKey` suffix, so every impostor species shares one
 * program. Unlike the other hooks its state lives on the material INSTANCE,
 * not in `userData`: the vegetation batches `clone()` the kit material, and
 * `Material.copy` JSON-clones `userData` (a texture there would not survive)
 * and drops `onBeforeCompile`; `ImpostorMaterial.copy` re-installs the hook.
 */

import * as THREE from "three";

/** One row of the kit's `<kit>.impostors.json` sidecar. */
export interface ImpostorRecord {
  id: string;
  /** Path of the impostor GLB under `kits/`. */
  path: string;
  /** Frames per side of the hemi-octahedral grid. */
  grid: number;
  framePx: number;
  /** Edge of one frame in metres (the quad's size). */
  cellM: number;
  /** Frame centre in the asset's object space (glTF, Y up). */
  centreM: [number, number, number];
  /** The tree's height in albedo texels in a horizon frame: the rung is
   * never used where the tree is taller than this on screen. */
  contentPx: number;
}

export interface ImpostorSidecar {
  schemaVersion: 1;
  kit: string;
  impostors: ImpostorRecord[];
}

type V3 = [number, number, number];

/** right = normalize(Y x d) (X where d is vertical), up = d x right. */
export function frameBasis(d: V3): { right: V3; up: V3 } {
  let r: V3 = [d[2], 0, -d[0]];
  const n = Math.hypot(r[0], r[2]);
  r = n < 1e-6 ? [1, 0, 0] : [r[0] / n, 0, r[2] / n];
  const up: V3 = [
    d[1] * r[2] - d[2] * r[1],
    d[2] * r[0] - d[0] * r[2],
    d[0] * r[1] - d[1] * r[0],
  ];
  return { right: r, up };
}

/** Direction of frame (i, j); the grid border is the horizon. */
export function gridDir(i: number, j: number, n: number): V3 {
  const gx = (i / (n - 1)) * 2 - 1;
  const gy = (j / (n - 1)) * 2 - 1;
  const px = (gx + gy) / 2;
  const pz = (gx - gy) / 2;
  const y = Math.max(1 - Math.abs(px) - Math.abs(pz), 0);
  const l = Math.hypot(px, y, pz);
  return [px / l, y / l, pz / l];
}

/** The three frames around view direction `v` (object space, toward the
 * viewer) and their barycentric weights. */
export function selectFrames(v: V3, n: number): { frames: [number, number][]; weights: V3 } {
  const x = v[0];
  const y = Math.max(v[1], 0) + 1e-5;
  const z = v[2];
  const s = Math.abs(x) + y + Math.abs(z);
  const px = x / s;
  const pz = z / s;
  const g = [((px + pz) * 0.5 + 0.5) * (n - 1), ((px - pz) * 0.5 + 0.5) * (n - 1)];
  const c = g.map((k) => Math.min(Math.max(Math.floor(k), 0), n - 2));
  const f = [g[0] - c[0], g[1] - c[1]];
  const h = (n - 1) / 2;
  if ((c[0] + 0.5 - h) * (c[1] + 0.5 - h) > 0) {
    // Toward grid corners (0,0) and (n-1,n-1) the cell splits along its main
    // diagonal, so the +-X azimuths run along a triangle edge as +-Z do.
    return f[0] >= f[1]
      ? { frames: [[c[0], c[1]], [c[0] + 1, c[1] + 1], [c[0] + 1, c[1]]], weights: [1 - f[0], f[1], f[0] - f[1]] }
      : { frames: [[c[0], c[1]], [c[0] + 1, c[1] + 1], [c[0], c[1] + 1]], weights: [1 - f[1], f[0], f[1] - f[0]] };
  }
  if (f[0] + f[1] < 1) {
    return {
      frames: [[c[0], c[1]], [c[0] + 1, c[1]], [c[0], c[1] + 1]],
      weights: [1 - f[0] - f[1], f[0], f[1]],
    };
  }
  return {
    frames: [[c[0] + 1, c[1] + 1], [c[0] + 1, c[1]], [c[0], c[1] + 1]],
    weights: [f[0] + f[1] - 1, 1 - f[1], 1 - f[0]],
  };
}

/** Fixed-point steps walking a view ray onto a frame's depth surface, and
 * the floor on the ray/frame cosine (same as `impostor_bake.py`). */
export const PARALLAX_STEPS = 2;
export const PARALLAX_MIN_COS = 0.2;

const SHARED_HEAD = /* glsl */ `
varying vec3 esImpP;
varying vec3 esImpVd;
varying vec4 esImpF01;
varying vec2 esImpF2;
varying vec3 esImpW;
varying vec3 esImpAx;
varying vec3 esImpAy;
varying vec3 esImpAz;
uniform float esImpGrid;
uniform float esImpCell;
vec3 esImpDir(vec2 f) {
  vec2 g = f / (esImpGrid - 1.0) * 2.0 - 1.0;
  vec2 p = vec2(g.x + g.y, g.x - g.y) * 0.5;
  return normalize(vec3(p.x, max(1.0 - abs(p.x) - abs(p.y), 0.0), p.y));
}
void esImpBasis(vec3 d, out vec3 r, out vec3 u) {
  r = vec3(d.z, 0.0, -d.x);
  float n = length(r);
  r = n < 1e-6 ? vec3(1.0, 0.0, 0.0) : r / n;
  u = cross(d, r);
}
`;

const VERTEX_HEAD = /* glsl */ `
${SHARED_HEAD}
uniform vec3 esImpCentre;
`;

const VERTEX_BODY = /* glsl */ `
{
  mat4 esImpM = modelMatrix;
  mat3 esImpN = normalMatrix;
  #ifdef USE_INSTANCING
    esImpM = modelMatrix * instanceMatrix;
    esImpN = normalMatrix * mat3(instanceMatrix);
  #endif
  vec3 esImpV = normalize((inverse(esImpM) * vec4(cameraPosition, 1.0)).xyz - esImpCentre);
  vec3 esImpR; vec3 esImpU;
  esImpBasis(esImpV, esImpR, esImpU);
  esImpP = (position.x * esImpR + position.y * esImpU) * esImpCell;
  esImpVd = esImpV;
  transformed = esImpCentre + esImpP;
  vec3 esImpH = vec3(esImpV.x, max(esImpV.y, 0.0) + 1e-5, esImpV.z);
  vec2 esImpQ = esImpH.xz / (abs(esImpH.x) + esImpH.y + abs(esImpH.z));
  vec2 esImpG = (vec2(esImpQ.x + esImpQ.y, esImpQ.x - esImpQ.y) * 0.5 + 0.5) * (esImpGrid - 1.0);
  vec2 esImpC = clamp(floor(esImpG), vec2(0.0), vec2(esImpGrid - 2.0));
  vec2 esImpFr = esImpG - esImpC;
  vec2 esImpQd = esImpC + 0.5 - 0.5 * (esImpGrid - 1.0);
  if (esImpQd.x * esImpQd.y > 0.0) {
    // Main-diagonal split toward grid corners (0,0) and (n-1,n-1).
    esImpF01 = vec4(esImpC, esImpC + vec2(1.0));
    if (esImpFr.x >= esImpFr.y) {
      esImpF2 = esImpC + vec2(1.0, 0.0);
      esImpW = vec3(1.0 - esImpFr.x, esImpFr.y, esImpFr.x - esImpFr.y);
    } else {
      esImpF2 = esImpC + vec2(0.0, 1.0);
      esImpW = vec3(1.0 - esImpFr.y, esImpFr.x, esImpFr.y - esImpFr.x);
    }
  } else if (esImpFr.x + esImpFr.y < 1.0) {
    esImpF01 = vec4(esImpC, esImpC + vec2(1.0, 0.0));
    esImpF2 = esImpC + vec2(0.0, 1.0);
    esImpW = vec3(1.0 - esImpFr.x - esImpFr.y, esImpFr.x, esImpFr.y);
  } else {
    esImpF01 = vec4(esImpC + vec2(1.0), esImpC + vec2(1.0, 0.0));
    esImpF2 = esImpC + vec2(0.0, 1.0);
    esImpW = vec3(esImpFr.x + esImpFr.y - 1.0, 1.0 - esImpFr.y, 1.0 - esImpFr.x);
  }
  esImpAx = esImpN * vec3(1.0, 0.0, 0.0);
  esImpAy = esImpN * vec3(0.0, 1.0, 0.0);
  esImpAz = esImpN * vec3(0.0, 0.0, 1.0);
}
`;

/** Per frame: the pixel's view ray walked onto the frame's depth surface
 * (PARALLAX_STEPS fixed-point steps from the centre plane), then the tap
 * coordinates; outside the frame a tap is empty. */
const FRAGMENT_HEAD = /* glsl */ `
${SHARED_HEAD}
uniform sampler2D esImpNormalMap;
uniform sampler2D esImpDepthMap;
vec2 esImpAt(vec2 f, vec2 uv) {
  return (f + vec2(uv.x, 1.0 - uv.y)) / esImpGrid;
}
vec2 esImpUv(vec2 f) {
  vec3 d = esImpDir(f);
  vec3 r; vec3 u;
  esImpBasis(d, r, u);
  vec3 q = esImpP / esImpCell;
  float vr = dot(esImpVd, r);
  float vu = dot(esImpVd, u);
  float vd = max(dot(esImpVd, d), ${PARALLAX_MIN_COS.toFixed(2)});
  vec3 o = vec3(dot(q, r), dot(q, u), dot(q, d));
  float t = 0.0;
  for (int k = 0; k < ${PARALLAX_STEPS}; k++) {
    vec2 uv = clamp(vec2(o.x - t * vr, o.y - t * vu) + 0.5, 0.0, 1.0);
    t = (o.z - (texture2D(esImpDepthMap, esImpAt(f, uv)).r - 0.5)) / vd;
  }
  return vec2(o.x - t * vr, o.y - t * vu) + 0.5;
}
bool esImpIn(vec2 uv) {
  return uv.x >= 0.0 && uv.y >= 0.0 && uv.x <= 1.0 && uv.y <= 1.0;
}
vec4 esImpTap(sampler2D t, vec2 f, vec2 uv) {
  return esImpIn(uv) ? texture2D(t, esImpAt(f, uv)) : vec4(0.0);
}
`;

/** Replaces <map_fragment>: the alpha-weighted blend of the three taps. */
const MAP_BODY = /* glsl */ `
  vec2 esImpUv0 = esImpUv(esImpF01.xy);
  vec2 esImpUv1 = esImpUv(esImpF01.zw);
  vec2 esImpUv2 = esImpUv(esImpF2);
  vec4 esImpT0 = esImpTap(map, esImpF01.xy, esImpUv0);
  vec4 esImpT1 = esImpTap(map, esImpF01.zw, esImpUv1);
  vec4 esImpT2 = esImpTap(map, esImpF2, esImpUv2);
  vec3 esImpWa = esImpW * vec3(esImpT0.a, esImpT1.a, esImpT2.a);
  float esImpAlpha = esImpWa.x + esImpWa.y + esImpWa.z;
  vec3 esImpCol = (esImpT0.rgb * esImpWa.x + esImpT1.rgb * esImpWa.y + esImpT2.rgb * esImpWa.z)
    / max(esImpAlpha, 1e-4);
  diffuseColor *= vec4(esImpCol, esImpAlpha);
`;

/** Replaces <normal_fragment_maps>: object-space normal atlas -> view space. */
const NORMAL_BODY = /* glsl */ `
  vec3 esImpNo = (esImpTap(esImpNormalMap, esImpF01.xy, esImpUv0).xyz * 2.0 - 1.0) * esImpWa.x
    + (esImpTap(esImpNormalMap, esImpF01.zw, esImpUv1).xyz * 2.0 - 1.0) * esImpWa.y
    + (esImpTap(esImpNormalMap, esImpF2, esImpUv2).xyz * 2.0 - 1.0) * esImpWa.z;
  normal = normalize(esImpAx * esImpNo.x + esImpAy * esImpNo.y + esImpAz * esImpNo.z
    + vec3(0.0, 0.0, 1e-4));
`;

/** Cache-key suffix: every impostor program is the same program. */
export const IMPOSTOR_CACHE_KEY = "|es-imp";

/** What the hook needs; shared by reference between a material and its clones. */
export interface ImpostorParams {
  grid: number;
  cellM: number;
  centre: THREE.Vector3;
  normalMap: THREE.Texture;
  depthMap: THREE.Texture;
}

function installImpostorHook(material: ImpostorMaterial): void {
  const params = material.esImpostor;
  if (!params) return;
  const previous = material.onBeforeCompile;
  const uniforms = {
    esImpGrid: { value: params.grid },
    esImpCell: { value: params.cellM },
    esImpCentre: { value: params.centre },
    esImpNormalMap: { value: params.normalMap },
    esImpDepthMap: { value: params.depthMap },
  };
  const wrapped: THREE.Material["onBeforeCompile"] = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    if (shader.vertexShader.includes("vec3 esImpDir(")) return; // never twice
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("void main() {", `${VERTEX_HEAD}\nvoid main() {`)
      // Right after `begin_vertex`: the quad is rebuilt in object space
      // before wind, the fade and `project_vertex` see `transformed`.
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${VERTEX_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("void main() {", `${FRAGMENT_HEAD}\nvoid main() {`)
      .replace("#include <map_fragment>", MAP_BODY)
      .replace("#include <normal_fragment_maps>", NORMAL_BODY);
  };
  material.onBeforeCompile = wrapped;
  material.esImpostorWrapped = wrapped;
  material.needsUpdate = true;
}

/**
 * The impostor rung's material. A `MeshStandardMaterial` (so every lit-
 * material patch applies), alpha-tested at 0.5 like all foliage, front-faced
 * (the quad always faces the camera), `map` = the albedo atlas.
 */
export class ImpostorMaterial extends THREE.MeshStandardMaterial {
  readonly isImpostorMaterial = true;
  esImpostor: ImpostorParams | null = null;
  esImpostorWrapped: THREE.Material["onBeforeCompile"] | null = null;

  constructor(albedo?: THREE.Texture, params?: ImpostorParams) {
    super({ map: albedo ?? null, alphaTest: 0.5, roughness: 1, metalness: 0 });
    this.name = "es-impostor";
    this.side = THREE.FrontSide;
    this.userData.esAerial = true;
    if (params) {
      this.esImpostor = params;
      installImpostorHook(this);
    }
  }

  override customProgramCacheKey(): string {
    return `${super.customProgramCacheKey()}${IMPOSTOR_CACHE_KEY}`;
  }

  override copy(source: ImpostorMaterial): this {
    super.copy(source);
    this.esImpostor = source.esImpostor;
    installImpostorHook(this);
    return this;
  }
}

/** Restore the hook after CSM reassigned `onBeforeCompile`. A no-op on any
 * other material and while the wrapper is live. */
export function reapplyImpostor(material: THREE.Material): void {
  const m = material as ImpostorMaterial;
  if (!m.isImpostorMaterial || !m.esImpostor) return;
  if (m.onBeforeCompile === m.esImpostorWrapped) return;
  installImpostorHook(m);
}

/** The shared quad: corners at ±0.5 in the shader's (right, up) plane. */
export function impostorQuad(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(
    [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

/**
 * The impostor part for one species from its loaded GLB (the quad carries
 * the albedo atlas as base colour, the normal atlas as normal texture and
 * the depth atlas in the occlusion slot, all KTX2). Null where one is missing: the species keeps its
 * card rather than draw a blank quad.
 */
export function impostorPart(
  record: ImpostorRecord,
  gltfScene: THREE.Object3D,
): { geometry: THREE.BufferGeometry; material: ImpostorMaterial } | null {
  let source: THREE.MeshStandardMaterial | null = null;
  gltfScene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && !source) source = mesh.material as THREE.MeshStandardMaterial;
  });
  const src = source as THREE.MeshStandardMaterial | null;
  // The GLB carries the depth atlas in the occlusion slot (red channel).
  if (!src?.map || !src.normalMap || !src.aoMap) return null;
  const normalMap = src.normalMap;
  const depthMap = src.aoMap;
  normalMap.colorSpace = THREE.NoColorSpace;
  depthMap.colorSpace = THREE.NoColorSpace;
  const material = new ImpostorMaterial(src.map, {
    grid: record.grid,
    cellM: record.cellM,
    centre: new THREE.Vector3(...record.centreM),
    normalMap,
    depthMap,
  });
  return { geometry: impostorQuad(), material };
}
