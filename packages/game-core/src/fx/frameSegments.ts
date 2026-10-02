/**
 * Segmented frame timer (decision 0084, performance round 10; node renderer
 * since decision 0111).
 *
 * GPU: the renderer's own timestamp queries (`trackTimestamp: true`). Every
 * render pass three runs (each `renderer.render`, each shadow map, each
 * `QuadMesh`) is one timed context; `gpuMark(name)` only sets the label the
 * NEXT passes are filed under, and a pass drawn into a shadow map is filed
 * under "shadow" whatever the open label. Results are resolved with
 * `resolveTimestampsAsync("render")` at most every RESOLVE_EVERY frames (or
 * sooner when the query pool is half full), never awaited in the frame, so
 * timing never stalls it. On the WebGPU backend the source is the
 * `timestamp-query` feature; on the WebGL 2 backend three uses
 * `EXT_disjoint_timer_query_webgl2` itself (we no longer issue our own
 * queries: two timers cannot share that extension).
 *
 * Compute passes (the froxel inject/blur/integrate, the GPU cull) are timed
 * by three in their own pool; each is filed under its ComputeNode's name
 * (`setName`), read from the uid three assigns when it starts the pass, and
 * resolved together with the render pool so a frame's rows add up to its
 * whole GPU time (per-pass labels adapted from fable5-world-demo
 * src/core/GpuProfiler.ts @ fd75fdb7, MIT, Copyright (c) the
 * fable5-world-demo authors).
 *
 * CPU: `performance.now()` between marks, committed synchronously.
 *
 * No module-level mutable state: the studio creates one `FrameSegments` and
 * passes it down through `FrameSegmentsContext`.
 */
import { createContext, useContext } from "react";
import { useFrame, type RenderCallback } from "@react-three/fiber";

const AVG_FRAMES = 60;
const MAX_FRAMES = 120;
/** Resolve the timestamp pool at most this often (frames). */
export const RESOLVE_EVERY = 10;
/** Label for passes that ran before any mark this frame (or after `gpuEnd`). */
const UNLABELLED = "other";

/** The slice of three's TimestampQueryPool this timer reads. */
interface TimestampPool {
  allocateQueriesForContext(uid: string): number | null;
  timestamps: Map<string, number>;
  currentQueryIndex: number;
  maxQueries: number;
}

/** What three passes to `updateTimeStampUID`: a ComputeNode, an array of them, or a render context. */
interface TimedContext { isComputeNode?: boolean; name?: string }

/** The label a compute dispatch is filed under: its node's name, the first named node of an array. */
export function computeLabel(ctx: TimedContext | TimedContext[]): string {
  const nodes = Array.isArray(ctx) ? ctx : [ctx];
  for (const n of nodes) if (n?.name) return n.name;
  return "compute";
}

/** The slice of WebGPURenderer this timer reads. */
export interface TimedRenderer {
  resolveTimestampsAsync(type?: "render" | "compute"): Promise<number | undefined>;
  getRenderTarget(): { texture?: { name?: string } } | null;
  backend: {
    isWebGPUBackend?: boolean;
    trackTimestamp?: boolean;
    hasFeature?(name: string): boolean;
    timestampQueryPool?: { render?: TimestampPool | null; compute?: TimestampPool | null };
    /** Three's per-pass uid assignment (Backend.updateTimeStampUID); wrapped to label compute passes. */
    updateTimeStampUID?(ctx: object): void;
    get?(ctx: object): { timestampUID?: string };
  };
}

/** Where the HUD's GPU numbers come from. */
export type GpuTimerSource = "webgpu timestamp-query" | "webgl2 disjoint-timer" | "none";

/** One label's windowed numbers, ms. */
export interface SegmentStat {
  label: string;
  avg: number;
  max: number;
}

export interface FrameSegmentStats {
  /** GPU segments in the order they were first seen this session. */
  gpu: SegmentStat[];
  /** CPU segments, same ordering rule. */
  cpu: SegmentStat[];
  /** Sum of the GPU segment averages: the old whole-frame `gpu` average. */
  gpuSumAvg: number;
  /** Max over the 120-frame window of the per-frame GPU sum. */
  gpuSumMax: number;
  /** False when the renderer has no timestamp queries (GPU rows read n/a). */
  gpuSupported: boolean;
  /** Which clock the GPU rows come from. */
  gpuSource: GpuTimerSource;
  /** True on Apple/Metal, where the GPU timestamp is WALL time on the queue —
   * the number is how long the frame took, not how much GPU work the pass
   * did, so the HUD marks it rather than pretending it is a measurement
   * (0084 round 11). */
  gpuWallTimeOnly: boolean;
}

/** The whole-frame subset of `FrameSegmentStats`, for a per-frame reader. */
export type FrameGpuSummary = Pick<FrameSegmentStats, "gpuSumAvg" | "gpuSumMax" | "gpuSupported" | "gpuWallTimeOnly">;

/** A 60-frame average / 120-frame maximum over per-frame per-label totals. */
class Window {
  /** One map per frame; a label missing from a frame counts as 0 ms. */
  private frames: Map<string, number>[] = [];
  private maxima: Map<string, number>[] = [];
  /** First-seen order, so the HUD can print frame order, not size order. */
  readonly order: string[] = [];

  push(frame: Map<string, number>): void {
    for (const label of frame.keys()) {
      if (!this.order.includes(label)) this.order.push(label);
    }
    this.frames.push(frame);
    if (this.frames.length > AVG_FRAMES) this.frames.shift();
    this.maxima.push(frame);
    if (this.maxima.length > MAX_FRAMES) this.maxima.shift();
  }

  stats(): SegmentStat[] {
    const n = Math.max(1, this.frames.length);
    return this.order.map((label) => {
      let sum = 0;
      for (const f of this.frames) sum += f.get(label) ?? 0;
      let max = 0;
      for (const f of this.maxima) max = Math.max(max, f.get(label) ?? 0);
      return { label, avg: sum / n, max };
    });
  }

  /** Per-frame totals over every label, for the whole-frame line, written
   * into `out` (the HUD reads this every frame: no array, no object). */
  totals(out: { avg: number; max: number }): void {
    let sum = 0;
    for (const f of this.frames) for (const v of f.values()) sum += v;
    let max = 0;
    for (const f of this.maxima) {
      let s = 0;
      for (const v of f.values()) s += v;
      max = Math.max(max, s);
    }
    out.avg = this.frames.length ? sum / this.frames.length : 0;
    out.max = max;
  }
}

export class FrameSegments {
  private renderer: TimedRenderer | null = null;
  private wallTimeOnly = false;
  /** The pool whose allocator we wrapped (it is created on the first pass). */
  private pool: TimestampPool | null = null;
  private unwrapPool: (() => void) | null = null;
  private gpuLabel: string | null = null;
  /** Timestamp uid (`<context>:f<frame>`) -> label, until resolved. */
  private uidLabels = new Map<string, string>();
  private resolving = false;
  /** Open `requestGpuTiming` calls. */
  private gpuDemand = 0;
  private framesSinceResolve = 0;
  private gpuWindow = new Window();

  /** Compute timestamp uid -> its node's name, until resolved. */
  private computeLabels = new Map<string, string>();
  private unwrapUid: (() => void) | null = null;
  private cpuLabel: string | null = null;
  private cpuStart = 0;
  private cpuFrame = new Map<string, number>();
  private cpuWindow = new Window();
  private readonly totalsScratch = { avg: 0, max: 0 };

  /**
   * Bind the renderer. Split from the constructor so the studio can make
   * the instance outside the canvas (where the renderer does not exist yet)
   * and the first in-canvas hook binds it.
   */
  attach(renderer: TimedRenderer | null): void {
    // Timestamp queries run only while a collector is bound and asked
    // (`requestGpuTiming`): the renderer is
    // made with them off, because frames rendered before this hook mounts
    // (the Suspense load) would fill three's query pool with nobody resolving
    // it ("Maximum number of queries exceeded").
    if (this.renderer && this.renderer !== renderer) this.renderer.backend.trackTimestamp = false;
    this.unwrapUid?.();
    this.unwrapUid = null;
    this.renderer = renderer && typeof renderer.resolveTimestampsAsync === "function"
      ? renderer : null;
    this.syncTracking();
    const b = this.renderer?.backend;
    if (b?.updateTimeStampUID && b.get) {
      const assign = b.updateTimeStampUID;
      const get = b.get.bind(b);
      b.updateTimeStampUID = (ctx: object) => {
        assign.call(b, ctx);
        const c = ctx as TimedContext | TimedContext[];
        if (!Array.isArray(c) && c.isComputeNode !== true) return;
        const uid = get(ctx).timestampUID;
        if (uid !== undefined) this.computeLabels.set(uid, computeLabel(c));
      };
      this.unwrapUid = () => { b.updateTimeStampUID = assign; };
    }
    // Apple hardware means Metal in every browser: the timestamp is the
    // pass's wall time on the GPU queue there, not its work (0084 r11).
    const nav = typeof navigator === "undefined" ? null : navigator;
    const platform = nav ? (nav.platform || nav.userAgent || "") : "";
    this.wallTimeOnly = /mac|iphone|ipad/i.test(platform);
  }

  /**
   * Ask for GPU timing; call the returned function to stop asking. Queries
   * run only while a renderer is bound AND someone asks (the HUD perf lines,
   * a probe): unasked, every pass would still allocate timestamp queries
   * (walk 10: the pool overflowed after the HUD that read them unmounted).
   */
  requestGpuTiming(): () => void {
    this.gpuDemand += 1;
    this.syncTracking();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.gpuDemand -= 1;
      this.syncTracking();
    };
  }

  /** Whether timestamp queries are being recorded now. */
  get gpuTiming(): boolean { return this.renderer?.backend.trackTimestamp === true; }

  private syncTracking(): void {
    const b = this.renderer?.backend;
    if (!b) return;
    // WebGPU checks the device feature only at init; the WebGL backend
    // guards on its own disjoint-timer extension.
    b.trackTimestamp = this.gpuDemand > 0
      && (!b.isWebGPUBackend || (b.hasFeature?.("timestamp-query") ?? false));
  }

  /** Which clock the GPU rows come from ("none" until the first pass is timed). */
  get gpuSource(): GpuTimerSource {
    if (!this.renderer || !this.pool) return "none";
    return this.renderer.backend.isWebGPUBackend ? "webgpu timestamp-query" : "webgl2 disjoint-timer";
  }

  get gpuSupported(): boolean { return this.gpuSource !== "none"; }

  /** File the next render passes under `name`. */
  gpuMark(name: string): void {
    this.gpuLabel = name;
  }

  /** Passes after this and before the next mark are filed as "other". */
  gpuEnd(): void {
    this.gpuLabel = null;
  }

  /** Wrap the pool's allocator once it exists, so each pass gets a label. */
  private bindPool(): void {
    const pool = this.renderer?.backend.timestampQueryPool?.render ?? null;
    if (!pool || pool === this.pool) return;
    this.unwrapPool?.();
    const allocate = pool.allocateQueriesForContext;
    pool.allocateQueriesForContext = (uid: string) => {
      const target = this.renderer?.getRenderTarget();
      const label = target?.texture?.name === "ShadowMap" ? "shadow" : (this.gpuLabel ?? UNLABELLED);
      this.uidLabels.set(uid, label);
      return allocate.call(pool, uid);
    };
    this.unwrapPool = () => { pool.allocateQueriesForContext = allocate; };
    this.pool = pool;
  }

  /** End the open CPU segment (if any) and begin one labelled `name`. */
  cpuMark(name: string): void {
    const now = performance.now();
    if (this.cpuLabel !== null) {
      this.cpuFrame.set(this.cpuLabel,
        (this.cpuFrame.get(this.cpuLabel) ?? 0) + (now - this.cpuStart));
    }
    this.cpuLabel = name;
    this.cpuStart = now;
  }

  /** End the open CPU segment without beginning another. */
  cpuEnd(): void {
    if (this.cpuLabel === null) return;
    this.cpuFrame.set(this.cpuLabel,
      (this.cpuFrame.get(this.cpuLabel) ?? 0) + (performance.now() - this.cpuStart));
    this.cpuLabel = null;
  }

  /**
   * Once per frame, after the last mark: commit the CPU frame and, every
   * RESOLVE_EVERY frames, start one asynchronous resolve of the timestamps
   * the frames since the last one recorded. The resolve is never awaited.
   */
  collect(): void {
    this.cpuWindow.push(this.cpuFrame);
    this.cpuFrame = new Map();
    if (!this.renderer || this.gpuDemand === 0) return;
    this.bindPool();
    this.framesSinceResolve += 1;
    const pool = this.pool;
    // Compute passes fill their own pool: resolved on the render cadence (or
    // sooner when it is half full) so both land in the same frames, and
    // unresolved they would overflow it ("Maximum number of queries").
    const compute = this.renderer.backend.timestampQueryPool?.compute ?? null;
    if ((!pool && !compute) || this.resolving) return;
    const halfFull = (p: TimestampPool | null) => !!p && p.currentQueryIndex * 2 >= p.maxQueries;
    if (this.framesSinceResolve < RESOLVE_EVERY && !halfFull(pool) && !halfFull(compute)) return;
    this.framesSinceResolve = 0;
    this.resolving = true;
    const r = this.renderer;
    Promise.all([
      pool ? r.resolveTimestampsAsync("render") : undefined,
      compute ? r.resolveTimestampsAsync("compute") : undefined,
    ])
      .then(() => this.drain(pool, compute))
      .catch(() => {
        // A failed resolve ends the timing for good: leaving the backend
        // recording with nobody resolving overflows three's query pool.
        r.backend.trackTimestamp = false;
        this.renderer = null;
      })
      .finally(() => { this.resolving = false; });
  }

  /** File every resolved pass (render and compute) under its frame and label, then forget it. */
  private drain(pool: TimestampPool | null, compute: TimestampPool | null): void {
    const frames = new Map<number, Map<string, number>>();
    const file = (labels: Map<string, string>, p: TimestampPool | null) => {
      if (!p) return;
      for (const [uid, label] of labels) {
        const ms = p.timestamps.get(uid);
        if (ms === undefined) continue;
        const frame = frameOfUid(uid);
        let row = frames.get(frame);
        if (!row) { row = new Map(); frames.set(frame, row); }
        row.set(label, (row.get(label) ?? 0) + ms);
        labels.delete(uid);
        // three never prunes this map; the uids are ours to forget once read.
        p.timestamps.delete(uid);
      }
      // Uids whose pass never resolved (pool overflow, lost device) must not pile up.
      if (labels.size > 4096) labels.clear();
    };
    file(this.uidLabels, pool);
    file(this.computeLabels, compute);
    for (const frame of [...frames.keys()].sort((a, b) => a - b)) {
      this.gpuWindow.push(frames.get(frame)!);
    }
  }

  /** The whole-frame GPU numbers only, written into `out`: the per-frame
   * reader's path (the HUD's gpu line), allocation-free. `stats()` builds the
   * per-label rows and is for the 1 Hz poll. */
  gpuSummary(out: FrameGpuSummary): FrameGpuSummary {
    this.gpuWindow.totals(this.totalsScratch);
    out.gpuSumAvg = this.totalsScratch.avg;
    out.gpuSumMax = this.totalsScratch.max;
    out.gpuSupported = this.gpuSupported;
    out.gpuWallTimeOnly = this.wallTimeOnly;
    return out;
  }

  stats(): FrameSegmentStats {
    const totals = { avg: 0, max: 0 };
    this.gpuWindow.totals(totals);
    return {
      gpu: this.gpuWindow.stats(),
      cpu: this.cpuWindow.stats(),
      gpuSumAvg: totals.avg,
      gpuSumMax: totals.max,
      gpuSupported: this.gpuSupported,
      gpuWallTimeOnly: this.wallTimeOnly,
      gpuSource: this.gpuSource,
    };
  }

  dispose(): void {
    if (this.renderer) this.renderer.backend.trackTimestamp = false;
    this.renderer = null;
    this.unwrapPool?.();
    this.unwrapPool = null;
    this.unwrapUid?.();
    this.unwrapUid = null;
    this.pool = null;
    this.uidLabels.clear();
    this.computeLabels.clear();
  }
}

/** The frame number in a three timestamp uid (`<context>:f<frame>`). */
export function frameOfUid(uid: string): number {
  const m = /:f(\d+)$/.exec(uid);
  return m ? Number.parseInt(m[1], 10) : -1;
}

/**
 * The studio creates one instance and provides it INSIDE the canvas tree, so
 * every renderer hook (vegetation, ground cover, sky, character, the water
 * pipeline) can mark without a global.
 */
export const FrameSegmentsContext = createContext<FrameSegments | null>(null);

export function useFrameSegments(): FrameSegments | null {
  return useContext(FrameSegmentsContext);
}

/** CPU label for the priority-0 work no hook has claimed. */
export const UNCLAIMED_CPU_LABEL = "other";

/**
 * `useFrame` whose main-thread time the HUD shows under `label` (walk 5 perf).
 * The CPU clock charges everything to the last mark until the next one, so a
 * hook that marks only its start also absorbs every unmarked hook after it
 * (that is how the "char" row came to carry the combat runtime, the actors
 * and the water surface). This marks the start AND hands the clock back to
 * `UNCLAIMED_CPU_LABEL` at the end. No allocation per frame; no-op without a
 * `FrameSegmentsContext` (the combat sandbox).
 */
export function useMarkedFrame(label: string, callback: RenderCallback, priority?: number): void {
  const segments = useFrameSegments();
  useFrame((state, delta, frame) => {
    if (!segments) { callback(state, delta, frame); return; }
    segments.cpuMark(label);
    try { callback(state, delta, frame); } finally { segments.cpuMark(UNCLAIMED_CPU_LABEL); }
  }, priority);
}
