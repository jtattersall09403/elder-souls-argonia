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
});

describe("deferDisposeReplaced", () => {
  it("deletes only the replaced geometry's own buffers at the drain, never the live one's", async () => {
    const THREE = await import("three");
    const { deferDisposeReplaced } = await import("./deferDispose");
    const deleted = new Set<object>();
    const r = { ...fakeRenderer(), _attributes: { delete: (a: object) => { deleted.add(a); } } };
    const make = () => {
      const g = new THREE.BufferGeometry();
      g.setIndex([0, 1, 2]);
      g.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(9), 3));
      return g;
    };
    const g0 = make(), g1 = make(), g2 = make();
    const disposed = vi.fn();
    for (const g of [g0, g1, g2]) g.addEventListener("dispose", disposed);
    deferDisposeReplaced(r, g0); // frame 1: rebind g0 -> g1
    r.info.reset();
    deferDisposeReplaced(r, g1); // frame 2: rebind g1 -> g2
    r.info.reset();
    expect(disposed).not.toHaveBeenCalled(); // three's handler (reads the live render object) never fires
    for (const g of [g0, g1]) { expect(deleted.has(g.index!)).toBe(true); expect(deleted.has(g.attributes.position)).toBe(true); }
    expect(deleted.has(g2.index!)).toBe(false);
    expect(deleted.has(g2.attributes.position)).toBe(false);
  });
});
