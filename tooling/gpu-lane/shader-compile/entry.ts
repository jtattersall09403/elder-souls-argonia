import * as THREE from "three";
import { applyAerialPerspective, createAerialUniforms } from "../../../apps/world-studio/src/sky/aerial";
const AU = createAerialUniforms();
import { createWaterMaterial, createWaterUniforms, WATER_TIERS } from "../../../packages/game-core/src/water/render/waterMaterial";
const tex = new THREE.DataTexture(new Uint8Array(4), 1, 1); tex.needsUpdate = true;
const a: any = { meta: { schemaVersion: 2, surface: { file: "s.png", size: 2017, metresPerPixel: 3.65568, minM: -1, maxM: 500, buryM: 3, ownerFile: "o.png", depthMinM: -6, depthSpanM: 30.6 },
  flow: { file: "f.png", size: 1345, metresPerPixel: 5.48, flowMax: 3, shoreMaxM: 160 }, klass: { file: "k.png", size: 1345, metresPerPixel: 5.48, classes: ["none"] } },
  surfaceTex: tex, flowTex: tex, klassTex: tex, shoreTex: tex, hasOwner: true };
const errs: string[] = []; let n = 0;
const r = new THREE.WebGLRenderer({ canvas: document.createElement("canvas") });
r.debug.onShaderError = (gl, prog, vs, fs) => { errs.push((gl.getShaderInfoLog(vs) || "") + (gl.getShaderInfoLog(fs) || "") + (gl.getProgramInfoLog(prog) || "")); };
const scene = new THREE.Scene(); const cam = new THREE.PerspectiveCamera();
for (const [tn, tier] of Object.entries(WATER_TIERS)) for (const v of ["above", "below"] as const) for (const mode of ["field", "strip"] as const) {
  try {
    const uniforms = createWaterUniforms(a);
    const m = createWaterMaterial(v, { csm: null, applyAerial: (mm: any) => applyAerialPerspective(mm, AU), assets: a, uniforms, tier: tier as any }, mode);
    const g = new THREE.PlaneGeometry(1, 1);
    if (mode === "strip") for (const [k, s] of [["aSideM",1],["aArc",1],["aScroll",1],["aEdge",1],["aStill",1],["aBedDepth",1],["aSeason",1],["aDrop",1],["aFlow",2],["aRockFoam",2]] as const) g.setAttribute(k, new THREE.BufferAttribute(new Float32Array(4 * s), s));
    const mesh = new THREE.Mesh(g, m); scene.clear(); scene.add(mesh); r.compile(scene, cam); r.render(scene, cam); n++;
  } catch (e) { errs.push(`${tn} ${v} ${mode}: ${e}`); }
}
(window as any).__done = { n, errs };
