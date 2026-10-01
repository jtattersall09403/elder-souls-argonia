import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  applyWindSway,
  createWindUniforms,
  reapplyWindSway,
  updateWindSway,
  windStiffness,
  WIND_REFERENCE_TRUNK_RADIUS_M,
  WIND_STIFFNESS_RANGE,
  WIND_TUNE_ATTRIBUTE,
  groundCoverSway,
  windGustAt,
  windGustEnvelope,
  windRustleGate,
  WIND_GUST,
} from "./windSway";

/** Eight ground-cover tips, each sampled at 60 Hz for 60 s. */
const ROOTS: [number, number][] = Array.from({ length: 8 }, (_, s) => [137.2 + s * 523, -48.9 + s * 311]);

function tipTrace(speedMS: number, gustiness: number, originXZ: [number, number]) {
  const out: { tip: number; rustle: number; env: number }[] = [];
  for (let i = 0; i < 3600; i++) {
    const r = groundCoverSway({ speedMS, gustiness, dirXZ: [1, 0], originXZ, heightM: 1, t: i / 60 });
    out.push({ tip: Math.hypot(r.along, r.across), rustle: Math.abs(r.across), env: r.envelope });
  }
  return out;
}

/** Fronts in an envelope trace (on above 0.25, off below 0.08), as durations in seconds. */
function fronts(env: number[]): number[] {
  const out: number[] = []; let on = -1;
  env.forEach((e, i) => {
    if (e > 0.25 && on < 0) on = i;
    if (e <= 0.08 && on >= 0) { out.push((i - on) / 60); on = -1; }
  });
  return out;
}

describe("the gust field (walk 9 owner correction: calm spells, separate fronts)", () => {
  it("is near still at 2 m/s with no gust", () => {
    for (const root of ROOTS) {
      const trace = tipTrace(2, 0, root);
      expect(trace.filter((s) => s.tip < 0.01).length / trace.length).toBeGreaterThan(0.8);
      expect(Math.max(...trace.map((s) => s.rustle))).toBeLessThan(0.002);
    }
  });
  it("at 8 m/s, gust 0.6: 3 to 12 fronts a minute lasting 2 to 15 s, a strongly varying envelope", () => {
    const counts: number[] = []; const durations: number[] = []; const cvs: number[] = [];
    for (const root of ROOTS) {
      const env = tipTrace(8, 0.6, root).map((s) => s.env);
      const f = fronts(env);
      counts.push(f.length); durations.push(...f);
      const mean = env.reduce((a, b) => a + b, 0) / env.length;
      cvs.push(Math.sqrt(env.reduce((a, b) => a + (b - mean) ** 2, 0) / env.length) / mean);
    }
    const meanCount = counts.reduce((a, b) => a + b, 0) / counts.length;
    expect(meanCount).toBeGreaterThanOrEqual(3);
    expect(meanCount).toBeLessThanOrEqual(12);
    const inRange = durations.filter((d) => d >= 2 && d <= 15).length / durations.length;
    expect(inRange).toBeGreaterThan(0.85);
    for (const cv of cvs) expect(cv).toBeGreaterThan(0.5);
  });
  it("at 14 m/s, gust 1: fronts every few seconds and a rustle over 2 cm as one passes", () => {
    for (const root of ROOTS) {
      const trace = tipTrace(14, 1, root);
      expect(fronts(trace.map((s) => s.env)).length).toBeGreaterThanOrEqual(3);
      expect(Math.max(...trace.filter((s) => s.env > 0.3).map((s) => s.rustle))).toBeGreaterThan(0.02);
    }
  });
  it("rolls fronts downwind: a root 5 m downwind sees the same front within 1 s", () => {
    for (const speed of [8, 14]) {
      const a = (t: number) => windGustEnvelope([100, 40], [1, 0], speed, 1, t);
      const b = (t: number) => windGustEnvelope([105, 40], [1, 0], speed, 1, t);
      let bestLag = 0; let bestErr = Infinity;
      for (let lag = 0; lag <= 3; lag += 0.01) {
        let err = 0;
        for (let t = 0; t < 60; t += 0.1) err += (b(t + lag) - a(t)) ** 2;
        if (err < bestErr) { bestErr = err; bestLag = lag; }
      }
      expect(bestLag).toBeGreaterThan(0);
      expect(bestLag).toBeLessThan(1);
      expect(bestErr).toBeLessThan(1e-3);
    }
  });
  it("tree bend mean stays near the calibrated 1 and the shader runs the same envelope and rustle gate", () => {
    let sum = 0; let n = 0;
    for (const root of ROOTS) for (let t = 0; t < 600; t += 0.5) { sum += windGustAt(root, [1, 0], 8, 0.6, t); n++; }
    expect(sum / n).toBeGreaterThan(0.6);
    expect(sum / n).toBeLessThan(1.2);
    expect(windRustleGate(2, 0, 0)).toBe(0);
    const material = new THREE.MeshStandardMaterial();
    applyWindSway(material, createWindUniforms());
    const vs = compile(material).vertexShader;
    expect(vs).toContain("float esGustEnvelope(");
    expect(vs).toContain("esRustleGate(esSpeedMS, esGustiness, esEnv)");
    expect(vs).toContain(`* ${WIND_GUST.slotM.toFixed(1)}`);
  });
});

/** A minimal stand-in for the object three.js passes to onBeforeCompile. */
function shaderStub() {
  return {
    uniforms: {} as Record<string, unknown>,
    vertexShader: "void main() {\n#include <begin_vertex>\n}",
    fragmentShader: "",
  };
}

function compile(material: THREE.Material) {
  const shader = shaderStub();
  material.onBeforeCompile(
    shader as unknown as THREE.WebGLProgramParametersWithUniforms,
    undefined as unknown as THREE.WebGLRenderer,
  );
  return shader;
}

describe("wind sway shader patch", () => {
  it("fades from the player's eye uniform, never the pass camera (shadow pass)", () => {
    const uniforms = createWindUniforms();
    updateWindSway(uniforms, 1, { windDirXZ: [1, 0], windSpeedMS: 5, gustiness: 0 }, new THREE.Vector3(3, 4, 5));
    expect(uniforms.esWindEye.value.toArray()).toEqual([3, 4, 5]);
    const material = new THREE.MeshStandardMaterial();
    applyWindSway(material, uniforms);
    const shader = compile(material);
    expect(shader.vertexShader).toContain("length(esWindEye - esInstanceOrigin)");
    expect(shader.vertexShader).not.toContain("cameraPosition - esInstanceOrigin");
    expect(shader.uniforms.esWindEye).toBe(uniforms.esWindEye);
  });

  it("injects the displacement and binds the shared uniforms", () => {
    const material = new THREE.MeshStandardMaterial();
    const uniforms = createWindUniforms();
    applyWindSway(material, uniforms);
    const shader = compile(material);
    expect(shader.vertexShader).toContain("esWindVec");
    expect(shader.uniforms.esWindTime).toBe(uniforms.esWindTime);
  });

  it("survives an onBeforeCompile overwrite via reapplyWindSway — CSM does", () => {
    // exactly this (plain assignment, no chaining), and round 5 shipped with
    // every tree motionless because the wind hook was wiped ~1 s after load.
    const material = new THREE.MeshStandardMaterial();
    const uniforms = createWindUniforms();
    applyWindSway(material, uniforms);
    let csmRan = false;
    material.onBeforeCompile = () => { csmRan = true; };
    reapplyWindSway(material);
    const shader = compile(material);
    expect(csmRan).toBe(true); // the newcomer still runs first
    expect(shader.vertexShader).toContain("esWindVec");
  });

  it("never injects twice, however many times it is applied", () => {
    const material = new THREE.MeshStandardMaterial();
    const uniforms = createWindUniforms();
    applyWindSway(material, uniforms);
    applyWindSway(material, uniforms);
    reapplyWindSway(material);
    reapplyWindSway(material);
    const shader = compile(material);
    expect(shader.vertexShader.match(/float esWindNoise\(/g)?.length ?? 0)
      .toBe(1); // one injection
  });

  it("ignores materials wind never touched", () => {
    const material = new THREE.MeshStandardMaterial();
    const before = material.onBeforeCompile;
    reapplyWindSway(material);
    expect(material.onBeforeCompile).toBe(before);
  });

  it("keys the program cache so a patched material cannot share a program", () => {
    const patched = new THREE.MeshStandardMaterial();
    const plain = new THREE.MeshStandardMaterial();
    applyWindSway(patched, createWindUniforms());
    expect(patched.customProgramCacheKey()).toContain("es-wind");
    expect(plain.customProgramCacheKey()).not.toContain("es-wind");
  });

  it("takes absolute time, so two callers per frame do not double the clock", () => {
    const uniforms = createWindUniforms();
    const wind = { windDirXZ: [1, 0] as const, windSpeedMS: 10, gustiness: 0.5 };
    updateWindSway(uniforms, 4.2, wind, new THREE.Vector3());
    updateWindSway(uniforms, 4.2, wind, new THREE.Vector3());
    expect(uniforms.esWindTime.value).toBe(4.2);
    expect(uniforms.esWindVec.value.x).toBeCloseTo(0.9);
  });

  it("declares the per-instance tune attribute only under instancing", () => {
    const material = new THREE.MeshStandardMaterial();
    applyWindSway(material, createWindUniforms());
    const shader = compile(material);
    expect(shader.vertexShader).toContain(`attribute vec3 ${WIND_TUNE_ATTRIBUTE}`);
    // Guarded, because the non-instanced path has no such attribute to bind,
    // and the foliage batches read the tune from their data texture instead.
    const declaration = shader.vertexShader.indexOf(
      `attribute vec3 ${WIND_TUNE_ATTRIBUTE}`);
    const guard = shader.vertexShader.lastIndexOf(
      "#if defined(USE_INSTANCING) && !defined(ES_BATCH_SLOTS)", declaration);
    expect(guard).toBeGreaterThan(-1);
  });

  it("measures height from the GROUND LINE, not the buried pivot", () => {
    // Terrain species are sunk deliberately; weighting from the pivot left the
    // trunk already displaced where it meets the soil (owner round 6:
    // "trunks look like they're swaying at their base").
    const material = new THREE.MeshStandardMaterial();
    applyWindSway(material, createWindUniforms());
    const shader = compile(material);
    expect(shader.vertexShader).toContain("esHeight = max(0.0, esLocal.y - esTune.y)");
  });

  it("carries the trunk/branch/leaf hierarchy and a travelling gust band", () => {
    const material = new THREE.MeshStandardMaterial();
    applyWindSway(material, createWindUniforms());
    const vs = compile(material).vertexShader;
    // Trunk bend by (height / plant height) squared, frequency by plant size.
    expect(vs).toContain("esProfile *= esProfile");
    expect(vs).toContain("inversesqrt(esPlantH)");
    // Branch sway and near-field leaf flutter.
    expect(vs).toContain("esBranchPhase");
    expect(vs).toContain("esLeafPhase");
    // The gust is the envelope carried downwind, sampled per instance.
    expect(vs).toContain("esGustEnvelope(esInstanceOrigin.xz, esDir, esSpeedMS, esGustiness, esT)");
    expect(vs).toContain("float u = dot(origin, dir) - t * (");
    // Plant height rides the tune's third channel.
    expect(vs).toContain("esTune.z");
    // The old two-sines-plus-swell branch is gone.
    expect(vs).not.toContain("esWindPhase");
    expect(vs).not.toContain("esT * 0.31");
    expect(vs).not.toContain("esRawHeight");
  });

  it("scales sway by the trunk's width, both ways off the reference", () => {
    expect(windStiffness(WIND_REFERENCE_TRUNK_RADIUS_M)).toBeCloseTo(1, 5);
    const [floor, ceiling] = WIND_STIFFNESS_RANGE;
    // A buttressed giant barely stirs; a slender trunk keeps the calibrated
    // amplitude and is never pushed ABOVE it (owner round 7: palms swayed
    // too much once thin trunks were allowed a multiplier over 1).
    expect(windStiffness(1.6)).toBe(floor);
    expect(windStiffness(0.05)).toBe(ceiling);
    expect(ceiling).toBe(1);
    // A 0.26 m palm trunk — the case the owner called out — must not exceed
    // the baseline it was tuned at.
    expect(windStiffness(0.26)).toBe(1);
    // Monotonic in between, and strictly decreasing with width.
    expect(windStiffness(0.25)).toBeGreaterThan(windStiffness(0.45));
    expect(windStiffness(0.45)).toBeLessThan(1);
  });

  it("reads the trunk width AT INSTANCE SCALE", () => {
    // The same species placed at x2 has a trunk twice as thick, so it must
    // sway less than its unscaled neighbour, not the same amount.
    expect(windStiffness(0.3, 2)).toBeLessThan(windStiffness(0.3, 1));
    expect(windStiffness(0.3, 2)).toBeCloseTo(windStiffness(0.6, 1), 6);
  });

  it("treats a species with no trunk capsule as neutral", () => {
    expect(windStiffness(0)).toBe(1);
    expect(windStiffness(Number.NaN)).toBe(1);
  });
});

describe("the ES_BATCH_SLOTS branch (0082 round 1, 0084 round 12)", () => {
  it("keeps the instancing branch and reads the batch data texture", () => {
    const material = new THREE.MeshStandardMaterial();
    applyWindSway(material, createWindUniforms());
    const shader = compile(material);
    expect(shader.vertexShader).toContain("#ifdef ES_BATCH_SLOTS");
    expect(shader.vertexShader).toContain("#elif defined(USE_INSTANCING)");
    expect(shader.vertexShader).toContain("esBatchTexel(1).xy");
    expect(shader.vertexShader).toContain("mat3(instanceMatrix)");
    expect(shader.vertexShader).toContain("int(esSlot)");
  });
});
