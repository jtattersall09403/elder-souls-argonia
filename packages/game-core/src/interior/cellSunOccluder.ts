import * as THREE from "three";
import { ShadowNode } from "three/webgpu";

/**
 * The windowed cell's sun caster (vol10 diag4 D2): the cell's shells are
 * solid at their windows, so the sun's shadow map gets its openings from one
 * shadow-only box over the room's bounds with a square hole per plugin
 * aperture (windowApertures, interiorLight.json) that faces the sun. Built from the record's
 * apertures and the cell bounds (std 6), its holes re-aimed as the sun turns
 * (vol10 diag5 E2); owned by the cell's group and its geometry disposed with
 * it (std 8). Only small props cast besides it (`CELL_SUN_CASTER_MAX_M`).
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
/** A hole grows by 1/|toSun . faceNormal| for an oblique sun, at most this many times the aperture's radius. */
export const OCCLUDER_OBLIQUE_GROWTH_MAX = 3;
/** The occluder is rebuilt when the sun's travel turns more than this from the last build (vol10 diag5 E2). */
export const OCCLUDER_REBUILD_DEG = 1;

/**
 * The aperture's hole for a sun toward `toSun` (cell-frame unit): the face of
 * `box` that the ray from the aperture centre toward the sun exits through
 * (axis, sign), the crossing point (the hole's centre) and the hole's half
 * side, grown by the obliquity. Null when the aperture faces away from the
 * sun (outward . toSun <= 0): no sun comes in by it.
 */
export function apertureHole(box: THREE.Box3, a: OccluderAperture, toSun: THREE.Vector3):
  { axis: 0 | 1 | 2; max: boolean; centre: THREE.Vector3; halfSideM: number } | null {
  if (a.outward.dot(toSun) <= 0) return null;
  let best: { axis: 0 | 1 | 2; max: boolean; t: number } | null = null;
  for (const axis of [0, 1, 2] as const) {
    const d = toSun.getComponent(axis);
    if (Math.abs(d) < 1e-9) continue;
    const max = d > 0;
    const t = ((max ? box.max : box.min).getComponent(axis) - a.centre.getComponent(axis)) / d;
    if (!best || t < best.t) best = { axis, max, t };
  }
  if (!best) return null;
  const facing = Math.abs(toSun.getComponent(best.axis));
  return {
    axis: best.axis, max: best.max,
    centre: a.centre.clone().addScaledVector(toSun, Math.max(0, best.t)),
    halfSideM: a.halfSideM * Math.min(1 / facing, OCCLUDER_OBLIQUE_GROWTH_MAX),
  };
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
 * The occluder's geometry for a sun toward `toSun`: the six faces of `box`,
 * each punched with a square hole per sun-facing aperture whose sun ray exits by it (`apertureHole`) (overlapping holes
 * merge into their bounding square). One indexed, non-interleaved
 * BufferGeometry; drawn double-sided.
 */
export function cellSunOccluderGeometry(box: THREE.Box3, apertures: readonly OccluderAperture[], toSun: THREE.Vector3): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const faces: { axis: 0 | 1 | 2; max: boolean }[] = [];
  for (const axis of [0, 1, 2] as const) for (const max of [false, true]) faces.push({ axis, max });
  const holes = new Map<string, Rect[]>();
  for (const a of apertures) {
    const f = apertureHole(box, a, toSun);
    if (!f) continue;
    const [ua, va] = f.axis === 0 ? [2, 1] : f.axis === 1 ? [0, 2] : [0, 1];
    const cu = f.centre.getComponent(ua), cv = f.centre.getComponent(va);
    const lo = box.min, hi = box.max;
    const r: Rect = [
      Math.max(cu - f.halfSideM, lo.getComponent(ua) + EDGE_M), Math.max(cv - f.halfSideM, lo.getComponent(va) + EDGE_M),
      Math.min(cu + f.halfSideM, hi.getComponent(ua) - EDGE_M), Math.min(cv + f.halfSideM, hi.getComponent(va) - EDGE_M),
    ];
    if (r[2] <= r[0] || r[3] <= r[1]) continue;
    const key = `${f.axis}${f.max}`;
    holes.set(key, [...(holes.get(key) ?? []), r]);
  }
  const p = new THREE.Vector3();
  let holeCount = 0;
  for (const { axis, max } of faces) {
    const [ua, va] = axis === 0 ? [2, 1] : axis === 1 ? [0, 2] : [0, 1];
    const u0 = box.min.getComponent(ua), u1 = box.max.getComponent(ua);
    const v0 = box.min.getComponent(va), v1 = box.max.getComponent(va);
    const shape = new THREE.Shape([new THREE.Vector2(u0, v0), new THREE.Vector2(u1, v0), new THREE.Vector2(u1, v1), new THREE.Vector2(u0, v1)]);
    for (const h of mergeOverlaps(holes.get(`${axis}${max}`) ?? [])) {
      holeCount++;
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
  geometry.userData.holeCount = holeCount;
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

/**
 * The cell's occluder: one mesh that casts the cell sun's shadow and draws
 * nothing, its holes on the sun rays through the apertures. `aim` rebuilds
 * the geometry only when the sun's direction has turned more than
 * `OCCLUDER_REBUILD_DEG` since the last build (old geometry disposed, the
 * shared material untouched). State lives on the instance (std 8).
 */
export class CellSunOccluder {
  readonly mesh: THREE.Mesh;
  /** Cell-frame unit direction toward the sun at the last build. */
  private readonly builtToSun = new THREE.Vector3(0, 1, 0);
  private readonly cosRebuild = Math.cos(THREE.MathUtils.degToRad(OCCLUDER_REBUILD_DEG));
  constructor(readonly box: THREE.Box3, readonly apertures: readonly OccluderAperture[], toSun = new THREE.Vector3(0, 1, 0)) {
    this.builtToSun.copy(toSun).normalize();
    this.mesh = new THREE.Mesh(cellSunOccluderGeometry(box, apertures, this.builtToSun), CELL_SUN_OCCLUDER_MATERIAL);
    this.mesh.name = "cellSunOccluder";
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = false;
  }
  /** The holes punched for the last build's sun (merged overlaps count once); probe-read. */
  get holeCount(): number { return (this.mesh.geometry.userData.holeCount as number | undefined) ?? 0; }
  /** Aim the holes at a sun toward `toSun` (unit, cell frame); true when the geometry was rebuilt. */
  aim(toSun: THREE.Vector3): boolean {
    if (toSun.dot(this.builtToSun) >= this.cosRebuild) return false;
    this.builtToSun.copy(toSun);
    const old = this.mesh.geometry;
    this.mesh.geometry = cellSunOccluderGeometry(this.box, this.apertures, this.builtToSun);
    old.dispose();
    return true;
  }
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
