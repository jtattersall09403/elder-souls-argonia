import * as THREE from "three";
import type { ApertureLight } from "./froxelGrid";

import windowRefs from "./windowRefs.json";

/**
 * Window light for an interior cell (decision 0112 §6), two sources in order:
 * 1. the plugin's own placed refs (decision 0114): window pieces and light-ray
 *    FX statics, read offline by tooling/volumetrics/window_refs.py into
 *    windowRefs.json (keyed by cell id);
 * 2. for a cell with none, the openings in its drawn geometry: rays from a
 *    grid of points inside the cell, 1-2 m over the floor, that leave the
 *    box of the structural pieces without touching an opaque one mark an
 *    opening; exits cluster per box face into apertures. See-through
 *    (glass) sub-meshes do not block, so glazed windows are openings too.
 * Deterministic: fixed sample order, sorted output.
 */
export interface WindowAperture {
  /** Aperture centre, cell frame (the interior group's local space). */
  centre: THREE.Vector3;
  /** Horizontal unit normal, pointing out of the cell. */
  outward: THREE.Vector3;
  areaM2: number;
}

interface RefsFile { schemaVersion: 1; cells: Record<string, { apertures: { centreM: number[]; outward: number[]; radiusM: number }[] }> }

/** The plugin-placed apertures of a cell (windowRefs.json), [] when it places none. */
export function pluginWindowApertures(cellId: string, refs: RefsFile = windowRefs as RefsFile): WindowAperture[] {
  const cell = refs.cells[cellId];
  if (!cell) return [];
  return cell.apertures.map((a) => ({
    centre: new THREE.Vector3(a.centreM[0], a.centreM[1], a.centreM[2]),
    outward: new THREE.Vector3(a.outward[0], 0, a.outward[2]).normalize(),
    areaM2: Math.PI * a.radiusM * a.radiusM,
  }));
}

export const OPENING_RULE = {
  /** Pieces whose box diagonal is under this are clutter, not walls. */
  structuralDiagM: 1.5,
  gridM: 1.5,
  heightsM: [1.5],
  raysPerRing: 24,
  tiltsDeg: [0, 25, -25],
  /** A sample point is inside the cell when this share of its level ring hits a wall. */
  enclosedShare: 0.75,
  /** Wall crossings within this of each other are one opening. */
  linkM: 0.6,
  minRadiusM: 0.2,
  /** A wider cluster is a missing wall (a modelling gap), not a window. */
  maxExtentM: 4,
  doorClearM: 1.5,
  /** Rays that must pass for a cluster to count (a seam lets one or two through). */
  minRays: 6,
  /** An opening's centre stands at least this over the floor. */
  minSillM: 0.5,
} as const;

function seeThrough(material: THREE.Material | THREE.Material[]): boolean {
  const m = Array.isArray(material) ? material[0] : material;
  return !!m && (m.transparent || m.opacity < 1);
}

/** Triangles of the structural opaque pieces in the group frame, chunked with a box per chunk. */
interface Chunk { box: THREE.Box3; tris: Float32Array }
const CHUNK_TRIS = 64;

function structuralChunks(group: THREE.Object3D, skip: THREE.Object3D | null): { chunks: Chunk[]; bounds: THREE.Box3 } {
  const chunks: Chunk[] = [];
  const bounds = new THREE.Box3();
  const m = new THREE.Matrix4();
  const toGroup = new THREE.Matrix4();
  const inv = new THREE.Matrix4();
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  const size = new THREE.Vector3();
  group.updateMatrixWorld(true);
  inv.copy(group.matrixWorld).invert();
  const walk = (o: THREE.Object3D): void => {
    if (o === skip) return;
    for (const c of o.children) walk(c);
    const mesh = o as THREE.Mesh;
    const pos = mesh.isMesh ? mesh.geometry?.getAttribute("position") : undefined;
    if (!pos || seeThrough(mesh.material)) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    toGroup.multiplyMatrices(inv, mesh.matrixWorld);
    const index = mesh.geometry.getIndex();
    const triCount = index ? index.count / 3 : pos.count / 3;
    const inst = mesh as unknown as THREE.InstancedMesh;
    const n = inst.isInstancedMesh ? inst.count : 1;
    for (let i = 0; i < n; i++) {
      if (inst.isInstancedMesh) { inst.getMatrixAt(i, m); m.premultiply(toGroup); } else m.copy(toGroup);
      box.copy(mesh.geometry.boundingBox!).applyMatrix4(m);
      if (box.getSize(size).length() < OPENING_RULE.structuralDiagM) continue;
      bounds.union(box);
      for (let t0 = 0; t0 < triCount; t0 += CHUNK_TRIS) {
        const nt = Math.min(CHUNK_TRIS, triCount - t0);
        const tris = new Float32Array(nt * 9);
        const cb = new THREE.Box3();
        for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) {
          const vi = index ? index.getX((t0 + t) * 3 + k) : (t0 + t) * 3 + k;
          v.fromBufferAttribute(pos, vi).applyMatrix4(m);
          tris.set([v.x, v.y, v.z], t * 9 + k * 3);
          cb.expandByPoint(v);
        }
        chunks.push({ box: cb.expandByScalar(0.01), tris });
      }
    }
  };
  walk(group);
  return { chunks, bounds };
}

const _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Vector3(), _s = new THREE.Vector3();
/** Nearest hit distance along the ray under maxT, else Infinity (double-sided Möller-Trumbore). */
function firstHit(chunks: readonly Chunk[], ray: THREE.Ray, maxT: number): number {
  let best = maxT;
  const hit = new THREE.Vector3();
  for (const c of chunks) {
    if (!ray.intersectBox(c.box, hit) && !c.box.containsPoint(ray.origin)) continue;
    if (!c.box.containsPoint(ray.origin) && hit.distanceTo(ray.origin) > best) continue;
    const a = c.tris;
    for (let i = 0; i < a.length; i += 9) {
      _e1.set(a[i + 3] - a[i], a[i + 4] - a[i + 1], a[i + 5] - a[i + 2]);
      _e2.set(a[i + 6] - a[i], a[i + 7] - a[i + 1], a[i + 8] - a[i + 2]);
      _p.crossVectors(ray.direction, _e2);
      const det = _e1.dot(_p);
      if (Math.abs(det) < 1e-9) continue;
      const id = 1 / det;
      _s.set(ray.origin.x - a[i], ray.origin.y - a[i + 1], ray.origin.z - a[i + 2]);
      const u = _s.dot(_p) * id;
      if (u < 0 || u > 1) continue;
      _q.crossVectors(_s, _e1);
      const w = ray.direction.dot(_q) * id;
      if (w < 0 || u + w > 1) continue;
      const t = _e2.dot(_q) * id;
      if (t > 1e-4 && t < best) best = t;
    }
  }
  return best < maxT ? best : Infinity;
}

export interface OpeningScan {
  apertures: WindowAperture[];
  /** Clusters wider than maxExtentM: missing walls, logged by the caller. */
  gaps: { centre: THREE.Vector3; extentM: number }[];
  ms: number;
}

/**
 * Scan a built cell's group for openings (once per cell load, only when the
 * plugin places no window). `floorY` is the arrival marker's height, `doors`
 * the door/arrival positions (cell frame); `skip` a subtree drawn without
 * real bounds (the cell's fire quads).
 */
export function detectWindowApertures(group: THREE.Object3D, floorY: number, doors: readonly THREE.Vector3[], skip: THREE.Object3D | null = null): OpeningScan {
  const t0 = performance.now();
  const R = OPENING_RULE;
  const { chunks, bounds } = structuralChunks(group, skip);
  const out: OpeningScan = { apertures: [], gaps: [], ms: 0 };
  if (bounds.isEmpty()) return out;
  const dirs: THREE.Vector3[] = [];
  for (const tilt of R.tiltsDeg) for (let k = 0; k < R.raysPerRing; k++) {
    const az = (k / R.raysPerRing) * Math.PI * 2, el = THREE.MathUtils.degToRad(tilt);
    dirs.push(new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)));
  }
  const up = new THREE.Vector3(0, 1, 0);
  const ray = new THREE.Ray();
  const exitPt = new THREE.Vector3();
  const ring = R.raysPerRing;
  const tHit = new Float64Array(dirs.length);
  // an escaping ray crosses the wall where its level neighbours hit it
  const cross: { p: THREE.Vector3; d: THREE.Vector3 }[] = [];
  for (let x = bounds.min.x + R.gridM / 2; x < bounds.max.x; x += R.gridM) {
    for (let z = bounds.min.z + R.gridM / 2; z < bounds.max.z; z += R.gridM) {
      for (const h of R.heightsM) {
        ray.origin.set(x, floorY + h, z);
        ray.direction.copy(up);
        if (firstHit(chunks, ray, bounds.max.y - ray.origin.y + 1) === Infinity) continue;
        let hits = 0;
        for (let k = 0; k < dirs.length; k++) {
          ray.direction.copy(dirs[k]);
          const tExit = ray.intersectBox(bounds, exitPt) ? exitPt.distanceTo(ray.origin) : 0;
          tHit[k] = firstHit(chunks, ray, tExit);
          if (k < ring && tHit[k] !== Infinity) hits++;
          if (k === ring - 1 && hits < R.enclosedShare * ring) break;
        }
        if (hits < R.enclosedShare * ring) continue;
        for (let k = 0; k < dirs.length; k++) {
          if (tHit[k] !== Infinity) continue;
          const base = k - (k % ring);
          let wall = Infinity;
          for (let s2 = 1; s2 <= 3 && wall === Infinity; s2++) {
            const l = tHit[base + ((k % ring) + ring - s2) % ring], r = tHit[base + ((k % ring) + s2) % ring];
            wall = Math.min(l, r);
          }
          if (wall === Infinity) continue;
          cross.push({ p: ray.origin.clone().addScaledVector(dirs[k], wall), d: dirs[k] });
        }
      }
    }
  }
  const label = new Int32Array(cross.length).fill(-1);
  let nClusters = 0;
  for (let i = 0; i < cross.length; i++) {
    if (label[i] >= 0) continue;
    label[i] = nClusters;
    const stack = [i];
    while (stack.length) {
      const a2 = stack.pop()!;
      for (let j = 0; j < cross.length; j++) if (label[j] < 0 && cross[j].p.distanceTo(cross[a2].p) < R.linkM) { label[j] = nClusters; stack.push(j); }
    }
    nClusters++;
  }
  for (let c = 0; c < nClusters; c++) {
    const box = new THREE.Box3();
    const dir = new THREE.Vector3();
    let n = 0;
    for (let i = 0; i < cross.length; i++) if (label[i] === c) { box.expandByPoint(cross[i].p); dir.add(cross[i].d); n++; }
    if (n < R.minRays) continue;
    const centre = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const extent = Math.max(size.x, size.y, size.z);
    if (doors.some((d) => Math.hypot(d.x - centre.x, d.z - centre.z) < R.doorClearM)) continue;
    if (centre.y < floorY + R.minSillM) continue; // a stairwell or a hole in the floor
    if (extent > R.maxExtentM) { out.gaps.push({ centre, extentM: extent }); continue; }
    const r = Math.max(R.minRadiusM, extent / 2);
    const outward = new THREE.Vector3(dir.x, 0, dir.z).normalize();
    out.apertures.push({ centre, outward, areaM2: Math.PI * r * r });
  }
  out.apertures.sort((a, b) => b.areaM2 - a.areaM2 || a.centre.x - b.centre.x || a.centre.z - b.centre.z || a.centre.y - b.centre.y);
  out.ms = performance.now() - t0;
  return out;
}

export const MAX_WINDOW_BEAMS = 4;
/** Sky fill through a window the sun is not behind, relative to a sun beam. */
export const SKY_FILL_SCALE = 0.15;
/** Moonlight relative to the sun. */
export const MOON_SCALE = 0.02;
/** A sun beam against the brightest lamp's pool at the floor (0112 §6: 2-4x). */
export const BEAM_OVER_LAMP = 3;
const FILL_TILT = Math.tan(THREE.MathUtils.degToRad(30));

/**
 * The brightest lamp pool at the floor, in the interior's exposure-1 units:
 * a point light of intensity I at height h over the floor lights it with I/h².
 * `lights` are the cell's (interiorLoader: intensity = fade × π, inverse-square).
 */
export function brightestLampFloor(lights: readonly { intensity: number; heightM: number }[]): number {
  let best = 0;
  for (const l of lights) best = Math.max(best, l.intensity / Math.max(1, l.heightM) ** 2);
  return best > 0 ? best : Math.PI / 4;
}

/**
 * Per-frame beams for a cell's windows, written into `out` (reused; no
 * allocation after the first call). `lightDir` is the unit direction the
 * light TRAVELS (minus the sun/moon direction); `strength` is the beam's
 * irradiance scale (0 hides every beam), `tint` its colour (max channel 1).
 */
export class WindowBeams {
  readonly out: ApertureLight[] = [];
  private readonly pool: ApertureLight[] = [];
  constructor(private readonly windows: readonly WindowAperture[], private readonly lengthM: number) {
    for (let i = 0; i < MAX_WINDOW_BEAMS; i++) {
      this.pool.push({ position: new THREE.Vector3(), direction: new THREE.Vector3(), radiusM: 0, lengthM, irradiance: new THREE.Color() });
    }
  }

  update(origin: THREE.Vector3, lightDir: THREE.Vector3, strength: number, tint: THREE.Color): ApertureLight[] {
    this.out.length = 0;
    if (strength <= 0) return this.out;
    // the largest sun-facing panes first, then the largest sky-fill ones
    for (let pass = 0; pass < 2; pass++) for (const w of this.windows) {
      if (this.out.length === MAX_WINDOW_BEAMS) break;
      // light entering through this pane travels along -outward
      const sunlit = -(lightDir.x * w.outward.x + lightDir.z * w.outward.z) > 0.1 && lightDir.y < 0;
      if (sunlit !== (pass === 0)) continue;
      const a = this.pool[this.out.length];
      a.position.copy(w.centre).add(origin);
      a.radiusM = Math.sqrt(w.areaM2 / Math.PI);
      a.lengthM = this.lengthM;
      if (sunlit) {
        a.direction.copy(lightDir);
        a.irradiance.copy(tint).multiplyScalar(strength);
      } else {
        a.direction.set(-w.outward.x, -FILL_TILT, -w.outward.z).normalize();
        a.irradiance.copy(tint).multiplyScalar(strength * SKY_FILL_SCALE);
      }
      this.out.push(a);
    }
    return this.out;
  }
}

type Body = { altitude: number; direction: { x: number; y: number; z: number } };
const SUN_TINT = new THREE.Color(1, 0.94, 0.82);
const MOON_TINT = new THREE.Color(0.72, 0.8, 1);

/**
 * The light a window lets in at this instant: the sun when it is up (faded
 * over its first 0.1 rad of altitude), else the highest moon at
 * `MOON_SCALE`, else nothing. Writes the travel direction and tint; returns
 * the strength relative to a full sun beam.
 */
export function windowSkyLight(sun: Body, moons: readonly Body[], lightDir: THREE.Vector3, tint: THREE.Color): number {
  if (sun.altitude > 0) {
    lightDir.set(-sun.direction.x, -sun.direction.y, -sun.direction.z);
    tint.copy(SUN_TINT);
    return THREE.MathUtils.smoothstep(sun.altitude, 0, 0.1);
  }
  let best: Body | null = null;
  for (const m of moons) if (m.altitude > 0 && (!best || m.altitude > best.altitude)) best = m;
  if (!best) return 0;
  lightDir.set(-best.direction.x, -best.direction.y, -best.direction.z);
  tint.copy(MOON_TINT);
  return MOON_SCALE;
}
