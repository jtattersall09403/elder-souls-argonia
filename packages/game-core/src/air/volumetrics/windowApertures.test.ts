import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { MAX_WINDOW_BEAMS, SKY_FILL_SCALE, WindowBeams, brightestLampFloor, pluginWindowApertures, windowSkyLight } from "./windowApertures";

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

describe("WindowBeams", () => {
  const w = windows;
  const beams = new WindowBeams(w, 8);
  const origin = new THREE.Vector3(10, 0, 0);
  const tint = new THREE.Color(1, 1, 1);

  it("sun from the east lights the east pane along the sun, the north pane gets a sky fill", () => {
    const sunDir = new THREE.Vector3(-1, -1, 0).normalize();
    const out = beams.update(origin, sunDir, 2, tint);
    expect(out).toHaveLength(2);
    expect(out[0].direction.toArray()).toEqual(sunDir.toArray());
    expect(out[0].irradiance.r).toBe(2);
    expect(out[0].position.x).toBeCloseTo(12.95, 3);
    expect(out[1].irradiance.r).toBeCloseTo(2 * SKY_FILL_SCALE, 6);
    expect(out[1].direction.z).toBeGreaterThan(0);
    expect(out[1].direction.y).toBeCloseTo(-0.5, 3);
    expect(beams.update(origin, sunDir, 2, tint)[0]).toBe(out[0]); // pooled, no allocation
  });

  it("no light, no beams; never more than the cap", () => {
    expect(beams.update(origin, new THREE.Vector3(0, -1, 0), 0, tint)).toHaveLength(0);
    const many = new WindowBeams(Array.from({ length: 7 }, () => w[0]), 8);
    expect(many.update(origin, new THREE.Vector3(0, -1, 0), 1, tint)).toHaveLength(MAX_WINDOW_BEAMS);
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
