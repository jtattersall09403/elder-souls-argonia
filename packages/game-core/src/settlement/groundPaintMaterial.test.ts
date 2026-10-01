import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { reapplyGroundPaint } from "./groundPaintMaterial";

/** A material as `paintMaterial` leaves it (built without the image loader). */
function paint(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ transparent: true });
  m.userData.esAerial = true;
  m.userData.esGroundPaint = { maps: [new THREE.Texture()], tile: new THREE.Vector3(6, 6, 6) };
  reapplyGroundPaint(m);
  return m;
}
function compile(m: THREE.Material) {
  const shader = {
    uniforms: {} as Record<string, unknown>,
    vertexShader: "#include <common>\n#include <project_vertex>",
    fragmentShader: "#include <common>\n#include <map_fragment>",
  };
  m.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
  return shader;
}

describe("ground paint material (16k walk 7)", () => {
  it("survives CSM replacing onBeforeCompile: the WorldSky reapply puts the blend back", () => {
    const m = paint();
    // CSM.setupMaterial assigns a fresh hook that never calls the old one
    m.onBeforeCompile = () => {};
    expect(compile(m).fragmentShader).toContain("#include <map_fragment>");   // the walk-7 defect: no blend
    reapplyGroundPaint(m);
    const s = compile(m);
    expect(s.fragmentShader).not.toContain("#include <map_fragment>");
    expect(s.fragmentShader).toContain("vPaintWeight");
    expect(s.vertexShader).toContain("attribute vec3 paintWeight");
    expect(m.customProgramCacheKey()).toContain("es-ground-paint");
  });

  it("patches once however often it is reapplied, and joins the aerial haze", () => {
    const m = paint();
    reapplyGroundPaint(m); reapplyGroundPaint(m);
    expect(compile(m).fragmentShader.match(/es-ground-paint/g)).toHaveLength(1);
    expect(m.userData.esAerial).toBe(true);
    // no distance fade of its own: the haze fades it as it fades the ground
    expect(compile(m).fragmentShader).not.toContain("paintFade");
  });

  it("leaves other materials alone", () => {
    const m = new THREE.MeshStandardMaterial();
    const hook = m.onBeforeCompile;
    reapplyGroundPaint(m);
    expect(m.onBeforeCompile).toBe(hook);
  });
});
