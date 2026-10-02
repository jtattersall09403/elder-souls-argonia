/**
 * The path paint's material and geometry (16k walk 4/7), apart from the layer
 * so tests and harnesses can import them: the blend of the place's ground
 * textures by per-vertex weight, as a TSL node material (webgpu branch; no
 * CSM hook to lose, so no reapply step).
 */

import * as THREE from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import * as tsl from "three/tsl";
import type { TerrainHeight } from "./types";
import type { TslNode } from "../render/nodes/materialNodes";
import { PAINT_MAX_TEXTURES, paintSurface, type GroundPaintEntry } from "./groundPaint";

const T = tsl as unknown as Record<string, (...a: TslNode[]) => TslNode> & Record<string, TslNode>;

/** A row of `textures/ground/<set>/materials.json`; `id` is its layer in the set's albedo array. */
export interface GroundMaterialRow { readonly id: number; readonly name: string; readonly file: string; readonly normalFile?: string; readonly tileM: number }

/** Value noise on the world XZ plane, 0..1 (the GLSL esPaintNoise of the WebGL branch). */
function paintNoise(p: TslNode): TslNode {
  const hash = (q: TslNode) => T.fract(T.sin(T.dot(q, T.vec2(127.1, 311.7))).mul(43758.5453));
  const i = T.floor(p);
  const f0 = T.fract(p);
  const f = f0.mul(f0).mul(T.float(3).sub(f0.mul(2)));
  return T.mix(
    T.mix(hash(i), hash(i.add(T.vec2(1, 0))), f.x),
    T.mix(hash(i.add(T.vec2(0, 1))), hash(i.add(T.vec2(1, 1))), f.x), f.y);
}

/** What the paint samples: the ground set's albedo array, the array layer of
 * each of its three channels, and each channel's tile size (metres). */
export interface PaintState {
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
 * graph because the array is sampled raw. UVs are world metres; each texture
 * tiles at its own `tileM`. The per-vertex `paintShade` is the baked contact
 * shade round a building (walk 9 seam): the ground under the surface darkens
 * by it as a multiply, folded into the one over-blend. The scene fog node
 * hazes it exactly as it hazes the ground under it; no distance fade of its own.
 */
export function paintMaterial(array: THREE.Texture, rows: readonly GroundMaterialRow[]): MeshStandardNodeMaterial {
  const rowOf = (c: number) => rows[Math.min(c, rows.length - 1)];
  const state: PaintState = {
    array,
    layer: new THREE.Vector3(rowOf(0).id, rowOf(1).id, rowOf(2).id),
    tile: new THREE.Vector3(rowOf(0).tileM, rowOf(1).tileM, rowOf(2).tileM),
  };
  const material = new MeshStandardNodeMaterial({
    roughness: 1, metalness: 0, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
  });
  material.userData.esGroundPaint = state;
  const w = T.attribute("paintWeight", "vec3");
  const at = T.uv();
  const albedo = (layer: number, tile: number) =>
    T.sRGBTransferEOTF(T.vec4(T.texture(array, at.div(tile)).depth(T.int(layer)).rgb, 1)).rgb;
  const c = albedo(state.layer.x, state.tile.x).mul(w.x)
    .add(albedo(state.layer.y, state.tile.y).mul(w.y))
    .add(albedo(state.layer.z, state.tile.z).mul(w.z))
    .div(T.max(w.x.add(w.y).add(w.z), 1e-4));
  const a = T.max(w.x, T.max(w.y, w.z));
  // worn ground is patchy: two octaves of world noise (0.9 m and 2.7 m)
  // thin the paint most where it is already thin, so the edge frays
  const xz = T.positionWorld.xz;
  const n = paintNoise(xz.div(0.9)).mul(0.6).add(paintNoise(xz.div(2.7)).mul(0.4));
  const frayed = a.mul(T.smoothstep(0, 1, T.clamp(a.mul(2.2).sub(n.mul(0.5)).add(0.2), 0, 1)));
  // contact shade (walk 9): the ground under the surface darkens by s, as a
  // multiply, folded into one over-blend: paint a over ground, all times (1 - s)
  const sh = T.clamp(T.attribute("paintShade", "float"), 0, 1);
  const A = T.float(1).sub(T.float(1).sub(frayed).mul(T.float(1).sub(sh)));
  material.colorNode = T.vec4(c.mul(frayed).mul(T.float(1).sub(sh)).div(T.max(A, 1e-4)), A);
  return material;
}

/** One place's surface as a geometry: UVs in world metres, `paintWeight` per vertex. */
export function paintGeometry(entries: readonly GroundPaintEntry[], groundAt: TerrainHeight):
  { geometry: THREE.BufferGeometry; textures: readonly string[] } | null {
  const s = paintSurface(entries, groundAt);
  if (!s || s.vertexCount === 0) return null; // an empty draw is a WebGPU validation error
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
