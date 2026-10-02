import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { WebGPURenderer } from "three/webgpu";
import { GpuCullPool, guardPageBuffers } from "./GpuCullPool";
import { createLodFadeUniforms } from "../../fx/lodFade";

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
    guardPageBuffers(f.renderer);
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
    const first = guardPageBuffers(f.renderer)!.delete;
    expect(guardPageBuffers(f.renderer)!.delete).toBe(first);
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
