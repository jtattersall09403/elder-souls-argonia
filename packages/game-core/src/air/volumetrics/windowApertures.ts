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

/** Seconds a beam takes to fade fully in or out. */
export const BEAM_FADE_S = 0.6;
/** A storey is floor y to floor y + this. */
export const STOREY_HEIGHT_M = 3;
/** Same storey when no walkable levels are recorded: |aperture y - player y| under this. */
export const SAME_STOREY_DY_M = 2.2;

/** What the beam ranking reads each frame, all in the cell frame. */
export interface BeamView {
  /** The player's feet. */
  player: THREE.Vector3;
  /** The cell's walkable floor heights, when recorded. */
  floorsY?: readonly number[];
  /** The camera frustum; an aperture is in view when its sphere of the beam length meets it. */
  frustum: THREE.Frustum;
  beamLengthM: number;
  /** Unit direction the light travels. */
  lightDir: THREE.Vector3;
}

const _sphere = new THREE.Sphere();

/** True when the light enters through this pane (it travels along -outward, from above). */
function sunFacing(w: WindowAperture, lightDir: THREE.Vector3): boolean {
  return -(lightDir.x * w.outward.x + lightDir.z * w.outward.z) > 0.1 && lightDir.y < 0;
}

function sameStorey(y: number, v: BeamView): boolean {
  if (!v.floorsY?.length) return Math.abs(y - v.player.y) < SAME_STOREY_DY_M;
  // the player's floor: the highest floor at or below the feet (+0.5 m for stairs and slop)
  let floor = -Infinity;
  for (const f of v.floorsY) if (f <= v.player.y + 0.5 && f > floor) floor = f;
  if (floor === -Infinity) floor = Math.min(...v.floorsY);
  return y >= floor && y <= floor + STOREY_HEIGHT_M;
}

/**
 * Window indices best first (planner ruling, 0112 §6): same storey as the
 * player, then in view, then sun-facing, then nearest. Written into `out`.
 */
export function rankApertures(windows: readonly WindowAperture[], v: BeamView, out: number[] = []): number[] {
  out.length = 0;
  const key: number[] = [];
  const dist: number[] = [];
  windows.forEach((w, i) => {
    _sphere.set(w.centre, v.beamLengthM);
    key.push((sameStorey(w.centre.y, v) ? 4 : 0) + (v.frustum.intersectsSphere(_sphere) ? 2 : 0) + (sunFacing(w, v.lightDir) ? 1 : 0));
    dist.push(w.centre.distanceToSquared(v.player));
    out.push(i);
  });
  return out.sort((a, b) => key[b] - key[a] || dist[a] - dist[b] || a - b);
}

/**
 * The beam slots: at most MAX_WINDOW_BEAMS apertures lit, each weight easing
 * to 1 when selected and to 0 when dropped over BEAM_FADE_S. A fading-out
 * aperture holds its slot until its weight is 0; a new pick waits for a free slot.
 */
export class ApertureFader {
  readonly slots: { index: number; weight: number }[] = [];
  update(wanted: readonly number[], dtS: number): void {
    const step = Math.max(0, dtS) / BEAM_FADE_S;
    for (const s of this.slots) {
      const on = wanted.includes(s.index);
      s.weight = on ? Math.min(1, s.weight + step) : Math.max(0, s.weight - step);
    }
    for (let i = this.slots.length - 1; i >= 0; i--) {
      if (this.slots[i].weight === 0 && !wanted.includes(this.slots[i].index)) this.slots.splice(i, 1);
    }
    for (const index of wanted) {
      if (this.slots.length >= MAX_WINDOW_BEAMS) break;
      if (!this.slots.some((s) => s.index === index)) this.slots.push({ index, weight: 0 });
    }
  }
}

/**
 * Per-frame beams for a cell's windows, written into `out` (pooled). The
 * ranking picks up to MAX_WINDOW_BEAMS; each lit aperture's radiance is
 * scaled by its fader weight. `lightDir` is the unit direction the light
 * TRAVELS; `strength` the beam's irradiance scale, `tint` its colour.
 */
export class WindowBeams {
  readonly out: ApertureLight[] = [];
  readonly fader = new ApertureFader();
  private readonly pool: ApertureLight[] = [];
  private readonly ranked: number[] = [];
  private readonly wanted: number[] = [];
  private readonly view: BeamView;
  constructor(private readonly windows: readonly WindowAperture[], private readonly lengthM: number, floorsY?: readonly number[]) {
    for (let i = 0; i < MAX_WINDOW_BEAMS; i++) {
      this.pool.push({ position: new THREE.Vector3(), direction: new THREE.Vector3(), radiusM: 0, lengthM, irradiance: new THREE.Color() });
    }
    this.view = { player: new THREE.Vector3(), floorsY, frustum: new THREE.Frustum(), beamLengthM: lengthM, lightDir: new THREE.Vector3() };
  }

  /**
   * `origin` is the cell's world position; `playerWorld` the player's feet and
   * `frustumWorld` the camera frustum, both in world space; `dtS` the frame time.
   */
  update(origin: THREE.Vector3, lightDir: THREE.Vector3, strength: number, tint: THREE.Color,
    playerWorld: THREE.Vector3, frustumWorld: THREE.Frustum, dtS: number): ApertureLight[] {
    const v = this.view;
    v.player.copy(playerWorld).sub(origin);
    v.frustum.copy(frustumWorld);
    for (const pl of v.frustum.planes) pl.constant += pl.normal.dot(origin); // world -> cell frame
    v.lightDir.copy(lightDir);
    rankApertures(this.windows, v, this.ranked);
    this.wanted.length = 0;
    if (strength > 0) for (let i = 0; i < Math.min(MAX_WINDOW_BEAMS, this.ranked.length); i++) this.wanted.push(this.ranked[i]);
    this.fader.update(this.wanted, dtS);
    this.out.length = 0;
    for (const slot of this.fader.slots) {
      if (slot.weight <= 0 || strength <= 0) continue;
      const w = this.windows[slot.index];
      const a = this.pool[this.out.length];
      a.position.copy(w.centre).add(origin);
      a.radiusM = Math.sqrt(w.areaM2 / Math.PI);
      a.lengthM = this.lengthM;
      if (sunFacing(w, lightDir)) {
        a.direction.copy(lightDir);
        a.irradiance.copy(tint).multiplyScalar(strength * slot.weight);
      } else {
        a.direction.set(-w.outward.x, -FILL_TILT, -w.outward.z).normalize();
        a.irradiance.copy(tint).multiplyScalar(strength * SKY_FILL_SCALE * slot.weight);
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
