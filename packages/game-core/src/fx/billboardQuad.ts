/**
 * Cylindrical billboarding for baked card quads — the third injection in the
 * same family as `windSway.ts` and `lodFade.ts`, and deliberately the same
 * shape (chained `onBeforeCompile`, a cache-key suffix, a `reapply` hook for
 * the CSM pass that overwrites `onBeforeCompile` with a plain assignment).
 *
 * What it is for: the ground-cover ring's mid and far tiers draw a species as
 * a single baked card instead of its full mesh. A card is only convincing
 * while it faces the viewer, and a card placed with the instance's own yaw
 * faces wherever the scatter happened to point it — edge-on half the time,
 * which reads as plants winking out. Rotating the quad on the CPU would mean
 * rewriting every instance matrix every frame (the whole cost the card tier
 * exists to avoid), so the rotation is done in the vertex shader.
 *
 * CYLINDRICAL, not spherical: the card turns about its own Y axis only, so it
 * stays rooted and upright. Grass seen from above should foreshorten like
 * grass, not tip over to face the camera.
 *
 * The view position is `esLodViewPos`, the SAME uniform `lodFade.ts` owns —
 * one camera position for the whole vegetation stack, and in the shadow pass
 * it is still the camera rather than the light (a card that turned to face the
 * sun would cast a shadow of a different shape than the one on screen).
 * `lodFade` declares that uniform when it is also installed, so the
 * declaration here is emitted only when it is not already in the source.
 * Install order therefore matters at the call site: apply the fade first.
 */

import * as THREE from "three";
import type { LodFadeUniforms } from "./lodFade";

/**
 * The world-space right vector of a cylindrical billboard, for a horizontal
 * view direction (pivot → viewer) of (`vx`, `vz`).
 *
 * `right = normalize(cross(up, viewDir))` with `up = (0,1,0)`, which reduces
 * to `(vz, -vx)` normalised. A viewer directly above the card leaves the
 * direction degenerate; the card then keeps its world +X axis, which is what
 * the GLSL below does too. Pure, so the arithmetic is testable without a GPU.
 */
export function billboardRightVector(vx: number, vz: number): [number, number] {
  const length = Math.hypot(vx, vz);
  if (!(length > 1e-6)) return [1, 0];
  return [vz / length, -vx / length];
}

const VERTEX_HEAD = /* glsl */ `
vec2 esBillboardRight(vec2 v) {
  float esBbLen = length(v);
  return esBbLen > 1e-6 ? vec2(v.y, -v.x) / esBbLen : vec2(1.0, 0.0);
}
`;

const VERTEX_BODY = /* glsl */ `
{
  #ifdef USE_INSTANCING
    mat3 esBbBasis = mat3(instanceMatrix);
    vec3 esBbOrigin = instanceMatrix[3].xyz;
    // Uniform instance scale, so any basis column's length is s.
    float esBbScaleSq = max(1e-6, dot(esBbBasis[0], esBbBasis[0]));
    float esBbScale = sqrt(esBbScaleSq);
    vec2 esBbRight2 = esBillboardRight(esLodViewPos.xz - esBbOrigin.xz);
    vec3 esBbRight = vec3(esBbRight2.x, 0.0, esBbRight2.y);
    // Forward completes the frame; a planar card has z ~ 0, so this only
    // matters for a card whose quad is not exactly in its local XY plane.
    vec3 esBbFwd = vec3(-esBbRight2.y, 0.0, esBbRight2.x);
    // The quad is rebuilt in WORLD space around its pivot — width along the
    // view-facing right vector, height straight up — so the instance's own
    // yaw is ignored entirely and every card faces the viewer.
    vec3 esBbWorld =
        esBbRight * (transformed.x * esBbScale)
      + vec3(0.0, transformed.y * esBbScale, 0.0)
      + esBbFwd * (transformed.z * esBbScale);
    // World -> object: the basis is rotation x uniform scale, so its inverse
    // is transpose / s^2. (GLSL ES 1.00 has no transpose() or inverse().)
    mat3 esBbBasisT = mat3(
      esBbBasis[0][0], esBbBasis[1][0], esBbBasis[2][0],
      esBbBasis[0][1], esBbBasis[1][1], esBbBasis[2][1],
      esBbBasis[0][2], esBbBasis[1][2], esBbBasis[2][2]);
    transformed = (esBbBasisT * esBbWorld) / esBbScaleSq;
  #endif
}
`;

interface BillboardPatchState {
  esBillboardUniforms?: LodFadeUniforms;
  esBillboardWrapped?: THREE.Material["onBeforeCompile"];
  esBillboardCacheKeyed?: boolean;
}

function installBillboardHook(
  material: THREE.Material,
  uniforms: LodFadeUniforms,
): void {
  const state = material.userData as BillboardPatchState;
  state.esBillboardUniforms = uniforms;
  const previous = material.onBeforeCompile;
  const wrapped: THREE.Material["onBeforeCompile"] = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    if (shader.vertexShader.includes("esBillboardRight")) return; // never twice
    shader.uniforms.esLodViewPos = uniforms.esLodViewPos;
    // `lodFade` declares the same uniform. Two declarations is a compile
    // error, so emit ours only when the fade is not in this shader.
    const declaration = shader.vertexShader.includes("uniform vec3 esLodViewPos")
      ? "" : "uniform vec3 esLodViewPos;\n";
    shader.vertexShader = shader.vertexShader
      .replace("void main() {", `${declaration}${VERTEX_HEAD}\nvoid main() {`)
      // After `begin_vertex` (which fills `transformed`) and before
      // `project_vertex` applies the instance matrix — the same seam wind
      // uses, and the reason the card's own yaw can be discarded here.
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${VERTEX_BODY}`);
  };
  material.onBeforeCompile = wrapped;
  state.esBillboardWrapped = wrapped;
  if (!state.esBillboardCacheKeyed) {
    state.esBillboardCacheKeyed = true;
    const previousKey = material.customProgramCacheKey;
    material.customProgramCacheKey = function (this: THREE.Material) {
      return `${previousKey.call(this)}|es-bbq`;
    };
  }
  material.needsUpdate = true;
}

/** Patch one card material to face the viewer. Safe to call repeatedly. */
export function applyCylindricalBillboard(
  material: THREE.Material,
  uniforms: LodFadeUniforms,
): void {
  const state = material.userData as BillboardPatchState;
  if (state.esBillboardUniforms) return;
  installBillboardHook(material, uniforms);
}

/**
 * Restore the billboard hook after something else reassigned
 * `onBeforeCompile` (CSM does). Same contract as `reapplyWindSway`: a no-op
 * while our wrapper is live, safe on materials never patched. Call it AFTER
 * `reapplyLodFade` so the fade's uniform declaration is emitted first.
 */
export function reapplyCylindricalBillboard(material: THREE.Material): void {
  const state = material.userData as BillboardPatchState;
  if (!state.esBillboardUniforms) return;
  if (material.onBeforeCompile === state.esBillboardWrapped) return;
  installBillboardHook(material, state.esBillboardUniforms);
}
