import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { MAX_WINDOW_BEAMS, SKY_FILL_SCALE, WindowBeams, brightestLampFloor, detectWindowApertures, windowSkyLight } from "./windowApertures";

const opaque = new THREE.MeshStandardMaterial();
const glass = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.4 });
function box(group: THREE.Group, size: [number, number, number], at: [number, number, number], mat: THREE.Material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  m.position.set(...at);
  group.add(m);
}
/** A 6 x 3 x 4 m room: walls at x = ±3, z = ±2; panes as named. */
function room(): THREE.Group {
  const g = new THREE.Group();
  box(g, [6, 0.2, 4], [0, 0, 0], opaque);
  box(g, [0.3, 3, 4], [3, 1.5, 0], opaque);
  box(g, [0.3, 3, 4], [-3, 1.5, 0], opaque);
  box(g, [6, 3, 0.3], [0, 1.5, 2], opaque);
  box(g, [6, 3, 0.3], [0, 1.5, -2], opaque);
  box(g, [0.05, 1.2, 1], [2.95, 1.6, 0], glass);      // east pane, 1.2 m²
  box(g, [0.05, 1.2, 1.01], [2.95, 1.6, 0.3], glass); // same window, merged
  box(g, [0.8, 1, 0.05], [-1, 1.6, -1.95], glass);    // north pane, 0.8 m²
  box(g, [0.05, 1, 1], [0, 1.5, 0], glass);           // mid-room screen: not at a wall
  box(g, [1, 0.05, 1], [2.5, 2, 1], glass);           // flat: not upright
  box(g, [0.05, 1, 1], [2.9, 1.5, -1.5], opaque);     // opaque: not glass
  return g;
}

describe("detectWindowApertures", () => {
  it("finds the wall panes, merged, largest first, normal outward", () => {
    const w = detectWindowApertures(room());
    expect(w.map((a) => a.outward.toArray())).toEqual([[1, 0, 0], [0, 0, -1]]);
    expect(w[0].areaM2).toBeCloseTo(1.2 * 1.01, 3);
    expect(w[0].centre.z).toBeCloseTo(0.15, 3);
  });

  it("is deterministic", () => {
    expect(detectWindowApertures(room())).toEqual(detectWindowApertures(room()));
  });
});

describe("WindowBeams", () => {
  const w = detectWindowApertures(room());
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
