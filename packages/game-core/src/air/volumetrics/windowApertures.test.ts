import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { cellCompassOffsetDeg, cellFloorLevels, clusterFloorLevels, storeyOf, ApertureFader, BEAM_FADE_S, MAX_WINDOW_BEAMS, interiorLightOf, rankApertures, SKY_FILL_SCALE, WindowBeams, brightestLampFloor, pluginWindowApertures, windowSkyLight, worldToCellDirection, BEAM_OVER_LAMP, lampsOverFloors, cellAmbientIrradiance } from "./windowApertures";
import { ALBEDO, beamInscatterPerM, interiorSkyInscatterPerM } from "./froxelGrid";
import { LAMP_HALO, lampPhase } from "./volumetricNodes";
import { colorFromRGB, INTERIOR_AMBIENT_SCALE, interiorAmbientShare, interiorCellLights } from "../../interior/interiorLoader";
import interiorLight from "./interiorLight.json";

describe("pluginWindowApertures", () => {
  it("reads the cell's placed window refs; none for an unknown cell", () => {
    const refs = { schemaVersion: 2 as const, cells: { A: { apertures: [{ centreM: [1, 2, 3], outward: [0, 0, -1], radiusM: 0.5 }], kind: "dwelling", volumeClass: "small" as const, humid: false, dust: "low" as const, floorMist: null } } };
    const w = pluginWindowApertures("A", refs);
    expect(w[0].centre.toArray()).toEqual([1, 2, 3]);
    expect(w[0].areaM2).toBeCloseTo(Math.PI * 0.25, 6);
    expect(pluginWindowApertures("B", refs)).toEqual([]);
  });
});

describe("interior light record (0112 §6)", () => {
  const published = readdirSync(new URL("../../../../../apps/world-studio/public/province/interiors/", import.meta.url))
    .filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();
  it("has a row for every published interior cell and none for a cell no longer published", () => {
    // a red here: run `python3 tooling/volumetrics/interior_light.py` (the cell was published without it)
    expect(Object.keys(interiorLight.cells).sort()).toEqual(published);
  });
  it("carries the plugin windows and a dust band per cell", () => {
    expect(pluginWindowApertures("KeebaHouseCrafter").length).toBe(5);
    expect(pluginWindowApertures("DawnstarBrinasHouse").length).toBe(4);
    for (const id of published) expect(["low", "medium", "high"]).toContain(interiorLightOf(id)?.dust);
  });
});

describe("cell compass (0112 §6)", () => {
  const bearing = (v: THREE.Vector3) => ((THREE.MathUtils.radToDeg(Math.atan2(v.x, -v.z)) % 360) + 360) % 360;
  it("turns the cell so its entrance faces the way the exterior door faces", () => {
    // arrival marker faces north (0) into the room, so the cell's door faces south (180); the exterior door faces east (90)
    expect(cellCompassOffsetDeg(90, 0)).toBeCloseTo(-90, 9);
    expect(cellCompassOffsetDeg(180, 0)).toBeCloseTo(0, 9);
    expect(cellCompassOffsetDeg(59, 233.95)).toBeCloseTo(-354.95 + 360, 9);
  });
  it("a world bearing b is the cell bearing b - offset", () => {
    const east = new THREE.Vector3(1, -0.5, 0);
    const d = worldToCellDirection(east, -90, new THREE.Vector3());
    expect(bearing(d)).toBeCloseTo(180, 6); // 90 - (-90)
    expect(d.y).toBeCloseTo(-0.5, 9);
    expect(bearing(worldToCellDirection(east, 0, new THREE.Vector3()))).toBeCloseTo(90, 6);
  });
  it("an east-facing window takes morning sun, a west one evening sun, a north one none at noon", () => {
    // cell compass = world compass; windows face E, W, N; light travels opposite the sun direction
    const w = [
      { centre: new THREE.Vector3(3, 1.5, 0), outward: new THREE.Vector3(1, 0, 0), areaM2: 1 },
      { centre: new THREE.Vector3(-3, 1.5, 0), outward: new THREE.Vector3(-1, 0, 0), areaM2: 1 },
      { centre: new THREE.Vector3(0, 1.5, -3), outward: new THREE.Vector3(0, 0, -1), areaM2: 1 },
    ];
    const lit = (sunTowards: THREE.Vector3) => {
      const beams = new WindowBeams(w, 8);
      const dir = sunTowards.clone().normalize().negate();
      beams.update(new THREE.Vector3(), dir, 1, new THREE.Color(1, 1, 1), new THREE.Vector3(0, 0.5, 0), all, 1);
      return beams.update(new THREE.Vector3(), dir, 1, new THREE.Color(1, 1, 1), new THREE.Vector3(0, 0.5, 0), all, 1)
        .filter((a) => a.direction.distanceTo(dir) < 1e-6).map((a) => a.position.x);
    };
    expect(lit(new THREE.Vector3(1, 0.3, 0.2))).toEqual([3]); // morning sun in the east-south-east
    expect(lit(new THREE.Vector3(-1, 0.3, 0.2))).toEqual([-3]); // evening sun in the west
    expect(lit(new THREE.Vector3(0, 1, 0.6))).toEqual([]); // noon sun high in the south: no pane faces it
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
    // no floor levels: one storey, so the near sun-facing upstairs pane leads
    expect(rankApertures(ws, v)).toEqual([0, 3, 2, 1]);
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

describe("floor levels", () => {
  const f = (y: number, areaM2 = 20) => ({ y, areaM2 });
  it("clusters floors within 0.3 m and drops tops under 4 m²", () => {
    expect(clusterFloorLevels([f(0), f(0.1), f(0.8, 2)])).toEqual([expect.closeTo(0.05, 6)]);
    expect(clusterFloorLevels([f(3.2), f(0), f(3.3), f(0.05)]).map((y) => +y.toFixed(3))).toEqual([0.025, 3.25]);
    // a mezzanine at 1.8 between two storeys
    expect(clusterFloorLevels([f(0), f(1.8, 6), f(3.5)])).toEqual([0, 1.8, 3.5]);
  });
  it("storeyOf: highest level at or below", () => {
    expect(storeyOf(1, [0, 3.5])).toBe(0);
    expect(storeyOf(3.6, [0, 3.5])).toBe(1);
    expect(storeyOf(-1, [0, 3.5])).toBe(-1);
  });
  it("cellFloorLevels reads up-facing opaque planes in the cell frame", () => {
    const g = new THREE.Group();
    g.position.set(100, 50, 0);
    const plane = (y: number, size: number, transparent = false) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent }));
      m.position.y = y;
      g.add(m);
    };
    plane(0, 6); plane(3, 5); plane(0.9, 1); plane(6, 6, true);
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(6, 6).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial());
    ceiling.position.y = 2.8; g.add(ceiling);
    expect(cellFloorLevels(g)).toEqual([0, 3]);
  });
});

describe("vol10 F3/F4/F7: the cell's own light feeds the medium", () => {
  const bundleOf = (cell: string) => JSON.parse(readFileSync(new URL(
    `../../../../../apps/world-studio/public/province/interiors/${cell}.json`, import.meta.url), "utf8"));
  // Keeba's levels: the arrival floor and the hearth's floor (the fire record stands on it, y 83.01)
  const keeba = bundleOf("KeebaHouseCrafter");
  const keebaFloors = [83.01, keeba.arrivalMarker.positionM[1]];
  const keebaUnit = BEAM_OVER_LAMP * brightestLampFloor(lampsOverFloors(interiorCellLights(keeba), keebaFloors, keeba.arrivalMarker.positionM[1]));

  it("F3: the beam unit comes from the record lamps (interiorCellLights), never the pi/4 fallback", () => {
    // the hearth light (fade 2.738) 0.32 m over the lower floor: pool at 1 m = 2.738 pi
    expect(keebaUnit).toBeCloseTo(3 * 2.738 * Math.PI, 2);
    expect(keebaUnit).toBeGreaterThan(3 * Math.PI / 4 * 2);
  });
  it("F4: mid-beam in-scatter (sky fill only) is over 2x a lamp halo at the same distance", () => {
    const dustSigma = 0.005; // Keeba's dust "low"
    const beam = beamInscatterPerM(keebaUnit * SKY_FILL_SCALE, dustSigma, 0);
    const lampI = 2.738 * Math.PI, d = 2;
    const halo = (lampI / (d * d)) * lampPhase(0) * Math.max(dustSigma, LAMP_HALO.high.sigmaFloorPerM) * ALBEDO;
    expect(beam).toBeGreaterThan(2 * halo);
  });
  it("F7: Mugsump's fog scatters its own ambient (radiance > 0 at mid-room), faces read by name", () => {
    const m = bundleOf("MugsumpHollowInt01");
    const irr = cellAmbientIrradiance(m.lighting.ambientCube, colorFromRGB(m.ambient.colorRGB),
      m.ambient.intensity * INTERIOR_AMBIENT_SCALE, interiorAmbientShare(0, false), new THREE.Color());
    const swapped = { ...m.lighting.ambientCube, py: m.lighting.ambientCube.ny, ny: m.lighting.ambientCube.py };
    const irr2 = cellAmbientIrradiance(swapped, new THREE.Color(), m.ambient.intensity * INTERIOR_AMBIENT_SCALE, 1, new THREE.Color());
    expect(irr2.g).toBeCloseTo(irr.g, 9);
    const midRoom = interiorSkyInscatterPerM(irr.g, 0.01); // dust "medium"
    expect(midRoom).toBeGreaterThan(0);
    expect(irr.r).toBeGreaterThan(0.3);
  });
});
