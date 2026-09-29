/**
 * Segmented frame timer (decision 0084, performance round 10).
 *
 * Round 9 left one GPU timer query and one main-thread span across the whole
 * frame, so a frame that costs ~19 ms CPU and ~12 ms GPU regardless of
 * triangle count, resolution or site could not say WHICH pass or stage it is.
 * This splits both clocks into labelled segments.
 *
 * GPU: `EXT_disjoint_timer_query_webgl2` allows exactly ONE active
 * TIME_ELAPSED query at a time, so `gpuMark(name)` ends the open query and
 * begins the next one; the old single whole-frame query is removed rather
 * than run beside this (it would be the second active query and fail). The
 * whole-frame `gpu a/b` the HUD already showed is recovered as the SUM of the
 * segments.
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
/** Never let unresolved queries pile up if the driver stalls. */
const MAX_PENDING = 32;

type TimerExt = { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number };

interface PendingQuery {
  query: WebGLQuery;
  label: string;
  frame: number;
}

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
  /** False when the timer-query extension is missing (GPU rows read n/a). */
  gpuSupported: boolean;
  /** True on Apple/Metal, where ANGLE reports WALL time for a timer query —
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
  private ctx: WebGL2RenderingContext | null = null;
  private ext: TimerExt | null = null;
  private wallTimeOnly = false;
  private open: PendingQuery | null = null;
  private pending: PendingQuery[] = [];
  /** Frame id of the segments being opened right now. */
  private frameId = 0;
  /** How many GPU queries this frame issued, so a frame commits when whole. */
  private issued = new Map<number, number>();
  private resolved = new Map<number, Map<string, number>>();
  private resolvedCount = new Map<number, number>();
  private gpuWindow = new Window();

  private cpuLabel: string | null = null;
  private cpuStart = 0;
  private cpuFrame = new Map<string, number>();
  private cpuWindow = new Window();
  private readonly totalsScratch = { avg: 0, max: 0 };

  /**
   * Bind the GL context. Split from the constructor so the studio can make
   * the instance outside the canvas (where the renderer does not exist yet)
   * and the first in-canvas hook binds it.
   */
  attach(renderer: { getContext(): unknown } | null): void {
    try {
      const raw = renderer?.getContext();
      if (typeof WebGL2RenderingContext !== "undefined"
        && raw instanceof WebGL2RenderingContext) {
        this.ctx = raw;
        this.ext = raw.getExtension("EXT_disjoint_timer_query_webgl2") as TimerExt | null;
        const debug = raw.getExtension("WEBGL_debug_renderer_info") as
          { UNMASKED_RENDERER_WEBGL: number } | null;
        const name = String(
          (debug ? raw.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null)
          ?? raw.getParameter(raw.RENDERER) ?? "");
        // Apple hardware means Metal in every browser, and Safari's
        // UNMASKED_RENDERER string names neither: the platform decides too.
        const nav = typeof navigator === "undefined" ? null : navigator;
        const platform = nav ? (nav.platform || nav.userAgent || "") : "";
        this.wallTimeOnly = /apple|metal/i.test(name)
          || /mac|iphone|ipad/i.test(platform);
      }
    } catch { this.ctx = null; this.ext = null; }
    if (!this.ext) this.ctx = null;
  }

  get gpuSupported(): boolean { return Boolean(this.ctx && this.ext); }

  /** End the open GPU segment (if any) and begin one labelled `name`. */
  gpuMark(name: string): void {
    const { ctx, ext } = this;
    if (!ctx || !ext) return;
    try {
      this.closeGpu();
      if (this.pending.length >= MAX_PENDING) return;
      const query = ctx.createQuery();
      if (!query) return;
      ctx.beginQuery(ext.TIME_ELAPSED_EXT, query);
      this.open = { query, label: name, frame: this.frameId };
      this.issued.set(this.frameId, (this.issued.get(this.frameId) ?? 0) + 1);
    } catch { this.disableGpu(); }
  }

  /** End the open GPU segment without beginning another. */
  gpuEnd(): void {
    if (!this.ctx || !this.ext) return;
    try { this.closeGpu(); } catch { this.disableGpu(); }
  }

  private closeGpu(): void {
    if (!this.open || !this.ctx || !this.ext) return;
    this.ctx.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push(this.open);
    this.open = null;
  }

  private disableGpu(): void {
    this.ctx = null;
    this.ext = null;
    this.open = null;
    this.pending = [];
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
   * Once per frame, after the last mark: commit the CPU frame and drain
   * whatever GPU queries the driver has finished. A frame's GPU row is
   * published only when every query it issued has come back, so the segments
   * of one frame always sum to that frame's GPU time.
   */
  collect(): void {
    this.cpuWindow.push(this.cpuFrame);
    this.cpuFrame = new Map();
    const committedFrame = this.frameId;
    this.frameId += 1;

    const { ctx, ext } = this;
    if (!ctx || !ext) return;
    try {
      const disjoint = ctx.getParameter(ext.GPU_DISJOINT_EXT) as boolean;
      const stillPending: PendingQuery[] = [];
      for (const p of this.pending) {
        const done = ctx.getQueryParameter(p.query, ctx.QUERY_RESULT_AVAILABLE) as boolean;
        if (!done) { stillPending.push(p); continue; }
        if (!disjoint) {
          const ms = (ctx.getQueryParameter(p.query, ctx.QUERY_RESULT) as number) / 1e6;
          let row = this.resolved.get(p.frame);
          if (!row) { row = new Map(); this.resolved.set(p.frame, row); }
          row.set(p.label, (row.get(p.label) ?? 0) + ms);
          this.resolvedCount.set(p.frame, (this.resolvedCount.get(p.frame) ?? 0) + 1);
        }
        ctx.deleteQuery(p.query);
      }
      this.pending = stillPending;
      if (disjoint) { this.resolved.clear(); this.resolvedCount.clear(); }
      for (const [frame, row] of this.resolved) {
        // Only frames whose marks are all closed and resolved can publish.
        if (frame > committedFrame) continue;
        if ((this.resolvedCount.get(frame) ?? 0) < (this.issued.get(frame) ?? 0)) continue;
        this.gpuWindow.push(row);
        this.resolved.delete(frame);
        this.resolvedCount.delete(frame);
        this.issued.delete(frame);
      }
      // Bound the bookkeeping if a frame never completes (context loss).
      for (const frame of this.issued.keys()) {
        if (committedFrame - frame > MAX_FRAMES) {
          this.issued.delete(frame);
          this.resolved.delete(frame);
          this.resolvedCount.delete(frame);
        }
      }
    } catch { this.disableGpu(); }
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
    };
  }

  dispose(): void {
    const { ctx, ext } = this;
    try {
      if (ctx && ext && this.open) ctx.endQuery(ext.TIME_ELAPSED_EXT);
      if (ctx) {
        for (const p of this.pending) ctx.deleteQuery(p.query);
        if (this.open) ctx.deleteQuery(this.open.query);
      }
    } catch { /* context already lost */ }
    this.open = null;
    this.pending = [];
  }
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
