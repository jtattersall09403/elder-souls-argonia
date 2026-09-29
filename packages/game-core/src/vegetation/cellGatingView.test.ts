/**
 * The view-frustum gate (walk 5, 2026-09-29): tiles off screen are not
 * submitted, with a widened margin and hysteresis for turns; a casting rung
 * keeps the tiles whose shadow reaches the view; a from-zero caster is gated
 * from distance 0 so near trees keep their shadow.
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  boxInPlanes,
  GATE_TILE_COUNT,
  gateSpecies,
  VIEW_OFF_MARGIN_DEG,
  VIEW_ON_MARGIN_DEG,
  viewPlanesFor,
  type GateRung,
  type GateSpecies,
  type GateStats,
  type GateView,
} from "./cellGating";
import { CELL_TILES, TILE_BOUNDS_STRIDE } from "./cellBuild";
import { LOD_OPEN_M } from "../fx/lodFade";

const CELL = 468;
const TILE = CELL / CELL_TILES;

function stats(): GateStats {
  return { visibleCopies: 0, visibleTriangles: 0, checksCell: 0, checksTile: 0 };
}

function fullRung(
  band: [number, number, number, number],
  extra: Partial<GateRung> = {},
  /** Each tile's plants all stand at its centre (no angular spread). */
  point = false,
): GateRung {
  const tileBounds = new Float32Array(GATE_TILE_COUNT * TILE_BOUNDS_STRIDE);
  const tileOffsets = new Uint32Array(GATE_TILE_COUNT + 1);
  for (let t = 0; t < GATE_TILE_COUNT; t++) {
    const tx = t % CELL_TILES;
    const tz = Math.floor(t / CELL_TILES);
    const b = t * TILE_BOUNDS_STRIDE;
    const lo = point ? 0.5 : 0;
    const hi = point ? 0.5 : 1;
    tileBounds[b] = (tx + lo) * TILE; tileBounds[b + 2] = (tz + lo) * TILE;
    tileBounds[b + 3] = (tx + hi) * TILE; tileBounds[b + 5] = (tz + hi) * TILE;
    tileBounds[b + 6] = 1;
    tileOffsets[t + 1] = t + 1;
  }
  return {
    band, near: true, tileOffsets, tileBounds,
    state: new Uint8Array(GATE_TILE_COUNT), ids: [new Int32Array(GATE_TILE_COUNT)],
    copies: GATE_TILE_COUNT, triangles: GATE_TILE_COUNT, trianglesPerInstance: 1, onTiles: 0,
    heightM: 10,
    ...extra,
  };
}

function entry(rungs: GateRung[]): GateSpecies {
  return {
    key: "k", cell: "c", species: "s", maxDraw: 1e4,
    cellBox: { minX: 0, minZ: 0, maxX: CELL, maxZ: CELL }, reachM: 0, rungs, near: true,
  };
}

/** A camera at the cell centre, 2 m up, looking along yaw (0 = −Z). */
function cameraAt(yawDeg: number, pitchDeg = 0): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 5000);
  camera.position.set(CELL / 2, 2, CELL / 2);
  camera.rotation.set((pitchDeg * Math.PI) / 180, (yawDeg * Math.PI) / 180, 0, "YXZ");
  camera.updateMatrixWorld(true);
  return camera;
}

function gate(list: GateSpecies[], camera: THREE.PerspectiveCamera, view: GateView): void {
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const l = Math.hypot(f.x, f.z);
  gateSpecies(list, camera.position, { x: f.x / l, z: f.z / l }, () => undefined, stats(),
    undefined, undefined, view);
}

/** Angle of a tile centre off the camera's horizontal view line, degrees. */
function offAxisDeg(t: number, camera: THREE.PerspectiveCamera): number {
  const tx = t % CELL_TILES;
  const tz = Math.floor(t / CELL_TILES);
  const cx = (tx + 0.5) * TILE - camera.position.x;
  const cz = (tz + 0.5) * TILE - camera.position.z;
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const dot = (cx * f.x + cz * f.z) / (Math.hypot(cx, cz) * Math.hypot(f.x, f.z));
  return (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
}

describe("view gate", () => {
  it("keeps what is on screen and drops what is behind", () => {
    const camera = cameraAt(0);
    const rung = fullRung([0, LOD_OPEN_M, 0, 0]);
    gate([entry([rung])], camera, viewPlanesFor(camera));
    const halfH = (Math.atan(Math.tan(Math.PI / 6) * (16 / 9)) * 180) / Math.PI;
    for (let t = 0; t < GATE_TILE_COUNT; t++) {
      const off = offAxisDeg(t, camera);
      const tx = t % CELL_TILES;
      const tz = Math.floor(t / CELL_TILES);
      const d = Math.hypot((tx + 0.5) * TILE - CELL / 2, (tz + 0.5) * TILE - CELL / 2);
      if (d < TILE * 1.5) continue;   // tiles around the eye straddle every plane
      // Every tile whose centre is on screen is in.
      if (off < halfH) expect(rung.state[t] & 1).toBe(1);
      // Nothing more than the widened margin (plus the tile's own spread) off
      // axis is in.
      const spread = (Math.asin(Math.min(1, (TILE * 0.71) / d)) * 180) / Math.PI;
      if (off > halfH + VIEW_OFF_MARGIN_DEG + spread + 1) expect(rung.state[t] & 1).toBe(0);
    }
    // Well under the ~2/3 of the ring the old behind-latch submitted.
    let on = 0;
    for (let t = 0; t < GATE_TILE_COUNT; t++) on += rung.state[t] & 1;
    expect(on / GATE_TILE_COUNT).toBeLessThan(0.5);
  });

  it("has hysteresis: a tile between the ON and OFF margins keeps its state", () => {
    expect(VIEW_ON_MARGIN_DEG).toBeLessThan(VIEW_OFF_MARGIN_DEG);
    const halfH = (Math.atan(Math.tan(Math.PI / 6) * (16 / 9)) * 180) / Math.PI;
    const rung = fullRung([0, LOD_OPEN_M, 0, 0], { heightM: 0.01 }, true);
    const list = [entry([rung])];
    const c0 = cameraAt(0);
    // In the gap: past the ON margin, inside the OFF margin (tile spread aside).
    const gap: number[] = [];
    for (let t = 0; t < GATE_TILE_COUNT; t++) {
      const tx = t % CELL_TILES;
      const tz = Math.floor(t / CELL_TILES);
      const d = Math.hypot((tx + 0.5) * TILE - CELL / 2, (tz + 0.5) * TILE - CELL / 2);
      if (d < TILE * 2) continue;
      const off = offAxisDeg(t, c0);
      if (off > halfH + VIEW_ON_MARGIN_DEG + 1 && off < halfH + VIEW_OFF_MARGIN_DEG - 1) {
        gap.push(t);
      }
    }
    expect(gap.length).toBeGreaterThan(4);
    // Coming from in view: they stay in.
    gate(list, c0, viewPlanesFor(c0));
    for (const t of gap) expect(rung.state[t] & 1).toBe(1);
    // Coming from out of view (the camera looked the other way): they stay out.
    const back = cameraAt(180);
    gate(list, back, viewPlanesFor(back));
    gate(list, c0, viewPlanesFor(c0));
    for (const t of gap) expect(rung.state[t] & 1).toBe(0);
  });

  it("keeps a casting tile behind the camera whose shadow falls on screen", () => {
    const camera = cameraAt(0);   // looking −Z
    const view = viewPlanesFor(camera);
    // A tall tree 60 m behind the camera (+Z), sun low in the south (+Z):
    // light travels toward −Z, shadow 10 m x 8 = 80 m long, onto the screen.
    const tile = (Math.floor((CELL / 2 + 60) / TILE)) * CELL_TILES + Math.floor(CELL / 2 / TILE);
    const casting = fullRung([0, LOD_OPEN_M, 0, 0], { casts: true, heightM: 10 });
    view.shadow = { x: 0, z: -1, perM: 8 };
    gate([entry([casting])], camera, view);
    expect(casting.state[tile] & 1).toBe(1);
    // The same tile, not casting, is culled; so is it at night.
    const plain = fullRung([0, LOD_OPEN_M, 0, 0]);
    gate([entry([plain])], camera, view);
    expect(plain.state[tile] & 1).toBe(0);
    const night = fullRung([0, LOD_OPEN_M, 0, 0], { casts: true, heightM: 10 });
    view.shadow = null;
    gate([entry([night])], camera, view);
    expect(night.state[tile] & 1).toBe(0);
  });

  it("gates a from-zero caster from distance 0, not from its band's inner edge", () => {
    const camera = cameraAt(0);
    const view = viewPlanesFor(camera);
    const tile = (Math.floor((CELL / 2 - 20) / TILE)) * CELL_TILES + Math.floor(CELL / 2 / TILE);
    const mid = fullRung([60, 200, 0, 0], { castsFromZero: true, casts: true });
    const midNoCast = fullRung([60, 200, 0, 0]);
    gate([entry([mid, midNoCast])], camera, view);
    expect(mid.state[tile] & 1).toBe(1);
    expect(midNoCast.state[tile] & 1).toBe(0);
  });

  it("boxInPlanes: a box straddling the eye is in", () => {
    const camera = cameraAt(0);
    const view = viewPlanesFor(camera);
    const p = camera.position;
    expect(boxInPlanes(view.off, p.x - 1, 0, p.z - 1, p.x + 1, 4, p.z + 1)).toBe(true);
    expect(boxInPlanes(view.off, p.x - 1, 0, p.z + 200, p.x + 1, 4, p.z + 210)).toBe(false);
  });
});
