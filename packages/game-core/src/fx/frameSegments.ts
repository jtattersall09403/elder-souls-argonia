/**
 * Segmented frame timer (decision 0084, performance round 10; node renderer
 * since decision 0109).
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
 * CPU: `performance.now()` between marks, committed synchronously.
 *
 * No module-level mutable state: the studio creates one `FrameSegments` and
 * passes it down through `FrameSegmentsContext`.
 */
import { createContext, useContext } from "react";

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

/** The slice of WebGPURenderer this timer reads. */
export interface TimedRenderer {
  resolveTimestampsAsync(type?: "render" | "compute"): Promise<number | undefined>;
  getRenderTarget(): { texture?: { name?: string } } | null;
  backend: {
    isWebGPUBackend?: boolean;
    trackTimestamp?: boolean;
    timestampQueryPool?: { render?: TimestampPool | null };
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

  /** Per-frame totals over every label, for the whole-frame line. */
  totals(): { avg: number; max: number } {
    const sums = this.frames.map((f) => {
      let s = 0;
      for (const v of f.values()) s += v;
      return s;
    });
    let max = 0;
    for (const f of this.maxima) {
      let s = 0;
      for (const v of f.values()) s += v;
      max = Math.max(max, s);
    }
    const avg = sums.length ? sums.reduce((a, b) => a + b, 0) / sums.length : 0;
    return { avg, max };
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
  private framesSinceResolve = 0;
  private gpuWindow = new Window();

  private cpuLabel: string | null = null;
  private cpuStart = 0;
  private cpuFrame = new Map<string, number>();
  private cpuWindow = new Window();

  /**
   * Bind the renderer. Split from the constructor so the studio can make
   * the instance outside the canvas (where the renderer does not exist yet)
   * and the first in-canvas hook binds it.
   */
  attach(renderer: TimedRenderer | null): void {
    this.renderer = renderer && typeof renderer.resolveTimestampsAsync === "function"
      ? renderer : null;
    // Apple hardware means Metal in every browser: the timestamp is the
    // pass's wall time on the GPU queue there, not its work (0084 r11).
    const nav = typeof navigator === "undefined" ? null : navigator;
    const platform = nav ? (nav.platform || nav.userAgent || "") : "";
    this.wallTimeOnly = /mac|iphone|ipad/i.test(platform);
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
    if (!this.renderer) return;
    this.bindPool();
    this.framesSinceResolve += 1;
    const pool = this.pool;
    if (!pool || this.resolving) return;
    const halfFull = pool.currentQueryIndex * 2 >= pool.maxQueries;
    if (this.framesSinceResolve < RESOLVE_EVERY && !halfFull) return;
    this.framesSinceResolve = 0;
    this.resolving = true;
    this.renderer.resolveTimestampsAsync("render")
      .then(() => this.drain(pool))
      .catch(() => { this.renderer = null; })
      .finally(() => { this.resolving = false; });
  }

  /** File every resolved pass under its frame and label, then forget it. */
  private drain(pool: TimestampPool): void {
    const frames = new Map<number, Map<string, number>>();
    for (const [uid, label] of this.uidLabels) {
      const ms = pool.timestamps.get(uid);
      if (ms === undefined) continue;
      const frame = frameOfUid(uid);
      let row = frames.get(frame);
      if (!row) { row = new Map(); frames.set(frame, row); }
      row.set(label, (row.get(label) ?? 0) + ms);
      this.uidLabels.delete(uid);
      // three never prunes this map; the uids are ours to forget once read.
      pool.timestamps.delete(uid);
    }
    for (const frame of [...frames.keys()].sort((a, b) => a - b)) {
      this.gpuWindow.push(frames.get(frame)!);
    }
    // Uids whose pass never resolved (pool overflow, lost device) must not pile up.
    if (this.uidLabels.size > 4096) this.uidLabels.clear();
  }

  stats(): FrameSegmentStats {
    const totals = this.gpuWindow.totals();
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
    this.unwrapPool?.();
    this.unwrapPool = null;
    this.pool = null;
    this.uidLabels.clear();
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
