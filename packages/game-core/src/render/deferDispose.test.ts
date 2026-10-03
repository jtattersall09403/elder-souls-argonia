import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { deferDispose, deferredCount, drainDeferred } from "./deferDispose";

const fakeRenderer = () => {
  const calls: number[] = [];
  return { calls, info: { reset: () => { calls.push(1); } } };
};

describe("deferDispose", () => {
  it("disposes only at the next frame start, after the original reset", () => {
    const r = fakeRenderer();
    const d = { dispose: vi.fn() };
    deferDispose(r, d);
    expect(d.dispose).not.toHaveBeenCalled();
    r.info.reset();
    expect(r.calls).toHaveLength(1);
    expect(d.dispose).toHaveBeenCalledTimes(1);
  });

  it("is idempotent: one object queued twice disposes once", () => {
    const r = fakeRenderer();
    const d = { dispose: vi.fn() };
    deferDispose(r, d);
    deferDispose(r, d);
    r.info.reset();
    r.info.reset();
    expect(d.dispose).toHaveBeenCalledTimes(1);
  });

  it("leaves nothing queued after a drain; keeps renderers apart", () => {
    const a = fakeRenderer(), b = fakeRenderer();
    const da = { dispose: vi.fn() }, db = { dispose: vi.fn() };
    deferDispose(a, da);
    deferDispose(b, db);
    a.info.reset();
    expect(deferredCount(a)).toBe(0);
    expect(deferredCount(b)).toBe(1);
    expect(db.dispose).not.toHaveBeenCalled();
    drainDeferred(b);
    expect(deferredCount(b)).toBe(0);
    expect(db.dispose).toHaveBeenCalledTimes(1);
  });

  it("disposes at once without a frame hook", () => {
    const d = { dispose: vi.fn() };
    deferDispose(null, d);
    deferDispose({}, { dispose: d.dispose });
    expect(d.dispose).toHaveBeenCalledTimes(2);
  });
});

describe("tagGeometryBuffers", () => {
  it("names unnamed buffers and keeps named ones", async () => {
    const THREE = await import("three");
    const { tagGeometryBuffers } = await import("./deferDispose");
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(3), 3));
    const kit = new THREE.BufferAttribute(new Float32Array(2), 2);
    kit.name = "kit:uv";
    g.setAttribute("uv", kit);
    const ib = new THREE.InterleavedBuffer(new Float32Array(4), 4);
    g.setAttribute("iRow", new THREE.InterleavedBufferAttribute(ib, 4, 0));
    g.setIndex([0]);
    tagGeometryBuffers(g, "fire");
    expect(g.getAttribute("position").name).toBe("fire:position");
    expect(kit.name).toBe("kit:uv");
    expect((ib as unknown as { name: string }).name).toBe("fire:iRow");
    expect(g.index!.name).toBe("fire:index");
  });

  it("a geometry swapped on a live mesh is freed after the mesh drew the new one (why fire disposes synchronously)", () => {
    // three's dispose handler deletes the attributes the mesh's render object holds at dispose
    // time; deferred past the next draw, those are the NEW geometry's (vol10 c10)
    const r = fakeRenderer();
    const mesh = new THREE.Mesh(new THREE.BufferGeometry());
    mesh.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(3), 3));
    let drawn = mesh.geometry;
    const deleted = new Set<unknown>();
    const old = mesh.geometry;
    old.addEventListener("dispose", () => { for (const a of Object.values(drawn.attributes)) deleted.add(a); });
    mesh.geometry = new THREE.BufferGeometry();
    mesh.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(3), 3));
    deferDispose(r, old);
    drawn = mesh.geometry; // the mesh draws the new geometry before the frame ends
    r.info.reset();
    expect(deleted.has(mesh.geometry.getAttribute("position"))).toBe(true); // the defect deferral causes
  });
});
