import { describe, expect, it } from "vitest";
import { WaterData, type WaterMeta } from "./waterData";
import { WaterWorld } from "./waterWorld";
import { computeBuoyancy } from "./buoyancy";
import { SEMIDIURNAL_MINUTES, tideOffset, seasonOffset } from "./tide";
import { SEA, CREST_NOISE, seaRmsHeightM, whitecapCoverage, whitecapThreshold, stillWaterDriftMS, whitecapDriftMS } from "./waves";
import { FLOW_WAVES, FLOW_WAVE_MIN_SPEED_MS, GROUP_OMEGA, OMEGA_QUANTUM, SHORE_SWELL, STANDING_BY_CLASS, SWASH,
  SWASH_OMEGA, WAVES, fetchExposure, flowWaveAt, flowWaveGlsl, flowWaveOmega, gerstnerAt, gerstnerGlsl, hash21,
  jonswapShape, shoreSwellAt, snapOmega, standingRatioGlsl, standingWaveRatio, surfGlsl, surfGroup, surfaceWaveAt,
  swashAt, waveBands, waveExposure } from "./waves";

// ---------------------------------------------------------------------------
// Waves — the CPU/GLSL lockstep model
// ---------------------------------------------------------------------------

describe("waves", () => {
  const out = { dx: 0, dz: 0, height: 0, nx: 0, ny: 1, nz: 0 };
  /** A real open-sea amplitude: the unit-rms table is scaled by this (the floor wind, full fetch). */
  const FULL = seaRmsHeightM(SEA.swellFloorWindMS, SEA.fetchMaxM);

  it("zero exposure means dead calm", () => {
    surfaceWaveAt(10, 20, 1234, 0, out);
    expect(out.height).toBe(0);
    expect(out.ny).toBe(1);
  });

  it("height stays inside the spectrum's amplitude budget", () => {
    const maxAmp = waveBands().reduce((s, b) => s + b.amp, 0);
    for (let i = 0; i < 200; i++) {
      surfaceWaveAt(i * 13.7, i * 7.1, i * 97.3, FULL, out);
      expect(Math.abs(out.height)).toBeLessThan(maxAmp * FULL + 1e-6);
      expect(out.ny).toBeGreaterThan(0.3); // no folded/degenerate normals
    }
  });

  it("JONSWAP bands: real swell at the peak, a UNIT-rms table scaled by wind and fetch", () => {
    const bands = waveBands();
    expect(bands.length).toBe(WAVES.bands);
    // longest band is genuine swell, shortest still resolvable by the grid
    expect(bands[0].wavelengthM).toBeCloseTo(WAVES.peakWavelengthM * WAVES.longestRatio, 6);
    expect(bands[bands.length - 1].wavelengthM).toBeGreaterThan(2.5);
    // energy peaks at the band nearest the peak wavelength
    const peakBand = bands.reduce((best, b) =>
      Math.abs(Math.log(b.wavelengthM / WAVES.peakWavelengthM)) < Math.abs(Math.log(best.wavelengthM / WAVES.peakWavelengthM)) ? b : best);
    expect(Math.max(...bands.map((b) => b.amp))).toBe(peakBand.amp);
    // Σ a²/2 = 1 m²: the table carries unit rms; the metres come from the sea
    const rms = Math.sqrt(bands.reduce((s, b) => s + b.amp * b.amp, 0) / 2);
    expect(rms).toBeCloseTo(1, 6);
    // deep-water dispersion, on the loop grid
    for (const b of bands) {
      expect(b.phaseSpeed).toBeCloseTo(Math.sqrt(9.81 * b.freq), 2);
      expect(b.phaseSpeed / OMEGA_QUANTUM).toBeCloseTo(Math.round(b.phaseSpeed / OMEGA_QUANTUM), 9);
      // per-band fetch: long swell needs long fetch, short chop the base 60 m
      expect(b.fetchM).toBeCloseTo(Math.max(WAVES.fetchMinM, WAVES.fetchPerWavelength * b.wavelengthM), 9);
    }
    // JONSWAP shape: peaked at ωp, γ-enhanced above a Pierson–Moskowitz sea
    const wp = 0.8;
    expect(jonswapShape(wp, wp)).toBeGreaterThan(jonswapShape(wp * 0.8, wp));
    expect(jonswapShape(wp, wp)).toBeGreaterThan(jonswapShape(wp * 1.25, wp));
    expect(jonswapShape(wp, wp, 3.3) / jonswapShape(wp, wp, 1)).toBeCloseTo(3.3, 6);
  });

  it("the sea's energy comes from the wind and the fetch (ruling 7), never a fixed number", () => {
    // JONSWAP fetch-limited growth under the Pierson–Moskowitz cap, Hs / 4
    expect(seaRmsHeightM(7, 60000)).toBeCloseTo(0.0016 * 7 * Math.sqrt(60000 / 9.81) / 4, 6);
    // the swell floor: a glassy weather day still carries the far storms' swell
    expect(seaRmsHeightM(0, 60000)).toBe(seaRmsHeightM(SEA.swellFloorWindMS, 60000));
    expect(seaRmsHeightM(2, 60000)).toBe(seaRmsHeightM(7, 60000));
    // grows with wind, and with fetch until fully developed
    expect(seaRmsHeightM(12, 60000)).toBeGreaterThan(seaRmsHeightM(7, 60000) * 1.5);
    expect(seaRmsHeightM(12, 300)).toBeLessThan(seaRmsHeightM(12, 60000) * 0.1);
    expect(seaRmsHeightM(30, 1e9)).toBeCloseTo(0.21 * 900 / 9.81 / 4, 6);
    // the calm sea is not muted (audit root cause 1): mean surface slope of
    // a 400 m open-water patch at the floor wind is a real swell's
    let slope = 0, n = 0;
    const rms = seaRmsHeightM(7, 60000);
    for (let z = 0; z < 400; z += 7.3) for (let x = 0; x < 400; x += 7.1) {
      gerstnerAt(x, z, 31.7, rms, out, 60000);
      slope += Math.hypot(out.nx, out.nz) / Math.max(out.ny, 1e-6); n++;
    }
    expect(slope / n).toBeGreaterThan(0.02);   // ~1.1°, the old table's 100 m band gave a third of that
    expect(rms).toBeGreaterThan(0.15);
  });

  it("whitecaps: 2–6 % of the sea from the floor wind to a storm, more in a squall, pattern and ripples drift downwind", () => {
    expect(whitecapCoverage(0)).toBeCloseTo(SEA.whitecap.calmCoverage, 9);
    expect(whitecapCoverage(7)).toBeCloseTo(0.02, 9);
    expect(whitecapCoverage(12)).toBeGreaterThan(0.05);
    expect(whitecapCoverage(12)).toBeLessThan(0.065);
    expect(whitecapCoverage(17)).toBeGreaterThan(0.1);
    expect(whitecapCoverage(40)).toBe(SEA.whitecap.maxCoverage);
    // the threshold is the matching upper quantile of the crest noise; the
    // noise's moments are re-measured here by porting the fragment's fbm
    const fract = (v: number) => v - Math.floor(v);
    const h21 = (px: number, py: number) => hash21(px, py);
    const noised = (x: number, y: number) => {
      const px = Math.floor(x), py = Math.floor(y);
      const fx = x - px, fy = y - py;
      const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10), uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
      const a = h21(px, py), b = h21(px + 1, py), c = h21(px, py + 1), d = h21(px + 1, py + 1);
      return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
    };
    const fbm = (x: number, y: number, oct: number) => {
      let amp = 0.5, sum = 0;
      for (let i = 0; i < oct; i++) {
        sum += amp * noised(x, y);
        const nx = 1.6 * x - 1.2 * y, ny = 1.2 * x + 1.6 * y;   // mat2(1.6, 1.2, -1.2, 1.6) column-major
        x = nx; y = ny; amp *= 0.5;
      }
      return sum;
    };
    void fract;
    const vals: number[] = [];
    for (let z = 0; z < 600; z += 1.7) for (let x = 0; x < 600; x += 1.9) {
      const px = x * 0.085, py = z * 0.085;
      vals.push(fbm(px, py, 3) * 0.5 + fbm(px * 2.7 + 11, py * 2.7 + 11, 2) * 0.5);
    }
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const std = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
    expect(mean).toBeCloseTo(CREST_NOISE.mean, 1);
    expect(std).toBeCloseTo(CREST_NOISE.std, 1);
    // ...and the threshold covers what it says: the share above it ≈ the coverage
    for (const wind of [7, 12]) {
      const thr = whitecapThreshold(wind);
      const share = vals.filter((v) => v > thr).length / vals.length;
      expect(share).toBeGreaterThan(whitecapCoverage(wind) * 0.5);
      expect(share).toBeLessThan(whitecapCoverage(wind) * 2.0);
    }
    // ripples on still water travel at their own phase speed, never 3 cm/s
    expect(stillWaterDriftMS(0)).toBeGreaterThanOrEqual(0.5);
    expect(stillWaterDriftMS(20)).toBeLessThanOrEqual(1.5);
    expect(whitecapDriftMS()).toBeGreaterThan(4);
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
      gerstnerAt(x, z, t, FULL, out); openRms += out.height * out.height;
      gerstnerAt(x, z, t, FULL, out, 80); lakeRms += out.height * out.height;
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
    gerstnerAt(31, 77, 12.5, FULL, a);
    gerstnerAt(31, 77, 12.5, FULL, a, Infinity, 0);
    gerstnerAt(31, 77, 12.5, FULL, b);
    expect(a.height).toBe(b.height);
    // s = 1: every band is a·sin(argS)·cos(ωt) — its time average is zero
    // everywhere and a single-band node never moves
    let mean = 0;
    for (let t = 0; t < 400; t += 0.25) mean += gerstnerAt(10, 20, t, FULL, a, Infinity, 1).height;
    expect(Math.abs(mean / 1600)).toBeLessThan(0.01);
    // standing motion has less horizontal sweep than travelling motion
    let swTr = 0, swSt = 0;
    for (let t = 0; t < 60; t += 0.1) {
      swTr += Math.abs(gerstnerAt(10, 20, t, FULL, a, Infinity, 0).dx);
      swSt += Math.abs(gerstnerAt(10, 20, t, FULL, a, Infinity, 1).dx);
    }
    expect(swSt).toBeLessThan(swTr);
    // the analytic normal matches a finite difference of the height at s = 0.4
    const e = 1e-3;
    for (const [x, z, t] of [[12, 40, 5], [300.2, 71.9, 33]]) {
      gerstnerAt(x, z, t, FULL, a, Infinity, 0.4);
      const hx = (gerstnerAt(x + e, z, t, FULL, b, Infinity, 0.4).height - gerstnerAt(x - e, z, t, FULL, b, Infinity, 0.4).height) / (2 * e);
      const hz = (gerstnerAt(x, z + e, t, FULL, b, Infinity, 0.4).height - gerstnerAt(x, z - e, t, FULL, b, Infinity, 0.4).height) / (2 * e);
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
      surfaceWaveAt(x, z, t, FULL, a, 500, 0.3);
      surfaceWaveAt(x, z, t + T, FULL, b, 500, 0.3);
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


  it("fixed-point inversion converges: rendered surface above (x,z) matches", () => {
    // sample the wave at the resolved rest position; its displaced x/z must
    // land back on the query point within a few cm
    for (const [x, z, t] of [[100, 50, 60], [2000, 3000, 7200], [512.3, 991.7, 300]]) {
      surfaceWaveAt(x, z, t, FULL, out);
      // re-run the forward map from the rest position the inversion found
      const rx = x - out.dx;
      const rz = z - out.dz;
      const fwd = { dx: 0, dz: 0, height: 0, nx: 0, ny: 1, nz: 0 };
      // forward sample at the rest position must displace back to ≈ (x, z)
      gerstnerAt(rx, rz, t, FULL, fwd);
      expect(Math.abs(rx + fwd.dx - x)).toBeLessThan(0.05);
      expect(Math.abs(rz + fwd.dz - z)).toBeLessThan(0.05);
    }
  });

  it("exposure model: the swell hands over to the shore swell at the waterline and dies in the shallows", () => {
    expect(waveExposure(0, 5)).toBe(0);
    expect(waveExposure(500, 0)).toBe(0);
    expect(waveExposure(500, 5)).toBe(1);
    expect(waveExposure((WAVES.handoverNearM + WAVES.handoverFarM) / 2, 5)).toBeCloseTo(0.5);
    // the fetch is a per-band limit, not an exposure term: 80 m of fetch
    // keeps the ripples and cuts the swell (see the sheltered-water test)
    expect(fetchExposure(SHORE_SWELL.fetchM, 0)).toBe(1);
    expect(fetchExposure(150, 0)).toBeCloseTo(0.25);
  });

  it("shore surf is gated by FETCH, not wave exposure (the round-7 lesson)", () => {
    // at the waterline itself (shoreDist ≈ 0, depth ≈ 0) waveExposure is 0 —
    // but with a big bay seaward, the swash must still move the waterline
    expect(waveExposure(0.5, 0.02)).toBeLessThan(0.01);
    const fetch = fetchExposure(SHORE_SWELL.fetchM, 0);
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
    expect(glsl).toContain(`${WAVES.handoverNearM.toFixed(1)}`);
    expect(glsl).toContain(`${SEA.swellFloorWindMS.toFixed(1)}`);
    // every band's wavenumber, amplitude, snapped frequency and fetch appear verbatim
    for (const b of waveBands()) {
      expect(glsl).toContain(`${b.freq}, ${b.amp}, ${b.phaseSpeed}, ${b.q}, ${b.phase0}`);
      expect(glsl).toContain(`clamp(fetchM / ${b.fetchM}`);
    }
    expect(glsl).toContain("EsWave esWaveSampleEx(vec2 pos, float exposure, float fetchM, float standing, float t)");
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
  it("falls from the high-water line on the semidiurnal period and never rises above it", () => {
    let min = Infinity;
    let max = -Infinity;
    for (let m = 0; m < SEMIDIURNAL_MINUTES * 4; m += 15) {
      const t = tideOffset(m, 0.5);
      min = Math.min(min, t);
      max = Math.max(max, t);
      expect(t).toBeLessThanOrEqual(1e-9);
      expect(t).toBeGreaterThanOrEqual(-1.0 - 1e-9);
    }
    expect(max).toBeGreaterThan(-0.05);
    expect(min).toBeLessThan(-0.6);
  });

  it("the season only draws the water DOWN from the line (owner 2026-09-13)", () => {
    expect(seasonOffset(1, 1.4)).toBeCloseTo(0, 9);
    expect(seasonOffset(-1, 1.4)).toBeCloseTo(-1.4);
    expect(seasonOffset(0, 1.4)).toBeCloseTo(-0.7);
    expect(seasonOffset(2, 1.4)).toBeCloseTo(0, 9);
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
      schemaVersion: 3,
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
