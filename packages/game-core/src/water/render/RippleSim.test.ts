import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { RippleBoundaryMask, RippleFrameScheduler, RippleSim, type RippleBoundarySampler } from "./RippleSim";

const pool: RippleBoundarySampler = () => ({ waterBodyId: "water.test.pool", depth: 1, surfaceHeight: 0 });

describe("ripple wet/body boundary", () => {
  it("keeps thin dry banks and different bodies separate at the mask resolution", () => {
    const mask = new RippleBoundaryMask(16, 8, 0.2, (x) => ({
      waterBodyId: Math.abs(x) < 0.05 ? null : x < 0 ? "water.test.left" : "water.test.right",
      depth: Math.abs(x) < 0.05 ? 0 : 1, surfaceHeight: 0,
    }));
    mask.update(0, 0, 0, 0);
    expect(mask.labelAt(-0.25, 0)).toBe(0);
    expect(mask.labelAt(0.25, 0)).toBe(0);
    const left = mask.labelAt(-1, 0);
    const right = mask.labelAt(1, 0);
    expect(left).toBeGreaterThan(0);
    expect(right).toBeGreaterThan(0);
    expect(left).not.toBe(right);
    mask.update(0.5, 0, 0, 0.01);
    expect(mask.labelAt(-1, 0)).toBe(left);
    expect(mask.labelAt(1, 0)).toBe(right);
    expect(mask.labelAt(0.25, 0)).toBe(0);
  });

  it("resamples only exposed strips on movement and refreshes levels at 5 Hz", () => {
    let queries = 0;
    const mask = new RippleBoundaryMask(16, 8, 0.2, (x, z, epoch) => { queries++; return pool(x, z, epoch); });
    expect(mask.update(0, 0, 0, 0)).toBe(true);
    const fullQueries = queries;
    expect(fullQueries).toBeLessThan(256 * 2.2);
    expect(mask.update(0, 0, 0, 0.05)).toBe(false);
    expect(queries).toBe(fullQueries);
    mask.update(0.5, 0, 0, 0.05);
    const stripQueries = queries - fullQueries;
    expect(stripQueries).toBeLessThanOrEqual(16 * 4);
    mask.update(0.5, 0, 0, 0.1);
    expect(queries).toBe(fullQueries * 2 + stripQueries);
  });

  it("handles newly dry/flooded ground and explicit terrain invalidation", () => {
    let depth = 0;
    const mask = new RippleBoundaryMask(16, 8, 0.2, () => ({ waterBodyId: "water.test.pool", depth, surfaceHeight: depth }));
    mask.update(0, 0, 0, 0);
    expect(mask.labelAt(0, 0)).toBe(0);
    depth = 1;
    mask.update(0, 0, 0, 0.2);
    const label = mask.labelAt(0, 0);
    expect(label).toBeGreaterThan(0);
    depth = 0;
    mask.invalidate(); mask.update(0, 0, 0, 0);
    expect(mask.labelAt(0, 0)).toBe(0);
    depth = 1;
    mask.update(0, 0, 0, 0.2);
    expect(mask.labelAt(0, 0)).toBe(label);
  });

  it("resolves world-space impulses after large relocations without stale mask samples", () => {
    const mask = new RippleBoundaryMask(16, 8, 0.2, (x) => ({ waterBodyId: x > 100 ? "water.test.lake" : null, depth: 2, surfaceHeight: 10 }));
    expect(mask.labelAt(0, 0)).toBe(0);
    mask.update(0, 0, 0, 0);
    expect(mask.labelAt(0, 0)).toBe(0);
    mask.update(200, 300, 0, 0.01);
    expect(mask.labelAt(200, 300)).toBeGreaterThan(0);
    expect(mask.labelAt(0, 0)).toBe(0);
  });

  it("budgets recurring refreshes by rows while sampling newly exposed strips immediately", () => {
    let queries = 0;
    let depth = 1;
    const mask = new RippleBoundaryMask(16, 8, 0.2, () => {
      queries++;
      return { waterBodyId: "water.test.pool", depth, surfaceHeight: depth };
    }, 2);
    mask.update(0, 0, 0, 0);
    expect(mask.labelAt(0, 0)).toBeGreaterThan(0);
    queries = 0;
    depth = 0;
    mask.update(0, 0, 0, 0.2);
    expect(queries).toBe(16 * 2);
    for (let i = 0; i < 7; i++) mask.update(0, 0, 0, 1 / 60);
    expect(mask.labelAt(0, 0)).toBe(0);
    // Moving one cell cannot expose unknown support while a refresh is pending.
    depth = 1;
    mask.update(0.5, 0, 0, 1 / 60);
    expect(mask.labelAt(4.25, 0)).toBeGreaterThan(0);
  });
});

describe("ripple frame scheduling", () => {
  it("retains every recenter on frames without a physics step", () => {
    const scheduler = new RippleFrameScheduler(256, 64);
    const first = scheduler.advance(0.25, 0, 1 / 240);
    expect(first.steps).toBe(0);
    expect(first.shiftX).toBe(0.25 / 64);
    const second = scheduler.advance(0.5, 0.25, 1 / 240);
    expect(second.steps).toBe(0);
    expect(second.shiftX).toBe(0.25 / 64);
    expect(second.shiftZ).toBe(0.25 / 64);
    expect(scheduler.center.x).toBe(0.5);
  });

  it("runs the same fixed number of steps across frame rates and caps catch-up work", () => {
    for (const fps of [30, 60, 120, 144]) {
      const scheduler = new RippleFrameScheduler();
      let steps = 0;
      for (let i = 0; i < fps; i++) steps += scheduler.advance(0, 0, 1 / fps).steps;
      expect(steps).toBe(60);
      expect(scheduler.advance(0, 0, 60).steps).toBe(4);
    }
  });
});

function fakeRenderer() {
  const calls: { kind: string; shift?: number[]; count?: number; drop?: number[] }[] = [];
  let target: THREE.WebGLRenderTarget | null = null;
  let clearColor = new THREE.Color(0.1, 0.2, 0.3);
  let clearAlpha = 0.7;
  let scissorTest = true;
  const renderer = {
    toneMapping: THREE.ACESFilmicToneMapping, autoClear: true,
    getRenderTarget: () => target,
    setRenderTarget: (next: THREE.WebGLRenderTarget | null) => { target = next; },
    getClearColor: (color: THREE.Color) => color.copy(clearColor),
    getClearAlpha: () => clearAlpha,
    setClearColor: (color: THREE.ColorRepresentation, alpha: number) => { clearColor = new THREE.Color(color); clearAlpha = alpha; },
    getViewport: (v: THREE.Vector4) => v.set(0, 0, 800, 600), setViewport: () => {},
    getScissor: (v: THREE.Vector4) => v.set(10, 10, 700, 500), setScissor: () => {},
    getScissorTest: () => scissorTest, setScissorTest: (on: boolean) => { scissorTest = on; },
    clear: () => {},
    render: (scene: THREE.Scene) => {
      const u = (scene.children[0] as THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>).material.uniforms;
      calls.push(u.uShift ? { kind: "copy", shift: u.uShift.value.toArray() }
        : u.uDropCount ? { kind: "drop", count: u.uDropCount.value, drop: u.uDrops.value[0].toArray() }
          : { kind: "update" });
    },
  };
  return { renderer: renderer as unknown as THREE.WebGLRenderer, calls };
}

describe("ripple render scheduling", () => {
  it("recenters before batching all impulses into one pass, even without a physics step", () => {
    const sim = new RippleSim({ boundarySize: 16 });
    const { renderer, calls } = fakeRenderer();
    for (let i = 0; i < 32; i++) sim.addDrop(300, 200, 0.5, 0.1);
    sim.step(renderer, 300, 200, 1 / 240);
    expect(calls).toHaveLength(2);
    expect(calls[0].kind).toBe("copy");
    expect(calls[1].kind).toBe("drop");
    expect(calls[1].count).toBe(32);
    expect(calls[1].drop?.slice(0, 2)).toEqual([0.5, 0.5]);
    expect(renderer.getRenderTarget()).toBeNull();
    expect(renderer.toneMapping).toBe(THREE.ACESFilmicToneMapping);
    expect(renderer.autoClear).toBe(true);
    expect(renderer.getClearAlpha()).toBe(0.7);
    expect(renderer.getScissorTest()).toBe(true);
    sim.dispose();
  });

  it("does no rendering on idle substep frames and rejects invalid or dry drops", () => {
    const sim = new RippleSim({ boundarySize: 16, sampleBoundary: () => ({ waterBodyId: null, depth: 0, surfaceHeight: 0 }) });
    const { renderer, calls } = fakeRenderer();
    sim.step(renderer, 0, 0, 0);
    calls.length = 0;
    sim.addDrop(NaN, 0, 0.5, 0.1);
    sim.addDrop(0, 0, 0.5, 0.1);
    sim.step(renderer, 0, 0, 1 / 240);
    expect(calls).toHaveLength(0);
    sim.dispose(); sim.dispose();
  });
});
