import * as THREE from "three";
import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/interior.fixture.json";
import { ambientCubeAt, ambientCubeToSH, type AmbientCube, type LinearRGB } from "./ambientCube";
import { parseInteriorBundle, type InteriorBundle } from "./bundle";
import { INTERIOR_AMBIENT_SCALE, colorFromRGB, interiorAmbient } from "./interiorLoader";

const AXES: [keyof AmbientCube, THREE.Vector3][] = [
  ["px", new THREE.Vector3(1, 0, 0)], ["nx", new THREE.Vector3(-1, 0, 0)], ["py", new THREE.Vector3(0, 1, 0)],
  ["ny", new THREE.Vector3(0, -1, 0)], ["pz", new THREE.Vector3(0, 0, 1)], ["nz", new THREE.Vector3(0, 0, -1)],
];

/** Irradiance of the SH as three.js evaluates it (the shader's shGetIrradianceAt). */
function irradiance(sh: LinearRGB[], n: THREE.Vector3): THREE.Vector3 {
  const s = new THREE.SphericalHarmonics3();
  sh.forEach((c, i) => s.coefficients[i].set(...c));
  return s.getIrradianceAt(n.clone().normalize(), new THREE.Vector3());
}

const uniform = (c: LinearRGB): AmbientCube => ({ px: c, nx: c, py: c, ny: c, pz: c, nz: c });

describe("ambientCubeToSH", () => {
  it("a uniform cube gives a flat probe", () => {
    const sh = ambientCubeToSH(uniform([0.2, 0.1, 0.05]));
    for (const n of [...AXES.map(([, v]) => v), new THREE.Vector3(1, 1, 1), new THREE.Vector3(-0.3, 0.2, 0.9)]) {
      const e = irradiance(sh, n);
      expect([e.x, e.y, e.z].map((v) => +v.toFixed(5))).toEqual([0.2, 0.1, 0.05]);
    }
    expect(sh.slice(1).flat().every((v) => Math.abs(v) < 1e-9)).toBe(true); // band 0 only
  });

  it("a +Y-only cube lights up-facing normals and nothing facing sideways or down", () => {
    const black: LinearRGB = [0, 0, 0];
    const sh = ambientCubeToSH({ ...uniform(black), py: [0.4, 0.4, 0.4] });
    expect(irradiance(sh, new THREE.Vector3(0, 1, 0)).x).toBeCloseTo(0.4, 5);
    for (const [k, n] of AXES) if (k !== "py") expect(irradiance(sh, n).x).toBeCloseTo(0, 5);
    expect(irradiance(sh, new THREE.Vector3(0.3, 1, 0)).x).toBeGreaterThan(0.2);
  });

  it("reproduces every axis of a general cube, and E(n) between them, times the scale", () => {
    const cube: AmbientCube = { px: [0.1, 0.2, 0.3], nx: [0.02, 0.01, 0], py: [0.5, 0.4, 0.3], ny: [0, 0.05, 0.1],
      pz: [0.2, 0.2, 0.2], nz: [0.3, 0.1, 0.05] };
    const sh = ambientCubeToSH(cube, 2);
    for (const [k, n] of AXES) {
      const e = irradiance(sh, n);
      expect([e.x, e.y, e.z].map((v, i) => v - 2 * cube[k][i]).every((d) => Math.abs(d) < 1e-5)).toBe(true);
    }
    const n = new THREE.Vector3(0.4, -0.5, 0.77).normalize();
    const want = ambientCubeAt(cube, [n.x, n.y, n.z]);
    const e = irradiance(sh, n);
    [e.x, e.y, e.z].forEach((v, i) => expect(v).toBeCloseTo(2 * want[i], 5));
  });
});

describe("interiorAmbient", () => {
  it("a cube of the old ambient colour lights as the old AmbientLight did (within 5 %)", () => {
    const b = parseInteriorBundle(structuredClone(fixture), "fixture") as InteriorBundle;
    const old = colorFromRGB(b.ambient.colorRGB).multiplyScalar(b.ambient.intensity * INTERIOR_AMBIENT_SCALE);
    const c: LinearRGB = [old.r, old.g, old.b].map((v) => v / INTERIOR_AMBIENT_SCALE / b.ambient.intensity) as LinearRGB;
    const probe = interiorAmbient({ ...b, lighting: { ambientCube: uniform(c) } }) as THREE.LightProbe;
    expect(probe.isLightProbe).toBe(true);
    for (const n of [new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0.5, -0.5, 0.2)]) {
      const e = probe.sh.getIrradianceAt(n.normalize(), new THREE.Vector3()).multiplyScalar(probe.intensity);
      [e.x, e.y, e.z].forEach((v, i) => expect(Math.abs(v / [old.r, old.g, old.b][i] - 1)).toBeLessThan(0.05));
    }
    const flat = interiorAmbient({ ...b, lighting: undefined }) as THREE.AmbientLight;
    expect(flat.isAmbientLight).toBe(true);
  });

  it("the parser refuses a malformed cube and still reads schema 3", () => {
    const bad = structuredClone(fixture) as Record<string, unknown>;
    (bad.lighting as Record<string, unknown>).ambientCube = { px: [0, 0] };
    expect(() => parseInteriorBundle(bad, "x")).toThrow(/bad lighting/);
    const v3 = structuredClone(fixture) as Record<string, unknown>;
    v3.schemaVersion = 3;
    delete v3.lighting;
    expect(parseInteriorBundle(v3, "x").lighting).toBeUndefined();
  });
});
