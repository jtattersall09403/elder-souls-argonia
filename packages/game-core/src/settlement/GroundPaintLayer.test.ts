import { describe, expect, it } from "vitest";
import { GROUND_PAINT_SCHEMA_VERSION, type GroundPaintEntry } from "./groundPaint";
import * as THREE from "three";
import {
  areasTouch, buildPaintGroups, groundMoved, groundReady, paintBounds, paintGroups, replacePaint,
  retainPaint,
} from "./GroundPaintLayer";
import { groundArrivalsOf } from "./groundPaint";

const strip = (id: string, x: number): GroundPaintEntry => ({
  id, kind: "road", texture: "track_mud", edgeM: 1, peakAlpha: 0.75,
  polygonM: [[x, -2], [x + 20, -2], [x + 20, 2], [x, 2]],
});
const place = (id: string, x: number) => ({
  id, groundPaint: { schemaVersion: GROUND_PAINT_SCHEMA_VERSION, entries: [strip(`paint.${id}`, x)] },
});

describe("ground paint layer grouping (16k walk 5)", () => {
  // Claywater and Greenspring sit ~4.4 km apart; only Claywater's ground is decoded.
  const bundle = [place("claywater", 307), place("greenspring", 4700)];
  const groundAt = (x: number) => (x < 1000 ? 5 : null);

  it("groups by place: one surface per place, never one texture across places", () => {
    expect([...paintGroups(bundle).keys()]).toEqual(["claywater", "greenspring"]);
  });

  it("a place with refused paint drops only its own paint", () => {
    const old = { id: "old", groundPaint: { schemaVersion: 1, entries: [strip("paint.old", 0)] } };
    expect([...paintGroups([old, ...bundle]).keys()]).toEqual(["claywater", "greenspring"]);
  });

  it("builds a decoded place's paint while another place's ground is still undecoded", () => {
    const { built, waiting, missing } = buildPaintGroups(paintGroups(bundle).values(), groundAt, () => true);
    expect(built.map((b) => b.group.placeId)).toEqual(["claywater"]);
    expect(built[0].geometry.getAttribute("position").count).toBeGreaterThan(0);
    expect(waiting.map((g) => g.placeId)).toEqual(["greenspring"]);
    expect(missing).toEqual([]);
  });

  it("drops a group whose texture has no ground material instead of retrying it", () => {
    const { built, missing } = buildPaintGroups(paintGroups(bundle).values(), () => 5, () => false);
    expect(built).toEqual([]);
    expect(missing).toHaveLength(2);
  });
});

describe("ground paint waits for its ground by event, never by polling (16k walk 7)", () => {
  const groups = paintGroups([place("claywater", 307), place("greenspring", 4700)]);
  const claywater = paintBounds(groups.get("claywater")!);
  const greenspring = paintBounds(groups.get("greenspring")!);

  it("a ground arrival touches only the places inside it", () => {
    const chunk = [0, -700, 1403.8, 703.8] as const;   // the chunk under Claywater
    expect(areasTouch(chunk, claywater)).toBe(true);
    expect(areasTouch(chunk, greenspring)).toBe(false);
  });

  it("an out-of-range place is not ready (no surface build is paid) until its ground answers", () => {
    const near = (x: number) => (x < 1000 ? 5 : null);
    expect(groundReady(claywater, near)).toBe(true);
    expect(groundReady(greenspring, near)).toBe(false);
    expect(groundReady(greenspring, () => 2)).toBe(true);
  });

  it("a built surface is rebuilt only when the ground under it moved", () => {
    const { built } = buildPaintGroups([groups.get("claywater")!], () => 5, () => true);
    const geometry = built[0].geometry;
    expect(groundMoved(geometry, () => 5)).toBe(false);
    expect(groundMoved(geometry, () => 5.6)).toBe(true);    // a finer level arrived under it
    expect(groundMoved(geometry, () => null)).toBe(false);  // ground unloaded: keep it drawn
  });

  it("adapts a chunk store's arrivals to the area they cover", () => {
    let fire: ((grid: { meta: { originM: [number, number] }; nx: number; ny: number; metresPerSample: number }) => void) | null = null;
    const store = { onArrival: (l: typeof fire) => { fire = l; return () => { fire = null; }; } };
    const seen: (readonly number[])[] = [];
    const stop = groundArrivalsOf(store as never)((area) => seen.push(area));
    fire!({ meta: { originM: [100, 200] }, nx: 11, ny: 6, metresPerSample: 2 });
    expect(seen).toEqual([[100, 200, 120, 210]]);
    stop();
    expect(fire).toBeNull();
  });
});

describe("ground paint swap (review 2026-09-30: a requery never blanks the paint)", () => {
  const mesh = (key: string) => {
    const m = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial());
    m.userData.paintKey = key;
    return m;
  };

  it("keeps a kept key's mesh drawn until its replacement is added, drops a dropped key at once", () => {
    const group = new THREE.Group();
    const a = mesh("a"); const b = mesh("b");
    group.add(a, b);
    let freed = 0;
    a.geometry.addEventListener("dispose", () => { freed += 1; });
    retainPaint(group, new Set(["a"]));
    expect(group.children).toEqual([a]);   // b dropped, a still drawn
    expect(freed).toBe(0);
    const a2 = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial());
    replacePaint(group, "a", a2);
    expect(group.children).toEqual([a2]);
    expect(freed).toBe(1);
  });

  it("a second requery before the rebuild keeps one mesh per key", () => {
    const group = new THREE.Group();
    const old = mesh("a"); const newer = mesh("a");
    group.add(old, newer);
    retainPaint(group, new Set(["a"]));
    expect(group.children).toEqual([newer]);
    let materialFreed = 0;
    const shared = newer.material as THREE.Material;
    shared.addEventListener("dispose", () => { materialFreed += 1; });
    replacePaint(group, "a", new THREE.Mesh(new THREE.BufferGeometry(), shared)); // material reused
    expect(materialFreed).toBe(0);
    replacePaint(group, "a", null); // texture lost its material
    expect(group.children).toEqual([]);
  });
});
