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

export interface GroundMaterialRow { readonly name: string; readonly file: string; readonly normalFile?: string; readonly tileM: number }

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

/**
 * One material per place: the place's textures (at most `PAINT_MAX_TEXTURES`)
 * blended by the per-vertex `paintWeight` channels, alpha = the largest weight
 * broken up by a metre-scale world noise, so the edge frays into the ground
 * round it instead of drawing a ribbon. UVs are world metres; each texture
 * tiles at its own `tileM`. The scene fog node hazes it exactly as it hazes
 * the ground under it; no distance fade of its own.
 */
export function paintMaterial(baseUrl: string, set: string, rows: readonly GroundMaterialRow[]): MeshStandardNodeMaterial {
  const loader = new THREE.TextureLoader();
  const maps = rows.map((row) => {
    const t = loader.load(`${baseUrl}textures/ground/${set}/${row.file}`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
  const tileOf = (c: number) => rows[Math.min(c, rows.length - 1)].tileM;
  const material = new MeshStandardNodeMaterial({
    map: maps[0], roughness: 1, metalness: 0, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
  });
  material.userData.paintMaps = maps;
  const extra = [maps[Math.min(1, maps.length - 1)], maps[Math.min(2, maps.length - 1)]];
  const w = T.attribute("paintWeight", "vec3");
  const at = T.uv();
  const c = T.texture(maps[0], at.div(tileOf(0))).rgb.mul(w.x)
    .add(T.texture(extra[0], at.div(tileOf(1))).rgb.mul(w.y))
    .add(T.texture(extra[1], at.div(tileOf(2))).rgb.mul(w.z))
    .div(T.max(w.x.add(w.y).add(w.z), 1e-4));
  const a = T.max(w.x, T.max(w.y, w.z));
  // worn ground is patchy: two octaves of world noise (0.9 m and 2.7 m)
  // thin the paint most where it is already thin, so the edge frays
  const xz = T.positionWorld.xz;
  const n = paintNoise(xz.div(0.9)).mul(0.6).add(paintNoise(xz.div(2.7)).mul(0.4));
  const frayed = a.mul(T.smoothstep(0, 1, T.clamp(a.mul(2.2).sub(n.mul(0.5)).add(0.2), 0, 1)));
  material.colorNode = T.vec4(c, frayed);
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
  g.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  g.setIndex(new THREE.BufferAttribute(s.indices, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return { geometry: g, textures: s.textures };
}
