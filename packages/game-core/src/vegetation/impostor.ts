/**
 * Octahedral impostors: the far rung of a heavy tree (walk-5 perf lane,
 * decision 0108 §5). One quad per instance, facing the camera; its pixels
 * come from an atlas of the tree's own mesh rendered from a hemi-octahedral
 * grid of directions (`pipeline/impostor_bake.py`, agargaro's
 * octahedral-impostor method). The vertex stage picks the three baked views
 * around the current view direction and projects the quad onto each of them;
 * the fragment stage blends the three taps by alpha-weighted barycentric
 * weights (the cell's split diagonal follows the grid's axis diagonals, see
 * `selectFrames`), and lights the pixel through the object-space normal atlas
 * with the material's own lights: it IS a `MeshStandardNodeMaterial`, so the
 * sun, ambient, CSM shadow node, fixture lights and the scene fogNode apply
 * as to every other lit plant.
 *
 * THE SHARED GEOMETRY. `frameBasis`, `gridDir` and `selectFrames` below are
 * the same arithmetic as the node graph and as `impostor_bake.py` (whose
 * judge reconstructs the impostor with them); `impostor.test.ts` pins the TS
 * and Python copies to the same numbers.
 *
 * TSL node features (decision 0111, docs/standards/tsl-shaders.md): the quad
 * rebuild is the `positionNode` (object space, pre-instance, installed first
 * so wind and the LOD fade wrap it), the tap blend is the `colorNode`, the
 * atlas normal is the `normalNode`. The nodes are plain own properties, so a
 * batch's `cloneNodeMaterial` copy carries them; nothing needs re-installing.
 * In the shadow pass `cameraPosition` is the light's camera, so the caster
 * turns to the sun and casts the tree's silhouette from the sun's side.
 */

import * as THREE from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import * as tsl from "three/tsl";
import { instanceMatrixNode, matrixColumn } from "../fx/instanceNodes";
import { sel, type TslNode } from "../render/nodes/materialNodes";

// TSL chains are typed loosely on purpose (tsl-shaders.md §1).
const {
  abs, cameraPosition, cameraViewMatrix, clamp, cross, dot, float, floor, length, mat3, max,
  modelWorldMatrix, normalize, positionGeometry, texture, transpose, uniform, varying,
  vec2, vec3, vec4,
} = tsl as unknown as Record<string, TslNode>;

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

/** What the graph needs; shared by reference between a material and its clones. */
export interface ImpostorParams {
  grid: number;
  cellM: number;
  centre: THREE.Vector3;
  normalMap: THREE.Texture;
  depthMap: THREE.Texture;
}

/** `frameBasis` as nodes: right = normalize(Y x d) (X where d is vertical). */
function basisNode(d: TslNode): { r: TslNode; u: TslNode } {
  const r0 = vec3(d.z, 0, d.x.negate());
  const n = length(r0);
  const r = sel(n.lessThan(1e-6), vec3(1, 0, 0), r0.div(max(n, 1e-6)));
  return { r, u: cross(d, r) };
}

/** `gridDir` as nodes, for a frame `f` (vec2, float grid coordinates). */
function dirNode(f: TslNode, grid: TslNode): TslNode {
  const g = f.div(grid.sub(1)).mul(2).sub(1);
  const p = vec2(g.x.add(g.y), g.x.sub(g.y)).mul(0.5);
  return normalize(vec3(p.x, max(float(1).sub(abs(p.x)).sub(abs(p.y)), 0), p.y));
}

/**
 * The impostor graph for one material: sets `positionNode`, `colorNode` and
 * `normalNode`. The vertex half (quad rebuild, frame choice, the instance's
 * axes in view space) reaches the fragment through varyings, as the GLSL did.
 */
function installImpostorNodes(material: ImpostorMaterial, params: ImpostorParams, albedo: THREE.Texture | null): void {
  const grid = uniform(params.grid);
  const cell = uniform(params.cellM);
  const centre = uniform(params.centre);

  // ---- vertex: the object's frame. The instance basis is rotation x uniform
  // scale (the scatter never shears), so its inverse is basis^T / s^2: WGSL
  // has no inverse().
  const m = modelWorldMatrix.mul(instanceMatrixNode());
  const c0 = matrixColumn(m, 0);
  const scaleSq = max(dot(c0, c0), 1e-12);
  const basis = mat3(c0, matrixColumn(m, 1), matrixColumn(m, 2));
  const camObj = transpose(basis).mul(cameraPosition.sub(matrixColumn(m, 3))).div(scaleSq);
  const v = normalize(camObj.sub(centre));
  const { r, u } = basisNode(v);
  // The raw attribute, not positionLocal: a varying reads it too.
  const quad = positionGeometry;
  const pObj = r.mul(quad.x).add(u.mul(quad.y)).mul(cell);

  const hv = vec3(v.x, max(v.y, 0).add(1e-5), v.z);
  const q = hv.xz.div(abs(hv.x).add(hv.y).add(abs(hv.z)));
  const g = vec2(q.x.add(q.y), q.x.sub(q.y)).mul(0.5).add(0.5).mul(grid.sub(1));
  const cc = clamp(floor(g), vec2(0), vec2(grid.sub(2)));
  const fr = g.sub(cc);
  const qd = cc.add(0.5).sub(grid.sub(1).mul(0.5));
  const diag = qd.x.mul(qd.y).greaterThan(0);
  const ge = fr.x.greaterThanEqual(fr.y);
  const lower = fr.x.add(fr.y).lessThan(1);
  const one = vec2(1, 0);
  const up = vec2(0, 1);
  // Main-diagonal split toward grid corners (0,0) and (n-1,n-1), else the
  // anti-diagonal split: the same three cases as `selectFrames`.
  const f01 = sel(diag, vec4(cc, cc.add(1)),
    sel(lower, vec4(cc, cc.add(one)), vec4(cc.add(1), cc.add(one))));
  const f2 = sel(diag, sel(ge, cc.add(one), cc.add(up)), cc.add(up));
  const w = sel(diag,
    sel(ge, vec3(float(1).sub(fr.x), fr.y, fr.x.sub(fr.y)), vec3(float(1).sub(fr.y), fr.x, fr.y.sub(fr.x))),
    sel(lower, vec3(float(1).sub(fr.x).sub(fr.y), fr.x, fr.y), vec3(fr.x.add(fr.y).sub(1), float(1).sub(fr.y), float(1).sub(fr.x))));
  // The instance's object axes in view space (normalMatrix x mat3(instance)
  // up to the uniform scale, which the final normalize removes).
  const mv = cameraViewMatrix.mul(m);
  const axis = (a: TslNode) => mv.mul(vec4(a, 0)).xyz;

  material.positionNode = centre.add(pObj);

  // ---- fragment.
  const vP = varying(pObj, "esImpP");
  const vVd = varying(v, "esImpVd");
  const vF01 = varying(f01, "esImpF01");
  const vF2 = varying(f2, "esImpF2");
  const vW = varying(w, "esImpW");
  const vAx = varying(axis(vec3(1, 0, 0)), "esImpAx");
  const vAy = varying(axis(vec3(0, 1, 0)), "esImpAy");
  const vAz = varying(axis(vec3(0, 0, 1)), "esImpAz");

  const at = (f: TslNode, uv: TslNode) => f.add(vec2(uv.x, float(1).sub(uv.y))).div(grid);
  /** The pixel's view ray walked onto frame `f`'s depth surface
   * (PARALLAX_STEPS fixed-point steps from the centre plane), as tap uv. */
  const frameUv = (f: TslNode) => {
    const d = dirNode(f, grid);
    const b = basisNode(d);
    const qn = vP.div(cell);
    const vr = dot(vVd, b.r);
    const vu = dot(vVd, b.u);
    const vd = max(dot(vVd, d), PARALLAX_MIN_COS);
    const o = vec3(dot(qn, b.r), dot(qn, b.u), dot(qn, d));
    let t: TslNode = float(0);
    for (let k = 0; k < PARALLAX_STEPS; k++) {
      const uv = clamp(vec2(o.x.sub(t.mul(vr)), o.y.sub(t.mul(vu))).add(0.5), 0, 1);
      t = o.z.sub(texture(params.depthMap, at(f, uv)).r.sub(0.5)).div(vd);
    }
    return vec2(o.x.sub(t.mul(vr)), o.y.sub(t.mul(vu))).add(0.5);
  };
  // Outside its frame a tap is empty (both sides evaluated: sel, never select).
  const tap = (tex: THREE.Texture, f: TslNode, uv: TslNode) => {
    const inside = uv.x.greaterThanEqual(0).and(uv.y.greaterThanEqual(0))
      .and(uv.x.lessThanEqual(1)).and(uv.y.lessThanEqual(1));
    return sel(inside, texture(tex, at(f, uv)), vec4(0));
  };
  const fa = vF01.xy;
  const fb = vF01.zw;
  const uv0 = frameUv(fa);
  const uv1 = frameUv(fb);
  const uv2 = frameUv(vF2);
  const map = albedo ?? new THREE.Texture();
  const t0 = tap(map, fa, uv0);
  const t1 = tap(map, fb, uv1);
  const t2 = tap(map, vF2, uv2);
  const wa = vW.mul(vec3(t0.a, t1.a, t2.a));
  const alpha = wa.x.add(wa.y).add(wa.z);
  const col = t0.rgb.mul(wa.x).add(t1.rgb.mul(wa.y)).add(t2.rgb.mul(wa.z)).div(max(alpha, 1e-4));
  // diffuseColor = (colour, opacity) x (blend, alpha); NodeMaterial applies
  // the opacity and the 0.5 alpha test after this node.
  material.colorNode = vec4(col, alpha);

  const nrm = (f: TslNode, uv: TslNode) => tap(params.normalMap, f, uv).xyz.mul(2).sub(1);
  const no = nrm(fa, uv0).mul(wa.x).add(nrm(fb, uv1).mul(wa.y)).add(nrm(vF2, uv2).mul(wa.z));
  material.normalNode = normalize(vAx.mul(no.x).add(vAy.mul(no.y)).add(vAz.mul(no.z))
    .add(vec3(0, 0, 1e-4)));
  material.needsUpdate = true;
}

/**
 * The impostor rung's material. A `MeshStandardNodeMaterial` (so every lit-
 * material feature applies), alpha-tested at 0.5 like all foliage,
 * front-faced (the quad always faces the camera), `map` = the albedo atlas
 * (for inspection; the colour graph samples it directly).
 */
export class ImpostorMaterial extends MeshStandardNodeMaterial {
  readonly isImpostorMaterial = true;
  esImpostor: ImpostorParams | null = null;

  constructor(albedo?: THREE.Texture, params?: ImpostorParams) {
    super();
    this.map = albedo ?? null;
    this.alphaTest = 0.5;
    this.roughness = 1;
    this.metalness = 0;
    this.name = "es-impostor";
    this.side = THREE.FrontSide;
    if (params) {
      this.esImpostor = params;
      installImpostorNodes(this, params, albedo ?? null);
    }
  }
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
