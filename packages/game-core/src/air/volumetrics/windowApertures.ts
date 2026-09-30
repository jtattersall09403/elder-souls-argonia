import * as THREE from "three";
import type { ApertureLight } from "./froxelGrid";

import windowRefs from "./windowRefs.json";

/**
 * Window light for an interior cell (decision 0112 §6). The only aperture
 * source is the plugin's own placed refs (decision 0114): window pieces,
 * light-ray FX statics and window-textured panes inside placed models, read
 * offline by tooling/volumetrics/window_refs.py into windowRefs.json (keyed by
 * cell id). A cell with no window has `apertures: []` and a reason there.
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
