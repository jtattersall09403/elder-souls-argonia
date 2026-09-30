/**
 * The fixture light field (render/fixtureLights): the CPU lamp selection, the
 * per-draw slot matrix the lights node reads, the lighting install, and the
 * attenuation twin of three's point light. The GPU side (both backends,
 * against real PointLights) is the harness: settlement-night and
 * harness/bench.mjs (decision 0107 §7: no shader text is asserted here).
 */
import * as THREE from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { describe, expect, it } from "vitest";
import {
  FIXTURE_LIGHTS_MAX,
  FIXTURE_LIGHTS_PER_OBJECT,
  FixtureFieldLighting,
  FixtureFieldLightsNode,
  FixtureLightField,
  FixtureTiledLighting,
  fixtureAttenuation,
  fixtureLightFieldOf,
  fixtureLightingModeFor,
  installFixtureLighting,
  isFixtureLitMaterial,
} from "./fixtureLightField";

const lamps = (n: number, spacingM = 3, radiusM = 6) =>
  Array.from({ length: n }, (_, i) => ({ position: new THREE.Vector3(i * spacingM, 2, 0), radiusM }));

describe("FixtureLightField", () => {
  it("holds up to 100 lamps and 8 per object", () => {
    expect(FIXTURE_LIGHTS_MAX).toBe(100);
    expect(FIXTURE_LIGHTS_PER_OBJECT).toBe(8);
    const field = new FixtureLightField();
    field.setLights(lamps(130));
    expect(field.count).toBe(100);
  });

  it("every lit material receives it, classic or node; an unlit one does not", () => {
    const field = new FixtureLightField();
    expect(field.install(new THREE.MeshStandardMaterial())).toBe(true);
    expect(field.installed(new MeshStandardNodeMaterial())).toBe(true);
    expect(isFixtureLitMaterial(new THREE.MeshLambertMaterial())).toBe(true);
    expect(field.install(new THREE.MeshBasicMaterial())).toBe(false);
    const flame = new MeshStandardNodeMaterial();
    flame.lights = false;
    expect(isFixtureLitMaterial(flame)).toBe(false);
  });

  it("an object gets its 8 nearest lamps that reach its bounding sphere, nearest first", () => {
    const field = new FixtureLightField();
    // lamps at x = 0, 3, 6, ... 57, radius 6 m
    field.setLights(lamps(20));
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1), new THREE.MeshStandardMaterial());
    mesh.position.set(30, 2, 0); mesh.updateMatrixWorld();
    const { idx, count } = field.slotsOf(mesh);
    // reach: |x - 30| - 1 < 6 -> x in (23, 37): lamps 8..12
    expect(count).toBe(5);
    expect([...idx.slice(0, count)]).toEqual([10, 9, 11, 8, 12]);
    mesh.position.set(500, 0, 0); mesh.updateMatrixWorld();
    expect(field.slotsOf(mesh).count).toBe(0);
    // a big object near many lamps keeps only 8
    const big = new THREE.Mesh(new THREE.SphereGeometry(40), new THREE.MeshStandardMaterial());
    big.position.set(30, 2, 0); big.updateMatrixWorld();
    expect(field.slotsOf(big).count).toBe(8);
  });

  it("the draw's slot matrix holds the list and -1 past it (what the lights node loops)", () => {
    const field = new FixtureLightField();
    field.setLights(lamps(20));
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1), new THREE.MeshStandardMaterial());
    mesh.position.set(30, 2, 0); mesh.updateMatrixWorld();
    const e = field.slotMatrixFor(mesh, mesh.material).elements;
    expect(e.slice(0, 6)).toEqual([10, 9, 11, 8, 12, -1]);
    expect(e.slice(5).every((v) => v === -1)).toBe(true);
    // one uniform, updated per drawn object
    expect(field.slotsNode.updateType).toBe("object");
  });

  it("re-chooses a list only when the lamp set changes or the object moves", () => {
    const field = new FixtureLightField();
    field.setLights(lamps(4));
    const epoch = field.epoch;
    field.setLights(lamps(4));
    expect(field.epoch).toBe(epoch);
    field.setIntensity(0, new THREE.Color(1, 0.5, 0.25), 6);
    expect(field.epoch).toBe(epoch);
    expect(field.radianceOf(0)).toEqual([6, 3, 1.5]);
    field.setLights(lamps(5));
    expect(field.epoch).toBe(epoch + 1);
  });

  it("the point-light modes mirror the slots into hidden-when-dark PointLights (decay 2, no shadow)", () => {
    const scene = new THREE.Scene();
    const field = fixtureLightFieldOf(scene);
    field.setLights(lamps(3));
    field.setIntensity(1, new THREE.Color(1, 0.5, 0.25), 6);
    const group = field.usePointLights(scene);
    field.commit();
    expect(group.parent).toBe(scene);
    expect(group.children).toHaveLength(FIXTURE_LIGHTS_MAX);
    const on = group.children.filter((l) => l.visible) as THREE.PointLight[];
    expect(on).toHaveLength(1);
    expect([on[0].position.x, on[0].distance, on[0].decay, on[0].castShadow]).toEqual([3, 6, 2, false]);
    expect([on[0].color.r * on[0].intensity, on[0].color.g * on[0].intensity]).toEqual([6, 3]);
  });

  it("one field per scene, held on the scene and never JSON-copied", () => {
    const scene = new THREE.Scene();
    expect(fixtureLightFieldOf(scene)).toBe(fixtureLightFieldOf(scene));
    expect(fixtureLightFieldOf(new THREE.Scene())).not.toBe(fixtureLightFieldOf(scene));
    expect(Object.keys(scene.userData)).toEqual([]);
  });
});

describe("per-material list length", () => {
  it("a material may raise its objects' list to 16 (the terrain)", () => {
    const field = new FixtureLightField();
    field.setLights(lamps(30, 2, 6));
    const ground = new THREE.MeshStandardMaterial();
    ground.userData.esFixtureLightsPerObject = 16;
    const tile = new THREE.Mesh(new THREE.PlaneGeometry(117, 117).rotateX(-Math.PI / 2), ground);
    tile.position.set(30, 0, 0); tile.updateMatrixWorld();
    expect(field.slotMatrixFor(tile, ground).elements.filter((v) => v >= 0)).toHaveLength(16);
    expect(field.slotMatrixFor(tile, new THREE.MeshStandardMaterial()).elements.filter((v) => v >= 0)).toHaveLength(8);
  });
});

describe("lighting install", () => {
  const fakeRenderer = (webgpu: boolean) => ({
    backend: { isWebGPUBackend: webgpu },
    lighting: null as unknown,
    _renderLists: { lighting: null as unknown, disposed: 0, dispose() { this.disposed += 1; } },
  });

  it("the field lights node is per scene, always lit, over the scene's own field", () => {
    const lighting = new FixtureFieldLighting();
    const scene = new THREE.Scene();
    const node = lighting.getNode(scene) as FixtureFieldLightsNode;
    expect(node).toBeInstanceOf(FixtureFieldLightsNode);
    expect(lighting.getNode(scene)).toBe(node);
    expect(node.field).toBe(fixtureLightFieldOf(scene));
    expect(node.hasLights).toBe(true);
  });

  it("installs once per mode, drops the render lists once, and never tiles on WebGL", () => {
    const webgl = fakeRenderer(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(installFixtureLighting(webgl as any)).toBe("field");
    expect(webgl.lighting).toBeInstanceOf(FixtureFieldLighting);
    expect(webgl._renderLists.lighting).toBe(webgl.lighting);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    installFixtureLighting(webgl as any);
    expect(webgl._renderLists.disposed).toBe(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(installFixtureLighting(webgl as any, "tiled")).toBe("field");
    const webgpu = fakeRenderer(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(installFixtureLighting(webgpu as any)).toBe(fixtureLightingModeFor("webgpu"));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(installFixtureLighting(webgpu as any, "tiled")).toBe("tiled");
    expect(webgpu.lighting).toBeInstanceOf(FixtureTiledLighting);
  });
});

describe("attenuation", () => {
  it("is three's point light: inverse square, windowed to 0 at the radius", () => {
    expect(fixtureAttenuation(2, 0)).toBeCloseTo(0.25, 12);
    expect(fixtureAttenuation(6, 6)).toBe(0);
    expect(fixtureAttenuation(3, 6)).toBeCloseTo((1 / 9) * (1 - 1 / 16) ** 2, 12);
  });
});

describe("FixtureLightField.forEachLight", () => {
  it("visits the lamps in use with their radiance", () => {
    const field = new FixtureLightField();
    field.setLights(lamps(3));
    field.setIntensity(1, new THREE.Color(1, 0.5, 0.25), 2);
    const seen: number[][] = [];
    field.forEachLight((x, y, z, r, cr, cg, cb) => seen.push([x, y, z, r, cr, cg, cb]));
    expect(seen).toEqual([[0, 2, 0, 6, 0, 0, 0], [3, 2, 0, 6, 2, 1, 0.5], [6, 2, 0, 6, 0, 0, 0]]);
  });

  it("a pooled InstancedMesh refilled in place gets a fresh lamp list (review 2026-09-30)", () => {
    const field = new FixtureLightField();
    field.setLights([{ position: new THREE.Vector3(0, 0, 0), radiusM: 6 }]);
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial(), 1);
    mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(100, 0, 0));
    mesh.updateMatrixWorld(true);
    expect(field.slotsOf(mesh).count).toBe(0);
    // Groundcover's meshPool refill: same mesh, same world matrix, new instances
    mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(1, 0, 0));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.boundingSphere = null;
    expect(field.slotsOf(mesh).count).toBe(1);
  });
});
