import { existsSync, readFileSync } from "node:fs";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/interior.fixture.json";
import type { ArchitectureAsset } from "../settlement/kit";
import type { SettlementDoor } from "../settlement/types";
import { isInteriorSwingDoor, parseInteriorBundle, type Vec3 } from "./bundle";
import { daylightShare, INTERIOR_LIGHT_INTENSITY_PER_FADE, INTERIOR_NIGHT_AMBIENT, InteriorDaylight, InteriorLoader, isWindowPane, type LoadedInterior, WINDOW_LIGHT_CANDELA, WINDOW_OVERCAST_SHARE } from "./interiorLoader";
import { FIXTURE_LIGHTS_MAX, FixtureLightField } from "../render/fixtureLights/fixtureLightField";
import { LIGHTS_CAP } from "../settlement/lighting";
import { DOOR_FADE_S, DoorTransition, RETURN_LIFT_M } from "./doorTransition";
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

/** Hosts over a bundle whose kits publish a part for every id `assetsOf(kit)` names (kitParts.ts). */
function partsHosts(bundle: unknown, assetsOf: (kitId: string) => string[]) {
  const fetched: string[] = [];
  const partsLoaded: string[] = [];
  const hosts = {
    fetchJson: async (url: string) => {
      fetched.push(url);
      const kit = /kits\/(.+)\/parts\/index\.json$/.exec(url)?.[1];
      if (!kit) return structuredClone(bundle);
      // the cell's fire rows: the published parts index's (schema 3)
      const published = new URL(`../../../../apps/world-studio/public/kits/${kit}/parts/index.json`, import.meta.url);
      const fires = existsSync(published) ? JSON.parse(readFileSync(published, "utf8")).fires : {};
      return {
        schemaVersion: 4, kit, source: { bytes: 0, sha256: "" }, packed: { bytes: 0, sha256: "" }, fires,
        assets: Object.fromEntries(assetsOf(kit).map((id) => [id, { file: `${encodeURIComponent(id)}.glb`, bytes: 0, vertices: 0, triangles: 0, lods: [{ lod: 0, vertices: 0, triangles: 0 }], textures: [] }])),
      };
    },
    loadPart: async (_kit: unknown, assetId: string, url: string) => {
      partsLoaded.push(url);
      return new Map([[assetId, asset(assetId)] as const]);
    },
  };
  return { hosts, fetched, partsLoaded };
}

/** Every asset id a bundle draws (placements, stand-ins, swing doors): the kit publishes a part for each. */
function bundleAssets(bundle: unknown): string[] {
  const b = bundle as { placements: { assetId: string }[]; substitutions?: { standInAsset: string }[]; doors: { assetId?: string }[] };
  return [...b.placements.map((p) => p.assetId), ...(b.substitutions ?? []).map((x) => x.standInAsset),
    ...b.doors.flatMap((d) => (d.assetId ? [d.assetId] : []))];
}

function fixtureLoader(bundle: unknown = fixture, published: string[] = bundleAssets(fixture)) {
  const { hosts, fetched, partsLoaded } = partsHosts(bundle, () => published);
  const loader = new InteriorLoader("/base/", hosts);
  return { loader, fetched, partsLoaded };
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
  bundle: unknown = fixture, groundAt: (x: number, z: number) => number | null = () => 10) {
  const { loader, fetched } = fixtureLoader(bundle);
  const controller = fakeController(start);
  const shown: { cell: string | null; origin: Vec3 | null } = { cell: null, origin: null };
  const t = new DoorTransition({
    controller, interiors: loader, bodyCentreHeightM: BODY,
    groundAt,
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
    expect(() => parseInteriorBundle({ ...fixture, schemaVersion: 1 }, "x")).toThrow(/unsupported schemaVersion 1/);
    const bad = structuredClone(fixture);
    bad.placements[0].kit = "nowhere";
    expect(() => parseInteriorBundle(bad, "x")).toThrow(/not in the bundle's kits/);
  });
});

describe("interior bundle contract (the shared fixture)", () => {
  it("parses the fixture the exporter test reads: plugin, frame, refCount, exit door, pairings, light raw fields", () => {
    const b = parseInteriorBundle(structuredClone(fixture), "fixture");
    expect([b.plugin, b.shellAssetId, b.refCount]).toEqual(["Fixture.esp", null, 10]);
    expect(b.exitDoor).toMatchObject({ id: "fixture.hut-int.exit", refId: "00000A01" });
    expect(b.doors.filter((d) => d.doorType === "load")).toEqual([{ doorType: "load", interiorLoadDoorRef: "00000A01",
      loadDoor: { positionM: [0, 0, 3.5], yawDeg: 180 } }]);
    expect(b.lights.map((l) => [l.refId, l.fade, l.raw.xrdsUnits])).toEqual([
      ["00000B01", 1.5, null], ["00000B02", 1, -120.5]]);
    // acceptance (0103 decision 3): references = placements + drops
    // walk 4: plus the swing doors, which are doors[] entries and not placements
    expect(b.placements.length + b.drops.length + b.doors.filter((d) => d.doorType === "swing").length).toBe(b.refCount);
    expect(() => parseInteriorBundle({ ...structuredClone(fixture), shellAssetId: "s" }, "x")).toThrow(/shellAssetId is not null/);
  });

  it("refuses a schema 2 or 3 file and a load door carrying a per-place pairing", () => {
    for (const v of [2, 3]) {
      expect(() => parseInteriorBundle({ ...structuredClone(fixture), schemaVersion: v }, "x"))
        .toThrow(new RegExp(`unsupported schemaVersion ${v} \\(this runtime reads 4 only`));
    }
    const old = structuredClone(fixture) as { doors: Record<string, unknown>[] };
    old.doors[0].exteriorDoorId = "door.other-place.1";
    expect(() => parseInteriorBundle(old, "x")).toThrow(/load door 0 carries per-place field exteriorDoorId/);
  });

  it("refuses a malformed door pairing, a light without its fade field, a missing drops list", () => {
    const pairing = structuredClone(fixture) as { doors: unknown[] };
    pairing.doors = [{ doorType: "load", interiorLoadDoorRef: "00000A01" }];      // no loadDoor
    expect(() => parseInteriorBundle(pairing, "x")).toThrow(/load door 0 malformed/);
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
    const points = cell.daylight.cellLights;
    expect(points[0].intensity).toBeCloseTo(1.5 * INTERIOR_LIGHT_INTENSITY_PER_FADE);
    expect(points[1].intensity).toBeCloseTo(INTERIOR_LIGHT_INTENSITY_PER_FADE);
    // the field holds colour x intensity in the cell's first reserved slots
    const field = new FixtureLightField();
    cell.daylight.bind(field);
    const c = points[0].colour;
    expect(field.radianceOf(field.reservedSlot(0))).toEqual(
      [c.r, c.g, c.b].map((v) => Math.fround(v * points[0].intensity)));
  });

  it("a door transition between cells with different light counts leaves three's light list and the lit program key unchanged (0108 §1)", async () => {
    const one = structuredClone(fixture) as typeof fixture & Record<string, unknown>;
    one.cellId = "fixture.one";
    one.lights = one.lights.slice(0, 1);
    const two = structuredClone(fixture) as typeof fixture & Record<string, unknown>;
    two.lights = [...two.lights, { ...two.lights[0], refId: "extra" }];
    (two as Record<string, unknown>).lighting = { ...(two.lighting as object), directionalRGB: [77, 62, 55] };
    const a = await fixtureLoader(one).loader.request("fixture.one");
    const b = await fixtureLoader(two).loader.request("fixture.hut-int");
    expect([a.counts.lights, b.counts.lights]).toEqual([1, 3]);
    const keyOf = (cell: LoadedInterior) => {
      const lights: THREE.Light[] = [];
      cell.group.traverse((o) => { if ((o as THREE.Light).isLight) lights.push(o as THREE.Light); });
      // three's program key inputs: the count of each light type
      const n = (t: string) => lights.filter((l) => (l as unknown as Record<string, boolean>)[t]).length;
      return { point: n("isPointLight"), spot: n("isSpotLight"), dir: n("isDirectionalLight"),
        hemi: n("isHemisphereLight"), rect: n("isRectAreaLight"), shadow: lights.filter((l) => l.castShadow).length };
    };
    expect(keyOf(a)).toEqual(keyOf(b));
    expect(keyOf(a).point).toBe(0);
    // the record lights live in the field, carried across the transition
    const field = new FixtureLightField();
    a.daylight.bind(field);
    expect(field.reservedCount).toBe(1 + a.daylight.windows.length);
    a.daylight.unbind();
    b.daylight.bind(field);
    expect(field.reservedCount).toBe(3 + b.daylight.windows.length);
  });

  it("lights like the cell (walk 2 D2): radius as distance, decay 2 × the plugin falloff, the bundle's directional, no shadows", async () => {
    // KeebaHouseFisher's shipped lighting block and falloff, as published 2026-09-26.
    const keeba = structuredClone(fixture) as typeof fixture & Record<string, unknown>;
    (keeba as Record<string, unknown>).lighting = {
      ambientRGB: [44, 33, 27], directionalRGB: [77, 62, 55], fogNearRGB: [89, 95, 102], fogNearM: 4.836,
      fogFarM: 71.12, directionalFade: 0.0, fogClipM: 71.12, fogPower: 0.6, fogFarRGB: [23, 33, 22], fogMax: 1.0,
    };
    (keeba.lights[0] as Record<string, unknown>).falloffExponent = 1.0;
    (keeba.lights[1] as Record<string, unknown>).falloffExponent = 1.5;
    const { loader } = fixtureLoader(keeba);
    const cell = await loader.request("fixture.hut-int");
    const points = cell.daylight.cellLights;
    expect(points.map((l) => l.radiusM)).toEqual([6, 3]);
    expect(points.map((l) => l.decay)).toEqual([2, 3]);
    const field = new FixtureLightField();
    cell.daylight.bind(field);
    expect([0, 1].map((j) => field.decayOf(field.reservedSlot(j)))).toEqual([2, 3]);
    const dirs = cell.group.children.filter((c) => (c as THREE.DirectionalLight).isDirectionalLight) as THREE.DirectionalLight[];
    expect(dirs.length).toBe(1);
    expect(dirs[0].castShadow).toBe(false);
    expect(dirs[0].color.getHexString(THREE.SRGBColorSpace)).toBe("4d3e37");
    // the target travels with the cell, so the light points down wherever the cell is lifted to
    expect(dirs[0].target.parent).toBe(cell.group);
    expect(cell.group.children.some((c) => (c as THREE.HemisphereLight).isHemisphereLight)).toBe(false);
    const meshes = cell.group.children.filter((c) => (c as THREE.InstancedMesh).isInstancedMesh) as THREE.InstancedMesh[];
    expect(meshes.every((m) => !m.receiveShadow && !m.castShadow)).toBe(true);
    // a bundle with no lighting block and no falloff keeps decay 2 and its directional dark
    const plain = await fixtureLoader().loader.request("fixture.hut-int");
    expect(plain.daylight.cellLights.map((l) => l.decay)).toEqual([2, 2]);
    const plainDirs = plain.group.children.filter((c) => (c as THREE.DirectionalLight).isDirectionalLight) as THREE.DirectionalLight[];
    expect(plainDirs.map((d) => d.intensity)).toEqual([0]);
  });

  it("instantiates the fixture: 6 placements over 4 assets, 2 point lights, ambient and fog", async () => {
    const { loader, fetched, partsLoaded } = fixtureLoader();
    const cell = await loader.request("fixture.hut-int");
    // the bundle and the kit's parts index (which carries the fire rows), each once; never the kit manifest
    expect(fetched.sort()).toEqual(["/base/kits/fixture-int-v1/parts/index.json",
      "/base/province/interiors/fixture.hut-int.json"]);
    // one part per asset drawn (4 placed assets and the swing door), nothing else
    expect(partsLoaded.sort()).toEqual(["barrel", "bench", "doors/animdoor01", "floor", "wall"]
      .map((n) => `/base/kits/fixture-int-v1/parts/${encodeURIComponent(`fixture:${n}`)}.glb`));
    const meshes = cell.group.children.filter((c) => (c as THREE.InstancedMesh).isInstancedMesh) as THREE.InstancedMesh[];
    expect(meshes.length).toBe(4);
    expect(meshes.reduce((n, m) => n + m.count, 0)).toBe(6);
    expect(cell.daylight.cellLights.map((l) => l.radiusM)).toEqual([6, 3]);
    // schema 4: the cell's ambient cube is a LightProbe in place of the flat AmbientLight
    expect(cell.group.children.filter((c) => (c as THREE.LightProbe).isLightProbe).length).toBe(1);
    expect(cell.group.children.filter((c) => (c as THREE.AmbientLight).isAmbientLight).length).toBe(0);
    expect([cell.fog.near, cell.fog.far]).toEqual([4, 30]);
    expect(cell.solids.length).toBe(6);
    expect(cell.counts).toEqual({ placements: 6, substitutions: 0, meshes: 4, lights: 2, solids: 6, fires: 0 });
    // cached by cellId: a second request fetches nothing
    await loader.request("fixture.hut-int");
    expect(fetched.length).toBe(2);
  });
});

describe("InteriorLoader: a drawn asset with no published part", () => {
  it("fails the cell with a line naming the kit and asset, which the transition hands the overlay's red line", async () => {
    const ghost = structuredClone(fixture);
    ghost.placements[0].assetId = "fixture:ghost";
    const { t, loader, shown } = rig([door({})], undefined, undefined, ghost);
    await run(t, 0.1);
    await run(t, 3 * DOOR_FADE_S, true);
    expect(shown.cell).toBeNull();
    const line = "fixture-int-v1/fixture:ghost has no published part";
    expect(loader.failure("fixture.hut-int")?.message).toContain(line);
    expect(t.lastError?.message).toContain(line);    // InteriorDoors: overlay.setError(transition.lastError.message)
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
    expect(t.loadingTextId).toBeNull();
    await run(t, 3 * DOOR_FADE_S, true);
    expect(t.cellId).toBe("fixture.hut-int");
    expect(t.fade).toBe(1);
    expect(t.loadingTextId).toBe("text.door.loading");   // the line on the black (walk 4 c)
    controller.teleport({ x: 100, y: 0, z: 202.5 });   // gravity pulled the body down
    await run(t, 0.1);
    expect(controller.pos.y).toBeCloseTo(INTERIOR_SPACE_LIFT_M + BODY);
    expect(t.enterS).toBeNull();                        // the hold has not ended
    resident.now = true;
    await run(t, 2 * DOOR_FADE_S);
    expect(t.fade).toBe(0);
    expect(t.loadingTextId).toBeNull();
    expect(t.enterS).toBeGreaterThanOrEqual(0);         // the loader timer, press to reveal (F3)
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
    { doorType: "load", interiorLoadDoorRef: "LOAD1",
      loadDoor: { positionM: [-3, 0, 0], yawDeg: 270 } },
    { doorType: "load", interiorLoadDoorRef: "LOAD2",
      loadDoor: { positionM: [3, 0, 0], yawDeg: 90 } },
  ];
  // the pairing is each place door's own claim (0104), never the shared cell file
  const claim = (ref: string, x: number, yawDeg: number) => ({ tier: "A", cellId: "fixture.hut-int",
    interiorLoadDoorRef: ref, arrivalMarker: { positionM: [x, 0, 0] as Vec3, yawDeg } });
  const one = door({ id: "door.one", thresholdM: [96, 200], facingDeg: 270, interiorClaim: claim("LOAD1", -2, 90) });
  const two = door({ id: "door.two", thresholdM: [104, 200], facingDeg: 90, interiorClaim: claim("LOAD2", 2, 270) });

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

  it("a claim without a load door ref still arrives at its marker, and one without a marker at the bundle's", async () => {
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
      { doorType: "load", interiorLoadDoorRef: "UPPER", loadDoor: { positionM: [0, 0, 3], yawDeg: 180 } }] as unknown[] };
    const parsed = parseInteriorBundle(structuredClone(withClosed), "x");
    expect(parsed.doors[1]).toMatchObject({ interiorLoadDoorRef: "UPPER" });
    const bad = structuredClone(withClosed) as { doors: Record<string, unknown>[] };
    delete bad.doors[1].loadDoor;
    expect(() => parseInteriorBundle(bad, "x")).toThrow(/load door 1 malformed/);

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

  it("two places claim one cell: leaving returns to the door of the place entered from, at its ground (walk 4 b)", async () => {
    // Claywater (place.a, ground 10 m) and Greenspring (place.b, 4.4 km away,
    // ground -5 m) both claim the cell's load door 1, each in its own door
    // record; the shared cell file names neither.
    const a = door({ id: "door.a", settlementId: "place.a", thresholdM: [100, 200], facingDeg: 90,
      interiorClaim: { tier: "A", cellId: "fixture.hut-int", interiorLoadDoorRef: "LOAD1" } });
    const b = door({ id: "door.one", settlementId: "place.b", thresholdM: [4500, 1850], facingDeg: 270,
      interiorClaim: claim("LOAD1", -2, 90) });
    const ground = (x: number) => (x > 1000 ? -5 : 10);
    const { t, controller, shown } = rig([a, b], { x: 100.3, y: 10 + BODY, z: 200 }, undefined, twoDoor, ground);
    await run(t, 3 * DOOR_FADE_S, true);
    expect(shown.cell).toBe("fixture.hut-int");
    controller.teleport({ x: 100 - 3 + 0.4, y: INTERIOR_SPACE_LIFT_M + BODY, z: 200 });
    await run(t, 0.1);
    expect(t.candidate).toMatchObject({ id: "fixture.hut-int.exit-1" });
    await run(t, 3 * DOOR_FADE_S, true);
    expect(shown.cell).toBeNull();
    // door.a's threshold, 1 m outward east, standing on its ground
    expect(Math.hypot(controller.pos.x - 101, controller.pos.z - 200)).toBeLessThan(0.5);
    expect(controller.pos.y).toBeCloseTo(10 + BODY + RETURN_LIFT_M);
  });

  it("returns to the height recorded on entry at a deck threshold over the terrain, never below the ground", async () => {
    const deck = door({ id: "door.deck", settlementId: "place.a", thresholdM: [100, 200], facingDeg: 90 });
    const { t, controller } = rig([deck], { x: 100.3, y: 14 + BODY, z: 200 });   // deck 4 m over ground 10
    await run(t, 3 * DOOR_FADE_S, true);
    controller.teleport({ x: 100, y: INTERIOR_SPACE_LIFT_M + BODY, z: 203.3 });
    await run(t, 0.1);
    await run(t, 3 * DOOR_FADE_S, true);
    expect(controller.pos.y).toBeCloseTo(14 + BODY + RETURN_LIFT_M);
  });

  it("leaving by another door of the same place stands on that door's ground, not the entry height", async () => {
    const low = { ...one };
    const high = { ...two };
    const ground = (x: number) => (x < 100 ? 2 : 10);
    const { t, controller } = rig([low, high], { x: 104.3, y: 10 + BODY, z: 200 }, undefined, twoDoor, ground);
    await run(t, 3 * DOOR_FADE_S, true);
    controller.teleport({ x: 104 - 3 + 0.4, y: INTERIOR_SPACE_LIFT_M + BODY, z: 200 });
    await run(t, 0.1);
    await run(t, 3 * DOOR_FADE_S, true);
    expect(controller.pos.x).toBeCloseTo(95);
    expect(controller.pos.y).toBeCloseTo(2 + BODY + RETURN_LIFT_M);
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
    const sky = new THREE.Color(0.1, 0.2, 0.3);
    scene.background = sky;
    const clear = { color: new THREE.Color(0, 0, 0), alpha: 0 };
    const gl = {
      toneMappingExposure: 3,
      getClearColor: (t: THREE.Color) => t.copy(clear.color),
      getClearAlpha: () => clear.alpha,
      setClearColor: (c: THREE.Color, a = 1) => { clear.color.copy(c); clear.alpha = a; },
    };
    const inside = new InteriorEnvironment(scene, gl, cell);
    // walk 4 a: a Color background makes three clear on every render() call,
    // wiping the water pipeline's blit; the fog colour is the clear colour
    expect(scene.background).toBeNull();
    expect(clear.color.equals(cell.background)).toBe(true);
    expect(clear.alpha).toBe(1);
    expect(sun.visible).toBe(false);
    expect(scene.environment).toBeNull();
    expect(scene.fog).toBe(cell.fog);
    expect(gl.toneMappingExposure).toBe(inside.exposure);
    expect(cell.group.children.filter((c) => (c as THREE.Light).isLight).every((l) => l.visible)).toBe(true);
    gl.toneMappingExposure = 2.5;     // the sky rig wrote while inside
    inside.frame();
    inside.restore();
    expect(sun.visible).toBe(true);
    expect(scene.environment).toBe(env);
    expect(scene.fog).toBeNull();
    expect(gl.toneMappingExposure).toBe(2.5);
    expect(scene.background).toBe(sky);
    expect(clear.color.equals(new THREE.Color(0, 0, 0))).toBe(true);
    expect(clear.alpha).toBe(0);
  });
});

describe("loaded cell contract (walk 4 a): the owner's cells draw around the arrival, inside the fog", () => {
  for (const cellId of ["KeebaHouseFisher", "KeebaHouseCrafter", "DawnstarBrinasHouse"]) {
    it(cellId, async () => {
      const raw = JSON.parse(readFileSync(new URL(
        `../../../../apps/world-studio/public/province/interiors/${cellId}.json`, import.meta.url), "utf8"));
      const bundle = parseInteriorBundle(structuredClone(raw), "x");
      const { hosts, fetched, partsLoaded } = partsHosts(raw, (kit) => [...bundle.placements, ...(bundle.substitutions ?? [])]
        .filter((p) => p.kit === kit).map((p) => ("standInAsset" in p ? p.standInAsset : p.assetId) as string));
      const loader = new InteriorLoader("/base/", hosts);
      const cell = await loader.request(cellId);
      const assets = new Set([...cell.bundle.placements, ...(cell.bundle.substitutions ?? [])]
        .map((p) => `${p.kit}|${"standInAsset" in p ? p.standInAsset : p.assetId}`));
      expect(cell.counts.meshes).toBe(assets.size);            // one InstancedMesh per (asset, part)
      // exactly the drawn assets are fetched, one part each, and no whole kit
      expect(partsLoaded.length).toBe(assets.size);
      expect(new Set(partsLoaded).size).toBe(assets.size);
      expect(fetched.filter((u) => u.endsWith("index.json")).length).toBe(Object.keys(cell.bundle.kits).length);
      expect([...fetched, ...partsLoaded].some((u) => /kits\/[^/]+\.glb$/.test(u))).toBe(false);
      const box = new THREE.Box3();
      for (const child of cell.group.children) if (child !== cell.fire?.group) box.expandByObject(child);
      const [ax, ay, az] = cell.bundle.arrivalMarker.positionM;
      expect(ax).toBeGreaterThan(box.min.x); expect(ax).toBeLessThan(box.max.x);
      expect(az).toBeGreaterThan(box.min.z); expect(az).toBeLessThan(box.max.z);
      expect(ay).toBeGreaterThanOrEqual(box.min.y - 0.5);
      const extent = box.getSize(new THREE.Vector3()).length();
      expect(cell.fog.far).toBeGreaterThan(extent);
      expect(cell.fog.near).toBeLessThan(cell.fog.far);
    });
  }
});

describe("interior fires (16k walk 5): the hut hearth burns a flame, not only a glow", () => {
  it("KeebaHouseFisher: its floor-hearth fxfirewithembers01 burns a brazier bed and its lantern candles burn, under the cell group", async () => {
    const raw = JSON.parse(readFileSync(new URL(
      "../../../../apps/world-studio/public/province/interiors/KeebaHouseFisher.json", import.meta.url), "utf8"));
    const bundle = parseInteriorBundle(structuredClone(raw), "x");
    const { hosts, fetched } = partsHosts(raw, (kit) => [...bundle.placements, ...(bundle.substitutions ?? [])]
      .filter((p) => p.kit === kit).map((p) => ("standInAsset" in p ? p.standInAsset : p.assetId) as string));
    const cell = await new InteriorLoader("/base/", hosts).request("KeebaHouseFisher");
    // the fire rows come from the parts indexes: no kit manifest is fetched
    expect(fetched.filter((u) => u.endsWith(".kit.json"))).toEqual([]);
    expect(cell.fire).not.toBeNull();
    expect(cell.fire!.group.parent).toBe(cell.group);
    const presets = cell.fire!.emitters.map((e) => e.preset);
    expect(presets).toContain("brazier");
    expect(cell.counts.fires).toBe(cell.fire!.emitters.length);
    expect(cell.fire!.flameInstances).toBeGreaterThan(0);
    // the brazier bed stands on the hearth placement's base
    const hearth = bundle.placements.find((p) => p.assetId === "vanilla:effects/fxfirewithembers01")!;
    const bed = cell.fire!.emitters.find((e) => e.preset === "brazier")!;
    expect(bed.position.distanceTo(new THREE.Vector3(...hearth.positionM))).toBeLessThan(0.1);
    // strength 1 at any hour: every flame instance burns after the first frame
    cell.fire!.update(1, () => 1);
    for (let i = 0; i < cell.fire!.flameInstances; i++) expect(cell.fire!.flameIntensity(i)).toBe(1);
  });

  it("a decal material from an interior part gets the settlement depth bias", async () => {
    const { instantiateInterior } = await import("./interiorLoader");
    const b = parseInteriorBundle(structuredClone(fixture), "fixture");
    const p = b.placements[0];
    const decal = new THREE.MeshStandardMaterial(); decal.userData = { decal: true };
    const g = new THREE.BoxGeometry(1, 1, 1);
    const decalAsset: ArchitectureAsset = { id: p.assetId, levels: [[
      { geometry: g, material: decal, localMatrix: new THREE.Matrix4(), triangles: 12 }]] };
    const ids = new Set([...b.placements, ...b.doors.filter(isInteriorSwingDoor)].map((q) => q.assetId));
    const kit = new Map([...ids].map((id) => [id, id === p.assetId ? decalAsset : asset(id)] as const));
    const cell = instantiateInterior(b, new Map([[p.kit, kit]]));
    expect(decal.polygonOffset).toBe(true);
    expect(decal.polygonOffsetFactor).toBeLessThan(0);
    expect(decal.depthWrite).toBe(false);
    const drawn = cell.group.children.find((c) => (c as THREE.InstancedMesh).material === decal)!;
    expect(drawn.renderOrder).toBe(1);
  });

  it("a flame-card piece's cards are left undrawn; a piece with none keeps every part", async () => {
    const { instantiateInterior } = await import("./interiorLoader");
    const b = parseInteriorBundle(structuredClone(fixture), "fixture");
    const p = b.placements[0];
    const card = new THREE.MeshStandardMaterial(); card.name = "Flames02grant01:0.Mat";
    const coal = new THREE.MeshStandardMaterial(); coal.name = "L2_CoalsBase:0.Mat";
    const g = new THREE.BoxGeometry(1, 1, 1);
    const fireAsset: ArchitectureAsset = { id: p.assetId, levels: [[
      { geometry: g, material: card, localMatrix: new THREE.Matrix4(), triangles: 12 },
      { geometry: g, material: coal, localMatrix: new THREE.Matrix4(), triangles: 12 }]] };
    const ids = new Set([...b.placements, ...b.doors.filter(isInteriorSwingDoor)].map((q) => q.assetId));
    const kit = new Map([...ids].map((id) => [id, id === p.assetId ? fireAsset : asset(id)] as const));
    const kits = new Map([[p.kit, kit]]);
    const plain = instantiateInterior(b, kits);
    const rows = new Map([[p.kit, new Map([[p.assetId, {
      id: "vanilla:effects/fxfirewithembers01", category: "effect", anchorClass: "fx",
      sizeM: [1.073, 1.073, 0.936], originOffsetM: [0.537, 0.536, 0.003], flameCardMaterials: [card.name],
    }]])]]);
    const lit = instantiateInterior(b, kits, rows);
    expect(plain.fire).toBeNull();
    expect(lit.counts.meshes).toBe(plain.counts.meshes - 1);
    const drawn = lit.group.children.filter((c): c is THREE.InstancedMesh => (c as THREE.InstancedMesh).isInstancedMesh);
    expect(drawn.some((m) => m.material === card)).toBe(false);
    expect(drawn.some((m) => m.material === coal)).toBe(true);
    expect(lit.fire!.emitters.map((e) => e.preset)).toEqual(
      b.placements.filter((q) => q.assetId === p.assetId).map(() => "brazier"));
  });
});

describe("interior daylight (walk 9, 0109 addendum)", () => {
  const pane = () => {
    const m = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
    m.name = "Objekt01:1.Mat";
    return m;
  };
  it("a pane is a material the manifest marks as window glass, never an emitter alone", () => {
    expect(isWindowPane({ windowMaterials: ["Objekt01:1.Mat"] }, pane())).toBe(true);
    // honeycomb, slime: emitting, not glass
    expect(isWindowPane({ emissiveMaterials: ["Objekt01:1.Mat"] } as never, pane())).toBe(false);
    expect(isWindowPane({}, pane())).toBe(false);
  });
  it("night keeps the ambient floor and no window light; noon lights the panes in the sun's colour", () => {
    const ambient = new THREE.AmbientLight(0xffffff, 2);
    const m = pane();
    const group = new THREE.Group();
    group.position.set(100, -4000, 50);
    const field = new FixtureLightField();
    const d = new InteriorDaylight(group, ambient, null, [m], [new THREE.Vector3(1, 2, 3)]);
    d.bind(field);
    const slot = field.reservedSlot(0);
    const sun = new THREE.Color(1, 0.9, 0.8);
    d.set(daylightShare(-0.2), sun);
    expect(ambient.intensity).toBeCloseTo(2 * INTERIOR_NIGHT_AMBIENT, 6);
    expect([field.radianceOf(slot)[0], m.emissive.r]).toEqual([0, 0]);
    expect(m.emissiveMap).toBe(m.map);
    d.set(daylightShare(Math.PI / 3), sun);
    expect(ambient.intensity).toBeCloseTo(2, 6);
    expect(field.radianceOf(slot)[0]).toBeCloseTo(WINDOW_LIGHT_CANDELA, 5);
    expect(field.radianceOf(slot)[1]).toBeCloseTo(0.9 * WINDOW_LIGHT_CANDELA, 5);
    expect(daylightShare(Math.PI / 12)).toBeCloseTo(Math.sin(Math.PI / 12) / 0.5, 6);
    // no three light per window: the field holds it, at the window's world position
    expect(group.children.some((c) => (c as THREE.Light).isLight)).toBe(false);
    const box = new THREE.Sphere(new THREE.Vector3(101, -3998, 53), 0.1);
    expect(field.selectFor(box, new Int32Array(8))).toBe(1);
    d.unbind();
    expect(field.count).toBe(0);
  });
  it("window lights sit in the scene's capped field beside the settlement's and never pass the cap", () => {
    const field = new FixtureLightField();
    const lamp = (x: number) => ({ position: new THREE.Vector3(x, 0, 0), radiusM: 5 });
    field.setLights(Array.from({ length: LIGHTS_CAP }, (_, i) => lamp(i)));
    expect(field.count).toBe(LIGHTS_CAP);
    const windows = Array.from({ length: 6 }, (_, i) => new THREE.Vector3(i, 10, 0));
    const d = new InteriorDaylight(new THREE.Group(), new THREE.AmbientLight(0xffffff, 1), null, [], windows);
    d.bind(field);
    expect(LIGHTS_CAP).toBe(FIXTURE_LIGHTS_MAX);
    expect([field.count, field.reservedCount]).toEqual([LIGHTS_CAP, 6]);
    // the settlement refresh keeps the windows' slots and takes what is left
    field.setLights(Array.from({ length: LIGHTS_CAP }, (_, i) => lamp(i)));
    expect(field.count).toBe(LIGHTS_CAP);
    expect(field.reservedSlot(0)).toBe(LIGHTS_CAP - 6);
    d.set(1, new THREE.Color(1, 1, 1));
    // a settlement slot past its share never writes over a window
    field.setIntensity(LIGHTS_CAP - 6, new THREE.Color(1, 0, 0), 99);
    expect(field.radianceOf(field.reservedSlot(0))).toEqual([WINDOW_LIGHT_CANDELA, WINDOW_LIGHT_CANDELA, WINDOW_LIGHT_CANDELA]);
    d.unbind();
    field.setLights(Array.from({ length: LIGHTS_CAP }, (_, i) => lamp(i)));
    expect([field.count, field.reservedCount]).toEqual([LIGHTS_CAP, 0]);
  });
  it("window daylight falls under overcast against a clear sky at the same hour", () => {
    const noon = Math.PI / 3;
    const clear = daylightShare(noon, 1);
    const overcast = daylightShare(noon, 0);
    expect(clear).toBe(1);
    expect(overcast).toBeCloseTo(WINDOW_OVERCAST_SHARE, 6);
    expect(daylightShare(noon, 0.3)).toBeLessThan(clear);
    expect(daylightShare(-0.1, 1)).toBe(0);
  });
});
