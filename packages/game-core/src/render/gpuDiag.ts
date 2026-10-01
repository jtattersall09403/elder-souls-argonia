/**
 * Per-frame GPU churn counters (walk 9): what the device creates and uploads
 * each frame, so a real-GPU session (the owner's `&diag=1`) produces evidence
 * of resource churn without an agent at the machine.
 *
 * A settled scene creates no pipelines, shader modules, textures or node
 * builds per frame and few buffers; a rising count in the steady state is
 * per-frame material, geometry or render-target churn. Counters wrap ONE
 * device instance (never the prototypes) and one renderer; the caller owns
 * the returned object (no module state).
 */

/** Counters for one frame (or one second, in a rollup). */
export interface GpuDiagFrame {
  /** ms since page start at the frame's end */
  t: number;
  /** wall ms since the previous frame */
  ms: number;
  pipelines: number;
  shaders: number;
  builds: number;
  buffers: number;
  bufferBytes: number;
  bufferDestroys: number;
  textures: number;
  textureDestroys: number;
  bindGroups: number;
  writeBytes: number;
  textureWriteBytes: number;
  submits: number;
  draws: number;
  /** draws skipped because their material was still building (shaderBuildQueue) */
  deferred: number;
}

const ZERO = (): Omit<GpuDiagFrame, "t" | "ms"> => ({
  pipelines: 0, shaders: 0, builds: 0, buffers: 0, bufferBytes: 0, bufferDestroys: 0, textures: 0,
  textureDestroys: 0, bindGroups: 0, writeBytes: 0, textureWriteBytes: 0, submits: 0, draws: 0, deferred: 0,
});

export interface GpuDiag {
  /** the frame being counted (mutated by the hooks) */
  readonly current: Omit<GpuDiagFrame, "t" | "ms">;
  /** close the current frame into the ring; call once per animation frame */
  endFrame(now: number): GpuDiagFrame;
  /** the ring, oldest first */
  frames(): GpuDiagFrame[];
  /** one row per whole second, summed (fps = frames in that second) */
  seconds(): Array<GpuDiagFrame & { fps: number }>;
  /** material names whose node build ran most often (material churn), top 20 */
  buildsBy(): Array<[string, number]>;
  /** the whole record as a JSON-safe object */
  dump(): { capacity: number; frames: GpuDiagFrame[]; seconds: Array<GpuDiagFrame & { fps: number }>; buildsBy: Array<[string, number]> };
}

type Fn = (...a: never[]) => unknown;
function wrap<T extends object>(target: T, name: string, before: (...a: never[]) => void, after?: (r: unknown) => unknown): void {
  const obj = target as Record<string, unknown>;
  const f = obj[name] as Fn | undefined;
  if (typeof f !== "function") return;
  obj[name] = function (this: unknown, ...a: never[]) {
    before(...a);
    const r = f.apply(this, a);
    return after ? after(r) : r;
  };
}

/** Sum frames into whole-second rows. */
export function rollupSeconds(frames: GpuDiagFrame[]): Array<GpuDiagFrame & { fps: number }> {
  const out: Array<GpuDiagFrame & { fps: number }> = [];
  for (const f of frames) {
    const sec = Math.floor(f.t / 1000);
    let row = out.at(-1);
    if (!row || Math.floor(row.t / 1000) !== sec) { row = { t: sec * 1000, ms: 0, fps: 0, ...ZERO() }; out.push(row); }
    row.fps += 1; row.ms = Math.max(row.ms, f.ms);
    for (const k of Object.keys(ZERO()) as Array<keyof ReturnType<typeof ZERO>>) row[k] += f[k];
  }
  return out;
}

/**
 * Hook a WebGPU device (and optionally three's node manager, for material
 * builds). `capacity` frames are kept (default 7200: two minutes at 60 fps).
 */
export function createGpuDiag(device: GPUDevice | null, nodes?: { _createNodeBuilderState?: Fn } | null, capacity = 7200,
  deferredCount?: () => number): GpuDiag {
  let deferredSeen = deferredCount?.() ?? 0;
  let cur = ZERO();
  const ring: GpuDiagFrame[] = [];
  let last = -1;
  const byName = new Map<string, number>();
  if (device) {
    wrap(device, "createRenderPipeline", () => { cur.pipelines++; });
    wrap(device, "createRenderPipelineAsync", () => { cur.pipelines++; });
    wrap(device, "createComputePipeline", () => { cur.pipelines++; });
    wrap(device, "createComputePipelineAsync", () => { cur.pipelines++; });
    wrap(device, "createShaderModule", () => { cur.shaders++; });
    wrap(device, "createBindGroup", () => { cur.bindGroups++; });
    wrap(device, "createBuffer", (d: GPUBufferDescriptor) => { cur.buffers++; cur.bufferBytes += d.size; }, (b) => {
      wrap(b as object, "destroy", () => { cur.bufferDestroys++; });
      return b;
    });
    wrap(device, "createTexture", () => { cur.textures++; }, (t) => {
      wrap(t as object, "destroy", () => { cur.textureDestroys++; });
      return t;
    });
    // a typed array's dataOffset and size are in elements (three writes update ranges of a whole array)
    wrap(device.queue, "writeBuffer", (_b: never, _o: never, data: { byteLength?: number; BYTES_PER_ELEMENT?: number }, dataOffset?: number, size?: number) => {
      const el = data?.BYTES_PER_ELEMENT ?? 1;
      cur.writeBytes += (size ?? ((data?.byteLength ?? 0) / el - (dataOffset ?? 0))) * el;
    });
    wrap(device.queue, "writeTexture", (_d: never, data: { byteLength?: number }) => { cur.textureWriteBytes += data?.byteLength ?? 0; });
    wrap(device.queue, "submit", () => { cur.submits++; });
    const countDraws = (pass: object) => {
      for (const k of ["draw", "drawIndexed", "drawIndirect", "drawIndexedIndirect"]) wrap(pass, k, () => { cur.draws++; });
      return pass;
    };
    wrap(device, "createCommandEncoder", () => {}, (enc) => {
      wrap(enc as object, "beginRenderPass", () => {}, (p) => countDraws(p as object));
      return enc;
    });
    wrap(device, "createRenderBundleEncoder", () => {}, (p) => countDraws(p as object));
  }
  if (nodes && typeof nodes._createNodeBuilderState === "function") {
    wrap(nodes, "_createNodeBuilderState", (obj: { material?: { name?: string; type?: string } }) => {
      cur.builds++;
      const k = (obj?.material?.name || obj?.material?.type || "?").replace(/\d{3,}/g, "#");
      byName.set(k, (byName.get(k) ?? 0) + 1);
    });
  }
  const api: GpuDiag = {
    get current() { return cur; },
    endFrame(now) {
      if (deferredCount) { const d = deferredCount(); cur.deferred = d - deferredSeen; deferredSeen = d; }
      const f: GpuDiagFrame = { t: Math.round(now), ms: last < 0 ? 0 : Math.round((now - last) * 10) / 10, ...cur };
      last = now; cur = ZERO();
      ring.push(f); if (ring.length > capacity) ring.splice(0, ring.length - capacity);
      return f;
    },
    frames: () => ring.slice(),
    seconds: () => rollupSeconds(ring),
    buildsBy: () => [...byName].sort((a, b) => b[1] - a[1]).slice(0, 20),
    dump: () => ({ capacity, frames: ring.slice(), seconds: rollupSeconds(ring), buildsBy: api.buildsBy() }),
  };
  return api;
}
