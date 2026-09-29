/**
 * The temporal rung cross-fade (walk 5, 2026-09-29): the history push and the
 * coverage invariant the owner asked for — across a rung edge the two copies
 * of one plant together cover every pixel exactly once, every frame, whatever
 * the camera does; the card never fades to nothing before the next rung has
 * arrived; both copies are drawn only inside the fade window.
 */
import { describe, expect, it } from "vitest";
import {
  BAYER4_THRESHOLDS,
  createLodFadeUniforms,
  createLodHistory,
  LOD_FADE_S,
  LOD_FADE_SAMPLES,
  LOD_OPEN_M,
  LOD_TELEPORT_M,
  lodCopyCollapsed,
  lodFadeFactorsOver,
  lodPixelKept,
  pushLodHistory,
} from "./lodFade";

const FPS = 60;

/** The copy's distances from every history sample, as the shader forms them
 * (current position plus the stored offset). */
function distancesOf(offsets: Float32Array, camX: number, camZ: number, px: number, pz: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < LOD_FADE_SAMPLES; k++) {
    out.push(Math.hypot(camX + offsets[k * 2] - px, camZ + offsets[k * 2 + 1] - pz));
  }
  return out;
}

/** Walk a camera along `path(t)` and at every frame count, per Bayer
 * threshold, how many of the two copies at an edge keep the pixel. */
function walk(
  path: (t: number) => number,
  seconds: number,
  edge: number,
  onFrame: (t: number, kept: number[], nearBoth: boolean, fadeIn: number) => void,
): void {
  const history = createLodHistory();
  const offsets = new Float32Array(LOD_FADE_SAMPLES * 2);
  const nearBand: [number, number, number, number] = [0, edge, 0, 0];
  const farBand: [number, number, number, number] = [edge, LOD_OPEN_M, 0, 0];
  for (let f = 0; f <= seconds * FPS; f++) {
    const t = f / FPS;
    const x = path(t);
    pushLodHistory(history, x, 0, t, offsets);
    const ds = distancesOf(offsets, x, 0, 0, 0);
    const near = lodFadeFactorsOver(nearBand, ds);
    const far = lodFadeFactorsOver(farBand, ds);
    const kept = BAYER4_THRESHOLDS.map(
      (b) => Number(lodPixelKept(near, b)) + Number(lodPixelKept(far, b)));
    const both = !lodCopyCollapsed(near) && !lodCopyCollapsed(far);
    onFrame(t, kept, both, far.fadeIn);
  }
}

describe("temporal rung cross-fade", () => {
  it("covers every pixel exactly once on the way in, out, and jittering on the edge", () => {
    const edge = 60;
    const paths: Array<(t: number) => number> = [
      (t) => 80 - 10 * t,                          // walk in across the edge
      (t) => 40 + 12 * t,                          // walk out across it
      (t) => edge + 0.3 * Math.sin(t * 40),        // camera shake on the edge
      (t) => edge + 3 * Math.sin(t * 7),           // strafing back and forth
      (t) => (t < 1 ? 100 : 30),                   // a jump shorter than a teleport? no: a teleport
      (t) => 70 - 25 * t,                          // sprinting in (25 m/s)
    ];
    for (const path of paths) {
      walk(path, 4, edge, (_t, kept) => {
        for (const k of kept) expect(k).toBe(1);
      });
    }
  });

  it("fades over LOD_FADE_S, not instantly and not forever", () => {
    const edge = 60;
    // Cross the edge at t = 1 s, then stand still.
    let firstBoth = -1;
    let lastBoth = -1;
    let monotonic = true;
    let prevIn = 0;
    walk((t) => (t < 1 ? 70 - 0.001 * t : 50), 3, edge, (t, _kept, both, fadeIn) => {
      if (both) {
        if (firstBoth < 0) firstBoth = t;
        lastBoth = t;
      }
      // Standing on the far side the far copy is full; after the step it only
      // ever loses coverage (the near copy only gains): no dip and return.
      if (t >= 1 && fadeIn > prevIn + 1e-9) monotonic = false;
      prevIn = fadeIn;
    });
    // The jump from 70 to 50 is under the teleport threshold, so it fades.
    expect(LOD_TELEPORT_M).toBeGreaterThan(20);
    expect(firstBoth).toBeGreaterThanOrEqual(1);
    expect(lastBoth - firstBoth).toBeGreaterThan(LOD_FADE_S * 0.5);
    expect(lastBoth - firstBoth).toBeLessThanOrEqual(LOD_FADE_S + 2 / FPS);
    expect(monotonic).toBe(true);
  });

  it("a camera standing still draws exactly one copy (no half-dissolved ring)", () => {
    for (const x of [59.9, 60, 60.1, 30, 90]) {
      let both = false;
      walk(() => x, 1, 60, (t, _kept, b) => { if (t > LOD_FADE_S + 0.05 && b) both = true; });
      expect(both).toBe(false);
    }
  });

  it("a teleport refills the history instead of fading across it", () => {
    const history = createLodHistory();
    const offsets = new Float32Array(LOD_FADE_SAMPLES * 2);
    pushLodHistory(history, 0, 0, 0, offsets);
    pushLodHistory(history, 0, 0, 0.3, offsets);
    pushLodHistory(history, LOD_TELEPORT_M + 5, 0, 0.32, offsets);
    for (const v of offsets) expect(v).toBe(0);
  });

  it("an all-zero history is the live-distance rule (a renderer that never pushes)", () => {
    const zero = new Float32Array(LOD_FADE_SAMPLES * 2);
    const ds = distancesOf(zero, 61, 0, 0, 0);
    expect(lodFadeFactorsOver([0, 60, 0, 0], ds)).toEqual({ fadeIn: 1, fadeOut: 1 });
    expect(lodFadeFactorsOver([60, LOD_OPEN_M, 0, 0], ds)).toEqual({ fadeIn: 1, fadeOut: 0 });
  });

  it("writes the node uniform's Vector2s exactly as the flat offsets", () => {
    const u = createLodFadeUniforms();
    expect(u.esLodHist.array.length).toBe(LOD_FADE_SAMPLES);
    const a = createLodHistory();
    const b = createLodHistory();
    const flat = new Float32Array(LOD_FADE_SAMPLES * 2);
    for (let f = 0; f < 40; f++) {
      const t = f / FPS;
      pushLodHistory(a, 3 * t, -2 * t, t, flat);
      pushLodHistory(b, 3 * t, -2 * t, t, u.esLodHist.array);
    }
    for (let k = 0; k < LOD_FADE_SAMPLES; k++) {
      expect(u.esLodHist.array[k].x).toBeCloseTo(flat[k * 2], 5);
      expect(u.esLodHist.array[k].y).toBeCloseTo(flat[k * 2 + 1], 5);
    }
    expect(flat.some((v) => v !== 0)).toBe(true);
  });
});
