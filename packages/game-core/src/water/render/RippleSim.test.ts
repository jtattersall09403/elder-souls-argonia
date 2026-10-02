import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { WebGPURenderer } from "three/webgpu";
import type { WorldWaterQuery } from "@elder-souls/contracts";
import { RippleBoundaryMask, RippleFrameScheduler, RippleSim, type RippleBoundarySampler } from "./RippleSim";
import { ripplePathConnected } from './rippleIsolation';

const pool: RippleBoundarySampler = () => ({ waterBodyId: "water.test.pool", depth: 1, surfaceHeight: 0 });

describe("ripple wet/body boundary", () => {
  it("clears an abruptly dried same-owner bridge before bounded readmission", () => {
    let stage = 0, queries = 0;
    const mask = new RippleBoundaryMask(16, 8, 0.2, x => {
      queries++;
      const depth = (Math.abs(x) < 0.6 ? 0.03 : 2) + stage;
      return { waterBodyId: depth > 0.004 ? 'water.pool' : null, depth, surfaceHeight: stage };
    }, 2);
    mask.setLevelOffsets(0, 0);
    mask.update(0, 0, 0, 0);
    expect(mask.labelAt(0, 0)).toBeGreaterThan(0);
    stage = -0.04;
    expect(mask.setLevelOffsets(0, stage)).toBe(true);
    expect(mask.labelAt(0, 0)).toBe(0); // no stale step before the refresh reaches this row
    for (let frame = 0; frame < 8; frame++) {
      queries = 0;
      mask.update(0, 0, 0, 1 / 60);
      expect(queries).toBeLessThanOrEqual(16 * 2 + 17 * 3);
    }
    expect(mask.labelAt(-2, 0)).toBeGreaterThan(0);
    expect(mask.labelAt(-2, 0)).toBe(mask.labelAt(2, 0));
    const labels = Array.from({ length: 256 }, (_, i) => mask.data[i * 4] + mask.data[i * 4 + 1] * 256);
    expect(ripplePathConnected(labels, 16, 4.5, 8.5, 12.5, 8.5)).toBe(false);
  });

  it("protects a deep pool whose connecting saddle is only just overtopped", () => {
    const mask = new RippleBoundaryMask(16, 8, 0.2, x => ({
      waterBodyId: 'water.pool', depth: 2, surfaceHeight: 0,
      wetMarginM: Math.abs(x) < 0.6 ? 0.005 : 1,
    }));
    mask.setLevelOffsets(0, 0); mask.update(0, 0, 0, 0);
    expect(mask.labelAt(0, 0)).toBe(0);
    expect(mask.labelAt(2, 0)).toBeGreaterThan(0);
  });

  it("continual small tide steps refresh normally without cancelling or full rescans", () => {
    let stage = 0, queries = 0;
    const mask = new RippleBoundaryMask(16, 8, 0.2, () => {
      queries++;
      return { waterBodyId: 'water.pool', depth: 2 + stage, surfaceHeight: stage };
    }, 2);
    mask.setLevelOffsets(0, 0); mask.update(0, 0, 0, 0);
    let refreshedFrames = 0;
    for (let frame = 0; frame < 240; frame++) {
      stage -= 0.0001;
      expect(mask.setLevelOffsets(stage, 0)).toBe(false);
      queries = 0;
      mask.update(0, 0, 0, 1 / 60);
      if (queries) refreshedFrames++;
      expect(queries).toBeLessThanOrEqual(16 * 2 + 17 * 3);
      expect(mask.data.filter((_, i) => i % 4 === 3 && mask.data[i] === 255)).toHaveLength(256);
    }
    expect(refreshedFrames).toBeGreaterThan(120);
  });

  it("does not restart the row cursor during a rapidly moving seasonal readmission", () => {
    const visited = new Set<number>();
    const mask = new RippleBoundaryMask(16, 8, 0.2, (_x, z) => {
      visited.add(Math.floor((z + 4) * 2));
      return { waterBodyId: 'water.pool', depth: 2, surfaceHeight: 0 };
    }, 2);
    mask.setLevelOffsets(0, 0); mask.update(0, 0, 0, 0);
    visited.clear();
    for (let frame = 1; frame <= 8; frame++) {
      mask.setLevelOffsets(0, -0.01 * frame);
      mask.update(0, 0, 0, 1 / 60);
    }
    for (let row = 0; row < 16; row++) expect(visited.has(row)).toBe(true);
    for (let frame = 0; frame < 8; frame++) mask.update(0, 0, 0, 1 / 60);
    expect(mask.data.filter((_, i) => i % 4 === 3 && mask.data[i] === 255)).toHaveLength(256);
  });

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

  it('copies and clears current with support, without adding a second boundary query', () => {
    let queries = 0;
    const mask = new RippleBoundaryMask(16, 8, 0.2, x => {
      queries++; return { waterBodyId: 'water.river', depth: 2, surfaceHeight: 0, flowX: x, flowZ: -12 };
    }, 2);
    mask.setLevelOffsets(0, 0); mask.update(0, 0, 0, 0);
    expect(queries).toBe(16 * 16 + 17 * 17);
    const old = mask.current[(8 * 16 + 9) * 2];
    mask.update(0.5, 0, 0, 0);
    expect(mask.current[(8 * 16 + 8) * 2]).toBe(old);
    expect(mask.current[(8 * 16 + 8) * 2 + 1]).toBe(-12);
    expect(mask.hasCurrent).toBe(true);
    mask.setLevelOffsets(0, -1);
    expect(mask.current.every(value => value === 0)).toBe(true);
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
  const calls: { kind: string; shift?: number[]; count?: number; drop?: number[]; dt?: number }[] = [];
  let target: unknown = null;
  let clearColor = new THREE.Color(0.1, 0.2, 0.3);
  let clearAlpha = 0.7;
  let scissorTest = true;
  let clears = 0;
  const links: { material: THREE.Material; target: THREE.RenderTarget | null; tone: THREE.ToneMapping }[] = [];
  const renderer = {
    compileAsync: (quad: THREE.Mesh) => {
      links.push({ material: quad.material as THREE.Material, target: target as THREE.RenderTarget | null, tone: renderer.toneMapping });
      return Promise.resolve(quad);
    },
    toneMapping: THREE.ACESFilmicToneMapping, autoClear: true,
    getRenderTarget: () => target,
    setRenderTarget: (next: unknown) => { target = next; },
    getClearColor: (color: THREE.Color) => color.copy(clearColor),
    getClearAlpha: () => clearAlpha,
    setClearColor: (color: THREE.ColorRepresentation, alpha: number) => { clearColor = new THREE.Color(color); clearAlpha = alpha; },
    getViewport: (v: THREE.Vector4) => v.set(0, 0, 800, 600), setViewport: () => {},
    getScissor: (v: THREE.Vector4) => v.set(10, 10, 700, 500), setScissor: () => {},
    getScissorTest: () => scissorTest, setScissorTest: (on: boolean) => { scissorTest = on; },
    clear: () => { clears++; },
    // QuadMesh.render(renderer) calls renderer.render(quad, camera); each pass
    // material is named "ripple.<kind>" and lists its own uniforms in userData.
    render: (quad: THREE.Mesh) => {
      const material = quad.material as THREE.Material;
      const kind = material.name.replace('ripple.', '');
      const u = material.userData.uniforms;
      calls.push(kind === 'advect' ? { kind, dt: u.deltaS.value } : kind === 'copy' ? { kind, shift: u.shift.value.toArray() }
        : kind === 'drop' ? { kind, count: u.dropCount.value, drop: u.drops[0].toArray() } : { kind });
    },
  };
  return { renderer: renderer as unknown as WebGPURenderer, calls, links, get clears() { return clears; } };
}

describe("ripple render scheduling", () => {
  it("links all four pass programs on the first step, against the half-float target untone-mapped (perf10 f11)", () => {
    const sim = new RippleSim({ boundarySize: 16, sampleBoundary: () => ({ waterBodyId: "water.pond", depth: 2, surfaceHeight: 0 }) as never });
    const { renderer, links } = fakeRenderer();
    sim.step(renderer, 0, 0, 0);
    const kinds = links.map(l => l.material.name.replace("ripple.", ""));
    expect(kinds.sort()).toEqual(["advect", "copy", "drop", "update"]);
    for (const l of links) {
      expect(l.target).toBeInstanceOf(THREE.RenderTarget);
      expect(l.target!.texture.type).toBe(THREE.HalfFloatType);
      expect(l.tone).toBe(THREE.NoToneMapping);
    }
    sim.step(renderer, 0, 0, 1 / 60);
    expect(links).toHaveLength(4);
  });

  it("skips the GPU step over an all-dry patch once the field is zero, resumes when water appears (perf10 f3)", () => {
    let wet = false;
    const sim = new RippleSim({ boundarySize: 16, sampleBoundary: () => (wet
      ? { waterBodyId: "water.pond", depth: 2, surfaceHeight: 0 }
      : { waterBodyId: null, depth: 0, surfaceHeight: 0 }) as never });
    const { renderer, calls } = fakeRenderer();
    sim.step(renderer, 0, 0, 1 / 60); // the one pass that zeroes the dry field
    expect(calls.some(c => c.kind === "update")).toBe(true);
    calls.length = 0;
    sim.addDrop(0, 0, 0.5, 0.1);
    sim.step(renderer, 0.3, 0, 1 / 60);
    sim.step(renderer, 0.6, 0, 1 / 60);
    expect(calls).toEqual([]);
    expect(sim.skippedSteps).toBe(2);
    wet = true; sim.invalidateBoundary();
    sim.step(renderer, 0.6, 0, 1 / 60);
    expect(calls.some(c => c.kind === "update")).toBe(true);
    sim.dispose();
  });
  it('advects full visible time once before bounded wave updates only where current exists', () => {
    let flowX = 12;
    const sim = new RippleSim({ boundarySize: 16, sampleBoundary: () => ({
      waterBodyId: 'water.river', depth: 2, surfaceHeight: 0, flowX, flowZ: 0,
    }) });
    const { renderer, calls } = fakeRenderer();
    sim.step(renderer, 0, 0, 1 / 30);
    expect(calls.map(call => call.kind)).toEqual(['copy', 'advect', 'update', 'update']);
    expect(calls.find(call => call.kind === 'advect')!.dt).toBe(1 / 30);
    flowX = 0; sim.invalidateBoundary(); calls.length = 0;
    sim.step(renderer, 0, 0, 1 / 60);
    expect(calls.map(call => call.kind)).toEqual(['copy', 'update']);
    sim.dispose();
  });
  it('keeps transport at real speed on slow/substep frames and stamps newborns after preceding transport', () => {
    const sim = new RippleSim({ boundarySize: 16, sampleBoundary: () => ({ waterBodyId: 'river', depth: 2, surfaceHeight: 0, flowX: 3 }) });
    const { renderer, calls } = fakeRenderer();
    sim.step(renderer, 0, 0, 0); calls.length = 0;
    sim.addDrop(0, 0, .5, .1);
    sim.step(renderer, 0, 0, .4);
    expect(calls.filter(c => c.kind === 'advect')).toEqual([{ kind: 'advect', dt: .4 }]);
    expect(calls.filter(c => c.kind === 'update')).toHaveLength(4);
    expect(calls.at(-1)?.kind).toBe('drop');
    calls.length = 0; sim.step(renderer, 0, 0, 1 / 240);
    expect(calls).toEqual([{ kind: 'advect', dt: 1 / 240 }]);
    sim.suspend(); calls.length = 0; sim.step(renderer, 0, 0, 0);
    expect(calls).toEqual([]);
    sim.dispose();
  });
  it("clears both old wave targets and queued impulses before rendering a changed season", () => {
    let season = 0;
    const sim = new RippleSim({ boundarySize: 32, sampleBoundary: () => ({
      waterBodyId: 'water.pool', depth: 0.03 + season, surfaceHeight: season,
    }) });
    sim.configureBoundary({ levelOffsets: () => ({ tide: 0, season }) } as unknown as WorldWaterQuery, () => 0);
    const render = fakeRenderer();
    sim.step(render.renderer, 0, 0, 0);
    expect(render.clears).toBe(2);
    sim.addDrop(0, 0, 0.5, 0.1);
    season = -0.1;
    render.calls.length = 0;
    sim.step(render.renderer, 0, 0, 1 / 60);
    expect(render.clears).toBe(4);
    expect(render.calls.map(call => call.kind)).toEqual(['copy', 'update']);
    sim.dispose();
  });

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

  it('stamps a swept path as drops spaced under a radius apart, bounded per frame', () => {
    const sim = new RippleSim({ boundarySize: 16, sampleBoundary: () => ({ waterBodyId: 'lake', depth: 2, surfaceHeight: 0 }) });
    const pending = () => (sim as unknown as { pendingDrops: unknown[] }).pendingDrops.length;
    sim.addPath(0, 0, 0, 0, 0.45, 0.04);
    expect(pending()).toBe(1);
    sim.addPath(0, 0, 1.0, 0, 0.45, 0.04);
    expect(pending()).toBe(1 + 3);
    sim.addPath(0, 0, 40, 0, 0.45, 0.04);
    expect(pending()).toBe(4 + 6);
    sim.addPath(NaN, 0, 1, 0, 0.45, 0.04);
    expect(pending()).toBe(10);
    sim.dispose();
  });
});

describe("ripple mask refresh cost (walk 5 perf)", () => {
  // A shore across the patch with a current, so labels, depth bytes and flow all vary.
  const shore = (level: { tide: number }): RippleBoundarySampler => (x, z) => {
    const depth = 0.4 + 0.08 * (x - 2) + 0.03 * Math.sin(z) + level.tide;
    return { waterBodyId: depth > 0.02 ? "water.test.shore" : null, depth, surfaceHeight: level.tide, flowX: 0.1 * z, flowZ: 0.3 };
  };
  const sameMask = (a: RippleBoundaryMask, b: RippleBoundaryMask) => {
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
    expect(Array.from(a.current)).toEqual(Array.from(b.current));
    expect(a.hasCurrent).toBe(b.hasCurrent);
  };

  it("an origin change or an in-place row refresh gives the full-refresh output for the same inputs", () => {
    const level = { tide: 0 };
    const moved = new RippleBoundaryMask(32, 16, 0.2, shore(level), 4, 1);
    moved.setLevelOffsets(0, 0); moved.update(0, 0, 0, 0);
    moved.update(1.5, -2, 0, 1 / 60);
    const fresh = new RippleBoundaryMask(32, 16, 0.2, shore(level), 4, 1);
    fresh.setLevelOffsets(0, 0); fresh.update(1.5, -2, 0, 0);
    sameMask(moved, fresh);
    // Level move past the epsilon: the in-place cycle converges on a fresh full build.
    level.tide = -0.05;
    moved.setLevelOffsets(level.tide, 0);
    for (let f = 0; f < 40; f++) moved.update(1.5, -2, 0, 1 / 60);
    const after = new RippleBoundaryMask(32, 16, 0.2, shore(level), 4, 1);
    after.setLevelOffsets(level.tide, 0); after.update(1.5, -2, 0, 0);
    sameMask(moved, after);
  });

  it("does no mask work and uploads nothing across frames with unchanged inputs", () => {
    let samples = 0;
    const level = { tide: 0 };
    const base = shore(level);
    const sim = new RippleSim({ boundarySize: 32, patchM: 16, sampleBoundary: (x, z, e) => { samples++; return base(x, z, e); } });
    sim.configureBoundary({ levelOffsets: () => ({ tide: level.tide, season: 0 }) } as unknown as WorldWaterQuery, () => 0);
    const { renderer } = fakeRenderer();
    const mask = (sim as unknown as { mask: RippleBoundaryMask }).mask;
    const tex = (sim as unknown as { maskTexture: THREE.DataTexture }).maskTexture;
    sim.step(renderer, 0, 0, 1 / 60);
    const version = tex.version;
    samples = 0;
    let walked = 0;
    for (let f = 0; f < 50; f++) { sim.step(renderer, 0, 0, 1 / 60); walked += mask.cellsWalked; }
    expect(samples).toBe(0);
    expect(walked).toBe(0);
    expect(tex.version).toBe(version);
    // No still-level safety cycle: ten more seconds of unchanged inputs sample nothing.
    for (let f = 0; f < 600; f++) sim.step(renderer, 0, 0, 1 / 60);
    expect(samples).toBe(0);
    expect(tex.version).toBe(version);
    sim.dispose();
  });

  it("a chunk arriving under the patch refreshes the mask within the rate limit; one elsewhere does nothing", () => {
    let samples = 0;
    const ground = { lifted: false };
    // Ground under x > 0 streams in dry once the chunk arrives.
    const sim = new RippleSim({ boundarySize: 32, patchM: 16, sampleBoundary: (x) => {
      samples++;
      const depth = ground.lifted && x > 0 ? -0.5 : 0.6;
      return { waterBodyId: depth > 0.02 ? "water.test.shore" : null, depth, surfaceHeight: 0 };
    } });
    sim.configureBoundary({ levelOffsets: () => ({ tide: 0, season: 0 }) } as unknown as WorldWaterQuery, () => 0);
    const { renderer } = fakeRenderer();
    const mask = (sim as unknown as { mask: RippleBoundaryMask }).mask;
    sim.step(renderer, 0, 0, 1 / 60);
    for (let f = 0; f < 30; f++) sim.step(renderer, 0, 0, 1 / 60);
    ground.lifted = true;
    samples = 0;
    sim.groundChanged(500, 500, 532, 532);          // far chunk: ignored
    for (let f = 0; f < 30; f++) sim.step(renderer, 0, 0, 1 / 60);
    expect(samples).toBe(0);
    sim.groundChanged(0, -32, 32, 0);               // overlaps the patch
    let frames = 0;
    while (mask.labelAt(4, 0) !== 0 && frames < 120) { sim.step(renderer, 0, 0, 1 / 60); frames++; }
    expect(mask.labelAt(4, 0)).toBe(0);             // dry ground now in the mask
    expect(frames).toBeLessThanOrEqual(12);        // 0.2 s rate limit, 16-row batches: was up to ~68 (1.13 s)
    expect(mask.labelAt(-4, 0)).not.toBe(0);
    sim.dispose();
  });

  it("uploads only the rows a level-driven refresh changed", () => {
    const level = { tide: 0 };
    // Only rows with z > 0 respond to the tide.
    const sim = new RippleSim({ boundarySize: 32, patchM: 16, sampleBoundary: (x, z) => {
      const depth = 0.4 + 0.08 * (x - 2) + (z > 0 ? level.tide : 0);
      return { waterBodyId: depth > 0.02 ? "water.test.shore" : null, depth, surfaceHeight: 0 };
    } });
    sim.configureBoundary({ levelOffsets: () => ({ tide: level.tide, season: 0 }) } as unknown as WorldWaterQuery, () => 0);
    const { renderer } = fakeRenderer();
    const textures = sim as unknown as { maskTexture: THREE.DataTexture; currentTexture: THREE.DataTexture };
    const consume = () => { for (const t of [textures.maskTexture, textures.currentTexture]) { t.onUpdate?.(t); } };
    sim.step(renderer, 0, 0, 1 / 60); consume();
    for (let f = 0; f < 12; f++) sim.step(renderer, 0, 0, 1 / 60);
    level.tide = -0.004; // past the 1 mm epsilon, under the 8 mm stale clear
    const rowsPerFrame: number[] = [];
    for (let f = 0; f < 3; f++) {
      sim.step(renderer, 0, 0, 1 / 60);
      const ranges = textures.maskTexture.updateRanges;
      expect(textures.currentTexture.updateRanges.length).toBe(ranges.length);
      for (const r of ranges) {
        expect(r.count).toBe(32 * 4);
        expect(Math.floor(r.start / (32 * 4))).toBeGreaterThanOrEqual(16); // a z > 0 row
      }
      rowsPerFrame.push(ranges.length);
      for (const t of [textures.maskTexture, textures.currentTexture]) t.clearUpdateRanges();
      consume();
    }
    // 16-row batches: rows 0-15 (z < 0) unchanged, rows 16-31 each changed once.
    expect(rowsPerFrame).toEqual([0, 16, 0]);
    sim.dispose();
  });
});
