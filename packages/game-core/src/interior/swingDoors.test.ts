import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { candidateSets, SoundEventBus, type SoundEvent } from "@elder-souls/audio";
import fixture from "./__fixtures__/interior.fixture.json";
import type { ArchitectureAsset } from "../settlement/kit";
import type { SettlementDoor } from "../settlement/types";
import { isInteriorSwingDoor, isLoadDoor, parseInteriorBundle } from "./bundle";
import { instantiateInterior } from "./interiorLoader";
import { DoorTransition } from "./doorTransition";
import { DOOR_TEXT, doorLoadingText } from "./doors";
import {
  SWING_TEXT, SwingDoorController, buildSwingDoor, isSwingDoor, loadDoorsOf, swingLeafShapes,
  type ExteriorSwingDoor, type SwingDoorPose,
} from "./swingDoors";

/** A 1.37 m x 2.5 m x 0.18 m leaf whose asset pivot is mid-width, hinge at its -x edge (farmhouseanimdoor01's shape). */
function leafAsset(id: string): ArchitectureAsset {
  const geometry = new THREE.BoxGeometry(1.37, 2.5, 0.18).translate(0, 1.25, 0);
  return { id, levels: [[{ geometry, material: new THREE.MeshStandardMaterial(), localMatrix: new THREE.Matrix4(), triangles: 12 }]] };
}

const pose = (over: Partial<SwingDoorPose> = {}): SwingDoorPose => ({
  assetId: "vanilla:architecture/farmhouse/farmhouseanimdoor01", kit: "vanilla-farmhouse-int",
  positionM: [10, 0, 20], rotationDeg: [0, 0, 0], scale: 1,
  hinge: { pivotM: [-0.685, 1.25, 0], axis: [0, 1, 0], openAngleDeg: -92, openS: 1 },
  initiallyOpen: false, ...over,
});

const angleOf = (q: THREE.Quaternion) => THREE.MathUtils.radToDeg(2 * Math.acos(Math.min(1, Math.abs(q.w))));

function settle(c: SwingDoorController, seconds: number, press?: string) {
  c.update(1 / 60, (id) => id === press);
  for (let s = 0; s < seconds; s += 1 / 60) c.update(1 / 60, () => false);
}

describe("swing doors (16k walk 4)", () => {
  it("[E] toggles a swing door: state flips and the leaf matrix turns by openAngleDeg about the hinge, then back", () => {
    const door = buildSwingDoor("d1", pose(), leafAsset("a").levels[0]);
    const sounds: SoundEvent[] = [];
    const collider: boolean[] = [];
    const c = new SwingDoorController([door], {
      sounds: { emit: (e) => sounds.push(e) }, bodies: () => [],
      setColliderEnabled: (_d, on) => collider.push(on),
    });
    const farEdgeClosed = new THREE.Vector3(0.685, 1.25, 0).applyMatrix4(door.leaf.children[0].matrix)
      .applyMatrix4(door.leaf.matrix);
    c.update(1 / 60, (id) => id === "d1");
    expect(door.open).toBe(true);
    expect(door.moving).toBe(true);
    settle(c, 1.1);
    expect(door.moving).toBe(false);
    door.leaf.updateMatrix();
    expect(angleOf(door.leaf.quaternion)).toBeCloseTo(92, 3);
    // the hinge stays put, the far edge swings round it by 92 degrees
    expect(door.leaf.position.toArray()).toEqual([-0.685, 1.25, 0]);
    const farEdgeOpen = new THREE.Vector3(0.685, 1.25, 0).applyMatrix4(door.leaf.children[0].matrix)
      .applyMatrix4(door.leaf.matrix);
    const hinge = door.leaf.position;
    const a = farEdgeClosed.clone().sub(hinge).setY(0).normalize();
    const b = farEdgeOpen.clone().sub(hinge).setY(0).normalize();
    expect(THREE.MathUtils.radToDeg(a.angleTo(b))).toBeCloseTo(92, 3);
    expect(sounds.map((e) => e.type)).toEqual(["door.open"]);
    expect(collider).toEqual([false, true]);
    settle(c, 1.1, "d1");
    expect(door.open).toBe(false);
    expect(angleOf(door.leaf.quaternion)).toBeCloseTo(0, 3);
    expect(sounds.map((e) => e.type)).toEqual(["door.open", "door.close"]);
  });

  it("says door.open and door.close on the scene's SoundEventBus (review 5536a1d9: the studio passes its bus)", () => {
    const door = buildSwingDoor("d1", pose(), leafAsset("a").levels[0]);
    const bus = new SoundEventBus();
    const heard: SoundEvent[] = [];
    bus.subscribe((e) => heard.push(e));
    const c = new SwingDoorController([door], { sounds: bus, bodies: () => [], setColliderEnabled: () => {} });
    c.update(1 / 60, (id) => id === "d1");
    settle(c, 1.1);
    settle(c, 1.1, "d1");
    expect(heard.map((e) => [e.type, "source" in e ? e.source : null])).toEqual([["door.open", "d1"], ["door.close", "d1"]]);
    expect(candidateSets(heard[0])).toEqual(["door.open"]);
    expect(candidateSets(heard[1])).toEqual(["door.close", "door.open"]);
  });

  it("eases over the record's openS: half way through the time is half way round", () => {
    const door = buildSwingDoor("d1", pose({ hinge: { ...pose().hinge, openS: 0.6 } }), null);
    const c = new SwingDoorController([door], { bodies: () => [] });
    c.toggle(door);
    c.update(0.3, () => false);
    expect(THREE.MathUtils.radToDeg(Math.abs(door.angle))).toBeCloseTo(46, 3);
    c.update(0.3, () => false);
    expect(door.moving).toBe(false);
  });

  it("a body in the arc the leaf would sweep keeps the door put; the same body clear of it does not", () => {
    const door = buildSwingDoor("d1", pose(), leafAsset("a").levels[0]);
    // opening -92 about +y turns the leaf (hinge at x 9.315, pointing +x) toward +z
    const inArc = { x: 9.315 + 0.6, z: 20 + 0.6 };
    const behind = { x: 9.315 + 0.6, z: 20 - 0.9 };
    let bodies = [inArc];
    const c = new SwingDoorController([door], { bodies: () => bodies });
    expect(c.toggle(door)).toBe(false);
    expect(door.open).toBe(false);
    bodies = [behind];
    expect(c.toggle(door)).toBe(true);
  });

  it("offers Open when closed and Close when open, within reach only", () => {
    const door = buildSwingDoor("d1", pose(), null);
    const c = new SwingDoorController([door], { bodies: () => [] }, [0, 4000, 0]);
    expect(c.candidates(10.5, 20).map((x) => x.promptTextId)).toEqual([SWING_TEXT.open]);
    expect(c.candidates(20, 20)).toEqual([]);
    settle(c, 1.1, "d1");
    expect(c.candidates(10.5, 20).map((x) => x.promptTextId)).toEqual([SWING_TEXT.close]);
  });

  it("initiallyOpen (the reference's ONAM) starts the leaf open", () => {
    const door = buildSwingDoor("d1", pose({ initiallyOpen: true }), null);
    expect(door.open).toBe(true);
    expect(angleOf(door.leaf.quaternion)).toBeCloseTo(92, 3);
  });

  it("a frame the NIF does not animate stays put: only parts inside leafBoundsM turn (impwooddoorsingle01)", () => {
    const leafGeo = new THREE.BoxGeometry(1.37, 2.5, 0.18).translate(0, 1.25, 0);
    const wallGeo = new THREE.BoxGeometry(3.6, 4, 0.36).translate(0, 2, 0.5);
    const mat = new THREE.MeshStandardMaterial();
    const parts = [leafGeo, wallGeo].map((geometry) => ({ geometry, material: mat, localMatrix: new THREE.Matrix4(), triangles: 12 }));
    const door = buildSwingDoor("d1", pose({ hinge: { ...pose().hinge, leafBoundsM: [[-0.685, 0, -0.09], [0.685, 2.5, 0.09]] } }), parts);
    expect(door.leaf.children.length).toBe(1);
    expect(door.frame.length).toBe(1);
    expect(door.frame[0].parent).toBe(door.object);
    const c = new SwingDoorController([door], { bodies: () => [] });
    settle(c, 1.1, "d1");
    expect(door.frame[0].matrix.equals(new THREE.Matrix4())).toBe(true);
    expect(angleOf(door.leaf.quaternion)).toBeCloseTo(92, 3);
  });

  it("leaf colliders are the drawn triangles in the leaf frame (hinge at the origin)", () => {
    const door = buildSwingDoor("d1", pose(), leafAsset("a").levels[0]);
    const [shape] = swingLeafShapes(door);
    let minX = Infinity;
    for (let i = 0; i < shape.vertices.length; i += 3) minX = Math.min(minX, shape.vertices[i]);
    expect(minX).toBeCloseTo(0, 5);
  });
});

describe("swing doors in the interior bundle", () => {
  it("parses the fixture's swing entry beside its load door and draws it under the cell group", () => {
    const b = parseInteriorBundle(structuredClone(fixture), "fixture");
    expect(b.doors.filter(isLoadDoor).length).toBe(1);
    const swing = b.doors.filter(isInteriorSwingDoor);
    expect(swing.map((d) => d.id)).toEqual(["fixture.hut-int.00000A05"]);
    const ids = [...b.placements.map((p) => p.assetId), ...swing.map((d) => d.assetId)];
    const kits = new Map([["fixture-int-v1", new Map(ids.map((id) => [id, leafAsset(id)] as const))]]);
    const cell = instantiateInterior(b, kits);
    expect(cell.swingDoors.map((d) => d.id)).toEqual(["fixture.hut-int.00000A05"]);
    expect(cell.swingDoors[0].object.parent).toBe(cell.group);
    // the swing door is not a placement: nothing of it is instanced as static geometry
    expect(b.placements.some((p) => p.assetId === swing[0].assetId)).toBe(false);
  });

  it("refuses a swing entry with a bad hinge, and an entry with no doorType", () => {
    const bad = structuredClone(fixture) as { doors: Record<string, unknown>[] };
    (bad.doors[1].hinge as Record<string, unknown>).axis = [0, 2, 0];
    expect(() => parseInteriorBundle(bad, "x")).toThrow(/swing door 1 malformed: bad hinge/);
    const untyped = structuredClone(fixture) as { doors: Record<string, unknown>[] };
    delete untyped.doors[0].doorType;
    expect(() => parseInteriorBundle(untyped, "x")).toThrow(/doorType undefined is neither load nor swing/);
  });
});

describe("exterior swing doors: a place's compiled doors[]", () => {
  const load: SettlementDoor = {
    id: "door.p.1", settlementId: "place.p", parcelId: "parcel.p.house", thresholdM: [10, 20], facingDeg: 0,
    interiorClaim: { tier: "A", cellId: "fixture.hut-int" },
  };
  const gate: ExteriorSwingDoor = {
    id: "door.p.2", settlementId: "place.p", parcelId: "parcel.p.stable", thresholdM: [30, 20], facingDeg: 90,
    doorType: "swing", swing: pose({ positionM: [30, 0, 20] }),
  };

  it("a synthetic swing record takes the swing path and toggles; the load door is untouched by it", () => {
    const doors: SettlementDoor[] = [load, gate];
    expect(doors.filter(isSwingDoor).map((d) => d.id)).toEqual(["door.p.2"]);
    expect(loadDoorsOf(doors).map((d) => d.id)).toEqual(["door.p.1"]);
    // decision 0114: a hollow shell's door never reaches the load path (no prompt)
    const hollow = { ...load, id: "door.p.3", doorType: "hollow", interiorClaim: { tier: "none" } } as SettlementDoor;
    expect(loadDoorsOf([load, hollow]).map((d) => d.id)).toEqual(["door.p.1"]);
    const built = doors.filter(isSwingDoor).map((d) => buildSwingDoor(d.id, d.swing, null));
    const c = new SwingDoorController(built, { bodies: () => [] });
    expect(c.candidates(10, 20)).toEqual([]);          // at the load door: nothing from the swing path
    settle(c, 1.1, "door.p.1");
    expect(built[0].open).toBe(false);                   // a press meant for the load door moves nothing
    settle(c, 1.1, "door.p.2");
    expect(built[0].open).toBe(true);
  });

  it("the load-door transition never offers a swing door (no closed line on a gate)", () => {
    const t = new DoorTransition({
      controller: {
        position: (out: THREE.Vector3) => out.set(30, 1, 20), teleport: () => undefined,
        faceDirection: () => undefined, releaseFacing: () => undefined, setLinearVelocity: () => undefined,
      },
      interiors: { request: () => new Promise(() => undefined), ready: () => undefined, failure: () => undefined },
      bodyCentreHeightM: 0.9, groundAt: () => 0, showInterior: () => undefined, showExterior: () => undefined,
    });
    t.setDoors([load, gate]);
    t.update(1 / 60, false);
    expect(t.candidate).toBeNull();
    expect(t.prompt).toBeNull();
  });
});

describe("the loading line names what is entered (walk 4)", () => {
  const rig = (door: SettlementDoor) => {
    const t = new DoorTransition({
      controller: {
        position: (out: THREE.Vector3) => out.set(door.thresholdM[0], 1, door.thresholdM[1]), teleport: () => undefined,
        faceDirection: () => undefined, releaseFacing: () => undefined, setLinearVelocity: () => undefined,
      },
      interiors: { request: () => new Promise(() => undefined), ready: () => undefined, failure: () => undefined },
      bodyCentreHeightM: 0.9, groundAt: () => 0, showInterior: () => undefined, showExterior: () => undefined,
    });
    t.setDoors([door]);
    t.update(1 / 60, true);
    for (let i = 0; i < 60; i++) t.update(1 / 60, false);   // faded to black, the cell never arrives
    return t;
  };
  const base: SettlementDoor = {
    id: "door.p.1", settlementId: "place.p", parcelId: "parcel.p.house", thresholdM: [10, 20],
    interiorClaim: { tier: "A", cellId: "fixture.hut-int" },
  };

  it("with the door's display name: the named template, filled", () => {
    const t = rig({ ...base, displayName: "the Poler's Hut" } as SettlementDoor);
    expect(t.loadingTextId).toBe(DOOR_TEXT.loadingNamed);
    expect(t.loadingName).toBe("the Poler's Hut");
    expect(doorLoadingText("Loading {name}…", t.loadingName)).toBe("Loading the Poler's Hut…");
  });

  it("without one: the plain line", () => {
    const t = rig(base);
    expect(t.loadingTextId).toBe(DOOR_TEXT.loading);
    expect(t.loadingName).toBeNull();
    expect(doorLoadingText("Loading…", t.loadingName)).toBe("Loading…");
  });
});
