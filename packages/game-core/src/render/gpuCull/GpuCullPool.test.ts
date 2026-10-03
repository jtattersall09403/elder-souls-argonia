import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { WebGPURenderer } from "three/webgpu";
import { GpuCullPool, guardSharedBuffers } from "./GpuCullPool";
import { createLodFadeUniforms } from "../../fx/lodFade";
import { makeSlotGeometry } from "../../vegetation/slotGeometry";

/** A renderer whose attribute store records the buffers it destroys. */
function fakeRenderer() {
  const destroyed = new Set<object>();
  const store = { delete(a: object) { destroyed.add(a); return {}; } };
  return { renderer: { _attributes: store } as unknown as WebGPURenderer, store, destroyed };
}

const opts = { capacity: 4, sphere: new THREE.Sphere(), band: null, casts: false, fromZero: false };

function member() {
  const g = new THREE.BoxGeometry();
  return new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial(), 4);
}

describe("GpuCullPool page buffers (webgpu diag10 D3)", () => {
  it("a released member's stale attribute list cannot destroy the page buffers", () => {
    const f = fakeRenderer();
    const pool = new GpuCullPool({ lodFade: createLodFadeUniforms() });
    const a = member(), b = member();
    const da = pool.addDraw(a, opts);
    const db = pool.addDraw(b, opts);
    expect(da.system).toBe(db.system);
    const page = da.system;
    const stale = [a.geometry.getAttribute("esSlot"), a.instanceMatrix, ...Object.values(a.geometry.attributes)];
    guardSharedBuffers(f.renderer);
    (pool as unknown as { store: unknown }).store = f.store;
    pool.removeDraw(da);
    // three's geometry onDispose: delete every attribute in the cached list
    for (const attr of stale) f.store.delete(attr);
    for (const buf of page.sharedBuffers) expect(f.destroyed.has(buf)).toBe(false);
    expect(b.geometry.getAttribute("esSlot")).toBe(page.slots);
    expect(b.instanceMatrix).toBe(page.matrices);
    expect(f.destroyed.has(a.geometry.getAttribute("position"))).toBe(true);
    // the page frees its own buffers when its last member leaves
    pool.removeDraw(db);
    for (const buf of page.sharedBuffers) expect(f.destroyed.has(buf)).toBe(true);
  });

  it("guards a renderer's store once", () => {
    const f = fakeRenderer();
    const first = guardSharedBuffers(f.renderer)!.delete;
    expect(guardSharedBuffers(f.renderer)!.delete).toBe(first);
  });

  it("the read-back stores each member's kept count on its mesh (userData.esKept)", async () => {
    const pool = new GpuCullPool({ lodFade: createLodFadeUniforms() });
    const a = member();
    const da = pool.addDraw(a, opts);
    const ind = new Uint32Array(64);
    ind[da.draw.index * 5 + 1] = 0;
    const renderer = { getArrayBufferAsync: async () => ind.buffer } as unknown as WebGPURenderer;
    pool.refreshCounts(renderer);
    await new Promise((r) => setTimeout(r, 0));
    expect(a.userData.esKept).toBe(0);
    expect(a.count).toBe(1);
  });
});

describe("GpuCullPool submit (webgpu10 c5 fix14: zero-kept members not submitted)", () => {
  const renderer = { compute() {} } as unknown as WebGPURenderer;
  function camera() {
    const c = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
    c.position.set(0, 2, 0);
    c.lookAt(0, 2, -10); // looks down -Z
    c.updateMatrixWorld();
    return c;
  }
  function placed(x: number, z: number) {
    const pool = new GpuCullPool({ lodFade: createLodFadeUniforms() });
    const mesh = member();
    const d = pool.addDraw(mesh, opts);
    pool.setCandidate(d, 0, new THREE.Matrix4().makeTranslation(x, 0, z), 0);
    return { pool, mesh, d };
  }

  it("kept 0 and bounds behind the camera: hidden", () => {
    const { pool, mesh } = placed(0, 100);
    pool.update(renderer, camera(), null);
    expect(mesh.visible).toBe(false);
  });

  it("kept 0 (lagging read-back) but bounds in view: drawn", () => {
    const { pool, mesh } = placed(0, -50);
    pool.update(renderer, camera(), null);
    expect(mesh.visible).toBe(true);
  });

  it("kept > 0: drawn even with bounds out of view", () => {
    const { pool, mesh, d } = placed(0, 100);
    d.kept = 3;
    pool.update(renderer, camera(), null);
    expect(mesh.visible).toBe(true);
  });

  it("a member with no candidates never reaches three", () => {
    const pool = new GpuCullPool({ lodFade: createLodFadeUniforms() });
    const mesh = member();
    const d = pool.addDraw(mesh, opts);
    d.kept = 2; // stale read-back
    pool.update(renderer, camera(), null);
    expect(mesh.visible).toBe(false);
  });

  it("out of its LOD band: hidden; a fresh write in view shows it the same frame", () => {
    const { pool, mesh, d } = placed(0, -50);
    pool.setBand(d, [0, 20, 0, 5]);
    pool.update(renderer, camera(), null);
    expect(mesh.visible).toBe(false);
    pool.setCandidate(d, 1, new THREE.Matrix4().makeTranslation(0, 0, -10), 0);
    pool.update(renderer, camera(), null);
    expect(mesh.visible).toBe(true);
  });

  it("the per-frame update reuses its scratch (no allocation)", () => {
    const { pool } = placed(0, -50);
    const p = pool as unknown as { nodes: unknown; planes: unknown; frustum: unknown };
    const before = [p.nodes, p.planes, p.frustum];
    pool.update(renderer, camera(), null);
    pool.update(renderer, camera(), null);
    expect([p.nodes, p.planes, p.frustum]).toEqual(before);
    expect(p.nodes).toBe(before[0]);
    expect(p.planes).toBe(before[1]);
  });
});

describe("GpuCullPool idle (webgpu10 fix16: interior shown)", () => {
  function setup() {
    const pool = new GpuCullPool({ lodFade: createLodFadeUniforms() });
    const a = member();
    const d = pool.addDraw(a, opts);
    d.submit = true; d.kept = 3;
    const computes: unknown[] = [];
    let reads = 0;
    const renderer = {
      _attributes: { delete() { return {}; } },
      compute: (n: unknown) => { computes.push(n); },
      getArrayBufferAsync: async () => { reads++; return new Uint32Array(64).buffer; },
    } as unknown as WebGPURenderer;
    const camera = new THREE.PerspectiveCamera();
    camera.updateMatrixWorld();
    return { pool, d, computes, renderer, camera, reads: () => reads };
  }
  it("idle: no dispatch, no read-back, members not submitted; reactivated: dispatches next update", async () => {
    const s = setup();
    s.pool.setIdle(true);
    expect(s.d.submit).toBe(false);
    s.pool.update(s.renderer, s.camera, null);
    s.pool.refreshCounts(s.renderer);
    await new Promise((r) => setTimeout(r, 0));
    expect(s.computes.length).toBe(0);
    expect(s.reads()).toBe(0);
    s.pool.setIdle(false);
    s.pool.update(s.renderer, s.camera, null);
    expect(s.computes.length).toBe(1);
    s.pool.refreshCounts(s.renderer);
    await new Promise((r) => setTimeout(r, 0));
    expect(s.reads()).toBe(1);
  });
});

describe("GpuCullPool kit-shared buffers (webgpu10 diag19 D1)", () => {
  it("disposing one slot view never deletes the kit buffers another view draws", () => {
    const f = fakeRenderer();
    guardSharedBuffers(f.renderer);
    const kit = new THREE.BoxGeometry();
    const ownA = new THREE.InstancedBufferAttribute(new Float32Array(4), 1);
    const a = makeSlotGeometry(kit, { esSlot: ownA });
    const b = makeSlotGeometry(kit, { esSlot: new THREE.InstancedBufferAttribute(new Float32Array(4), 1) });
    // three r184 Geometries onDispose: delete every attribute of the render
    // object's CACHED list (built at first render), whatever the view holds now
    const cached = [...Object.values(a.attributes), a.index!];
    a.addEventListener("dispose", () => { for (const attr of cached) f.store.delete(attr); });
    a.dispose();
    for (const attr of [...Object.values(kit.attributes), kit.index!]) expect(f.destroyed.has(attr)).toBe(false);
    expect(f.destroyed.has(ownA)).toBe(true);
    expect(b.attributes.position).toBe(kit.attributes.position);
  });
});

describe("GpuCullPool kept-none members and per-camera cull (webgpu10 diag19 D2)", () => {
  const cam = () => {
    const c = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
    c.position.set(0, 2, 0);
    c.lookAt(0, 2, -10);
    c.updateMatrixWorld();
    return c;
  };
  async function readBack(pool: GpuCullPool, kept: number, index: number) {
    const ind = new Uint32Array(64);
    ind[index * 5 + 1] = kept;
    pool.refreshCounts({ getArrayBufferAsync: async () => ind.buffer } as unknown as WebGPURenderer);
    await new Promise((r) => setTimeout(r, 0));
  }
  const renderer = { compute() {} } as unknown as WebGPURenderer;

  it("a read-back that kept none hides an in-view member; a fill shows it again at once", async () => {
    const pool = new GpuCullPool({ lodFade: createLodFadeUniforms() });
    const mesh = member();
    const d = pool.addDraw(mesh, opts);
    pool.setCandidate(d, 0, new THREE.Matrix4().makeTranslation(0, 0, -50), 0);
    const c = cam();
    pool.update(renderer, c, null);
    expect(mesh.visible).toBe(true);           // nothing read back yet
    await readBack(pool, 0, d.draw.index);
    pool.update(renderer, c, null);
    expect(mesh.visible).toBe(false);          // kept none, view unchanged
    pool.fillDraw(d, new Float32Array(new THREE.Matrix4().makeTranslation(1, 0, -40).elements));
    pool.update(renderer, c, null);
    expect(mesh.visible).toBe(true);           // new rows: shown before the next read-back
  });

  it("a kept-none member is shown again when the camera turns past the stale limit", async () => {
    const pool = new GpuCullPool({ lodFade: createLodFadeUniforms() });
    const mesh = member();
    const d = pool.addDraw(mesh, opts);
    pool.setCandidate(d, 0, new THREE.Matrix4().makeTranslation(0, 0, -50), 0);
    const c = cam();
    pool.update(renderer, c, null);
    await readBack(pool, 0, d.draw.index);
    pool.update(renderer, c, null);
    expect(mesh.visible).toBe(false);
    c.lookAt(5, 2, -10);
    c.updateMatrixWorld();
    pool.update(renderer, c, null);
    expect(mesh.visible).toBe(true);
  });

  it("a member is frustum-culled per camera on its candidates' bounds (each cascade draws its own casters)", () => {
    const pool = new GpuCullPool({ lodFade: createLodFadeUniforms() });
    const mesh = member();
    const d = pool.addDraw(mesh, opts);
    pool.setCandidate(d, 0, new THREE.Matrix4().makeTranslation(0, 0, -50), 0);
    pool.update(renderer, cam(), null);
    expect(mesh.frustumCulled).toBe(true);
    expect(mesh.boundingSphere!.center.z).toBeCloseTo(-50);
    const near = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
    near.position.set(0, 50, 0); near.lookAt(0, 0, 0); near.updateMatrixWorld();
    const far = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
    far.position.set(0, 50, -50); far.lookAt(0, 0, -50); far.updateMatrixWorld();
    const hit = (o: THREE.Camera) => new THREE.Frustum().setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(o.projectionMatrix, o.matrixWorldInverse)).intersectsObject(mesh);
    expect(hit(near)).toBe(false);
    expect(hit(far)).toBe(true);
    pool.removeDraw(d);
    expect(mesh.frustumCulled).toBe(false);
    expect(mesh.boundingSphere).toBeNull();
  });
});
