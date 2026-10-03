import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { FOG_NOISE, FogDrift, FogShapeBake, bakeFogShape, bakeFogWarp, fogShapeNoise, sunBurn, burnOff } from "./fogNoise";
import { fogRegimes, type FogFieldInput } from "./fogField";
import { Volumetrics } from "./froxelGrid";

// the mobile tier's 64^3 shape: the octave maths are the same at 128^3, and it bakes in ~0.1 s
const TEX = { shape: bakeFogShape(64), shapeTexels: 64, warp: bakeFogWarp() };
const HIGH = FOG_NOISE.bands.high;

function corr(a: number[], b: number[]): number {
  const n = a.length;
  const ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
  return sab / Math.sqrt(saa * sbb);
}
/** The shape on a 64 x 64 grid over 1000 m at height 3 m, far from the eye (4th octave at its mean). */
function slice(d: FogDrift, ox = 0, oz = 0): number[] {
  const out: number[] = [];
  for (let j = 0; j < 64; j++) for (let i = 0; i < 64; i++) out.push(fogShapeNoise(TEX, d, HIGH, ox + i * 15.7, 3, oz + j * 15.7, 0));
  return out;
}

describe("fog noise (vol10 A)", () => {
  it("(a) the octave sum does not repeat within 1500 m along x or z", () => {
    const d = new FogDrift(0);
    const xs: number[] = [];
    for (let i = 0; i < 3000; i++) xs.push(fogShapeNoise(TEX, d, HIGH, i * 1.0, 3, 0, 1));
    const zs: number[] = [];
    for (let i = 0; i < 3000; i++) zs.push(fogShapeNoise(TEX, d, HIGH, 0, 3, i * 1.0, 1));
    let worst = 0;
    for (let lag = 40; lag <= 1500; lag += 1) {
      for (const s of [xs, zs]) worst = Math.max(worst, corr(s.slice(0, 3000 - lag), s.slice(lag)));
    }
    expect(worst).toBeLessThan(0.5);
  });
  it("(b) the field at t, t + 91 s and t + 250 s differs (no loop of the old 91 s / 250 s translations)", () => {
    const d = new FogDrift(0);
    for (let k = 0; k < 600; k++) d.step(1, 0.3, 0);
    const a = slice(d);
    for (let k = 0; k < 91; k++) d.step(1, 0.3, 0);
    const b = slice(d);
    for (let k = 0; k < 159; k++) d.step(1, 0.3, 0);
    const c = slice(d);
    expect(corr(a, b)).toBeLessThan(0.97);
    expect(corr(a, c)).toBeLessThan(0.95);
  });
  it("(c) a wind change at t = 3000 s moves the offsets by at most wind x rate x dt (no teleport)", () => {
    const d = new FogDrift(0);
    for (let k = 0; k < 3000 * 4; k++) d.step(0.25, 2, 1);
    const before = Float64Array.from(d.octaveO);
    d.step(1 / 60, -3, 0.5);
    for (let k = 0; k < 4; k++) {
      const moved = Math.hypot(d.octaveO[2 * k] - before[2 * k], d.octaveO[2 * k + 1] - before[2 * k + 1]);
      expect(moved).toBeLessThanOrEqual(Math.hypot(-3, 0.5) * FOG_NOISE.octaves[k].rate / 60 + 1e-9);
    }
    for (const v of d.octaveOff) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
  it("(d) the clock does not wrap at 8192 s: the frame step across it equals the step elsewhere", () => {
    const d = new FogDrift(0);
    for (let k = 0; k < 8191 * 2; k++) d.step(0.5, 0.3, 0);
    const a = slice(d); d.step(1, 0.3, 0); const b = slice(d);
    for (let k = 0; k < 3000; k++) d.step(1, 0.3, 0);
    const c = slice(d); d.step(1, 0.3, 0); const e = slice(d);
    expect(d.t).toBeGreaterThan(8192);
    const step = (p: number[], q: number[]) => p.reduce((s, v, i) => s + Math.abs(v - q[i]), 0) / p.length;
    expect(step(a, b)).toBeLessThan(0.04) // morph 0.005 periods/s and the 47 m octave (vol10 diag7 O4);
    expect(step(a, b)).toBeLessThan(step(c, e) * 3 + 0.005);
    d.step(1e6, 0.3, 0);
    for (const v of d.octaveOff) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
  it("(e) coverage falls as the sun climbs from 4 to 25 deg; burn-off is monotone in coverage", () => {
    const base: FogFieldInput = { minuteOfDay: 6 * 60 + 30, sunriseMin: 6 * 60, sunsetMin: 18 * 60, prevNightClearCalm: 1,
      hoursSinceRain: Infinity, rain: 0, windSpeedMS: 0.5, windDirXZ: [1, 0], humidity: 0.6, wetSeason: 1 };
    let prev = Infinity;
    for (let e = 4; e <= 25; e += 3) {
      const r = fogRegimes({ ...base, sunElevationDeg: e });
      expect(r.radiationMist).toBeLessThan(prev + 1e-12);
      prev = r.radiationMist;
    }
    expect(fogRegimes({ ...base, sunElevationDeg: 25 }).radiationMist).toBeLessThan(fogRegimes({ ...base, sunElevationDeg: 4 }).radiationMist * 0.8);
    expect(sunBurn(4)).toBe(0); expect(sunBurn(25)).toBe(1);
    for (let c = 0.1; c < 1; c += 0.1) expect(burnOff(0.6, c + 0.1)).toBeGreaterThanOrEqual(burnOff(0.6, c));
  });
  it("(f) the fog uniforms do not move when only the camera moves", () => {
    const make = () => new Volumetrics({
      renderer: { compute: () => undefined } as never, backend: "webgpu", tier: "mobile",
      terrain: { groundHeight: () => 0, water: () => ({ height: 0, mask: 0 }), seaMask: () => 0, wetness: () => 0.5 },
      crowns: () => [],
    });
    const run = (v: Volumetrics, camX: number) => {
      v.setBand("low");
      const cam = new THREE.PerspectiveCamera(60, 1.5, 0.3, 3000);
      for (let k = 0; k < 30; k++) {
        cam.position.set(camX + k * 7, 2, -k * 3);
        v.update({ camera: cam, timeS: k, deltaS: 1, sunDir: new THREE.Vector3(0.3, 0.5, 0.2), sunIrradiance: new THREE.Color(1, 1, 1),
          skyIrradiance: new THREE.Color(0.3, 0.3, 0.3),
          fog: { minuteOfDay: 380, sunriseMin: 360, sunsetMin: 1080, prevNightClearCalm: 1, hoursSinceRain: Infinity, rain: 0,
            windSpeedMS: 1, windDirXZ: [0.6, 0.8], humidity: 0.7, wetSeason: 1, dayIndex: 3 } });
      }
      return [...v.drift.octaveOff, ...v.drift.warpOff, ...v.drift.cover, v.drift.phiA, v.drift.phiB, v.drift.wfade, v.drift.slow];
    };
    const a = make(), b = make();
    expect(run(a, 0)).toEqual(run(b, 5000));
    a.dispose(); b.dispose();
  });
  it("froxelGrid's kernel no longer reads fire's detail texture", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync(new URL("./froxelGrid.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/makeVolumeDetail|volumeFire/);
  });
  it("texture memory per tier: 8 MiB + 128 KiB high, 1 MiB + 128 KiB mobile", () => {
    expect(FOG_NOISE.textureBytes(128)).toBe(8 * 2 ** 20 + 128 * 1024);
    expect(FOG_NOISE.textureBytes(64)).toBe(2 ** 20 + 128 * 1024);
  });
});

describe("fog shape bake over frames", () => {
  it("writes the mean until done, then the whole bake at once, byte-identical to bakeFogShape", () => {
    const b = new FogShapeBake(16);
    const arr = b.data;
    let steps = 0;
    while (!b.step(3)) { steps++; expect(b.data[5]).toBe(128); }
    expect(b.done).toBe(true);
    expect(steps).toBe(Math.ceil((16 * 4) / 3) - 1);
    expect(b.data).toBe(arr);
    expect(Array.from(b.data)).toEqual(Array.from(bakeFogShape(16)));
    expect(b.step()).toBe(false);
  });
  it("Volumetrics bakes into the same texture: identity unchanged, re-uploaded once on completion", () => {
    const v = new Volumetrics({ renderer: {} as never, backend: "webgpu", tier: "mobile", terrain: {} as never, crowns: () => [] });
    const tex = v.fogShapeTexture;
    const data = tex.image.data;
    const version = tex.version;
    v.stepShapeBake(64 * 4 - 1);
    expect(tex.version).toBe(version);
    v.stepShapeBake(1);
    expect(v.fogShapeTexture).toBe(tex);
    expect(tex.image.data).toBe(data);
    expect(tex.version).toBe(version + 1);
    v.dispose();
  });
});
