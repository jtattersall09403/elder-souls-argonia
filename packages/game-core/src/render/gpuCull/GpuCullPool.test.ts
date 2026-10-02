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
