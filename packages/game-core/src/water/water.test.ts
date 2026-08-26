import { describe, expect, it } from "vitest";
import { WaterData, type WaterMeta } from "./waterData";
import { WaterWorld } from "./waterWorld";
import { computeBuoyancy } from "./buoyancy";
import { SEMIDIURNAL_MINUTES, tideOffset, seasonOffset } from "./tide";
import { WAVES, gerstnerAt, gerstnerGlsl, surfaceWaveAt, waveExposure } from "./waves";

// ---------------------------------------------------------------------------
// Waves — the CPU/GLSL lockstep model
// ---------------------------------------------------------------------------

describe("waves", () => {
  const out = { dx: 0, dz: 0, height: 0, nx: 0, ny: 1, nz: 0 };

  it("zero exposure means dead calm", () => {
    surfaceWaveAt(10, 20, 1234, 0, out);
    expect(out.height).toBe(0);
    expect(out.ny).toBe(1);
  });

  it("height stays inside the spectrum's amplitude budget", () => {
    let maxAmp = 0;
    let amp = WAVES.baseAmplitude;
    for (let i = 0; i < WAVES.bands; i++) {
      maxAmp += amp;
      amp *= WAVES.ampMul;
    }
    for (let i = 0; i < 200; i++) {
      surfaceWaveAt(i * 13.7, i * 7.1, i * 97.3, 1, out);
      expect(Math.abs(out.height)).toBeLessThan(maxAmp + 1e-6);
      expect(out.ny).toBeGreaterThan(0.3); // no folded/degenerate normals
    }
  });

  it("fixed-point inversion converges: rendered surface above (x,z) matches", () => {
    // sample the wave at the resolved rest position; its displaced x/z must
    // land back on the query point within a few cm
    for (const [x, z, t] of [[100, 50, 60], [2000, 3000, 7200], [512.3, 991.7, 300]]) {
      surfaceWaveAt(x, z, t, 1, out);
      // re-run the forward map from the rest position the inversion found
      const rx = x - out.dx;
      const rz = z - out.dz;
      const fwd = { dx: 0, dz: 0, height: 0, nx: 0, ny: 1, nz: 0 };
      // forward sample at the rest position must displace back to ≈ (x, z)
      gerstnerAt(rx, rz, t, 1, fwd);
      expect(Math.abs(rx + fwd.dx - x)).toBeLessThan(0.05);
      expect(Math.abs(rz + fwd.dz - z)).toBeLessThan(0.05);
    }
  });

  it("exposure model gates by fetch and depth", () => {
    expect(waveExposure(0, 5)).toBe(0);
    expect(waveExposure(500, 0)).toBe(0);
    expect(waveExposure(500, 5)).toBe(1);
    expect(waveExposure(WAVES.fetchSaturationM / 2, 5)).toBeCloseTo(0.5);
  });

  it("GLSL twin bakes the same constants as the CPU table", () => {
    const glsl = gerstnerGlsl();
    expect(glsl.match(/esWaveBand\(pos/g)?.length).toBe(WAVES.bands);
    expect(glsl).toContain(`${WAVES.fetchSaturationM.toFixed(1)}`);
    // first band's frequency appears verbatim
    const freq = (2 * Math.PI) / WAVES.baseWavelength;
    expect(glsl).toContain(String(freq));
    // low tier truncates
    expect(gerstnerGlsl(WAVES.lowTierBands).match(/esWaveBand\(pos/g)?.length).toBe(WAVES.lowTierBands);
  });
});

// ---------------------------------------------------------------------------
// Tide and season
// ---------------------------------------------------------------------------

describe("tide", () => {
  it("oscillates on the semidiurnal period within amplitude bounds", () => {
    let min = Infinity;
    let max = -Infinity;
    for (let m = 0; m < SEMIDIURNAL_MINUTES * 4; m += 15) {
      const t = tideOffset(m, 0.5);
      min = Math.min(min, t);
      max = Math.max(max, t);
      expect(Math.abs(t)).toBeLessThanOrEqual(0.5 + 1e-9);
    }
    expect(max).toBeGreaterThan(0.15);
    expect(min).toBeLessThan(-0.15);
  });

  it("wet season raises, dry season draws down gently", () => {
    expect(seasonOffset(1, 1.4)).toBeCloseTo(1.4);
    expect(seasonOffset(-1, 1.4)).toBeCloseTo(-0.28);
    expect(seasonOffset(0, 1.4)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// WaterWorld over a tiny synthetic raster
// ---------------------------------------------------------------------------

function tinyWorld() {
  // 4×4 surface raster, 10 m/px: west half sea (W=0 over ground −5),
  // east half dry upland (W = ground − 3)
  const size = 4;
  const meta: WaterMeta = {
    surface: { file: "", size, metresPerPixel: 10, minM: -10, maxM: 10, buryM: 3 },
    flow: { file: "", size, metresPerPixel: 10, flowMax: 3, shoreMaxM: 160 },
    klass: { file: "", size, metresPerPixel: 10, classes: ["none", "coast", "estuary", "river", "lake", "marsh"] },
  };
  const surface = new Float32Array(size * size);
  const depth = new Float32Array(size * size);
  const flow = new Uint8ClampedArray(size * size * 4);
  const klass = new Uint8ClampedArray(size * size * 4);
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const i = z * size + x;
      const isSea = x < 2;
      surface[i] = isSea ? 0 : 7; // dry ground 10 − bury 3
      depth[i] = isSea ? 5 : 0;
      flow[i * 4 + 0] = 128;
      flow[i * 4 + 1] = 128;
      flow[i * 4 + 3] = isSea ? 255 : 0;
      klass[i * 4 + 0] = isSea ? 1 : 0;
      klass[i * 4 + 1] = 64; // turbidity 0.25
      klass[i * 4 + 2] = isSea ? 255 : 0;
      klass[i * 4 + 3] = 0;
    }
  }
  const data = new WaterData(meta, surface, depth, flow, klass);
  return new WaterWorld(data, {
    tidalAmplitudeM: 0.5,
    seasonalAmplitudeM: 1.4,
    groundHeight: (x) => (x < 20 ? -5 : 10),
    seasonScalar: () => 0,
  });
}

describe("WaterWorld", () => {
  it("samples sea water with sane fields", () => {
    const w = tinyWorld().sample({ x: 5, y: -1, z: 15 }, 0);
    expect(w.waterBodyId).toBe("coast");
    expect(w.depth).toBeGreaterThan(4);
    expect(w.immersion).toBe(1);
    expect(w.salinity).toBeCloseTo(1);
    expect(Math.abs(w.surfaceHeight)).toBeLessThan(1.5); // tide + waves bounded
  });

  it("returns dry on upland", () => {
    const w = tinyWorld().sample({ x: 35, y: 11, z: 15 }, 0);
    expect(w.waterBodyId).toBeNull();
    expect(w.depth).toBe(0);
    expect(w.immersion).toBe(0);
  });

  it("tide moves the coast surface over time", () => {
    const ww = tinyWorld();
    const heights = [0, 0.25, 0.5, 0.75].map(
      (f) => ww.stillSurfaceAt(5, 15, f * SEMIDIURNAL_MINUTES),
    );
    const spread = Math.max(...heights) - Math.min(...heights);
    expect(spread).toBeGreaterThan(0.2);
  });

  it("immersion is continuous through the surface", () => {
    const ww = tinyWorld();
    let prev = ww.sample({ x: 5, y: 2, z: 15 }, 0).immersion;
    for (let y = 2; y >= -3; y -= 0.1) {
      const cur = ww.sample({ x: 5, y, z: 15 }, 0).immersion;
      expect(cur).toBeGreaterThanOrEqual(prev - 1e-9);
      expect(Math.abs(cur - prev)).toBeLessThan(0.12);
      prev = cur;
    }
  });

  it("interaction events buffer and drain", () => {
    const ww = tinyWorld();
    ww.emitInteraction({ kind: "splash", position: { x: 1, y: 0, z: 1 } });
    expect(ww.drainInteractions()).toHaveLength(1);
    expect(ww.drainInteractions()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Buoyancy
// ---------------------------------------------------------------------------

describe("buoyancy", () => {
  it("pushes a submerged crate up and a dry crate not at all", () => {
    const ww = tinyWorld();
    const params = {
      volumeM3: 0.5,
      linearDrag: 20,
      points: [
        { x: -0.4, y: 0, z: -0.4 }, { x: 0.4, y: 0, z: -0.4 },
        { x: -0.4, y: 0, z: 0.4 }, { x: 0.4, y: 0, z: 0.4 },
      ],
    };
    const id = (v: { x: number; y: number; z: number }) => v;
    const sub = computeBuoyancy(ww, 0, { x: 5, y: -2, z: 15 }, id, { x: 0, y: 0, z: 0 }, params);
    expect(sub.force.y).toBeGreaterThan(1000); // ~0.5 m³ fully under ≈ 4.9 kN
    expect(sub.immersion).toBeCloseTo(1);
    const dry = computeBuoyancy(ww, 0, { x: 35, y: 12, z: 15 }, id, { x: 0, y: 0, z: 0 }, params);
    expect(dry.force.y).toBe(0);
    expect(dry.immersion).toBe(0);
  });

  it("drag opposes water-relative velocity", () => {
    const ww = tinyWorld();
    const params = { volumeM3: 0.5, linearDrag: 40, points: [{ x: 0, y: 0, z: 0 }] };
    const r = computeBuoyancy(ww, 0, { x: 5, y: -2, z: 15 }, (v) => v, { x: 2, y: 0, z: 0 }, params);
    expect(r.force.x).toBeLessThan(0);
    expect(r.relativeSpeed).toBeGreaterThan(1.5);
  });
});
