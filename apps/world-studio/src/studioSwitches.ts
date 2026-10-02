/**
 * Diagnosis-only URL switches (webgpu10 C2; no effect unless present):
 * `?obuf=8` renders into an 8-bit output buffer instead of half-float,
 * `?tone=0` uses no tone mapping and linear output (no frame target),
 * `?refr=<scale>` overrides the water scene target scale (> 0),
 * `?msaa=0` creates the renderer with antialias off, so three's frame-buffer target and the canvas run at 0 samples
 *   and the water draw target to 0 samples (the bloom mips are already 0-sample; webgpu-diag14 Q2). MSAA stays on by default (0108 §6).
 * `?gcgpu=0` forces groundcover onto the CPU-cull path (the one WebGL uses) on native WebGPU; GPU cull stays on by default.
 * `?gpucull=0` forces every GpuCullPool user (vegetation and groundcover) onto the CPU-cull path, so every draw is a direct draw.
 * `?post=0` (CharacterMode) already switches the bloom pass off.
 */
export interface StudioSwitches {
  obuf8: boolean;
  tone0: boolean;
  /** Scene-target scale override, or null. */
  refr: number | null;
  msaa0: boolean;
  /** Groundcover GPU cull on native WebGPU; false only for `?gcgpu=0`. */
  gcGpu: boolean;
  /** GPU cull for all layers on native WebGPU; false only for `?gpucull=0`. */
  gpuCull: boolean;
}

/** Read at import: the App re-serialises the query string and drops keys it does not know before the water and sky mount. */
export const INITIAL_SWITCHES: Readonly<StudioSwitches> = Object.freeze(
  parseStudioSwitches(typeof location === "undefined" ? "" : location.search),
);

export function parseStudioSwitches(search: string): StudioSwitches {
  const q = new URLSearchParams(search);
  const refr = Number(q.get("refr"));
  return {
    obuf8: q.get("obuf") === "8",
    tone0: q.get("tone") === "0",
    msaa0: q.get("msaa") === "0",
    gcGpu: q.get("gcgpu") !== "0",
    gpuCull: q.get("gpucull") !== "0",
    refr: q.has("refr") && Number.isFinite(refr) && refr > 0 ? Math.min(refr, 2) : null,
  };
}
