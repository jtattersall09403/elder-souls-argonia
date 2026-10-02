import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  FIXTURE_LIGHTS_MAX, FIXTURE_LIGHTS_PER_OBJECT, FixtureLightField, fixtureLightFieldOf, isFixtureLitMaterial,
} from "./fixtureLightField";

const lamps = (n: number, spacingM = 3, radiusM = 6) =>
  Array.from({ length: n }, (_, i) => ({ position: new THREE.Vector3(i * spacingM, 2, 0), radiusM }));

/** What three hands onBeforeCompile for a MeshStandardMaterial. */
function compiled(material: THREE.Material): { fragment: string; key: string; uniforms: Record<string, unknown> } {
  const shader = {
    uniforms: {} as Record<string, THREE.IUniform>,
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
    defines: {},
  } as unknown as THREE.WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  return { fragment: shader.fragmentShader, key: material.customProgramCacheKey(), uniforms: shader.uniforms };
}

describe("FixtureLightField", () => {
  it("holds up to 100 lamps and 8 per object", () => {
    expect(FIXTURE_LIGHTS_MAX).toBe(100);
    expect(FIXTURE_LIGHTS_PER_OBJECT).toBe(8);
    const field = new FixtureLightField();
    field.setLights(lamps(130));
    expect(field.count).toBe(100);
  });

  it("the shader text and cache key are the same for 0, 5, 40 and 100 lamps: one program", () => {
    const field = new FixtureLightField();
    const material = new THREE.MeshStandardMaterial();
    field.install(material);
    const seen = new Set<string>();
    for (const n of [0, 5, 40, 100]) {
      field.setLights(lamps(n));
      const { fragment, key } = compiled(material);
      seen.add(`${key}\n${fragment}`);
      expect(fragment).toContain("esFxIdx");
      expect(fragment).toContain("getDistanceAttenuation( esFxD, esFxP.w, esFxC.a )");
    }
    expect(seen.size).toBe(1);
  });

  it("install is idempotent and survives a later hook overwrite (CSM)", () => {
    const field = new FixtureLightField();
    const material = new THREE.MeshStandardMaterial();
    expect(field.install(material)).toBe(true);
    const hook = material.onBeforeCompile;
    field.install(material);
    expect(material.onBeforeCompile).toBe(hook);
    const keyOnce = material.customProgramCacheKey();
    // CSM's setupMaterial replaces onBeforeCompile outright
    material.onBeforeCompile = (shader) => { shader.fragmentShader = `// csm\n${shader.fragmentShader}`; };
    expect(field.installed(material)).toBe(false);
    field.install(material);
    const { fragment } = compiled(material);
    expect(fragment.startsWith("// csm")).toBe(true);
    expect(fragment).toContain("esFxCount");
    // the key suffix is added once, never stacked
    expect(material.customProgramCacheKey()).toBe(keyOnce);
    expect(field.install(new THREE.MeshBasicMaterial())).toBe(false);
    expect(isFixtureLitMaterial(new THREE.MeshLambertMaterial())).toBe(true);
  });

  it("shares one uniform object per field across materials", () => {
    const field = new FixtureLightField();
    const a = new THREE.MeshStandardMaterial(); const b = new THREE.MeshStandardMaterial();
    field.install(a); field.install(b);
    expect(compiled(a).uniforms.esFxData).toBe(compiled(b).uniforms.esFxData);
    expect(compiled(a).uniforms.esFxCount).toBe(field.uniforms.esFxCount);
  });

  it("re-wrapping a hook CSM replaced relinks only a program that lacks the chunk (perf10 f27)", () => {
    const field = new FixtureLightField();
    const linked = new THREE.MeshStandardMaterial();
    field.install(linked); compiled(linked);
    linked.onBeforeCompile = () => {}; // CSM's setupMaterial replaces the hook
    const v = linked.version;
    field.install(linked);
    expect(linked.version).toBe(v);
    const unlinked = new THREE.MeshStandardMaterial();
    field.install(unlinked);
    unlinked.onBeforeCompile = () => {};
    const u = unlinked.version;
    field.install(unlinked);
    expect(unlinked.version).toBe(u + 1);
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

  it("attach chains an existing onBeforeRender and is idempotent", () => {
    const field = new FixtureLightField();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    let calls = 0;
    mesh.onBeforeRender = () => { calls += 1; };
    field.attach(mesh); field.attach(mesh);
    const renderer = { properties: { get: () => ({}) }, getContext: () => ({}) } as unknown as THREE.WebGLRenderer;
    mesh.onBeforeRender(renderer, new THREE.Scene(), new THREE.PerspectiveCamera(), mesh.geometry, mesh.material, null as unknown as THREE.Group);
    expect(calls).toBe(1);
  });

  it("one field per scene, held on the scene", () => {
    const scene = new THREE.Scene();
    expect(fixtureLightFieldOf(scene)).toBe(fixtureLightFieldOf(scene));
    expect(fixtureLightFieldOf(new THREE.Scene())).not.toBe(fixtureLightFieldOf(scene));
  });
});

describe("per-material list length", () => {
  it("a material may raise its objects' list to 16 (the terrain); the program keys differ by it, never by the count", () => {
    const field = new FixtureLightField();
    field.setLights(lamps(30, 2, 6));
    const ground = new THREE.MeshStandardMaterial();
    ground.userData.esFixtureLightsPerObject = 16;
    field.install(ground);
    const tile = new THREE.Mesh(new THREE.PlaneGeometry(117, 117).rotateX(-Math.PI / 2), ground);
    tile.position.set(30, 0, 0); tile.updateMatrixWorld();
    expect(field.slotsOf(tile, undefined, 16).count).toBe(16);
    expect(field.slotsOf(tile).count).toBe(8);
    const { fragment, key } = compiled(ground);
    expect(fragment).toContain("esFxI < 16");
    expect(key.endsWith("|16")).toBe(true);
    const wall = new THREE.MeshStandardMaterial();
    field.install(wall);
    expect(compiled(wall).fragment).toContain("esFxI < 8");
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
