import * as THREE from "three";
import { ALWAYS_LIT_DAY_FACTOR, artificialLightFactor } from "./lighting";
import type { SettlementKitMaterialExtras } from "./types";
import { applyLanternShell } from "./fixtureGlow";
import { chainHas, markChain } from "../render/shaderHookChain";

export interface SettlementMaterialUniforms {
  esSettlementRain: { value: number };
  esSettlementNight: { value: number };
}

const PATCH = "es-settlement-surface-v2";
/** The varying the patch declares in both stages; its presence means "patched". */
const SETTLEMENT_VARYING = "varying float esSettlementHeightAboveGround";
export const SETTLEMENT_GROUND_ATTRIBUTE = "esSettlementGroundY";

/** How a material glows: a window's emissive mask by night (`true`); an
 * additive effect card drawn unlit, a fire's (`"flame"`, burns by day at
 * `ALWAYS_LIT_DAY_FACTOR`) or a lamp's (`"lamp-flame"`, the lamp clock),
 * lighting.ts `fixtureFactor`; a lantern's shell lit from inside
 * (`"lamp-shell"`, fixtureGlow.ts, the lamp clock); or not at all. */
export type SettlementGlow = boolean | "flame" | "lamp-flame" | "lamp-shell";

interface SettlementSurfaceState {
  uniforms: SettlementMaterialUniforms;
  glowMaterial: SettlementGlow;
  depthPair: boolean;
  /** An additive card's gain (`additiveGain`), a uniform of its own: a
   * program per distinct gain was one relink per new flame asset. */
  flameGain: THREE.IUniform<number>;
}

/** Warm lamplight colour of a lit window at full night (linear RGB), and its
 * gain over the glTF emissive (the NIF's Glow_Map mask at factor 1). */
const WINDOW_GLOW_RGB = "vec3(1.0, 0.6, 0.28)";
const WINDOW_GLOW_GAIN = 2.0;
/** Gain of an additive effect card over its texture x vertex colour when its
 * kit carries none: kits built before output format 3 (build_kit
 * KIT_OUTPUT_FORMAT_VERSION); every later build writes the NIF's own. */
const FLAME_GLOW_GAIN = 1.5;

/** An additive card's gain: the NIF shape's emissive multiple, carried as the
 * glTF material extra `gain` (build_kit apply_additive_gains:
 * fxfirewithembers01's flame cards 1.6, the campfire's Glow:2 2.5), else
 * FLAME_GLOW_GAIN. Skyrim's effect shader draws texture x vertex colour x it. */
export function additiveGain(material: THREE.Material): number {
  const gain = (material.userData as SettlementKitMaterialExtras | undefined)?.gain;
  return typeof gain === "number" && gain > 0 ? gain : FLAME_GLOW_GAIN;
}

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

/**
 * Still water held in a kit piece (a trough, a basin): the NIF's water
 * shader, carried by the kit build as extras `{ "water": true }` with no
 * texture. Selected by that flag, never by name.
 */
export function isSettlementStillWaterMaterial(material: THREE.Material): boolean {
  return (material.userData as SettlementKitMaterialExtras | undefined)?.water === true;
}

/** Fresh still water in a trough (linear RGB): the field water's clear
 * tint at zero salinity (waterMaterial.ts), lifted so a thin layer reads
 * dark green rather than black; a glossy translucent surface, no
 * reflection (planner water call, 2026-09-26; the owner judges the look). */
const STILL_WATER_RGB = new THREE.Color(0.06, 0.13, 0.115);
const STILL_WATER_OPACITY = 0.6;

/** Give a still-water material its look. Returns whether it was one. Idempotent. */
export function applySettlementStillWater(material: THREE.Material): boolean {
  if (!isSettlementStillWaterMaterial(material)) return false;
  const m = material as THREE.MeshStandardMaterial;
  m.color?.copy(STILL_WATER_RGB);
  m.transparent = true;
  m.opacity = STILL_WATER_OPACITY;
  m.roughness = 0.05;
  m.metalness = 0;
  m.depthWrite = false;
  return true;
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

/** An additive effect card: the kit build's material extras `{ additive: true }`. */
export function isSettlementAdditiveMaterial(material: THREE.Material): boolean {
  return (material.userData as SettlementKitMaterialExtras | undefined)?.additive === true;
}

/**
 * An additive effect card (fxfirewithembers01's flame cards, the campfire's
 * log glow overlays) blends like Skyrim's effect shader: added to what is
 * behind it, writing no depth. Its colour is unlit (materials.ts glowLine).
 */
export function applySettlementAdditive(material: THREE.Material): boolean {
  material.blending = THREE.AdditiveBlending;
  material.transparent = true;
  material.depthWrite = false;
  return true;
}

/** How a settlement mesh drawing `material` is flagged: a decal draws after
 * its parent's opaque surface and casts no shadow (the surface under it
 * already does; its twin would double the caster at the same depth); an
 * additive effect card casts none (light casts no shadow). */
export function settlementMeshDrawFlags(material: THREE.Material): {
  castShadow: boolean; renderOrder: number;
} {
  if (isSettlementDecalMaterial(material)) {
    return { castShadow: false, renderOrder: SETTLEMENT_DECAL_RENDER_ORDER };
  }
  return { castShadow: !isSettlementAdditiveMaterial(material), renderOrder: 0 };
}

/**
 * Building wetness and night windows share one uniform block. State lives in
 * userData and the cache key is chained, so WorldSky can safely reapply this
 * after CSM replaces onBeforeCompile.
 */
export function applySettlementSurface(
  material: THREE.Material,
  uniforms: SettlementMaterialUniforms,
  glowMaterial: SettlementGlow = false,
): void {
  const m = material as THREE.MeshStandardMaterial;
  if (!m.isMeshStandardMaterial) return;
  m.userData.esAerial = true;
  // a shell's emissive (colour x its diffuse) is set before the first draw
  if (glowMaterial === "lamp-shell") applyLanternShell(m);
  const held = m.userData.esSettlementSurface as SettlementSurfaceState | undefined;
  const gain = additiveGain(m);
  // Same state again (every rebuild re-applies it): nothing to relink.
  if (held && held.uniforms === uniforms && held.glowMaterial === glowMaterial && !held.depthPair) {
    held.flameGain.value = gain;
    reapplySettlementSurface(m);
    return;
  }
  m.userData.esSettlementSurface = {
    uniforms, glowMaterial, depthPair: false, flameGain: { value: gain },
  };
  // a changed glow kind is a new program: the installed hook re-wraps
  reapplySettlementSurface(m, Boolean(held));
}

/** Create the alpha/displacement-matched shadow twin at the colour patch call site. */
export function applySettlementSurfaceWithShadow(
  material: THREE.Material,
  uniforms: SettlementMaterialUniforms,
  glowMaterial: SettlementGlow = false,
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
  depth.userData.esSettlementSurface = { uniforms, glowMaterial: false, depthPair: true, flameGain: { value: 0 } };
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

/** The strength of an additive card: lighting.ts `fixtureFactor` on the lamp clock. */
function flameStrength(glow: "flame" | "lamp-flame"): string {
  return glow === "flame"
    ? `(${ALWAYS_LIT_DAY_FACTOR.toFixed(2)} + ${(1 - ALWAYS_LIT_DAY_FACTOR).toFixed(2)} * esSettlementNight)`
    : "esSettlementNight";
}

/** The line after the output stage an additive card adds: unlit, its texture
 * x vertex colour x gain (the `esSettlementFlameGain` uniform) x strength,
 * alpha kept for the additive blend. */
export function flameOutputLine(glow: SettlementGlow): string {
  return glow === "flame" || glow === "lamp-flame"
    ? `\ngl_FragColor = vec4(diffuseColor.rgb * esSettlementFlameGain * ${flameStrength(glow)}, diffuseColor.a);`
    : "";
}

/** The emissive-stage line a glow kind adds (none for a plain surface or a card). */
function glowLine(glow: SettlementGlow): string {
  if (glow === "flame" || glow === "lamp-flame") return "";
  if (glow === "lamp-shell") return "\ntotalEmissiveRadiance *= esSettlementNight;";
  return glow
    ? `\ntotalEmissiveRadiance *= ${WINDOW_GLOW_RGB} * esSettlementNight * ${WINDOW_GLOW_GAIN.toFixed(1)};`
    : "";
}

/** The surface's program key part: the glow kind and the pass, never a value. */
function surfaceKey(state: SettlementSurfaceState): string {
  const glow = state.glowMaterial === "flame" ? 2 : state.glowMaterial === "lamp-flame" ? 3
    : state.glowMaterial === "lamp-shell" ? 4 : state.glowMaterial ? 1 : 0;
  return `${PATCH}|${glow}|${state.depthPair ? "depth" : "colour"}`;
}

export function reapplySettlementSurface(material: THREE.Material, force = false): void {
  const m = material as THREE.MeshStandardMaterial | THREE.MeshDepthMaterial;
  if (!m.userData?.esSettlementSurface) return;
  // The hook reads the state held at compile time, so a changed glow kind
  // needs a relink, never a second wrap (shaderHookChain.ts says why).
  if (chainHas(m.onBeforeCompile, PATCH)) {
    if (force) m.needsUpdate = true;
  } else {
    const previous = m.onBeforeCompile;
    m.onBeforeCompile = markChain<THREE.Material["onBeforeCompile"]>((shader, renderer) => {
      previous?.call(m, shader, renderer);
      const state = m.userData.esSettlementSurface as SettlementSurfaceState | undefined;
      // never twice: a chain that holds this hook twice patches once
      if (!state || shader.vertexShader.includes(SETTLEMENT_VARYING)) return;
      shader.uniforms.esSettlementRain = state.uniforms.esSettlementRain;
      shader.uniforms.esSettlementNight = state.uniforms.esSettlementNight;
      shader.uniforms.esSettlementFlameGain = state.flameGain;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>\nattribute float ${SETTLEMENT_GROUND_ATTRIBUTE};\n${SETTLEMENT_VARYING};`)
        .replace("#include <begin_vertex>", `#include <begin_vertex>\nvec4 esSettlementWorldPosition = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\nesSettlementWorldPosition = instanceMatrix * esSettlementWorldPosition;\n#endif\nesSettlementWorldPosition = modelMatrix * esSettlementWorldPosition;\nesSettlementHeightAboveGround = esSettlementWorldPosition.y - ${SETTLEMENT_GROUND_ATTRIBUTE};`);
      if (state.depthPair) return;
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\nuniform float esSettlementRain;\nuniform float esSettlementNight;\nuniform float esSettlementFlameGain;\n${SETTLEMENT_VARYING};`)
        .replace("#include <color_fragment>", `#include <color_fragment>\nfloat esWallWet = esSettlementRain * mix(0.55, 1.0, 1.0 - smoothstep(0.0, 4.0, max(0.0, esSettlementHeightAboveGround)));\ndiffuseColor.rgb *= mix(1.0, 0.62, esWallWet * 0.55);`)
        // Night windows in the EMISSIVE stage: the kit's glow mask (emissive
        // map x factor) x warm lamplight x the lamp clock (lighting.ts). By day the
        // factor is 0, so the glTF's emissive never shows. Added to albedo
        // (the old path) it was multiplied by the night light and stayed dark.
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>${glowLine(state.glowMaterial)}`)
        .replace("#include <opaque_fragment>", `#include <opaque_fragment>${flameOutputLine(state.glowMaterial)}`)
        .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.32, esWallWet * 0.55);`);
    }, previous, PATCH);
    m.needsUpdate = true;
  }
  // A clone (materialVariant) has three's default key: key it again.
  if (!chainHas(m.customProgramCacheKey, PATCH)) {
    const priorKey = m.customProgramCacheKey;
    // stable: the kind and the pass read from the state held NOW, never a gain
    m.customProgramCacheKey = markChain(function (this: THREE.Material) {
      const held = this.userData.esSettlementSurface as SettlementSurfaceState | undefined;
      return `${priorKey.call(this)}|${held ? surfaceKey(held) : PATCH}`;
    }, priorKey, PATCH);
  }
}

export function updateSettlementEnvironment(
  uniforms: SettlementMaterialUniforms,
  rainIntensity: number,
  epochMinutes: number,
): void {
  uniforms.esSettlementRain.value = THREE.MathUtils.clamp(rainIntensity, 0, 1);
  // the ONE clock for every artificial light (lighting.ts, walk 2 D7)
  uniforms.esSettlementNight.value = artificialLightFactor(epochMinutes);
}
