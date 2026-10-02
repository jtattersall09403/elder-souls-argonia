import { describe, expect, it } from "vitest";
import { FrameSegments, RESOLVE_EVERY, computeLabel, frameOfUid, type TimedRenderer } from "./frameSegments";

/** A renderer whose pool times each pass at a fixed ms, like three's pools do on resolve. */
function fakeRenderer(msPerPass: number) {
  let target: { texture: { name: string } } | null = null;
  const pool = {
    timestamps: new Map<string, number>(),
    currentQueryIndex: 0,
    maxQueries: 2048,
    allocated: [] as string[],
    allocateQueriesForContext(uid: string) { this.allocated.push(uid); this.currentQueryIndex += 2; return 0; },
  };
  let resolves = 0;
  const renderer: TimedRenderer = {
    backend: { isWebGPUBackend: true, trackTimestamp: false, hasFeature: () => true, timestampQueryPool: { render: pool } },
    getRenderTarget: () => target,
    resolveTimestampsAsync: async () => {
      resolves += 1;
      for (const uid of pool.allocated) pool.timestamps.set(uid, msPerPass);
      pool.allocated = [];
      pool.currentQueryIndex = 0;
      return msPerPass;
    },
  };
  return {
    renderer, pool,
    resolves: () => resolves,
    pass(uid: string, shadow = false) {
      target = shadow ? { texture: { name: "ShadowMap" } } : null;
      pool.allocateQueriesForContext(uid);
      target = null;
    },
  };
}

describe("frame segments on renderer timestamps", () => {
  it("reads the frame out of a three timestamp uid", () => {
    expect(frameOfUid("12:f345")).toBe(345);
    expect(frameOfUid("nonsense")).toBe(-1);
  });

  it("files passes under the open mark, shadow maps under shadow, and resolves every N frames", async () => {
    const segs = new FrameSegments();
    const fake = fakeRenderer(2);
    segs.attach(fake.renderer);
    segs.requestGpuTiming();
    segs.collect(); // binds the pool
    for (let f = 1; f <= RESOLVE_EVERY; f++) {
      segs.gpuMark("scene");
      fake.pass(`1:f${f}`);
      fake.pass(`2:f${f}`, true);
      segs.gpuMark("water");
      fake.pass(`3:f${f}`);
      segs.gpuEnd();
      segs.collect();
    }
    expect(fake.resolves()).toBe(1);
    await new Promise((r) => setTimeout(r, 0));
    const stats = segs.stats();
    expect(stats.gpuSupported).toBe(true);
    expect(stats.gpuSource).toBe("webgpu timestamp-query");
    const by = new Map(stats.gpu.map((s) => [s.label, s.avg]));
    expect(by.get("scene")).toBeCloseTo(2);
    expect(by.get("shadow")).toBeCloseTo(2);
    expect(by.get("water")).toBeCloseTo(2);
    expect(stats.gpuSumAvg).toBeCloseTo(6);
    // Consumed uids are forgotten so three's map cannot grow without bound.
    expect(fake.pool.timestamps.size).toBe(0);
  });

  it("reports no GPU source without a timestamp pool", () => {
    const segs = new FrameSegments();
    segs.attach(null);
    segs.collect();
    expect(segs.stats().gpuSource).toBe("none");
    expect(segs.stats().gpuSupported).toBe(false);
  });

  it("unwraps the pool allocator on dispose", () => {
    const segs = new FrameSegments();
    const fake = fakeRenderer(1);
    const original = fake.pool.allocateQueriesForContext;
    segs.attach(fake.renderer);
    segs.requestGpuTiming();
    segs.collect();
    expect(fake.pool.allocateQueriesForContext).not.toBe(original);
    segs.dispose();
    expect(fake.pool.allocateQueriesForContext).toBe(original);
  });
  it("turns timestamp queries on only while bound (the pool filled unread during the load)", () => {
    const fake = fakeRenderer(1);
    const segs = new FrameSegments();
    expect(fake.renderer.backend.trackTimestamp).toBe(false);
    segs.attach(fake.renderer);
    expect(fake.renderer.backend.trackTimestamp).toBe(false);
    const release = segs.requestGpuTiming();
    expect(fake.renderer.backend.trackTimestamp).toBe(true);
    release();
    release();
    expect(fake.renderer.backend.trackTimestamp).toBe(false);
    segs.requestGpuTiming();
    expect(fake.renderer.backend.trackTimestamp).toBe(true);
    segs.attach(null);
    expect(fake.renderer.backend.trackTimestamp).toBe(false);
  });
  it("files compute passes under their node names, resolved with the render pool (per-pass sum = frame)", async () => {
    const fake = fakeRenderer(2);
    const cpool = { timestamps: new Map<string, number>(), currentQueryIndex: 0, maxQueries: 2048 };
    const data = new WeakMap<object, { timestampUID?: string }>();
    let calls = 0;
    const b = fake.renderer.backend as TimedRenderer["backend"] & Record<string, unknown>;
    b.timestampQueryPool = { render: fake.pool, compute: cpool as never };
    b.get = (o: object) => { if (!data.has(o)) data.set(o, {}); return data.get(o)!; };
    let frame = 0;
    b.updateTimeStampUID = (ctx: object) => { b.get!(ctx).timestampUID = `c:${calls++}:7:f${frame}`; };
    const resolve = fake.renderer.resolveTimestampsAsync;
    fake.renderer.resolveTimestampsAsync = async (type) => {
      if (type === "compute") { for (const k of computed) cpool.timestamps.set(k, 0.5); computed.length = 0; return 0; }
      return resolve(type);
    };
    const computed: string[] = [];
    const inject = { isComputeNode: true, name: "volumetricsInject" };
    const cull = [{ isComputeNode: true, name: "gpuCull" }, { isComputeNode: true, name: "gpuCullRows" }];
    const segs = new FrameSegments();
    segs.attach(fake.renderer);
    segs.requestGpuTiming();
    segs.collect();
    for (let f = 1; f <= RESOLVE_EVERY; f++) {
      frame = f;
      for (const c of [inject, cull] as object[]) { b.updateTimeStampUID!(c); computed.push(b.get!(c).timestampUID!); }
      segs.gpuMark("scene");
      fake.pass(`1:f${f}`);
      segs.collect();
    }
    await new Promise((r) => setTimeout(r, 0));
    const by = new Map(segs.stats().gpu.map((s) => [s.label, s.avg]));
    expect(by.get("volumetricsInject")).toBeCloseTo(0.5);
    expect(by.get("gpuCull")).toBeCloseTo(0.5);
    expect(by.get("scene")).toBeCloseTo(2);
    expect(segs.stats().gpuSumAvg).toBeCloseTo(3);
    expect(cpool.timestamps.size).toBe(0);
    segs.dispose();
    expect(computeLabel([{}, { name: "x" }])).toBe("x");
    expect(computeLabel({})).toBe("compute");
  });
  it("stops recording on dispose and when a resolve fails (walk 10 pool overflow)", async () => {
    const a = fakeRenderer(1);
    const segs = new FrameSegments();
    segs.attach(a.renderer);
    segs.requestGpuTiming();
    segs.dispose();
    expect(a.renderer.backend.trackTimestamp).toBe(false);
    const b = fakeRenderer(1);
    (b.renderer as unknown as { resolveTimestampsAsync: () => Promise<number> }).resolveTimestampsAsync =
      () => Promise.reject(new Error("lost"));
    const segs2 = new FrameSegments();
    segs2.attach(b.renderer);
    segs2.requestGpuTiming();
    for (let i = 0; i < 200; i++) segs2.collect();
    await new Promise((r) => setTimeout(r, 0));
    expect(b.renderer.backend.trackTimestamp).toBe(false);
  });
});
