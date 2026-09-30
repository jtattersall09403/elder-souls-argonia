import * as THREE from "three";
import type { ApertureLight } from "./froxelGrid";

/**
 * Window light for an interior cell (decision 0112 §6). The cell records
 * carry no window, no window LIGH and no light-ray FX, so the windows are
 * read from the cell's own drawn geometry once, when the cell is built: a
 * glass pane is a see-through sub-mesh (transparent or opacity < 1) whose box
 * is thin in one horizontal axis, upright and window-sized, standing at the
 * cell's outer wall (the box of its opaque pieces). Deterministic: the scan
 * walks the group in child order and sorts by area, then position.
 */
export interface WindowAperture {
  /** Pane centre, cell frame (the interior group's local space). */
  centre: THREE.Vector3;
  /** Horizontal unit normal, pointing out of the cell. */
  outward: THREE.Vector3;
  areaM2: number;
}

export const WINDOW_RULE = {
  maxThicknessM: 0.35,
  minSideM: 0.3,
  maxSideM: 3,
  wallBandM: 0.8,
  mergeM: 0.5,
} as const;

function seeThrough(material: THREE.Material | THREE.Material[]): boolean {
  const m = Array.isArray(material) ? material[0] : material;
  // glass blends normally: additive cards (flames, glows) are light, not panes
  return !!m && (m.transparent || m.opacity < 1) && m.blending === THREE.NormalBlending;
}

/** The pieces' boxes in the group's frame, one per drawn instance. */
function forEachInstanceBox(group: THREE.Object3D, skip: THREE.Object3D | null, fn: (box: THREE.Box3, mesh: THREE.Mesh) => void): void {
  const box = new THREE.Box3();
  const m = new THREE.Matrix4();
  const inv = new THREE.Matrix4();
  group.updateMatrixWorld(true);
  inv.copy(group.matrixWorld).invert();
  const walk = (o: THREE.Object3D): void => {
    if (o === skip) return;
    for (const c of o.children) walk(c);
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry?.getAttribute("position")) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const local = mesh.geometry.boundingBox!;
    const toGroup = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld);
    const inst = mesh as unknown as THREE.InstancedMesh;
    const n = inst.isInstancedMesh ? inst.count : 1;
    for (let i = 0; i < n; i++) {
      if (inst.isInstancedMesh) { inst.getMatrixAt(i, m); m.premultiply(toGroup); } else m.copy(toGroup);
      box.copy(local).applyMatrix4(m);
      fn(box, mesh);
    }
  };
  walk(group);
}

/**
 * Scan a built cell's group for window panes (once per cell load). `skip`
 * is a subtree drawn without real bounds (the cell's fire quads, placed in
 * the shader): never a pane and never a wall.
 */
export function detectWindowApertures(group: THREE.Object3D, skip: THREE.Object3D | null = null): WindowAperture[] {
  const R = WINDOW_RULE;
  const walls = new THREE.Box3();
  const panes: THREE.Box3[] = [];
  forEachInstanceBox(group, skip, (box, mesh) => {
    if (seeThrough(mesh.material)) panes.push(box.clone());
    else walls.union(box);
  });
  if (walls.isEmpty()) return [];
  const mid = walls.getCenter(new THREE.Vector3());
  const size = new THREE.Vector3();
  const c = new THREE.Vector3();
  const found: { centre: THREE.Vector3; outward: THREE.Vector3; areaM2: number; n: number }[] = [];
  for (const b of panes) {
    b.getSize(size);
    b.getCenter(c);
    const thinX = size.x < R.maxThicknessM && size.x <= size.z;
    const thinZ = size.z < R.maxThicknessM && size.z < size.x;
    if (!thinX && !thinZ) continue;
    const width = thinX ? size.z : size.x;
    if (size.y < R.minSideM || size.y > R.maxSideM || width < R.minSideM || width > R.maxSideM) continue;
    const toWall = Math.min(c.x - walls.min.x, walls.max.x - c.x, c.z - walls.min.z, walls.max.z - c.z);
    if (toWall > R.wallBandM) continue;
    const outward = thinX ? new THREE.Vector3(Math.sign(c.x - mid.x) || 1, 0, 0) : new THREE.Vector3(0, 0, Math.sign(c.z - mid.z) || 1);
    const area = width * size.y;
    const near = found.find((f) => f.centre.distanceTo(c) < R.mergeM);
    if (near) {
      near.centre.multiplyScalar(near.n).add(c).divideScalar(near.n + 1);
      near.n += 1;
      near.areaM2 = Math.max(near.areaM2, area);
    } else found.push({ centre: c.clone(), outward, areaM2: area, n: 1 });
  }
  found.sort((a, b) => b.areaM2 - a.areaM2 || a.centre.x - b.centre.x || a.centre.z - b.centre.z || a.centre.y - b.centre.y);
  return found.map(({ centre, outward, areaM2 }) => ({ centre, outward, areaM2 }));
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
