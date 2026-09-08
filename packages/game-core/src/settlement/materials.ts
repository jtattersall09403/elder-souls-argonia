import * as THREE from "three";

export interface SettlementMaterialUniforms {
  esSettlementRain: { value: number };
  esSettlementNight: { value: number };
}

const PATCH = "es-settlement-surface-v1";
export const SETTLEMENT_GROUND_ATTRIBUTE = "esSettlementGroundY";

interface SettlementSurfaceState {
  uniforms: SettlementMaterialUniforms;
  windowMaterial: boolean;
  depthPair: boolean;
}

/**
 * Building wetness and night windows share one uniform block. State lives in
 * userData and the cache key is chained, so WorldSky can safely reapply this
 * after CSM replaces onBeforeCompile.
 */
export function applySettlementSurface(
  material: THREE.Material,
  uniforms: SettlementMaterialUniforms,
  windowMaterial = false,
): void {
  const m = material as THREE.MeshStandardMaterial;
  if (!m.isMeshStandardMaterial) return;
  m.userData.esAerial = true;
  m.userData.esSettlementSurface = { uniforms, windowMaterial, depthPair: false };
  reapplySettlementSurface(m);
}

/** Create the alpha/displacement-matched shadow twin at the colour patch call site. */
export function applySettlementSurfaceWithShadow(
  material: THREE.Material,
  uniforms: SettlementMaterialUniforms,
  windowMaterial = false,
): THREE.MeshDepthMaterial | undefined {
  const m = material as THREE.MeshStandardMaterial;
  if (!m.isMeshStandardMaterial) return undefined;
  applySettlementSurface(m, uniforms, windowMaterial);
  const depth = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    map: m.map,
    alphaMap: m.alphaMap,
    alphaTest: m.alphaTest,
    side: m.side,
    displacementMap: m.displacementMap,
    displacementScale: m.displacementScale,
    displacementBias: m.displacementBias,
  });
  depth.name = `${m.name || "settlement"}.shadow-depth`;
  depth.userData.esSettlementSurface = { uniforms, windowMaterial: false, depthPair: true };
  reapplySettlementSurface(depth);
  return depth;
}

/**
 * Fail-closed evidence that the caster material still matches its colour
 * material.  This is run on every near and far draw after the chosen LOD's
 * material has been patched, so an LOD swap cannot silently restore opaque
 * card shadows or drop displacement from the depth pass.
 */
export function settlementShadowPairErrors(
  material: THREE.Material,
  depth: THREE.MeshDepthMaterial | undefined,
): string[] {
  const colour = material as THREE.MeshStandardMaterial;
  if (!colour.isMeshStandardMaterial) {
    return ["architecture colour material is not a supported physically lit material"];
  }
  if (!depth) return ["standard colour material has no paired shadow-depth material"];
  const errors: string[] = [];
  if (depth.map !== colour.map) errors.push("colour map differs from shadow-depth map");
  if (depth.alphaMap !== colour.alphaMap) errors.push("alpha map differs from shadow-depth alpha map");
  if (depth.alphaTest !== colour.alphaTest) errors.push("alpha test differs from shadow-depth alpha test");
  if (depth.side !== colour.side) errors.push("face side differs from shadow-depth face side");
  if (depth.displacementMap !== colour.displacementMap) {
    errors.push("displacement map differs from shadow-depth displacement map");
  }
  if (depth.displacementScale !== colour.displacementScale
      || depth.displacementBias !== colour.displacementBias) {
    errors.push("displacement values differ from shadow-depth displacement values");
  }
  const state = depth.userData?.esSettlementSurface as SettlementSurfaceState | undefined;
  if (!state?.depthPair) errors.push("shadow-depth material lacks settlement pair identity");
  return errors;
}

export function reapplySettlementSurface(material: THREE.Material): void {
  const m = material as THREE.MeshStandardMaterial | THREE.MeshDepthMaterial;
  const state = m.userData?.esSettlementSurface as
    | SettlementSurfaceState
    | undefined;
  if (!state || m.userData.esSettlementHook === m.onBeforeCompile) return;
  const previous = m.onBeforeCompile;
  const hook: THREE.Material["onBeforeCompile"] = (shader, renderer) => {
      previous?.call(m, shader, renderer);
      shader.uniforms.esSettlementRain = state.uniforms.esSettlementRain;
      shader.uniforms.esSettlementNight = state.uniforms.esSettlementNight;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>\nattribute float ${SETTLEMENT_GROUND_ATTRIBUTE};\nvarying float esSettlementHeightAboveGround;`)
        .replace("#include <begin_vertex>", `#include <begin_vertex>\nvec4 esSettlementWorldPosition = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\nesSettlementWorldPosition = instanceMatrix * esSettlementWorldPosition;\n#endif\nesSettlementWorldPosition = modelMatrix * esSettlementWorldPosition;\nesSettlementHeightAboveGround = esSettlementWorldPosition.y - ${SETTLEMENT_GROUND_ATTRIBUTE};`);
      if (state.depthPair) return;
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\nuniform float esSettlementRain;\nuniform float esSettlementNight;\nvarying float esSettlementHeightAboveGround;`)
        .replace("#include <color_fragment>", `#include <color_fragment>\nfloat esWallWet = esSettlementRain * mix(0.55, 1.0, 1.0 - smoothstep(0.0, 4.0, max(0.0, esSettlementHeightAboveGround)));\ndiffuseColor.rgb *= mix(1.0, 0.62, esWallWet * 0.55);${state.windowMaterial ? "\ndiffuseColor.rgb += vec3(1.0, 0.48, 0.12) * esSettlementNight * 0.7;" : ""}`)
        .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.32, esWallWet * 0.55);`);
    };
  m.onBeforeCompile = hook;
  m.userData.esSettlementHook = hook;
  if (!m.userData.esSettlementCacheKeyed) {
    m.userData.esSettlementCacheKeyed = true;
    const priorKey = m.customProgramCacheKey;
    m.customProgramCacheKey = function (this: THREE.Material) {
      return `${priorKey.call(this)}|${PATCH}|${state.windowMaterial ? 1 : 0}|${state.depthPair ? "depth" : "colour"}`;
    };
  }
  m.needsUpdate = true;
}

export function updateSettlementEnvironment(
  uniforms: SettlementMaterialUniforms,
  rainIntensity: number,
  minuteOfDay: number,
): void {
  uniforms.esSettlementRain.value = THREE.MathUtils.clamp(rainIntensity, 0, 1);
  const hour = ((minuteOfDay / 60) % 24 + 24) % 24;
  uniforms.esSettlementNight.value = hour >= 19 || hour < 6 ? 1 : 0;
}
