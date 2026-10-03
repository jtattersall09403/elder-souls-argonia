import * as THREE from "three";
import { ShadowNode } from "three/webgpu";

/**
 * The windowed cell's sun caster (vol10 diag4 D2): the cell's shells are
 * solid at their windows, so the sun's shadow map gets its openings from one
 * shadow-only box over the room's bounds with a square hole per plugin
 * aperture (windowApertures, interiorLight.json), every aperture whatever the
 * sun does now (the sun moves). Built once per cell from the record's
 * apertures and the cell bounds only (std 6); owned by the cell's group and
 * its geometry disposed with it (std 8). The shell no longer casts.
 */
export interface OccluderAperture {
  /** Centre, cell frame. */
  centre: THREE.Vector3;
  /** Horizontal unit normal out of the cell. */
  outward: THREE.Vector3;
  /** Half the hole's side: the aperture's radius. */
  halfSideM: number;
}

/** Holes keep this far inside their face's edges so the face outline stays a simple polygon. */
const EDGE_M = 1e-3;

/**
 * The aperture's hole: which x/z face of `box` it opens in (axis 0 = x,
 * 2 = z; sign of the face) and its centre on that face, reached from the
 * aperture centre along its outward normal (the face it exits by; a centre
 * outside the box projects back onto the face it lies beyond).
 */
export function apertureFace(box: THREE.Box3, a: OccluderAperture): { axis: 0 | 2; max: boolean; centre: THREE.Vector3 } {
  let best: { axis: 0 | 2; max: boolean; t: number } | null = null;
  for (const axis of [0, 2] as const) {
    const o = a.outward.getComponent(axis);
    if (Math.abs(o) < 1e-6) continue;
    const max = o > 0;
    const plane = (max ? box.max : box.min).getComponent(axis);
    const t = (plane - a.centre.getComponent(axis)) / o;
    if (!best || t < best.t) best = { axis, max, t };
  }
  if (!best) throw new Error("aperture outward normal is not horizontal");
  return { axis: best.axis, max: best.max, centre: a.centre.clone().addScaledVector(a.outward, best.t) };
}

type Rect = [number, number, number, number]; // u0 v0 u1 v1

function mergeOverlaps(rects: Rect[]): Rect[] {
  const out = rects.map((r) => [...r] as Rect);
  for (let merged = true; merged;) {
    merged = false;
    for (let i = 0; i < out.length && !merged; i++) {
      for (let j = i + 1; j < out.length && !merged; j++) {
        const a = out[i], b = out[j];
        if (a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3]) {
          out[i] = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
          out.splice(j, 1);
          merged = true;
        }
      }
    }
  }
  return out;
}

/**
 * The occluder's geometry: the six faces of `box`, each x/z wall face
 * punched with a square hole per aperture opening in it (overlapping holes
 * merge into their bounding square). One indexed, non-interleaved
 * BufferGeometry; drawn double-sided.
 */
export function cellSunOccluderGeometry(box: THREE.Box3, apertures: readonly OccluderAperture[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const faces: { axis: 0 | 1 | 2; max: boolean }[] = [];
  for (const axis of [0, 1, 2] as const) for (const max of [false, true]) faces.push({ axis, max });
  const holes = new Map<string, Rect[]>();
  for (const a of apertures) {
    const f = apertureFace(box, a);
    const [ua, va] = f.axis === 0 ? [2, 1] : [0, 1];
    const cu = f.centre.getComponent(ua), cv = f.centre.getComponent(va);
    const lo = box.min, hi = box.max;
    const r: Rect = [
      Math.max(cu - a.halfSideM, lo.getComponent(ua) + EDGE_M), Math.max(cv - a.halfSideM, lo.getComponent(va) + EDGE_M),
      Math.min(cu + a.halfSideM, hi.getComponent(ua) - EDGE_M), Math.min(cv + a.halfSideM, hi.getComponent(va) - EDGE_M),
    ];
    if (r[2] <= r[0] || r[3] <= r[1]) continue;
    const key = `${f.axis}${f.max}`;
    holes.set(key, [...(holes.get(key) ?? []), r]);
  }
  const p = new THREE.Vector3();
  for (const { axis, max } of faces) {
    const [ua, va] = axis === 0 ? [2, 1] : axis === 1 ? [0, 2] : [0, 1];
    const u0 = box.min.getComponent(ua), u1 = box.max.getComponent(ua);
    const v0 = box.min.getComponent(va), v1 = box.max.getComponent(va);
    const shape = new THREE.Shape([new THREE.Vector2(u0, v0), new THREE.Vector2(u1, v0), new THREE.Vector2(u1, v1), new THREE.Vector2(u0, v1)]);
    for (const h of mergeOverlaps(holes.get(`${axis}${max}`) ?? [])) {
      shape.holes.push(new THREE.Path([new THREE.Vector2(h[0], h[1]), new THREE.Vector2(h[0], h[3]), new THREE.Vector2(h[2], h[3]), new THREE.Vector2(h[2], h[1])]));
    }
    const g = new THREE.ShapeGeometry(shape);
    const pos = g.getAttribute("position");
    const base = positions.length / 3;
    const w = (max ? box.max : box.min).getComponent(axis);
    for (let i = 0; i < pos.count; i++) {
      p.setComponent(ua, pos.getX(i)).setComponent(va, pos.getY(i)).setComponent(axis, w);
      positions.push(p.x, p.y, p.z);
    }
    const idx = g.getIndex()!;
    for (let i = 0; i < idx.count; i++) indices.push(base + idx.getX(i));
    g.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * The one material every cell's occluder shares (0108: one shadow-only
 * material): writes neither colour nor depth in the colour pass, both sides
 * cast. Never mutated after creation and never disposed with a cell.
 */
export const CELL_SUN_OCCLUDER_MATERIAL: THREE.Material = new THREE.MeshBasicMaterial({
  colorWrite: false, depthWrite: false, side: THREE.DoubleSide, name: "cellSunOccluder",
});

/** The cell's occluder mesh: casts the cell sun's shadow, draws nothing. */
export function cellSunOccluder(box: THREE.Box3, apertures: readonly OccluderAperture[]): THREE.Mesh {
  const mesh = new THREE.Mesh(cellSunOccluderGeometry(box, apertures), CELL_SUN_OCCLUDER_MATERIAL);
  mesh.name = "cellSunOccluder";
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  return mesh;
}

/**
 * The cell sun's shadow node: three's ShadowNode with its depth texture as
 * FloatType (depth32float) instead of depth24plus, which WebGPU cannot copy
 * out, so a depth readback of the cell sun's map works (vol10 diag4 D3).
 * Only the depth texture's type differs; the filtering TSL is three's.
 */
export class CellSunShadowNode extends ShadowNode {
  setupRenderTarget(shadow: THREE.LightShadow, builder: unknown): { shadowMap: THREE.RenderTarget; depthTexture: THREE.DepthTexture } {
    const base = (ShadowNode.prototype as unknown as {
      setupRenderTarget(s: THREE.LightShadow, b: unknown): { shadowMap: THREE.RenderTarget; depthTexture: THREE.DepthTexture };
    }).setupRenderTarget.call(this, shadow, builder);
    base.depthTexture.type = THREE.FloatType;
    return base;
  }
}
