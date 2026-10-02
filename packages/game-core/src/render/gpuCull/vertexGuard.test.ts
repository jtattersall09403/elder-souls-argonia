import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import type { WebGPURenderer } from "three/webgpu";
import { guardVertexBuffers, repairVertexBuffers } from "./GpuCullPool";
import { detachSharedAttribute } from "../../vegetation/slotGeometry";

/** A backend DataMap and an attribute store over it (three's Attributes shape). */
function fakeStore() {
  const backendMap = new Map<object, { buffer?: object }>();
  const versions = new Map<object, number>();
  const backend = { get: (o: object) => { if (!backendMap.has(o)) backendMap.set(o, {}); return backendMap.get(o)!; } };
  const store = {
    delete(a: object) { versions.delete(a); backendMap.delete(a); return {}; },
    update(a: object) { if (!versions.has(a)) { backend.get(a).buffer = {}; versions.set(a, 1); } },
  };
  return { backend, backendMap, store };
}

/** A render object caching its geometry's vertex buffers, as RenderObject.getAttributes does. */
function renderObject(geometry: THREE.BufferGeometry, names: string[]) {
  const ro = {
    attributes: null as unknown[] | null,
    vertexBuffers: null as THREE.BufferAttribute[] | null,
    getAttributes() {
      if (this.attributes) return this.attributes;
      this.attributes = names.map((n) => geometry.getAttribute(n));
      this.vertexBuffers = this.attributes as THREE.BufferAttribute[];
      return this.attributes;
    },
    getVertexBuffers() { if (!this.attributes) this.getAttributes(); return this.vertexBuffers!; },
  };
  return ro;
}

describe("vertex buffer guard (webgpu diag11)", () => {
  it("a freed esSlot is dropped from the stale list or re-uploaded before the draw", () => {
    const f = fakeStore();
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(9), 3));
    g.setAttribute("esSlot", new THREE.InstancedBufferAttribute(new Float32Array(4), 1));
    const ro = renderObject(g, ["position", "esSlot"]);
    for (const vb of ro.getVertexBuffers()) f.store.update(vb);
    const slot = g.getAttribute("esSlot");
    detachSharedAttribute(g, "esSlot");
    f.store.delete(slot); // freed while the cached list still names it
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    repairVertexBuffers(ro as never, f.backend, f.store, () => true);
    for (const vb of ro.getVertexBuffers()) expect(f.backend.get(vb).buffer).toBeDefined();
    expect(ro.getVertexBuffers()).not.toContain(slot);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("re-uploads a buffer the geometry still holds", () => {
    const f = fakeStore();
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(9), 3));
    const ro = renderObject(g, ["position"]);
    const pos = g.getAttribute("position");
    expect(repairVertexBuffers(ro as never, f.backend, f.store, () => false)).toBe(1);
    expect(f.backend.get(pos).buffer).toBeDefined();
    expect(repairVertexBuffers(ro as never, f.backend, f.store, () => false)).toBe(0);
  });

  it("installs once per renderer and repairs before the draw", () => {
    const f = fakeStore();
    const drawn: number[] = [];
    const backend = { ...f.backend, draw: () => { drawn.push(1); } };
    const renderer = { backend, _attributes: f.store } as unknown as WebGPURenderer;
    expect(guardVertexBuffers(renderer)).toBe(true);
    const wrapped = backend.draw;
    guardVertexBuffers(renderer);
    expect(backend.draw).toBe(wrapped);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(9), 3));
    const ro = renderObject(g, ["position"]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    (backend.draw as (r: unknown, i: unknown) => void)(ro, {});
    warn.mockRestore();
    expect(f.backend.get(g.getAttribute("position")).buffer).toBeDefined();
    expect(drawn).toEqual([1]);
  });
});
