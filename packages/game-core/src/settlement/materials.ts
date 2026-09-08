import * as THREE from "three";

export interface SettlementMaterialUniforms {
  esSettlementRain: { value: number };
  esSettlementNight: { value: number };
}

const PATCH = "es-settlement-surface-v1";

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
  m.userData.esSettlementSurface = { uniforms, windowMaterial };
  reapplySettlementSurface(m);
}

export function reapplySettlementSurface(material: THREE.Material): void {
  const m = material as THREE.MeshStandardMaterial;
  const state = m.userData?.esSettlementSurface as
    | { uniforms: SettlementMaterialUniforms; windowMaterial: boolean }
    | undefined;
  if (!state || m.userData.esSettlementHook === m.onBeforeCompile) return;
  const previous = m.onBeforeCompile;
  const hook: THREE.Material["onBeforeCompile"] = (shader, renderer) => {
      previous?.call(m, shader, renderer);
      shader.uniforms.esSettlementRain = state.uniforms.esSettlementRain;
      shader.uniforms.esSettlementNight = state.uniforms.esSettlementNight;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying float esSettlementLocalHeight;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nesSettlementLocalHeight = transformed.y;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\nuniform float esSettlementRain;\nuniform float esSettlementNight;\nvarying float esSettlementLocalHeight;`)
        .replace("#include <color_fragment>", `#include <color_fragment>\nfloat esWallWet = esSettlementRain * mix(0.55, 1.0, 1.0 - smoothstep(0.0, 4.0, esSettlementLocalHeight));\ndiffuseColor.rgb *= mix(1.0, 0.62, esWallWet * 0.55);${state.windowMaterial ? "\ndiffuseColor.rgb += vec3(1.0, 0.48, 0.12) * esSettlementNight * 0.7;" : ""}`)
        .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.32, esWallWet * 0.55);`);
    };
  m.onBeforeCompile = hook;
  m.userData.esSettlementHook = hook;
  if (!m.userData.esSettlementCacheKeyed) {
    m.userData.esSettlementCacheKeyed = true;
    const priorKey = m.customProgramCacheKey;
    m.customProgramCacheKey = function (this: THREE.Material) {
      return `${priorKey.call(this)}|${PATCH}|${state.windowMaterial ? 1 : 0}`;
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
