/**
 * The path paint's material and geometry (16k walk 4/7), apart from the layer
 * so WorldSky's material chain and the harness can import them: the blend of
 * the place's ground textures by per-vertex weight, and its reapply after
 * CSM replaces the hook.
 */

import * as THREE from "three";
import type { TerrainHeight } from "./types";
import { PAINT_MAX_TEXTURES, paintSurface, type GroundPaintEntry } from "./groundPaint";
import { chainHas, markChain } from "../render/shaderHookChain";

/** A row of `textures/ground/<set>/materials.json`; `id` is its layer in the set's albedo array. */
export interface GroundMaterialRow { readonly id: number; readonly name: string; readonly file: string; readonly normalFile?: string; readonly tileM: number }

const PAINT_MARK = "/* es-ground-paint */";
const PAINT_PATCH = "es-ground-paint";

interface PaintState {
  readonly array: THREE.Texture;
  readonly layer: THREE.Vector3;
  readonly tile: THREE.Vector3;
}

/**
 * One material per place: the place's textures (at most `PAINT_MAX_TEXTURES`)
 * blended by the per-vertex `paintWeight` channels, alpha = the largest weight
 * broken up by a metre-scale world noise, so the edge frays into the ground
 * round it instead of drawing a ribbon. The albedos are layers of the ground
 * set's albedo array (`terrain/groundArray`, the terrain's own texture, shared
 * through the loader cache and never disposed here), decoded from sRGB in the
 * shader because the array is sampled raw. UVs are world metres; each texture
 * tiles at its own `tileM`. `esAerial` puts it under the one aerial haze the
 * terrain draws with (WorldSky), so it fades into the mist exactly as the
 * ground under it does; no distance fade of its own.
 */
export function paintMaterial(array: THREE.Texture, rows: readonly GroundMaterialRow[]): THREE.MeshStandardMaterial {
  const rowOf = (c: number) => rows[Math.min(c, rows.length - 1)];
  const material = new THREE.MeshStandardMaterial({
    roughness: 1, metalness: 0, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
  });
  material.userData.esAerial = true;
  material.userData.esGroundPaint = {
    array,
    layer: new THREE.Vector3(rowOf(0).id, rowOf(1).id, rowOf(2).id),
    tile: new THREE.Vector3(rowOf(0).tileM, rowOf(1).tileM, rowOf(2).tileM),
  } satisfies PaintState;
  reapplyGroundPaint(material);
  return material;
}

/**
 * Install (or restore) the paint blend on `material`. `CSM.setupMaterial`
 * REPLACES `onBeforeCompile` (fx/windSway.ts says why), and WorldSky runs it
 * on every lit material in the scene: without this call after it the paint
 * drew as one opaque tile of its first texture over every quad of its grid
 * (16k walk 7: the blocky dark cobble at Claywater, unfaded at any range).
 * Chains whatever hook is there; a no-op on other materials and on a chain
 * that already carries it.
 */
export function reapplyGroundPaint(material: THREE.Material): void {
  const state = material.userData?.esGroundPaint as PaintState | undefined;
  if (!state) return;
  if (!chainHas(material.onBeforeCompile, PAINT_PATCH)) {
    const previous = material.onBeforeCompile;
    material.onBeforeCompile = markChain<THREE.Material["onBeforeCompile"]>((shader, renderer) => {
      previous?.call(material, shader, renderer);
      if (shader.fragmentShader.includes(PAINT_MARK)) return;
      shader.uniforms.paintArray = { value: state.array };
      shader.uniforms.paintLayer = { value: state.layer };
      shader.uniforms.paintTile = { value: state.tile };
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>
attribute vec3 paintWeight;
attribute float paintShade;
varying vec3 vPaintWeight;
varying float vPaintShade;
varying vec2 vPaintXZ;
varying vec2 vPaintUv;`)
        .replace("#include <project_vertex>", `#include <project_vertex>
vPaintWeight = paintWeight;
vPaintShade = paintShade;
vPaintXZ = (modelMatrix * vec4(transformed, 1.0)).xz;
vPaintUv = uv;`);
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>
${PAINT_MARK}
uniform highp sampler2DArray paintArray;
uniform vec3 paintLayer;
uniform vec3 paintTile;
varying vec3 vPaintWeight;
varying float vPaintShade;
varying vec2 vPaintXZ;
varying vec2 vPaintUv;
vec3 esPaintAlbedo(float layer, float tile) {
  return sRGBTransferEOTF(vec4(texture(paintArray, vec3(vPaintUv / tile, layer)).rgb, 1.0)).rgb;
}
float esPaintHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float esPaintNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(esPaintHash(i), esPaintHash(i + vec2(1.0, 0.0)), f.x),
             mix(esPaintHash(i + vec2(0.0, 1.0)), esPaintHash(i + vec2(1.0, 1.0)), f.x), f.y);
}`)
        .replace("#include <map_fragment>", `{
  vec3 w = vPaintWeight;
  vec3 c = w.x * esPaintAlbedo(paintLayer.x, paintTile.x)
    + w.y * esPaintAlbedo(paintLayer.y, paintTile.y)
    + w.z * esPaintAlbedo(paintLayer.z, paintTile.z);
  c /= max(w.x + w.y + w.z, 1e-4);
  float a = max(w.x, max(w.y, w.z));
  // worn ground is patchy: two octaves of world noise (0.9 m and 2.7 m)
  // thin the paint most where it is already thin, so the edge frays
  float n = 0.6 * esPaintNoise(vPaintXZ / 0.9) + 0.4 * esPaintNoise(vPaintXZ / 2.7);
  a *= smoothstep(0.0, 1.0, clamp(a * 2.2 - 0.5 * n + 0.2, 0.0, 1.0));
  // contact shade (walk 9): the ground under the surface darkens by s, as a
  // multiply, folded into one over-blend: paint a over ground, all times (1 - s)
  float s = clamp(vPaintShade, 0.0, 1.0);
  float A = 1.0 - (1.0 - a) * (1.0 - s);
  diffuseColor *= vec4(c * a * (1.0 - s) / max(A, 1e-4), A);
}`);
    }, previous, PAINT_PATCH);
    material.needsUpdate = true;
  }
  if (!chainHas(material.customProgramCacheKey, PAINT_PATCH)) {
    const priorKey = material.customProgramCacheKey;
    material.customProgramCacheKey = markChain(function (this: THREE.Material) {
      return `${priorKey.call(this)}|${PAINT_PATCH}`;
    }, priorKey, PAINT_PATCH);
  }
}

/** One place's surface as a geometry: UVs in world metres, `paintWeight` per vertex. */
export function paintGeometry(entries: readonly GroundPaintEntry[], groundAt: TerrainHeight):
  { geometry: THREE.BufferGeometry; textures: readonly string[] } | null {
  const s = paintSurface(entries, groundAt);
  if (!s) return null;
  const uvs = new Float32Array(s.vertexCount * 2);
  for (let v = 0; v < s.vertexCount; v++) {
    uvs[v * 2] = s.positions[v * 3];
    uvs[v * 2 + 1] = s.positions[v * 3 + 2];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(s.positions, 3));
  g.setAttribute("paintWeight", new THREE.BufferAttribute(s.weights, PAINT_MAX_TEXTURES));
  g.setAttribute("paintShade", new THREE.BufferAttribute(s.shade, 1));
  g.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  g.setIndex(new THREE.BufferAttribute(s.indices, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return { geometry: g, textures: s.textures };
}
