import * as THREE from "three";
import { sunAt, TWILIGHT } from "@elder-souls/world-time";
import type { SettlementKitMaterialExtras } from "./types";

export interface SettlementMaterialUniforms {
  esSettlementRain: { value: number };
  esSettlementNight: { value: number };
}

const PATCH = "es-settlement-surface-v2";
export const SETTLEMENT_GROUND_ATTRIBUTE = "esSettlementGroundY";

interface SettlementSurfaceState {
  uniforms: SettlementMaterialUniforms;
  glowMaterial: boolean;
  depthPair: boolean;
}

/** Warm lamplight colour of a lit window at full night (linear RGB), and its
 * gain over the glTF emissive (the NIF's Glow_Map mask at factor 1). */
const WINDOW_GLOW_RGB = "vec3(1.0, 0.6, 0.28)";
const WINDOW_GLOW_GAIN = 2.0;
/** Sun altitude (deg) at which window lamps start to come on, and the civil
 * twilight altitude where they are fully lit (Module 55 bands). */
const LAMPS_ON_START_DEG = 2;

/**
 * A glow material is one whose kit build carried the NIF's Glow_Map slot
 * into the glTF as an emissive texture (blender/build_kit.py
 * rebuild_material). Selected by that map, never by a material name.
 */
export function isSettlementGlowMaterial(material: THREE.Material): boolean {
  return Boolean((material as THREE.MeshStandardMaterial).emissiveMap);
}

/**
 * A decal material is an overlay its makers drew coplanar with the surface
 * under it (the NIF's shader flags DECAL / DYNAMIC_DECAL, which give it a
 * depth bias in Skyrim; e.g. the ImpDirt01 grime over the imperial wall
 * skirting). The kit build carries the flag as the glTF material's extras
 * `{ "decal": true }`, which the loader puts on `userData`
 * (SettlementKitMaterialExtras). Selected by that flag, never by name.
 */
export function isSettlementDecalMaterial(material: THREE.Material): boolean {
  return (material.userData as SettlementKitMaterialExtras | undefined)?.decal === true;
}

/** Draw order of a decal relative to the opaque surface it overlays. */
export const SETTLEMENT_DECAL_RENDER_ORDER = 1;

/**
 * Give a decal material the depth bias Skyrim gives it, so it never
 * z-fights the coplanar surface under it (16h check-in 3 §3): pulled towards
 * the camera by polygon offset, and it writes no depth. Returns whether the
 * material is a decal. Idempotent.
 */
export function applySettlementDecal(material: THREE.Material): boolean {
  if (!isSettlementDecalMaterial(material)) return false;
  material.polygonOffset = true;
  material.polygonOffsetFactor = -1;
  material.polygonOffsetUnits = -1;
  material.depthWrite = false;
  return true;
}

/** How a settlement mesh drawing `material` is flagged: a decal draws after
 * its parent's opaque surface and casts no shadow (the surface under it
 * already does; its twin would double the caster at the same depth). */
export function settlementMeshDrawFlags(material: THREE.Material): {
  castShadow: boolean; renderOrder: number;
} {
  return isSettlementDecalMaterial(material)
    ? { castShadow: false, renderOrder: SETTLEMENT_DECAL_RENDER_ORDER }
    : { castShadow: true, renderOrder: 0 };
}

/** 0 by day, 1 from civil twilight down, a smooth ramp between. */
export function settlementNightFactor(sunAltitudeDeg: number): number {
  return 1 - THREE.MathUtils.smoothstep(sunAltitudeDeg, TWILIGHT.civilDeg, LAMPS_ON_START_DEG);
}

/**
 * Building wetness and night windows share one uniform block. State lives in
 * userData and the cache key is chained, so WorldSky can safely reapply this
 * after CSM replaces onBeforeCompile.
 */
export function applySettlementSurface(
  material: THREE.Material,
  uniforms: SettlementMaterialUniforms,
  glowMaterial = false,
): void {
  const m = material as THREE.MeshStandardMaterial;
  if (!m.isMeshStandardMaterial) return;
  m.userData.esAerial = true;
  m.userData.esSettlementSurface = { uniforms, glowMaterial, depthPair: false };
  reapplySettlementSurface(m);
}

/** Create the alpha/displacement-matched shadow twin at the colour patch call site. */
export function applySettlementSurfaceWithShadow(
  material: THREE.Material,
  uniforms: SettlementMaterialUniforms,
  glowMaterial = false,
): THREE.MeshDepthMaterial | undefined {
  const m = material as THREE.MeshStandardMaterial;
  if (!m.isMeshStandardMaterial) return undefined;
  applySettlementSurface(m, uniforms, glowMaterial);
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
  depth.userData.esSettlementSurface = { uniforms, glowMaterial: false, depthPair: true };
  reapplySettlementSurface(depth);
  return depth;
}

/**
 * Bring a reused shadow twin back in line with its colour material before
 * the pair check. three's shadow pass rewrites the twin's `side` on every
 * render (`WebGLShadowMap.getDepthMaterial`: `shadowSide[material.side]`),
 * so a twin kept across builds no longer matches the colour side it was
 * made with; the texture, alpha and displacement fields are re-read too.
 */
export function syncSettlementDepthTwin(
  depth: THREE.MeshDepthMaterial,
  material: THREE.Material,
): void {
  const m = material as THREE.MeshStandardMaterial;
  depth.map = m.map;
  depth.alphaMap = m.alphaMap;
  depth.alphaTest = m.alphaTest;
  depth.side = m.side;
  depth.displacementMap = m.displacementMap;
  depth.displacementScale = m.displacementScale;
  depth.displacementBias = m.displacementBias;
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
        .replace("#include <color_fragment>", `#include <color_fragment>\nfloat esWallWet = esSettlementRain * mix(0.55, 1.0, 1.0 - smoothstep(0.0, 4.0, max(0.0, esSettlementHeightAboveGround)));\ndiffuseColor.rgb *= mix(1.0, 0.62, esWallWet * 0.55);`)
        // Night windows in the EMISSIVE stage: the kit's glow mask (emissive
        // map x factor) x warm lamplight x the twilight ramp. By day the
        // factor is 0, so the glTF's emissive never shows. Added to albedo
        // (the old path) it was multiplied by the night light and stayed dark.
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>${state.glowMaterial ? `\ntotalEmissiveRadiance *= ${WINDOW_GLOW_RGB} * esSettlementNight * ${WINDOW_GLOW_GAIN.toFixed(1)};` : ""}`)
        .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.32, esWallWet * 0.55);`);
    };
  m.onBeforeCompile = hook;
  m.userData.esSettlementHook = hook;
  if (!m.userData.esSettlementCacheKeyed) {
    m.userData.esSettlementCacheKeyed = true;
    const priorKey = m.customProgramCacheKey;
    m.customProgramCacheKey = function (this: THREE.Material) {
      return `${priorKey.call(this)}|${PATCH}|${state.glowMaterial ? 1 : 0}|${state.depthPair ? "depth" : "colour"}`;
    };
  }
  m.needsUpdate = true;
}

export function updateSettlementEnvironment(
  uniforms: SettlementMaterialUniforms,
  rainIntensity: number,
  epochMinutes: number,
): void {
  uniforms.esSettlementRain.value = THREE.MathUtils.clamp(rainIntensity, 0, 1);
  uniforms.esSettlementNight.value = settlementNightFactor(
    (sunAt(epochMinutes).altitude * 180) / Math.PI);
}
