import { describe, expect, it } from "vitest";
import { WaterData, type WaterMeta } from "./waterData";
import { WaterWorld } from "./waterWorld";
import { computeBuoyancy } from "./buoyancy";
import { SEMIDIURNAL_MINUTES, tideOffset, seasonOffset } from "./tide";
import { FLOW_WAVES, FLOW_WAVE_MIN_SPEED_MS, GROUP_OMEGA, OMEGA_QUANTUM, SHORE_SWELL, STANDING_BY_CLASS, SWASH,
  SWASH_OMEGA, WAVES, fetchExposure, flowWaveAt, flowWaveGlsl, flowWaveOmega, gerstnerAt, gerstnerGlsl, hash21,
  jonswapShape, shoreSwellAt, snapOmega, standingRatioGlsl, standingWaveRatio, surfGlsl, surfGroup, surfaceWaveAt,
  swashAt, waveBands, waveExposure } from "./waves";

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
    const maxAmp = waveBands().reduce((s, b) => s + b.amp, 0);
    for (let i = 0; i < 200; i++) {
      surfaceWaveAt(i * 13.7, i * 7.1, i * 97.3, 1, out);
      expect(Math.abs(out.height)).toBeLessThan(maxAmp + 1e-6);
      expect(out.ny).toBeGreaterThan(0.3); // no folded/degenerate normals
    }
  });

  it("JONSWAP bands: real swell at the peak, rms energy equal to the retired table", () => {
    const bands = waveBands();
    expect(bands.length).toBe(WAVES.bands);
    // longest band is genuine swell, shortest still resolvable by the grid
    expect(bands[0].wavelengthM).toBeCloseTo(WAVES.peakWavelengthM * WAVES.longestRatio, 6);
    expect(bands[bands.length - 1].wavelengthM).toBeGreaterThan(2.5);
    // energy peaks at the band nearest the peak wavelength
    const peakBand = bands.reduce((best, b) =>
      Math.abs(Math.log(b.wavelengthM / WAVES.peakWavelengthM)) < Math.abs(Math.log(best.wavelengthM / WAVES.peakWavelengthM)) ? b : best);
    expect(Math.max(...bands.map((b) => b.amp))).toBe(peakBand.amp);
    // Σ a²/2 = rms² — the owner-calibrated energy of the 0.17 m × 0.76ⁱ table
    const rms = Math.sqrt(bands.reduce((s, b) => s + b.amp * b.amp, 0) / 2);
    expect(rms).toBeCloseTo(WAVES.rmsHeightM, 6);
    let oldSq = 0;
    for (let i = 0, a = 0.17; i < 10; i++, a *= 0.76) oldSq += a * a;
    expect(rms).toBeCloseTo(Math.sqrt(oldSq / 2), 2);
    // deep-water dispersion, on the loop grid
    for (const b of bands) {
      expect(b.phaseSpeed).toBeCloseTo(Math.sqrt(9.81 * b.freq), 2);
      expect(b.phaseSpeed / OMEGA_QUANTUM).toBeCloseTo(Math.round(b.phaseSpeed / OMEGA_QUANTUM), 9);
      // per-band fetch: long swell needs long fetch, short chop the base 60 m
      expect(b.fetchM).toBeCloseTo(Math.max(WAVES.fetchSaturationM, WAVES.fetchPerWavelength * b.wavelengthM), 9);
    }
    // JONSWAP shape: peaked at ωp, γ-enhanced above a Pierson–Moskowitz sea
    const wp = 0.8;
    expect(jonswapShape(wp, wp)).toBeGreaterThan(jonswapShape(wp * 0.8, wp));
    expect(jonswapShape(wp, wp)).toBeGreaterThan(jonswapShape(wp * 1.25, wp));
    expect(jonswapShape(wp, wp, 3.3) / jonswapShape(wp, wp, 1)).toBeCloseTo(3.3, 6);
  });

  it("directional spread is narrow at the peak and broad at the shortest band", () => {
    const bands = waveBands();
    const base = Math.atan2(WAVES.windDir[1], WAVES.windDir[0]);
    const off = (b: { dirX: number; dirZ: number }) => {
      let d = Math.atan2(b.dirZ, b.dirX) - base;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      return Math.abs(d);
    };
    for (let i = 0; i < bands.length; i++) {
      const b = bands[i];
      const bound = b.wavelengthM >= WAVES.peakWavelengthM ? WAVES.spreadPeak : WAVES.spreadShort;
      expect(off(b)).toBeLessThanOrEqual(bound + 1e-9);
      // the offset is the hashed fraction of the band's own spread
      const frac = Math.abs(hash21(i, 1.7) * 2 - 1);
      expect(off(b) / Math.max(frac, 1e-9)).toBeLessThanOrEqual(WAVES.spreadShort + 1e-9);
    }
    expect(off(bands[0])).toBeLessThanOrEqual(WAVES.spreadPeak + 1e-9);
  });

  it("sheltered water: fetch limits the long bands, so a lake carries chop, never swell", () => {
    // fully developed vs 80 m from shore (a ~160 m lake): the swell bands are
    // cut back, the short bands keep their energy
    const bands = waveBands();
    const swell = bands[0];
    expect(Math.min(80 / swell.fetchM, 1)).toBeLessThan(0.3);
    expect(Math.min(80 / bands[bands.length - 1].fetchM, 1)).toBe(1);
    let openRms = 0, lakeRms = 0;
    const n = 400;
    for (let i = 0; i < n; i++) {
      const x = i * 3.71, z = i * 1.93, t = i * 0.37;
      gerstnerAt(x, z, t, 1, out); openRms += out.height * out.height;
      gerstnerAt(x, z, t, 1, out, 80); lakeRms += out.height * out.height;
    }
    expect(Math.sqrt(lakeRms / n)).toBeLessThan(Math.sqrt(openRms / n) * 0.8);
    // marsh/river amplitude stays tiny: exposure (turbidity, fetch, depth)
    const marsh = waveExposure(20, 0.6, 0.8);
    expect(marsh).toBeLessThan(0.06);
    let peak = 0;
    for (let t = 0; t < 30; t += 0.3) peak = Math.max(peak, Math.abs(gerstnerAt(5, 5, t, marsh, out, 20).height));
    expect(peak).toBeLessThan(0.012);
  });

  it("standing waves: nodes stay put, s = 0 is the travelling form, normals stay analytic", () => {
    // s = 0 reproduces the plain travelling sum bit-for-bit
    const a = { ...out }, b = { ...out };
    gerstnerAt(31, 77, 12.5, 1, a);
    gerstnerAt(31, 77, 12.5, 1, a, Infinity, 0);
    gerstnerAt(31, 77, 12.5, 1, b);
    expect(a.height).toBe(b.height);
    // s = 1: every band is a·sin(argS)·cos(ωt) — its time average is zero
    // everywhere and a single-band node never moves
    let mean = 0;
    for (let t = 0; t < 400; t += 0.25) mean += gerstnerAt(10, 20, t, 1, a, Infinity, 1).height;
    expect(Math.abs(mean / 1600)).toBeLessThan(0.01);
    // standing motion has less horizontal sweep than travelling motion
    let swTr = 0, swSt = 0;
    for (let t = 0; t < 60; t += 0.1) {
      swTr += Math.abs(gerstnerAt(10, 20, t, 1, a, Infinity, 0).dx);
      swSt += Math.abs(gerstnerAt(10, 20, t, 1, a, Infinity, 1).dx);
    }
    expect(swSt).toBeLessThan(swTr);
    // the analytic normal matches a finite difference of the height at s = 0.4
    const e = 1e-3;
    for (const [x, z, t] of [[12, 40, 5], [300.2, 71.9, 33]]) {
      gerstnerAt(x, z, t, 1, a, Infinity, 0.4);
      const hx = (gerstnerAt(x + e, z, t, 1, b, Infinity, 0.4).height - gerstnerAt(x - e, z, t, 1, b, Infinity, 0.4).height) / (2 * e);
      const hz = (gerstnerAt(x, z + e, t, 1, b, Infinity, 0.4).height - gerstnerAt(x, z - e, t, 1, b, Infinity, 0.4).height) / (2 * e);
      // Gerstner normals are exact for the displaced surface; at these slopes
      // the rest-position gradient agrees to a few percent
      expect(-a.nx / a.ny).toBeCloseTo(hx, 1);
      expect(-a.nz / a.ny).toBeCloseTo(hz, 1);
    }
  });

  it("standing ratio by class: lakes and marsh bob, coast and rivers march, big lakes ease off", () => {
    expect(standingWaveRatio("coast", 1000)).toBe(0);
    expect(standingWaveRatio("river", 5)).toBe(0);
    expect(standingWaveRatio("lake", 50)).toBeCloseTo(STANDING_BY_CLASS.lake, 9);
    expect(standingWaveRatio("marsh", 20)).toBeCloseTo(STANDING_BY_CLASS.marsh, 9);
    expect(standingWaveRatio("estuary", 20)).toBeCloseTo(STANDING_BY_CLASS.estuary, 9);
    expect(standingWaveRatio("lake", 900)).toBe(0);
    expect(standingWaveRatio("unknown", 20)).toBe(0);
    const glsl = standingRatioGlsl(["none", "coast", "estuary", "river", "lake", "marsh"]);
    expect(glsl).toContain("if (ci == 4) base = 0.45;");
    expect(glsl).toContain("if (ci == 5) base = 0.5;");
    expect(glsl).toContain("smoothstep(300.0, 800.0, shoreDist)");
  });

  it("the whole field loops on WAVES.timePeriodS (frequencies snapped to 2π/8192)", () => {
    const T = WAVES.timePeriodS;
    expect(T).toBe(8192);
    expect(snapOmega(0.9) / OMEGA_QUANTUM).toBeCloseTo(Math.round(0.9 / OMEGA_QUANTUM), 9);
    expect(snapOmega(1e-9)).toBe(OMEGA_QUANTUM);
    const a = { ...out }, b = { ...out };
    for (const [x, z, t] of [[100, 50, 60.3], [2000, 3000, 7200.7], [512.3, 991.7, 8191.9]]) {
      surfaceWaveAt(x, z, t, 1, a, 500, 0.3);
      surfaceWaveAt(x, z, t + T, 1, b, 500, 0.3);
      expect(b.height).toBeCloseTo(a.height, 6);
      expect(b.nx).toBeCloseTo(a.nx, 6);
      flowWaveAt(x, z, 0.6, 0.8, 0.7, t, a);
      flowWaveAt(x, z, 0.6, 0.8, 0.7, t + T, b);
      expect(b.height).toBeCloseTo(a.height, 6);
      expect(swashAt(3, 1, t + T)).toBeCloseTo(swashAt(3, 1, t), 6);
      expect(shoreSwellAt(12, 1, 1, t + T)).toBeCloseTo(shoreSwellAt(12, 1, 1, t), 6);
      expect(surfGroup(7, t + T)).toBeCloseTo(surfGroup(7, t), 6);
    }
    expect(SWASH_OMEGA).toBeCloseTo(SWASH.omega, 3);
    expect(GROUP_OMEGA).toBeCloseTo(SWASH.groupOmega, 3);
  });

  it("crest statistic: whitecap density and storm growth stay in the reviewed range", () => {
    // The fragment's whitecap term is smoothstep(0.16, 0.34, height - still)
    // × exposure. Measure its mean over space/time for the retired geometric
    // table (34 m / 0.17 m / 0.76 / 1.31 / spread 0.9) and the JONSWAP set,
    // at calm (1), fresh (2) and squall (6) wind-wave scales.
    const sstep = (e0: number, e1: number, v: number) => {
      const t = Math.min(Math.max((v - e0) / (e1 - e0), 0), 1);
      return t * t * (3 - 2 * t);
    };
    const oldBands: { dx: number; dz: number; k: number; a: number; w: number; q: number; p0: number }[] = [];
    {
      const base = Math.atan2(WAVES.windDir[1], WAVES.windDir[0]);
      let k = (2 * Math.PI) / 34, a = 0.17;
      for (let i = 0; i < 10; i++) {
        const ang = base + (hash21(i, 1.7) * 2 - 1) * 0.9;
        oldBands.push({ dx: Math.cos(ang), dz: Math.sin(ang), k, a, w: Math.sqrt(9.81 * k), q: 0.62 / (k * a * 10), p0: hash21(i, 9.1) * 6.2831853 });
        k *= 1.31; a *= 0.76;
      }
    }
    const oldHeight = (x: number, z: number, t: number, exposure: number) => {
      let h = 0;
      for (const b of oldBands) h += b.a * exposure * Math.sin(b.k * (b.dx * x + b.dz * z) + t * b.w + b.p0);
      return h;
    };
    const stat = (height: (x: number, z: number, t: number) => number) => {
      let s = 0, n = 0;
      for (let t = 0; t < 64; t += 1.7) for (let z = 0; z < 400; z += 9.3) for (let x = 0; x < 400; x += 9.7) {
        s += sstep(0.16, 0.34, height(x, z, t)); n++;
      }
      return s / n;
    };
    const rows: string[] = [];
    for (const wind of [1, 2, 6]) {
      const before = stat((x, z, t) => oldHeight(x, z, t, wind));
      const after = stat((x, z, t) => gerstnerAt(x, z, t, wind, out).height);
      rows.push(`wind ${wind}: before ${before.toFixed(4)} after ${after.toFixed(4)}`);
      // same order of magnitude at every wind; monotone growth with wind
      expect(after).toBeGreaterThan(before * 0.5);
      expect(after).toBeLessThan(before * 2.0 + 0.002);
    }
    const afterCalm = stat((x, z, t) => gerstnerAt(x, z, t, 1, out).height);
    const afterStorm = stat((x, z, t) => gerstnerAt(x, z, t, 6, out).height);
    expect(afterStorm).toBeGreaterThan(afterCalm * 3);
    console.info("[waves] crest statistic (mean whitecap weight) " + rows.join("; "));
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

  it("shore surf is gated by FETCH, not wave exposure (the round-7 lesson)", () => {
    // at the waterline itself (shoreDist ≈ 0, depth ≈ 0) waveExposure is 0 —
    // but with a big bay seaward, the swash must still move the waterline
    expect(waveExposure(0.5, 0.02)).toBeLessThan(0.01);
    const fetch = fetchExposure(200, 0);
    expect(fetch).toBe(1);
    let hi = -Infinity;
    let lo = Infinity;
    for (let t = 0; t < 120; t += 0.25) {
      const s = swashAt(0.5, fetch, t);
      hi = Math.max(hi, s);
      lo = Math.min(lo, s);
    }
    // the waterline genuinely travels (vertical span >> the old 9 cm sine)
    expect(hi - lo).toBeGreaterThan(0.12);
    expect(Math.abs(hi)).toBeLessThan(SWASH.amplitudeM + 1e-6);
    // far from shore or with no fetch: dead flat
    expect(swashAt(SWASH.bandM + 1, fetch, 10)).toBe(0);
    expect(swashAt(0.5, 0, 10)).toBe(0);
  });

  it("shore swell shoals then collapses in the break zone", () => {
    const t = 42;
    // bounded everywhere
    for (let d = 0; d < 100; d += 1.7) {
      const h = shoreSwellAt(d, Math.max(d * 0.05, 0.2), 1, t);
      expect(Math.abs(h)).toBeLessThan(SHORE_SWELL.amplitudeM * 1.8 * 1.3 + 1e-6);
    }
    // deep offshore water far beyond the build zone: no shore swell at all
    expect(shoreSwellAt(SHORE_SWELL.buildFarM + 10, 8, 1, t)).toBe(0);
    // amplitude envelope peaks in the shoaling band, collapses at the beach:
    // compare oscillation spans (phase-independent), not instant values
    const span = (d: number, depth: number) => {
      let hi = -Infinity;
      let lo = Infinity;
      for (let tt = 0; tt < 90; tt += 0.2) {
        const h = shoreSwellAt(d, depth, 1, tt);
        hi = Math.max(hi, h);
        lo = Math.min(lo, h);
      }
      return hi - lo;
    };
    expect(span(15, 0.8)).toBeGreaterThan(span(1, 0.1) * 1.5);
  });

  it("surf GLSL twin bakes the shared shore constants", () => {
    const glsl = surfGlsl();
    expect(glsl).toContain(String(SWASH.omega));
    expect(glsl).toContain(String(SHORE_SWELL.k));
    expect(glsl).toContain("esSwash");
    expect(glsl).toContain("esShoreSwell");
    expect(glsl).toContain("esSurfFoam");
  });

  it("GLSL twin bakes the same constants as the CPU table", () => {
    const glsl = gerstnerGlsl();
    expect(glsl.match(/esWaveBand\(pos/g)?.length).toBe(WAVES.bands);
    expect(glsl).toContain(`${WAVES.fetchSaturationM.toFixed(1)}`);
    // every band's wavenumber, amplitude, snapped frequency and fetch appear verbatim
    for (const b of waveBands()) {
      expect(glsl).toContain(`${b.freq}, ${b.amp}, ${b.phaseSpeed}, ${b.q}, ${b.phase0}`);
      expect(glsl).toContain(`clamp(shoreDist / ${b.fetchM}`);
    }
    expect(glsl).toContain("EsWave esWaveSampleEx(vec2 pos, float exposure, float shoreDist, float standing, float t)");
    expect(glsl).toContain("EsWave esWaveSample(vec2 pos, float exposure, float t)");
    expect(glsl).toContain(`floor(omega / ${OMEGA_QUANTUM} + 0.5)) * ${OMEGA_QUANTUM}`);
    // the standing blend is the same algebra as gerstnerAt
    expect(glsl).toContain("float hh = sS * cT + tr * cS * sT;");
    expect(glsl).toContain("float dd = tr * cS * cT - sS * sT;");
    // low tier truncates
    expect(gerstnerGlsl(WAVES.lowTierBands).match(/esWaveBand\(pos/g)?.length).toBe(WAVES.lowTierBands);
  });
});

describe("flow waves (decision 0047 item 6)", () => {
  const out = { dx: 0, dz: 0, height: 0, nx: 0, ny: 1, nz: 0 };

  it("stays within the speed-scaled amplitude and never displaces horizontally", () => {
    for (const speed of [0.2, 0.8, 2, 3]) {
      const amp = FLOW_WAVES.ampBase + FLOW_WAVES.ampPerMS * Math.min(speed, FLOW_WAVES.ampSpeedCapMS);
      let peak = 0;
      for (let i = 0; i < 400; i++) {
        flowWaveAt(i * 0.37, i * 0.11, 0.6, 0.8, speed, i * 0.13, out);
        peak = Math.max(peak, Math.abs(out.height));
        expect(out.dx).toBe(0);
        expect(out.ny).toBeGreaterThan(0.9);
      }
      expect(peak).toBeLessThanOrEqual(amp + 1e-9);
      expect(peak).toBeGreaterThan(amp * 0.5);
    }
  });

  it("crests travel DOWNSTREAM at speed + 0.4 m/s (on the loop grid, within 0.1 %)", () => {
    // a crest at along-distance s at time t is at s + c·dt at t + dt; each
    // band's k·c is snapped to 2π/8192 so the field loops, which moves the
    // crest speed by under 0.1 %
    const speed = 0.5;
    const c = speed + FLOW_WAVES.phaseSpeedAddMS;
    const dir = [1, 0] as const;
    for (const b of FLOW_WAVES.bands) {
      const k = (2 * Math.PI) / b.wavelengthM;
      expect(Math.abs(flowWaveOmega(k, c) / k / c - 1)).toBeLessThan(1e-3);
    }
    // single-band check: exact at the snapped speed
    const k0 = (2 * Math.PI) / FLOW_WAVES.bands[0].wavelengthM;
    const cSnap = flowWaveOmega(k0, c) / k0;
    for (const [x0, t0, dt] of [[3.2, 1, 0.7], [10.1, 5, 1.3], [0.4, 12, 2.2]]) {
      const h0 = flowWaveAt(x0, 2, dir[0], dir[1], speed, t0, out).height;
      const h1 = flowWaveAt(x0 + cSnap * dt, 2, dir[0], dir[1], speed, t0 + dt, out).height;
      expect(h1).toBeCloseTo(h0, 4);
    }
  });

  it("GLSL twin bakes the same table and gate", () => {
    const glsl = flowWaveGlsl();
    expect(glsl).toContain("float esFlowWave(vec2 pos, vec2 dir, float speed, float t, out vec3 normal)");
    for (const b of FLOW_WAVES.bands) {
      expect(glsl).toContain(String((2 * Math.PI) / b.wavelengthM));
      expect(glsl).toContain(`amp * ${b.weight}`);
    }
    expect(glsl).toContain(`min(speed, ${FLOW_WAVES.ampSpeedCapMS.toFixed(1)})`);
    expect(glsl).toContain(`speed + ${FLOW_WAVES.phaseSpeedAddMS}`);
    expect(glsl).toContain("esSnapOmega(");
    expect(FLOW_WAVE_MIN_SPEED_MS).toBe(0.15);
  });

  it("the analytic normal matches a finite difference of the height", () => {
    const e = 1e-4;
    for (const [x, z, t] of [[5, 7, 3], [120.3, 44.1, 9.5], [1000, 2000, 60]]) {
      flowWaveAt(x, z, 0.28, 0.96, 1.2, t, out);
      const nx = out.nx / out.ny, nz = out.nz / out.ny;
      const hx = (flowWaveAt(x + e, z, 0.28, 0.96, 1.2, t, { ...out }).height
        - flowWaveAt(x - e, z, 0.28, 0.96, 1.2, t, { ...out }).height) / (2 * e);
      const hz = (flowWaveAt(x, z + e, 0.28, 0.96, 1.2, t, { ...out }).height
        - flowWaveAt(x, z - e, 0.28, 0.96, 1.2, t, { ...out }).height) / (2 * e);
      expect(-nx).toBeCloseTo(hx, 4);
      expect(-nz).toBeCloseTo(hz, 4);
    }
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

describe("wet-aware surface interpolation", () => {
  // 2×2: the west column is a pool (W = 1.5, depth 2), the east column is dry
  // ground buried at W = 7. Plain bilinear tilts the pool surface down into
  // the bank; the wet-aware mix holds it level to the last wet texel.
  function pool() {
    const size = 2;
    const meta: WaterMeta = {
      surface: { file: "", size, metresPerPixel: 10, minM: -10, maxM: 10, buryM: 3 },
      flow: { file: "", size, metresPerPixel: 10, flowMax: 3, shoreMaxM: 160 },
      klass: { file: "", size, metresPerPixel: 10, classes: ["none", "lake"] },
    };
    const surface = new Float32Array([1.5, 7, 1.5, 7]);
    const depth = new Float32Array([2, 0, 2, 0]);
    const flow = new Uint8ClampedArray(size * size * 4);
    const klass = new Uint8ClampedArray(size * size * 4);
    return new WaterData(meta, surface, depth, flow, klass);
  }

  it("keeps the pool surface level instead of doming into the buried bank", () => {
    const data = pool();
    for (const x of [5, 8, 12, 14]) {
      expect(data.surfaceBase(x, 5)).toBeCloseTo(1.5, 6);
    }
  });

  it("still fades the depth proxy to zero over the dry texel", () => {
    const data = pool();
    expect(data.depthProxy(5, 5)).toBeCloseTo(2, 6);
    expect(data.depthProxy(15, 5)).toBeCloseTo(0, 2);
    expect(data.depthProxy(10, 5)).toBeCloseTo(1, 6);
  });

  it("falls back to the plain mix where no corner is wet", () => {
    const data = pool();
    const meta = data.meta;
    const dry = new WaterData(meta, new Float32Array([7, 7, 7, 7]),
      new Float32Array(4), new Uint8ClampedArray(16), new Uint8ClampedArray(16));
    expect(dry.surfaceBase(10, 10)).toBeCloseTo(7, 6);
  });

  // decision 0047: signed depth. West = wet (+2), east = TABLE cell (−1: dry
  // now, floodable; carries the body's W) or BURIED (−3: W = ground − 3).
  function signed(eastDepth: number, eastW: number) {
    const size = 2;
    const meta: WaterMeta = {
      schemaVersion: 2,
      surface: { file: "", size, metresPerPixel: 10, minM: -10, maxM: 10, buryM: 3, depthMinM: -6, depthSpanM: 30.6 },
      flow: { file: "", size, metresPerPixel: 10, flowMax: 3, shoreMaxM: 160 },
      klass: { file: "", size, metresPerPixel: 10, classes: ["none", "lake"] },
    };
    const shore = new Float32Array(4);
    const season = new Float32Array([1, 1, 1, 1]);
    return new WaterData(meta, new Float32Array([1.5, eastW, 1.5, eastW]),
      new Float32Array([2, eastDepth, 2, eastDepth]), new Uint8ClampedArray(16), new Uint8ClampedArray(16), shore, season);
  }

  it("extends the level plane over a table texel but never into a buried one", () => {
    const table = signed(-1, 1.5);
    for (const x of [5, 10, 14]) expect(table.surfaceBase(x, 5)).toBeCloseTo(1.5, 6);
    const buried = signed(-3, -0.5);
    for (const x of [5, 10, 14]) expect(buried.surfaceBase(x, 5)).toBeCloseTo(1.5, 6);
    // …and the depth itself keeps the plain mix, so the buried side reads buried
    expect(buried.depthProxy(14.9, 5)).toBeLessThan(-2.5);
  });

  it("signed depth + lift decides wetness: a season floods the table band and a drought drains shallows", () => {
    const table = signed(-1, 1.5);
    expect(table.depthProxy(15, 5)).toBeCloseTo(-1, 1);
    expect(table.isWet(15, 5)).toBe(false);
    expect(table.isWet(15, 5, 0, 1.4)).toBe(true);      // wet season +1.4 m
    expect(table.depthAt(15, 5, 0, 1.4)).toBeCloseTo(0.4, 1);
    const shallow = signed(0.2, 1.5);
    expect(shallow.isWet(15, 5)).toBe(true);
    expect(shallow.isWet(15, 5, 0, -0.28)).toBe(false);  // dry season −0.28 m
  });
});

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

  it("rides the flow-wave twin on moving water so buoyancy matches the vertex stage", () => {
    // a 2x2 raster of river water flowing +x at 1 m/s, no real ground hook
    const size = 2;
    const meta: WaterMeta = {
      surface: { file: "", size, metresPerPixel: 10, minM: -10, maxM: 10, buryM: 3 },
      flow: { file: "", size, metresPerPixel: 10, flowMax: 3, shoreMaxM: 160 },
      klass: { file: "", size, metresPerPixel: 10, classes: ["none", "coast", "estuary", "river"] },
    };
    const flow = new Uint8ClampedArray(16);
    const klass = new Uint8ClampedArray(16);
    for (let i = 0; i < 4; i++) {
      flow[i * 4] = Math.round((1 / 3 / 2 + 0.5) * 255); flow[i * 4 + 1] = 128; flow[i * 4 + 3] = 0;
      klass[i * 4] = 3; klass[i * 4 + 1] = 0; klass[i * 4 + 2] = 0;
    }
    const data = new WaterData(meta, new Float32Array([2, 2, 2, 2]), new Float32Array([3, 3, 3, 3]), flow, klass,
      new Float32Array(4), new Float32Array(4));
    let t = 0;
    const world = new WaterWorld(data, { tidalAmplitudeM: 0, seasonalAmplitudeM: 0, seasonScalar: () => 0, waveTimeS: () => t });
    const heights: number[] = [];
    for (t = 0; t < 6; t += 0.25) heights.push(world.sample({ x: 10, y: 2, z: 10 }, 0).surfaceHeight);
    const span = Math.max(...heights) - Math.min(...heights);
    expect(span).toBeGreaterThan(0.02); // it moves
    expect(span).toBeLessThan(0.1);     // a few centimetres at 1 m/s
    const n = world.sample({ x: 10, y: 2, z: 10 }, 0).surfaceNormal;
    expect(Math.hypot(n.x, n.y, n.z)).toBeCloseTo(1, 6);
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
