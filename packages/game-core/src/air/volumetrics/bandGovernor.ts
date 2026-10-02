/**
 * The volumetric band per frame (decision 0112 §7): a `?vol=` URL override
 * wins; the WebGL backend is off; otherwise start medium, step down when the
 * median frame time over 2 s is above 20 ms, step up (to high at most) once
 * the 2 s median has stayed under 12 ms for 8 s; never two changes within 8 s. Frame times are what the host feeds
 * (CPU frame deltas: the wall time the player sees).
 */
import type { VolumetricBand } from "./froxelGrid";

const ORDER: VolumetricBand[] = ["off", "low", "medium", "high"];
export const DOWN_MS = 20;
export const UP_MS = 12;
export const DOWN_WINDOW_S = 2;
export const UP_WINDOW_S = 8;
/** No band change within this long of the last one, either way (hysteresis; walk 10 B stepped every 2 s). */
export const HOLD_S = 8;

/** The `vol` query parameter, when it names a band. */
export function volBandOverride(search: string): VolumetricBand | null {
  const v = new URLSearchParams(search).get("vol");
  return v === "off" || v === "low" || v === "medium" || v === "high" ? v : null;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export class BandGovernor {
  band: VolumetricBand;
  private readonly fixed: boolean;
  /** The last 2 s of frames: ms, and seconds since the last band change when recorded. */
  private frames: { ms: number; t: number }[] = [];
  private sinceChange = 0;
  /** Seconds the 2 s median has been under `UP_MS` without a break. */
  private calmS = 0;

  constructor(opts: { backend: "webgpu" | "webgl"; override?: VolumetricBand | null }) {
    if (opts.override) { this.band = opts.override; this.fixed = true; }
    else if (opts.backend === "webgl") { this.band = "off"; this.fixed = true; }
    else { this.band = "medium"; this.fixed = false; }
  }

  /** Feed one frame; returns the band for the next frame. */
  frame(frameMs: number): VolumetricBand {
    if (this.fixed || !(frameMs > 0)) return this.band;
    this.sinceChange += frameMs / 1000;
    this.frames.push({ ms: frameMs, t: this.sinceChange });
    const keepFrom = this.sinceChange - DOWN_WINDOW_S;
    let drop = 0;
    while (drop < this.frames.length && this.frames[drop].t < keepFrom) drop++;
    if (drop) this.frames.splice(0, drop);
    const i = ORDER.indexOf(this.band);
    const med = median(this.frames.map((f) => f.ms));
    this.calmS = med < UP_MS ? this.calmS + frameMs / 1000 : 0;
    if (this.sinceChange >= HOLD_S && i > 1 && med > DOWN_MS) return this.change(ORDER[i - 1]);
    if (this.calmS >= UP_WINDOW_S && i < ORDER.length - 1) return this.change(ORDER[i + 1]);
    return this.band;
  }

  private change(b: VolumetricBand): VolumetricBand {
    this.band = b;
    this.frames = [];
    this.sinceChange = 0;
    this.calmS = 0;
    return b;
  }
}
