import { describe, expect, it } from "vitest";
import { GROUND_PAINT_SCHEMA_VERSION, type GroundPaintEntry } from "./groundPaint";
import * as THREE from "three";
import { buildPaintGroups, paintGroups, replacePaint, retainPaint } from "./GroundPaintLayer";

const strip = (id: string, x: number): GroundPaintEntry => ({
  id, kind: "road", texture: "bc_road", edgeM: 1,
  polygonM: [[x, -2], [x + 20, -2], [x + 20, 2], [x, 2]],
});
const place = (id: string, x: number) => ({
  id, groundPaint: { schemaVersion: GROUND_PAINT_SCHEMA_VERSION, entries: [strip(`paint.${id}`, x)] },
});

describe("ground paint layer grouping (16k walk 5)", () => {
  // Claywater and Greenspring sit ~4.4 km apart; only Claywater's ground is decoded.
  const bundle = [place("claywater", 307), place("greenspring", 4700)];
  const groundAt = (x: number) => (x < 1000 ? 5 : null);

  it("groups by (place, texture), never one texture across places", () => {
    expect([...paintGroups(bundle).keys()]).toEqual(["claywater|bc_road", "greenspring|bc_road"]);
  });

  it("builds a decoded place's paint while another place's ground is still undecoded", () => {
    const { built, waiting, missing } = buildPaintGroups(paintGroups(bundle).values(), groundAt, () => 4);
    expect(built.map((b) => b.group.placeId)).toEqual(["claywater"]);
    expect(built[0].geometry.getAttribute("position").count).toBeGreaterThan(0);
    expect(waiting.map((g) => g.placeId)).toEqual(["greenspring"]);
    expect(missing).toEqual([]);
  });

  it("drops a group whose texture has no ground material instead of retrying it", () => {
    const { built, missing } = buildPaintGroups(paintGroups(bundle).values(), () => 5, () => undefined);
    expect(built).toEqual([]);
    expect(missing).toHaveLength(2);
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
