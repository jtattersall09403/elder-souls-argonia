import * as THREE from "three";
import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/interior.fixture.json";
import type { ArchitectureAsset } from "../settlement/kit";
import type { SettlementDoor } from "../settlement/types";
import { parseInteriorBundle, type Vec3 } from "./bundle";
import { INTERIOR_LIGHT_INTENSITY_PER_FADE, InteriorLoader, type LoadedInterior } from "./interiorLoader";
import { DOOR_FADE_S, DoorTransition } from "./doorTransition";
import { INTERIOR_SPACE_LIFT_M, cellsToPrefetch, doorAccess } from "./doors";
import { InteriorEnvironment } from "./interiorEnvironment";

const BODY = 0.9;

function asset(id: string): ArchitectureAsset {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  return { id, levels: [[{
    geometry, material: new THREE.MeshStandardMaterial(), localMatrix: new THREE.Matrix4(),
    triangles: geometry.index!.count / 3,
  }]] };
}

function fixtureLoader(bundle: unknown = fixture) {
  const fetched: string[] = [];
  const kitsLoaded: string[] = [];
  const loader = new InteriorLoader("/base/", {
    fetchJson: async (url) => { fetched.push(url); return structuredClone(bundle); },
    loadKit: async (kit, url) => {
      kitsLoaded.push(url);
      return new Map(["fixture:floor", "fixture:wall", "fixture:bench", "fixture:barrel"]
        .map((id) => [id, asset(id)] as const));
    },
  });
  return { loader, fetched, kitsLoaded };
}

function fakeController(start: { x: number; y: number; z: number }) {
  const pos = new THREE.Vector3(start.x, start.y, start.z);
  const facing = new THREE.Vector3();
  return {
    pos, facing,
    position: (out: THREE.Vector3) => out.copy(pos),
    teleport: (p: { x: number; y: number; z: number }) => { pos.set(p.x, p.y, p.z); },
    faceDirection: (d: THREE.Vector3) => { facing.copy(d); },
    releaseFacing: () => undefined,
    setLinearVelocity: () => undefined,
  };
}

const door = (over: Partial<SettlementDoor>): SettlementDoor => ({
  id: "door.test.a", settlementId: "place.test", parcelId: "parcel.test.a",
  thresholdM: [100, 200], facingDeg: 90,
  interiorClaim: { tier: "A", cellId: "fixture.hut-int" }, ...over,
});

function rig(doors: SettlementDoor[], start = { x: 100.5, y: 10 + BODY, z: 200 }, resident = { now: true },
  bundle: unknown = fixture) {
  const { loader, fetched } = fixtureLoader(bundle);
  const controller = fakeController(start);
  const shown: { cell: string | null; origin: Vec3 | null } = { cell: null, origin: null };
  const t = new DoorTransition({
    controller, interiors: loader, bodyCentreHeightM: BODY,
    groundAt: () => 10,
    showInterior: (i: LoadedInterior, o) => { shown.cell = i.bundle.cellId; shown.origin = o; },
    showExterior: () => { shown.cell = null; },
    interiorResident: () => resident.now,
  });
  t.setDoors(doors);
  return { t, controller, shown, fetched, loader };
}

/** Step the transition until it settles (loads resolve between steps). */
async function run(t: DoorTransition, seconds: number, press = false) {
  t.update(1 / 60, press);
  for (let s = 0; s < seconds; s += 1 / 60) {
    await Promise.resolve();
    t.update(1 / 60, false);
  }
}

describe("interior bundle", () => {
  it("refuses a bundle of another schema and a placement whose kit is not listed", () => {
    expect(() => parseInteriorBundle({ ...fixture, schemaVersion: 2 }, "x")).toThrow(/schemaVersion/);
    const bad = structuredClone(fixture);
    bad.placements[0].kit = "nowhere";
    expect(() => parseInteriorBundle(bad, "x")).toThrow(/not in the bundle's kits/);
  });
});

describe("interior bundle contract (the shared fixture)", () => {
  it("parses the fixture the exporter test reads: plugin, frame, refCount, exit door, pairings, light raw fields", () => {
    const b = parseInteriorBundle(structuredClone(fixture), "fixture");
    expect([b.plugin, b.shellAssetId, b.refCount]).toEqual(["Fixture.esp", "fixture:shell/hut01", 9]);
    expect(b.exitDoor).toMatchObject({ id: "fixture.hut-int.exit", refId: "00000A01" });
    expect(b.doors).toEqual([{ exteriorDoorId: "door.fixture.1", interiorLoadDoorRef: "00000A01",
      arrivalMarker: { positionM: [0, 0, 2.5], yawDeg: 0 }, loadDoor: { positionM: [0, 0, 3.5], yawDeg: 180 } }]);
    expect(b.lights.map((l) => [l.refId, l.fade, l.raw.xrdsUnits])).toEqual([
      ["00000B01", 1.5, null], ["00000B02", 1, -120.5]]);
    // acceptance (0103 decision 3): references = placements + drops
    expect(b.placements.length + b.drops.length).toBe(b.refCount);
    expect(parseInteriorBundle({ ...structuredClone(fixture), shellAssetId: null }, "x").shellAssetId).toBeNull();
  });

  it("refuses a malformed door pairing, a light without its fade field, a missing drops list", () => {
    const pairing = structuredClone(fixture) as { doors: unknown[] };
    pairing.doors = [{ exteriorDoorId: "door.x", interiorLoadDoorRef: "00000A01",
      arrivalMarker: { positionM: [0, 0, 2.5], yawDeg: 0 } }];      // no loadDoor
    expect(() => parseInteriorBundle(pairing, "x")).toThrow(/door pairing 0 malformed/);
    const light = structuredClone(fixture) as { lights: Record<string, unknown>[] };
    delete light.lights[0].fade;
    expect(() => parseInteriorBundle(light, "x")).toThrow(/light 0 malformed/);
    const drops = structuredClone(fixture) as Record<string, unknown>;
    delete drops.drops;
    expect(() => parseInteriorBundle(drops, "x")).toThrow(/no drops list/);
  });
});

describe("InteriorLoader", () => {
  it("a light's intensity is its fade times the one tuned constant (fade null reads 1)", async () => {
    const nullFade = structuredClone(fixture);
    (nullFade.lights[1] as { fade: number | null }).fade = null;
    const { loader } = fixtureLoader(nullFade);
    const cell = await loader.request("fixture.hut-int");
    const points = cell.group.children.filter((c) => (c as THREE.PointLight).isPointLight) as THREE.PointLight[];
    expect(points[0].intensity).toBeCloseTo(1.5 * INTERIOR_LIGHT_INTENSITY_PER_FADE);
    expect(points[1].intensity).toBeCloseTo(INTERIOR_LIGHT_INTENSITY_PER_FADE);
  });

  it("lights like the cell (walk 2 D2): radius as distance, decay 2 × the plugin falloff, the bundle's directional, no shadows", async () => {
    // KeebaHouseFisher's shipped lighting block and falloff, as published 2026-09-26.
    const keeba = structuredClone(fixture) as typeof fixture & Record<string, unknown>;
    keeba.lighting = {
      ambientRGB: [44, 33, 27], directionalRGB: [77, 62, 55], fogNearRGB: [89, 95, 102], fogNearM: 4.836,
      fogFarM: 71.12, directionalFade: 0.0, fogClipM: 71.12, fogPower: 0.6, fogFarRGB: [23, 33, 22], fogMax: 1.0,
    };
    (keeba.lights[0] as Record<string, unknown>).falloffExponent = 1.0;
    (keeba.lights[1] as Record<string, unknown>).falloffExponent = 1.5;
    const { loader } = fixtureLoader(keeba);
    const cell = await loader.request("fixture.hut-int");
    const points = cell.group.children.filter((c) => (c as THREE.PointLight).isPointLight) as THREE.PointLight[];
    expect(points.map((l) => l.distance)).toEqual([6, 3]);
    expect(points.map((l) => l.decay)).toEqual([2, 3]);
    expect(points.every((l) => !l.castShadow)).toBe(true);
    const dirs = cell.group.children.filter((c) => (c as THREE.DirectionalLight).isDirectionalLight) as THREE.DirectionalLight[];
    expect(dirs.length).toBe(1);
    expect(dirs[0].castShadow).toBe(false);
    expect(dirs[0].color.getHexString(THREE.SRGBColorSpace)).toBe("4d3e37");
    // the target travels with the cell, so the light points down wherever the cell is lifted to
    expect(dirs[0].target.parent).toBe(cell.group);
    expect(cell.group.children.some((c) => (c as THREE.HemisphereLight).isHemisphereLight)).toBe(false);
    const meshes = cell.group.children.filter((c) => (c as THREE.InstancedMesh).isInstancedMesh) as THREE.InstancedMesh[];
    expect(meshes.every((m) => !m.receiveShadow && !m.castShadow)).toBe(true);
    // a bundle with no lighting block and no falloff keeps decay 2 and adds no directional
    const plain = await fixtureLoader().loader.request("fixture.hut-int");
    const plainPoints = plain.group.children.filter((c) => (c as THREE.PointLight).isPointLight) as THREE.PointLight[];
    expect(plainPoints.map((l) => l.decay)).toEqual([2, 2]);
    expect(plain.group.children.some((c) => (c as THREE.DirectionalLight).isDirectionalLight)).toBe(false);
  });

  it("instantiates the fixture: 6 placements over 4 assets, 2 point lights, ambient and fog", async () => {
    const { loader, fetched, kitsLoaded } = fixtureLoader();
    const cell = await loader.request("fixture.hut-int");
    expect(fetched).toEqual(["/base/province/interiors/fixture.hut-int.json"]);
    expect(kitsLoaded).toEqual(["/base/kits/fixture-int-v1.glb"]);
    const meshes = cell.group.children.filter((c) => (c as THREE.InstancedMesh).isInstancedMesh) as THREE.InstancedMesh[];
    expect(meshes.length).toBe(4);
    expect(meshes.reduce((n, m) => n + m.count, 0)).toBe(6);
    const points = cell.group.children.filter((c) => (c as THREE.PointLight).isPointLight) as THREE.PointLight[];
    expect(points.map((l) => l.distance)).toEqual([6, 3]);
    expect(cell.group.children.filter((c) => (c as THREE.AmbientLight).isAmbientLight).length).toBe(1);
    expect([cell.fog.near, cell.fog.far]).toEqual([4, 30]);
    expect(cell.solids.length).toBe(6);
    expect(cell.counts).toEqual({ placements: 6, meshes: 4, lights: 2, solids: 6 });
    // cached by cellId: a second request fetches nothing
    await loader.request("fixture.hut-int");
    expect(fetched.length).toBe(1);
  });
});

describe("door access and streaming", () => {
  it("only a tier A claim with a cell opens; reserved and untiered doors are closed", () => {
    expect(doorAccess(door({}))).toEqual({ kind: "enter", cellId: "fixture.hut-int" });
    expect(doorAccess(door({ interiorStatus: "reserved" })).kind).toBe("closed");
    expect(doorAccess(door({ interiorClaim: { culture: "imperial", interiorRef: "x" } })).kind).toBe("closed");
    expect(doorAccess(door({ interiorClaim: null })).kind).toBe("closed");
  });

  it("prefetches tier A cells within 40 m and no others", () => {
    const doors = [door({}), door({ id: "far", thresholdM: [100, 260], interiorClaim: { tier: "A", cellId: "far.cell" } })];
    expect(cellsToPrefetch(doors, 100, 195)).toEqual(["fixture.hut-int"]);
    expect(cellsToPrefetch(doors, 100, 320)).toEqual([]);
  });
});

describe("DoorTransition", () => {
  it("moves the player to the arrival marker, and leaving returns 1 m outside the threshold", async () => {
    const { t, controller, shown } = rig([door({})]);
    await run(t, 0.1);
    expect(t.prompt).toMatchObject({ kind: "enter", textId: "text.door.prompt-enter" });
    await run(t, 3 * DOOR_FADE_S, true);
    expect(shown.cell).toBe("fixture.hut-int");
    expect(shown.origin).toEqual([100, INTERIOR_SPACE_LIFT_M, 200]);
    expect(t.cellId).toBe("fixture.hut-int");
    expect(controller.pos.x).toBeCloseTo(100);
    expect(controller.pos.y).toBeCloseTo(INTERIOR_SPACE_LIFT_M + BODY);
    expect(controller.pos.z).toBeCloseTo(202.5);
    expect(controller.facing.z).toBeCloseTo(-1);   // yawDeg 0 faces north (-z)
    expect(t.fade).toBe(0);

    controller.teleport({ x: 100, y: INTERIOR_SPACE_LIFT_M + BODY, z: 203.3 });
    await run(t, 0.1);
    expect(t.prompt).toMatchObject({ kind: "leave", textId: "text.door.prompt-leave" });
    await run(t, 3 * DOOR_FADE_S, true);
    expect(shown.cell).toBeNull();
    expect(t.cellId).toBeNull();
    // facingDeg 90 is east: 1 m outward along +x
    expect(Math.hypot(controller.pos.x - 101, controller.pos.z - 200)).toBeLessThan(0.5);
    expect(controller.pos.y).toBeGreaterThan(10 + BODY);
  });

  it("a reserved door shows the closed line and never transitions", async () => {
    const { t, controller, shown, fetched } = rig([door({ interiorStatus: "reserved" })]);
    await run(t, 3 * DOOR_FADE_S, true);
    expect(t.prompt).toMatchObject({ kind: "closed", textId: "text.door.closed" });
    expect(shown.cell).toBeNull();
    expect(t.fade).toBe(0);
    expect(controller.pos.x).toBeCloseTo(100.5);
    expect(fetched).toEqual([]);
  });

  it("holds at black on the arrival marker until the cell's colliders are resident", async () => {
    const resident = { now: false };
    const { t, controller } = rig([door({})], undefined, resident);
    await run(t, 3 * DOOR_FADE_S, true);
    expect(t.cellId).toBe("fixture.hut-int");
    expect(t.fade).toBe(1);
    controller.teleport({ x: 100, y: 0, z: 202.5 });   // gravity pulled the body down
    await run(t, 0.1);
    expect(controller.pos.y).toBeCloseTo(INTERIOR_SPACE_LIFT_M + BODY);
    resident.now = true;
    await run(t, 2 * DOOR_FADE_S);
    expect(t.fade).toBe(0);
  });

  it("opens a cell directly at its arrival marker (studio ?interior=)", async () => {
    const { t, controller, shown } = rig([]);
    t.openDirect("fixture.hut-int", { x: 50, y: 12, z: 60 });
    await run(t, 2 * DOOR_FADE_S);
    expect(shown.cell).toBe("fixture.hut-int");
    expect(controller.pos.z).toBeCloseTo(62.5);
    expect(t.fade).toBe(0);
  });
});

describe("DoorTransition: two exterior doors, one cell (owner ruling B)", () => {
  // Door 1 on the west wall, door 2 on the east wall. The cell's positioned
  // load door (the bundle's exitDoor) is load door 1.
  const twoDoor = structuredClone(fixture);
  twoDoor.exitDoor = { id: "fixture.hut-int.exit-1", refId: "LOAD1", positionM: [-3, 0, 0], yawDeg: 270 };
  twoDoor.doors = [
    { exteriorDoorId: "door.one", interiorLoadDoorRef: "LOAD1", arrivalMarker: { positionM: [-2, 0, 0], yawDeg: 90 },
      loadDoor: { positionM: [-3, 0, 0], yawDeg: 270 } },
    { exteriorDoorId: "door.two", interiorLoadDoorRef: "LOAD2", arrivalMarker: { positionM: [2, 0, 0], yawDeg: 270 },
      loadDoor: { positionM: [3, 0, 0], yawDeg: 90 } },
  ];
  const one = door({ id: "door.one", thresholdM: [96, 200], facingDeg: 270 });
  const two = door({ id: "door.two", thresholdM: [104, 200], facingDeg: 90 });

  it("entering by door 2 arrives at door 2's marker; leaving by load door 1 returns outside door 1", async () => {
    const { t, controller, shown } = rig([one, two], { x: 104.3, y: 10 + BODY, z: 200 }, undefined, twoDoor);
    await run(t, 3 * DOOR_FADE_S, true);
    expect(shown.origin).toEqual([104, INTERIOR_SPACE_LIFT_M, 200]);
    expect(controller.pos.x).toBeCloseTo(104 + 2);          // door 2's marker, not the bundle's
    expect(controller.pos.z).toBeCloseTo(200);
    expect(controller.facing.x).toBeCloseTo(-1);            // yaw 270 faces west

    controller.teleport({ x: 104 - 3 + 0.4, y: INTERIOR_SPACE_LIFT_M + BODY, z: 200 });
    await run(t, 0.1);
    expect(t.candidate).toMatchObject({ id: "fixture.hut-int.exit-1", kind: "door" });
    await run(t, 3 * DOOR_FADE_S, true);
    expect(shown.cell).toBeNull();
    // door 1's threshold (96, 200), 1 m outward along its facing (west)
    expect(controller.pos.x).toBeCloseTo(95);
    expect(controller.pos.z).toBeCloseTo(200);
  });

  it("entering by door 1 and leaving by load door 2 (its own loadDoor) returns outside door 2", async () => {
    const { t, controller, shown } = rig([one, two], { x: 96.3, y: 10 + BODY, z: 200 }, undefined, twoDoor);
    await run(t, 3 * DOOR_FADE_S, true);
    expect(controller.pos.x).toBeCloseTo(96 - 2);           // door 1's marker
    controller.teleport({ x: 96 + 3 - 0.4, y: INTERIOR_SPACE_LIFT_M + BODY, z: 200 });
    await run(t, 0.1);
    expect(t.candidate).toMatchObject({ id: "fixture.hut-int.exit.LOAD2", kind: "door" });
    await run(t, 3 * DOOR_FADE_S, true);
    expect(shown.cell).toBeNull();
    // door 2's threshold (104, 200), 1 m outward along its facing (east)
    expect(controller.pos.x).toBeCloseTo(105);
    expect(controller.pos.z).toBeCloseTo(200);
  });

  it("a door the bundle does not pair falls back to the claim's marker, then the bundle's", async () => {
    const claimed = door({ id: "door.three", thresholdM: [100, 200],
      interiorClaim: { tier: "A", cellId: "fixture.hut-int", arrivalMarker: { positionM: [1, 0, -1], yawDeg: 0 } } });
    const a = rig([claimed], undefined, undefined, twoDoor);
    await run(a.t, 3 * DOOR_FADE_S, true);
    expect([a.controller.pos.x, a.controller.pos.z]).toEqual([101, 199]);
    const b = rig([door({ id: "door.four" })], undefined, undefined, twoDoor);
    await run(b.t, 3 * DOOR_FADE_S, true);
    expect(b.controller.pos.z).toBeCloseTo(202.5);
  });

  it("a load door no exterior door pairs with is closed: the closed line, and pressing does nothing", async () => {
    const withClosed = { ...structuredClone(twoDoor), doors: [twoDoor.doors[0],
      { interiorLoadDoorRef: "UPPER", closed: true, loadDoor: { positionM: [0, 0, 3], yawDeg: 180 } }] as unknown[] };
    const parsed = parseInteriorBundle(structuredClone(withClosed), "x");
    expect(parsed.doors[1]).toMatchObject({ interiorLoadDoorRef: "UPPER", closed: true });
    const bad = structuredClone(withClosed) as { doors: Record<string, unknown>[] };
    delete bad.doors[1].loadDoor;
    expect(() => parseInteriorBundle(bad, "x")).toThrow(/door pairing 1 malformed/);

    const { t, controller, shown } = rig([one], { x: 96.3, y: 10 + BODY, z: 200 }, undefined,
      withClosed as unknown as typeof twoDoor);
    await run(t, 3 * DOOR_FADE_S, true);
    expect(shown.cell).toBe("fixture.hut-int");
    controller.teleport({ x: 96 + 0.3, y: INTERIOR_SPACE_LIFT_M + BODY, z: 200 + 3 });
    await run(t, 0.1);
    expect(t.prompt).toMatchObject({ kind: "closed", textId: "text.door.closed" });
    expect(t.candidate).toMatchObject({ id: "fixture.hut-int.exit.UPPER", promptTextId: "text.door.closed" });
    await run(t, 3 * DOOR_FADE_S, true);
    expect(shown.cell).toBe("fixture.hut-int");          // still inside
  });

  it("answers only the door the arbiter awards the press to", async () => {
    const { t, shown } = rig([door({})]);
    await run(t, 0.1);
    t.update(1 / 60, (id) => id === "someone.else");
    await run(t, 3 * DOOR_FADE_S);
    expect(shown.cell).toBeNull();
    t.update(1 / 60, (id) => id === "door.test.a");
    await run(t, 3 * DOOR_FADE_S);
    expect(shown.cell).toBe("fixture.hut-int");
  });
});

describe("InteriorEnvironment", () => {
  it("hides outside lights and the sky's exposure while inside, and puts them back", async () => {
    const { loader } = fixtureLoader();
    const cell = await loader.request("fixture.hut-int");
    const scene = new THREE.Scene();
    const sun = new THREE.DirectionalLight();
    const env = new THREE.Texture();
    scene.add(sun, cell.group);
    scene.environment = env;
    const gl = { toneMappingExposure: 3 };
    const inside = new InteriorEnvironment(scene, gl, cell);
    expect(sun.visible).toBe(false);
    expect(scene.environment).toBeNull();
    expect(scene.fog).toBe(cell.fog);
    expect(gl.toneMappingExposure).toBe(1);
    expect(cell.group.children.filter((c) => (c as THREE.Light).isLight).every((l) => l.visible)).toBe(true);
    gl.toneMappingExposure = 2.5;     // the sky rig wrote while inside
    inside.frame();
    inside.restore();
    expect(sun.visible).toBe(true);
    expect(scene.environment).toBe(env);
    expect(scene.fog).toBeNull();
    expect(gl.toneMappingExposure).toBe(2.5);
  });
});
