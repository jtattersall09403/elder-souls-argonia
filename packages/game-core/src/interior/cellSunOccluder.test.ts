import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { apertureHole, CELL_SUN_OCCLUDER_MATERIAL, CellSunOccluder } from "./cellSunOccluder";

const cellSunOccluder = (b: THREE.Box3, a: Parameters<typeof apertureHole>[1][], toSun?: THREE.Vector3) => new CellSunOccluder(b, a, toSun).mesh;

const box = new THREE.Box3(new THREE.Vector3(-4, 0, -3), new THREE.Vector3(4, 3, 3));
// one window in the +x wall, centre 0.3 m inside it (the Brinas case), 0.5 m radius
const window = { centre: new THREE.Vector3(3.7, 1.5, 0), outward: new THREE.Vector3(1, 0, 0), halfSideM: 0.5 };

function hits(mesh: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3): boolean {
  const dir = to.clone().sub(from);
  const ray = new THREE.Raycaster(from, dir.clone().normalize(), 0, dir.length());
  return ray.intersectObject(mesh).length > 0;
}

describe("cellSunOccluder (vol10 diag4 D2)", () => {
  const floor = new THREE.Vector3(1.7, 0.01, 0);
  // the sun low in the east, beyond the +x window, its ray through the window centre to the floor
  const sunDir = window.centre.clone().sub(floor).normalize();
  const mesh = cellSunOccluder(box, [window], sunDir);
  mesh.updateMatrixWorld();

  it("opens the window: a floor point sees the sun through the hole", () => {
    expect(hits(mesh, floor, floor.clone().addScaledVector(sunDir, 20))).toBe(false);
  });
  it("closes the wall: the same sun from a floor point off the window is blocked", () => {
    const off = new THREE.Vector3(1.7, 0.01, 2);
    expect(hits(mesh, off, off.clone().addScaledVector(sunDir, 20))).toBe(true);
    const noon = new THREE.Vector3(0, 0.01, 0);
    expect(hits(mesh, noon, new THREE.Vector3(0, 20, 0))).toBe(true);
  });
  it("centres the hole where the sun ray from the aperture exits the bounds", () => {
    const f = apertureHole(box, window, sunDir)!;
    expect([f.axis, f.max, f.centre.x]).toEqual([0, true, 4]);
    expect(f.centre.y).toBeCloseTo(1.5 + 0.3 * sunDir.y / sunDir.x, 9);
    expect(apertureHole(box, window, new THREE.Vector3(-1, 1, 0).normalize())).toBeNull();
  });

  // vol10 diag5 E2: a 6x3x6 room, an aperture 1 m inside the +x wall, sun at alt 34 deg facing 0.77
  const room = new THREE.Box3(new THREE.Vector3(-3, 0, -3), new THREE.Vector3(3, 3, 3));
  const deep = { centre: new THREE.Vector3(2, 1.2, 0), outward: new THREE.Vector3(1, 0, 0), halfSideM: 0.4 };
  const sunAt = (altDeg: number, facing: number) => {
    const alt = THREE.MathUtils.degToRad(altDeg), az = Math.acos(facing);
    return new THREE.Vector3(Math.cos(alt) * Math.cos(az), Math.sin(alt), Math.cos(alt) * Math.sin(az));
  };
  it("lets the sun ray through a deep aperture; the old centre + normal placement would miss it", () => {
    const toSun = sunAt(34, 0.77);
    const occ = new CellSunOccluder(room, [deep], toSun);
    occ.mesh.updateMatrixWorld();
    expect(hits(occ.mesh, deep.centre, deep.centre.clone().addScaledVector(toSun, 20))).toBe(false);
    const hole = apertureHole(room, deep, toSun)!;
    const old = new THREE.Vector3(3, 1.2, 0);
    expect(hole.centre.distanceTo(old)).toBeGreaterThan(deep.halfSideM);
    expect(hole.halfSideM).toBeCloseTo(deep.halfSideM / Math.abs(toSun.x), 9);
    // the old hole's centre square alone: the ray crosses the face outside it
    const cross = hole.centre;
    expect(Math.max(Math.abs(cross.y - old.y), Math.abs(cross.z - old.z))).toBeGreaterThan(deep.halfSideM);
  });
  it("rebuilds its geometry when the sun turns over 1 deg, not under", () => {
    const base = sunAt(34, 0.77);
    const occ = new CellSunOccluder(room, [deep], base);
    const turn = (deg: number) => base.clone().applyAxisAngle(base.clone().cross(new THREE.Vector3(0, 1, 0)).normalize(), THREE.MathUtils.degToRad(deg));
    const g0 = occ.mesh.geometry;
    expect(occ.aim(turn(0.5))).toBe(false);
    expect(occ.mesh.geometry).toBe(g0);
    expect(occ.aim(turn(1.1))).toBe(true);
    expect(occ.mesh.geometry).not.toBe(g0);
    expect(occ.mesh.material).toBe(CELL_SUN_OCCLUDER_MATERIAL);
  });
  it("is shadow-only and shares one material", () => {
    expect(mesh.castShadow).toBe(true);
    expect(CELL_SUN_OCCLUDER_MATERIAL.colorWrite).toBe(false);
    expect(CELL_SUN_OCCLUDER_MATERIAL.depthWrite).toBe(false);
    expect(cellSunOccluder(box, [], sunDir).material).toBe(mesh.material);
  });
  it("is deterministic in its inputs", () => {
    const a = cellSunOccluder(box, [window], sunDir).geometry.getAttribute("position").array;
    expect(Array.from(a)).toEqual(Array.from(mesh.geometry.getAttribute("position").array));
  });
});

// vol10 c8 L2: the shipped record's Brinas apertures, in the frame the loader builds the occluder in
describe("cellSunOccluder on DawnstarBrinasHouse's record apertures (vol10 c8 L2)", async () => {
  const { interiorLightOf } = await import("../air/volumetrics/windowApertures");
  const row = interiorLightOf("DawnstarBrinasHouse") as unknown as {
    boundsM: [number[], number[]]; apertures: { centreM: number[]; outward: number[]; radiusM: number }[];
  };
  const bounds = new THREE.Box3(new THREE.Vector3(...row.boundsM[0]), new THREE.Vector3(...row.boundsM[1]));
  const aps = row.apertures.map((a) => ({
    centre: new THREE.Vector3(a.centreM[0], a.centreM[1], a.centreM[2]),
    outward: new THREE.Vector3(a.outward[0], 0, a.outward[2]).normalize(),
    halfSideM: a.radiusM,
  }));
  it("has the four plugin apertures inside the bounds", () => {
    expect(aps.length).toBe(4);
    for (const a of aps) expect(bounds.containsPoint(a.centre)).toBe(true);
  });
  // the loader's clamp: 45 deg elevation, from the bearing of each aperture's outward
  for (const [i, a] of aps.entries()) {
    for (const yawDeg of [0, 30, -30]) {
      it(`a sun ray through aperture ${i} (bearing ${yawDeg} deg off its normal) reaches the floor`, () => {
        const h = a.outward.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(yawDeg));
        const toSun = new THREE.Vector3(h.x * Math.SQRT1_2, Math.SQRT1_2, h.z * Math.SQRT1_2).normalize();
        const occ = new CellSunOccluder(bounds, aps, toSun);
        occ.mesh.updateMatrixWorld();
        // floor (y 0) point on the sun ray through the aperture centre
        const t = a.centre.y / toSun.y;
        const floor = a.centre.clone().addScaledVector(toSun, -t);
        expect(bounds.containsPoint(floor)).toBe(true);
        expect(hits(occ.mesh, floor, floor.clone().addScaledVector(toSun, 40))).toBe(false);
        // and a floor point 1 m beside the patch is shadowed (the walls stay closed)
        const side = floor.clone().add(new THREE.Vector3(-h.z, 0, h.x));
        expect(hits(occ.mesh, side, side.clone().addScaledVector(toSun, 40))).toBe(true);
      });
    }
  }
});

describe("CellSunOccluder.holeCount (vol10 c8 L2 probe)", () => {
  it("counts the holes of the last build: one for a sun-facing window, none for a sun behind it", () => {
    const b = new THREE.Box3(new THREE.Vector3(-4, 0, -3), new THREE.Vector3(4, 3, 3));
    const w = { centre: new THREE.Vector3(3.7, 1.5, 0), outward: new THREE.Vector3(1, 0, 0), halfSideM: 0.5 };
    expect(new CellSunOccluder(b, [w], new THREE.Vector3(1, 1, 0).normalize()).holeCount).toBe(1);
    expect(new CellSunOccluder(b, [w], new THREE.Vector3(-1, 1, 0).normalize()).holeCount).toBe(0);
  });
});
