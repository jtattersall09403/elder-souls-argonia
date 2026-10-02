import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createOcclusionCadence, createOcclusionSweep, hiddenBehindTerrain, topCornersOfBox } from "./terrainOcclusion";

describe("createOcclusionSweep", () => {
  it("spreads one pass over frames under its budget and applies the one-shot verdicts at the end", () => {
    const ridge = (x: number) => (x > 400 && x < 500 ? 300 : 0);
    const units = Array.from({ length: 10 }, (_, i) => ({
      mesh: { visible: i % 2 === 0 ? false : true },
      corners: [{ x: i < 5 ? 1000 : 300 + i, y: 10, z: 0 }],
    }));
    const before = units.map((u) => u.mesh.visible);
    const expected = units.map((u) => !hiddenBehindTerrain({ x: 0, y: 2, z: 0 }, u.corners, ridge));
    // A fake clock that advances 1 ms per read: the first (one-unit) batch
    // exhausts a 1 ms budget, so each frame tests exactly one unit.
    let t = 0;
    const sweep = createOcclusionSweep({ budgetMs: 1, batch: 4, now: () => (t += 1) });
    expect(sweep.step(ridge)).toBeNull();            // no pass yet
    sweep.start({ x: 0, y: 2, z: 0 }, units);
    for (let f = 0; f < 9; f++) expect(sweep.step(ridge)).toBeNull(); // units 0-8
    expect(units.map((u) => u.mesh.visible)).toEqual(before); // old result live mid-pass
    expect(sweep.step(ridge)).toBe(5);               // unit 9: pass done, 5 hidden
    expect(units.map((u) => u.mesh.visible)).toEqual(expected);
    expect(sweep.step(ridge)).toBeNull();
  });

  it("a cadence restart on a cold cache stays within the budgeted height samples per frame (diag10 C1)", () => {
    const ridge = (x: number) => (x > 400 && x < 500 ? 300 : 0);
    const units = Array.from({ length: 400 }, (_, i) => ({
      mesh: { visible: true },
      corners: topCornersOfBox(new THREE.Box3(
        new THREE.Vector3(200 + (i % 20) * 200, 0, Math.floor(i / 20) * 150 - 1500),
        new THREE.Vector3(260 + (i % 20) * 200, 20, Math.floor(i / 20) * 150 - 1440))),
    }));
    const expected = units.map((u) => !hiddenBehindTerrain({ x: 0, y: 2, z: 0 }, u.corners, ridge));
    // A cold sample costs 0.05 ms: the clock only moves on height samples.
    const COST = 0.05;
    let clock = 0; let calls = 0;
    const counting = (x: number) => { calls++; clock += COST; return ridge(x); };
    const sweep = createOcclusionSweep({ budgetMs: 0.5, now: () => clock });
    const unitMax = 5 * 130;            // samples one unit can cost (march bound)
    const cap = 0.5 / COST + unitMax * 5;   // budget + first unit + one batch of 4
    for (let restart = 0; restart < 3; restart++) {
      sweep.start({ x: 0, y: 2, z: 0 }, units);
      let result: number | null = null;
      while (result === null) {
        calls = 0;
        result = sweep.step(counting);
        expect(calls).toBeLessThanOrEqual(cap);
      }
      expect(result).toBe(expected.filter((v) => !v).length);
      expect(units.map((u) => u.mesh.visible)).toEqual(expected);
    }
  });

  it("writes only changed verdicts, at most 16 a frame, and lands the one-shot result", () => {
    const ridge = (x: number) => (x > 400 && x < 500 ? 300 : 0);
    const writes: number[] = [];
    let frameWrites = 0;
    const units = Array.from({ length: 100 }, (_, i) => {
      let v = true;
      return {
        mesh: { get visible() { return v; }, set visible(n: boolean) { v = n; frameWrites++; } },
        corners: [{ x: i % 2 === 0 ? 1000 : 300, y: 10, z: 0 }],
      };
    });
    const expected = units.map((u) => !hiddenBehindTerrain({ x: 0, y: 2, z: 0 }, u.corners, ridge));
    const changed = expected.filter((v) => !v).length;      // 50 start visible, end hidden
    const sweep = createOcclusionSweep({ budgetMs: 1e9, now: () => 0 });
    sweep.start({ x: 0, y: 2, z: 0 }, units);
    let result: number | null = null;
    while (result === null) { frameWrites = 0; result = sweep.step(ridge); writes.push(frameWrites); }
    expect(Math.max(...writes)).toBeLessThanOrEqual(16);
    expect(writes.reduce((a, b) => a + b, 0)).toBe(changed);
    expect(units.map((u) => u.mesh.visible)).toEqual(expected);
    // A second pass from the same eye changes nothing and writes nothing.
    sweep.start({ x: 0, y: 2, z: 0 }, units);
    frameWrites = 0;
    expect(sweep.step(ridge)).toBe(changed);
    expect(frameWrites).toBe(0);
  });

  it("keeps one frame's step within its budget on a large grid and completes over K frames", () => {
    const ridge = (x: number) => (x > 400 && x < 500 ? 300 : 0);
    const units = Array.from({ length: 4000 }, (_, i) => ({
      mesh: { visible: true },
      corners: topCornersOfBox(new THREE.Box3(
        new THREE.Vector3(200 + (i % 80) * 60, 0, Math.floor(i / 80) * 60 - 1500),
        new THREE.Vector3(250 + (i % 80) * 60, 20, Math.floor(i / 80) * 60 - 1450))),
    }));
    const expected = units.map((u) => !hiddenBehindTerrain({ x: 0, y: 2, z: 0 }, u.corners, ridge));
    // A clock charged per height sample (0.01 ms each), so the budget test is
    // deterministic: the sweep reads only the clock, never the wall time.
    const COST = 0.01;
    let clock = 0;
    const charged = (x: number) => { clock += COST; return ridge(x); };
    const sweep = createOcclusionSweep({ budgetMs: 1, now: () => clock });
    sweep.start({ x: 0, y: 2, z: 0 }, units);
    let frames = 0; let worst = 0; let result: number | null = null;
    while (result === null) {
      const t0 = clock;
      result = sweep.step(charged);
      worst = Math.max(worst, clock - t0);
      frames++;
    }
    expect(frames).toBeGreaterThan(10);
    // The budget plus at most one 4-unit batch of overrun: 4 units x 5
    // corners x <= 130 samples a corner (the march-cost bound below).
    expect(worst).toBeLessThanOrEqual(1 + 4 * 5 * 130 * COST);
    expect(result).toBe(expected.filter((v) => !v).length);
    expect(units.map((u) => u.mesh.visible)).toEqual(expected);
  });
});

/** A synthetic ridge 200 m high between x = 300 and x = 320, flat elsewhere. */
const ridge = (x: number): number => (x > 300 && x < 320 ? 200 : 0);
const eye = { x: 0, y: 10, z: 0 };

describe("hiddenBehindTerrain", () => {
  it("hides a low corner beyond the ridge", () => {
    expect(hiddenBehindTerrain(eye, [{ x: 600, y: 0, z: 0 }], (x) => ridge(x))).toBe(true);
  });

  it("keeps a corner that stands above the line of sight", () => {
    expect(hiddenBehindTerrain(eye, [{ x: 600, y: 400, z: 0 }], (x) => ridge(x))).toBe(false);
  });

  it("keeps a mixed corner set: every corner must be hidden", () => {
    const corners = [{ x: 600, y: 0, z: 0 }, { x: 600, y: 400, z: 0 }];
    expect(hiddenBehindTerrain(eye, corners, (x) => ridge(x))).toBe(false);
  });

  it("sees everything from an eye above the ridge", () => {
    expect(hiddenBehindTerrain({ x: 0, y: 500, z: 0 }, [{ x: 600, y: 0, z: 0 }], (x) => ridge(x)))
      .toBe(false);
  });

  it("never blocks on missing data", () => {
    expect(hiddenBehindTerrain(eye, [{ x: 600, y: 0, z: 0 }], () => NaN)).toBe(false);
    expect(hiddenBehindTerrain(eye, [{ x: 600, y: 0, z: 0 }], () => -Infinity)).toBe(false);
  });

  it("keeps a unit closer than the skipped near band", () => {
    expect(hiddenBehindTerrain(eye, [{ x: 80, y: 0, z: 0 }], () => 500)).toBe(false);
  });

  it("gives five top points for a box", () => {
    const points = topCornersOfBox(new THREE.Box3(
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(10, 20, 30)));
    expect(points).toHaveLength(5);
    expect(points.every((p) => p.y === 20)).toBe(true);
    expect(points[4]).toEqual({ x: 5, y: 20, z: 15 });
  });
});

describe("createOcclusionCadence", () => {
  it("a phased, delayed second cadence never fires on the same frame as the first (diag10 C1)", () => {
    const camera = new THREE.PerspectiveCamera();
    const chunk = createOcclusionCadence();
    const apron = createOcclusionCadence({ phaseMs: 1000, delayFrames: 1 });
    let a = 0; let b = 0;
    for (let f = 0; f < 2000; f++) {
      if (f % 300 === 150) camera.position.x += 25;          // a move both see
      const t = f * 16.7;
      const fa = chunk(camera, t), fb = apron(camera, t);
      expect(fa && fb).toBe(false);
      if (fa) a++; if (fb) b++;
    }
    expect(a).toBeGreaterThan(10);
    expect(b).toBeGreaterThan(10);
  });

  it("fires first, then only on time or movement, never on a turn", () => {
    const camera = new THREE.PerspectiveCamera();
    camera.updateMatrixWorld();
    const due = createOcclusionCadence();
    expect(due(camera, 0)).toBe(true);
    expect(due(camera, 100)).toBe(false);
    camera.rotation.y = Math.PI / 2;
    camera.updateMatrixWorld();
    expect(due(camera, 200)).toBe(false);
    expect(due(camera, 2100)).toBe(true);
    camera.position.set(0, 0, 20);
    expect(due(camera, 2110)).toBe(true);
    expect(due(camera, 2120)).toBe(false);
  });
});

describe("march cost (perf10)", () => {
  it("marches a 6 km line in at most 130 samples and still finds a 150 m ridge at 3 km", () => {
    let calls = 0;
    const heightAt = (x: number) => { calls++; return x > 2950 && x < 3100 ? 200 : 0; };
    expect(hiddenBehindTerrain({ x: 0, y: 2, z: 0 }, [{ x: 6000, y: 10, z: 0 }], heightAt)).toBe(true);
    calls = 0;
    // An unblocked corner marches the whole line: the fixed 15 m step took 394 samples.
    expect(hiddenBehindTerrain({ x: 0, y: 2, z: 0 }, [{ x: 6000, y: 10, z: 0 }], () => { calls++; return 0; })).toBe(false);
    expect(calls).toBeLessThanOrEqual(130);
  });
});
