import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  frameBasis,
  gridDir,
  IMPOSTOR_CACHE_KEY,
  ImpostorMaterial,
  impostorQuad,
  reapplyImpostor,
  selectFrames,
  type ImpostorParams,
} from "./impostor";
import { applyLodFade, createLodFadeUniforms, LOD_FRAGMENT_TEST } from "../fx/lodFade";

/** Expected answers written by `pipeline/impostor_bake.py` (the bake and the
 * judge use the same arithmetic): `select_frames(v, 12)`, `grid_dir(3, 7, 12)`
 * and `frame_basis` of it. The three copies of the geometry must agree. */
const PY_SELECT: { v: [number, number, number]; frames: [number, number][]; w: number[] }[] = [
  { v: [0.309426, 0.206284, 0.928279], frames: [[10, 3], [11, 3], [10, 4]], w: [0.642873, 0.214253, 0.142873] },
  { v: [-0.952579, 0.136083, -0.272166], frames: [[0, 2], [1, 3], [0, 3]], w: [0.249976, 0.550037, 0.199987] },
  { v: [0.99619, 0.087156, 0.0], frames: [[10, 10], [11, 11], [11, 10]], w: [0.442526, 0.557474, 0.0] },
  { v: [-0.8, 0.3, -0.2], frames: [[1, 2], [2, 3], [1, 3]], w: [0.038442, 0.269263, 0.692295] },
  { v: [0.0, 1.0, 0.0], frames: [[6, 6], [6, 5], [5, 6]], w: [0.0, 0.5, 0.5] },
  { v: [0.650945, -0.390567, -0.650945], frames: [[6, 11], [6, 10], [5, 11]], w: [0.499958, 4.2e-5, 0.5] },
];

function params(): ImpostorParams {
  return {
    grid: 12, cellM: 10, centre: new THREE.Vector3(0, 4, 0),
    normalMap: new THREE.Texture(), depthMap: new THREE.Texture(),
  };
}

function compile(material: THREE.Material): { vertexShader: string; fragmentShader: string } {
  const shader = {
    uniforms: {} as Record<string, THREE.IUniform>,
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
  } as unknown as THREE.WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  return shader;
}

describe("impostor frame geometry", () => {
  it("selects the same three frames and weights as the bake's judge", () => {
    for (const row of PY_SELECT) {
      const { frames, weights } = selectFrames(row.v, 12);
      expect(frames).toEqual(row.frames);
      weights.forEach((w, i) => expect(w).toBeCloseTo(row.w[i], 4));
      expect(weights[0] + weights[1] + weights[2]).toBeCloseTo(1, 6);
    }
  });

  it("decodes grid directions and bases as the bake does", () => {
    const d = gridDir(3, 7, 12);
    [-0.137361, 0.824163, -0.549442].forEach((x, i) => expect(d[i]).toBeCloseTo(x, 5));
    const { right, up } = frameBasis(d);
    [-0.970143, 0, 0.242536].forEach((x, i) => expect(right[i]).toBeCloseTo(x, 5));
    [0.199889, 0.566352, 0.799556].forEach((x, i) => expect(up[i]).toBeCloseTo(x, 5));
  });

  it("puts the horizon on the grid border and every frame in the upper hemisphere", () => {
    for (let i = 0; i < 12; i++) {
      expect(gridDir(i, 0, 12)[1]).toBeCloseTo(0, 9);
      expect(gridDir(11, i, 12)[1]).toBeCloseTo(0, 9);
      for (let j = 0; j < 12; j++) expect(gridDir(i, j, 12)[1]).toBeGreaterThanOrEqual(0);
    }
  });

  it("a low view along +-X or +-Z leans on the on-axis horizon frame (split follows the axis diagonals)", () => {
    const el = (5 * Math.PI) / 180;
    for (const [x, z, corner] of [[1, 0, [11, 11]], [-1, 0, [0, 0]], [0, 1, [11, 0]], [0, -1, [0, 11]]] as const) {
      const { frames, weights } = selectFrames([x * Math.cos(el), Math.sin(el), z * Math.cos(el)], 12);
      const k = frames.findIndex((f) => f[0] === corner[0] && f[1] === corner[1]);
      expect(k).toBeGreaterThanOrEqual(0);
      expect(weights[k]).toBeGreaterThan(0.5);
    }
  });

  it("a view exactly on a frame takes that frame alone", () => {
    const d = gridDir(4, 9, 12);
    const { frames, weights } = selectFrames(d, 12);
    const k = weights.indexOf(Math.max(...weights));
    expect(frames[k]).toEqual([4, 9]);
    expect(weights[k]).toBeCloseTo(1, 4);
  });
});

describe("ImpostorMaterial", () => {
  it("rebuilds the quad, blends the taps and lights through the normal atlas", () => {
    const m = new ImpostorMaterial(new THREE.Texture(), params());
    const s = compile(m);
    expect(s.vertexShader).toContain("transformed = esImpCentre + esImpP;");
    expect(s.fragmentShader).toContain("esImpTap(map, esImpF01.xy, esImpUv0)");
    expect(s.fragmentShader).toContain("normal = normalize(esImpAx * esImpNo.x");
    expect(s.fragmentShader).not.toContain("#include <map_fragment>");
    expect(m.alphaTest).toBe(0.5);
  });

  it("a chain holding the hook twice patches the shader once (review 2026-09-30)", () => {
    const m = new ImpostorMaterial(new THREE.Texture(), params());
    const hook = m.onBeforeCompile;
    m.onBeforeCompile = (s, r) => { hook.call(m, s, r); hook.call(m, s, r); };
    const s = compile(m);
    expect(s.vertexShader.split("vec3 esImpDir(").length - 1).toBe(1);
    expect(s.fragmentShader.split("uniform float esImpGrid;").length - 1).toBeLessThanOrEqual(1);
  });

  it("joins the temporal LOD cross-fade: the fade's discard survives the impostor patch", () => {
    const m = new ImpostorMaterial(new THREE.Texture(), params());
    applyLodFade(m, createLodFadeUniforms());
    const s = compile(m);
    expect(s.fragmentShader).toContain(LOD_FRAGMENT_TEST.trim().split("\n")[0].trim());
    expect(s.vertexShader).toContain("esImpBasis(esImpV, esImpR, esImpU)");
    // The fade keys on the instance origin, which the quad rebuild never moves.
    expect(s.vertexShader).toContain("esLodOrigin");
  });

  it("survives the batch clone and CSM's reassignment, with one program key", () => {
    const a = new ImpostorMaterial(new THREE.Texture(), params());
    const b = new ImpostorMaterial(new THREE.Texture(), { ...params(), grid: 16, cellM: 14 });
    const clone = a.clone();
    expect(clone).toBeInstanceOf(ImpostorMaterial);
    expect(compile(clone).vertexShader).toContain("esImpBasis");
    expect(a.customProgramCacheKey()).toBe(b.customProgramCacheKey());
    expect(a.customProgramCacheKey().endsWith(IMPOSTOR_CACHE_KEY)).toBe(true);
    clone.onBeforeCompile = () => undefined; // what csm.setupMaterial does
    reapplyImpostor(clone);
    expect(compile(clone).vertexShader).toContain("esImpBasis");
    // A plain material is left alone.
    const plain = new THREE.MeshStandardMaterial();
    const before = plain.onBeforeCompile;
    reapplyImpostor(plain);
    expect(plain.onBeforeCompile).toBe(before);
  });

  it("the quad is two triangles facing +Z in its own plane", () => {
    const g = impostorQuad();
    expect(g.getIndex()!.count).toBe(6);
    expect(g.getAttribute("position").count).toBe(4);
  });
});
