import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ApertureFader, BEAM_FADE_S, MAX_WINDOW_BEAMS, rankApertures, SKY_FILL_SCALE, WindowBeams, brightestLampFloor, pluginWindowApertures, windowSkyLight } from "./windowApertures";

describe("pluginWindowApertures", () => {
  it("reads the cell's placed window refs; none for an unknown cell", () => {
    const refs = { schemaVersion: 1 as const, cells: { A: { apertures: [{ centreM: [1, 2, 3], outward: [0, 0, -1], radiusM: 0.5 }] } } };
    const w = pluginWindowApertures("A", refs);
    expect(w[0].centre.toArray()).toEqual([1, 2, 3]);
    expect(w[0].areaM2).toBeCloseTo(Math.PI * 0.25, 6);
    expect(pluginWindowApertures("B", refs)).toEqual([]);
  });
  it("the published cells carry their plugin windows", () => {
    expect(pluginWindowApertures("KeebaHouseCrafter").length).toBe(5);
    expect(pluginWindowApertures("DawnstarBrinasHouse").length).toBe(4);
    expect(pluginWindowApertures("LilmothPlantationStorehouse").length).toBe(10);
  });
});

const windows = [
  { centre: new THREE.Vector3(2.95, 1.5, 0), outward: new THREE.Vector3(1, 0, 0), areaM2: 1.2 },
  { centre: new THREE.Vector3(-1, 1.6, -2), outward: new THREE.Vector3(0, 0, -1), areaM2: 0.8 },
];

// a frustum that contains everything
const all = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().makeOrthographic(-1e4, 1e4, 1e4, -1e4, -1e4, 1e4));
const none = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().makeOrthographic(1e4, 1e4 + 1, 1, 0, 0, 1));

describe("WindowBeams", () => {
  const w = windows;
  const origin = new THREE.Vector3(10, 0, 0);
  const player = new THREE.Vector3(10, 0.5, 0);
  const tint = new THREE.Color(1, 1, 1);

  it("fully faded in: the east pane along the sun, the north pane a sky fill; pooled", () => {
    const beams = new WindowBeams(w, 8);
    const sunDir = new THREE.Vector3(-1, -1, 0).normalize();
    let out = beams.update(origin, sunDir, 2, tint, player, all, 1);
    out = beams.update(origin, sunDir, 2, tint, player, all, 1);
    expect(out).toHaveLength(2);
    const east = out.find((a) => a.position.x > 12)!;
    expect(east.direction.toArray()).toEqual(sunDir.toArray());
    expect(east.irradiance.r).toBe(2);
    const north = out.find((a) => a !== east)!;
    expect(north.irradiance.r).toBeCloseTo(2 * SKY_FILL_SCALE, 6);
    expect(north.direction.y).toBeCloseTo(-0.5, 3);
    expect(beams.update(origin, sunDir, 2, tint, player, all, 0)[0]).toBe(out[0]);
  });

  it("never more than the cap lit", () => {
    const many = new WindowBeams(Array.from({ length: 7 }, () => w[0]), 8);
    for (let i = 0; i < 3; i++) expect(many.update(origin, new THREE.Vector3(0, -1, 0), 1, tint, player, all, 0.5).length).toBeLessThanOrEqual(MAX_WINDOW_BEAMS);
    expect(many.fader.slots).toHaveLength(MAX_WINDOW_BEAMS);
  });
});

describe("rankApertures", () => {
  const at = (x: number, y: number, z: number, ox = 1, oz = 0) =>
    ({ centre: new THREE.Vector3(x, y, z), outward: new THREE.Vector3(ox, 0, oz), areaM2: 1 });
  const light = new THREE.Vector3(-1, -1, 0).normalize(); // sun in the east: east panes (outward +x) are sun-facing
  it("storey, then view, then sun-facing, then nearest", () => {
    const ws = [
      at(1, 5, 0),          // 0 upstairs, sun-facing, near
      at(9, 1.5, 0, -1, 0), // 1 same storey, not sun-facing, far
      at(2, 1.5, 0, -1, 0), // 2 same storey, not sun-facing, near
      at(8, 1.5, 0),        // 3 same storey, sun-facing, far
    ];
    const v = { player: new THREE.Vector3(0, 0, 0), frustum: all, beamLengthM: 1, lightDir: light };
    expect(rankApertures(ws, v)).toEqual([3, 2, 1, 0]);
    expect(rankApertures(ws, { ...v, floorsY: [0, 3.5] })).toEqual([3, 2, 1, 0]);
    // standing upstairs: the upstairs pane leads
    expect(rankApertures(ws, { ...v, player: new THREE.Vector3(0, 3.6, 0), floorsY: [0, 3.5] })[0]).toBe(0);
    // out of view loses to in view on the same storey
    const inView = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().makeOrthographic(0, 4, 3, 0, -10, 10));
    expect(rankApertures([at(8, 1.5, 0), at(2, 1.5, 0, -1, 0)], { ...v, frustum: inView, beamLengthM: 0.1 })).toEqual([1, 0]);
    expect(rankApertures([at(8, 1.5, 0)], { ...v, frustum: none }).length).toBe(1);
  });
});

describe("ApertureFader", () => {
  it("no pop: a weight never moves more than dt/0.6; a fading slot holds until 0; newcomers wait", () => {
    const f = new ApertureFader();
    const prev = new Map<number, number>();
    const picks = [[0, 1, 2, 3], [0, 1, 2, 3], [4, 5, 6, 7], [4, 5, 6, 7], [0, 5, 6, 7], [4, 5, 6, 7]];
    let saw4Waiting = false;
    for (let frame = 0; frame < 120; frame++) {
      const dt = 0.016 + (frame % 5) * 0.01;
      f.update(picks[Math.floor(frame / 20)], dt);
      expect(f.slots.length).toBeLessThanOrEqual(MAX_WINDOW_BEAMS);
      for (const s of f.slots) {
        expect(Math.abs(s.weight - (prev.get(s.index) ?? 0))).toBeLessThanOrEqual(dt / BEAM_FADE_S + 1e-9);
        prev.set(s.index, s.weight);
      }
      for (const k of [...prev.keys()]) if (!f.slots.some((s) => s.index === k)) {
        expect(prev.get(k)!).toBeLessThanOrEqual(dt / BEAM_FADE_S + 1e-9); // reached 0 this frame, no pop
        prev.delete(k);
      }
      if (frame === 40 && !f.slots.some((s) => s.index === 4)) saw4Waiting = true;
    }
    expect(saw4Waiting).toBe(true);
    expect(f.slots.map((s) => s.index).sort()).toEqual([4, 5, 6, 7]);
  });
});

describe("windowSkyLight", () => {
  const d = new THREE.Vector3();
  const c = new THREE.Color();
  it("sun up: travels away from the sun; night: the highest moon at 0.02; else dark", () => {
    expect(windowSkyLight({ altitude: 0.5, direction: { x: 0, y: 1, z: 0 } }, [], d, c)).toBe(1);
    expect(d.y).toBe(-1);
    expect(windowSkyLight({ altitude: -0.2, direction: { x: 0, y: -1, z: 0 } }, [{ altitude: 0.3, direction: { x: 1, y: 0, z: 0 } }], d, c)).toBe(0.02);
    expect(d.x).toBe(-1);
    expect(windowSkyLight({ altitude: -0.2, direction: { x: 0, y: -1, z: 0 } }, [{ altitude: -0.1, direction: { x: 1, y: 0, z: 0 } }], d, c)).toBe(0);
  });
  it("lamp pool: intensity over height squared, the brightest", () => {
    expect(brightestLampFloor([{ intensity: Math.PI, heightM: 2 }, { intensity: 2 * Math.PI, heightM: 2 }])).toBeCloseTo(Math.PI / 2, 6);
  });
});
