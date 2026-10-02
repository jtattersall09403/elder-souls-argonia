import * as THREE from "three";
import type { NodeMaterial } from "three/webgpu";
import {
  attribute, float, materialColor, materialEmissive, materialReference, materialRoughness, max, mix, positionWorld, smoothstep,
  varying, vec3, vec4,
} from "three/tsl";
import { ALWAYS_LIT_DAY_FACTOR, artificialLightFactor } from "./lighting";
import { cloneNodeMaterial, isNodeMaterial, type TslNode } from "../render/nodes/materialNodes";
import type { SettlementKitMaterialExtras } from "./types";
import { applyLanternShell } from "./fixtureGlow";
import { sharedUniform } from "../render/nodes/sharedUniform";

/** A float `uniform()` node (TSL): writers set `.value`, every material reads the one node. */
export type SettlementUniform = TslNode & { value: number };

/** The settlement's per-frame environment, shared by every surface (one node each). */
export interface SettlementMaterialUniforms {
  esSettlementRain: SettlementUniform;
  esSettlementNight: SettlementUniform;
}

/** Fresh environment uniforms (rain 0, night 0); the layer owns one set. */
export function createSettlementMaterialUniforms(): SettlementMaterialUniforms {
  return { esSettlementRain: sharedUniform(0) as SettlementUniform, esSettlementNight: sharedUniform(0) as SettlementUniform };
}

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
}

/** The material property an additive card's gain lives in (`additiveGain`),
 * read per draw by one shared `materialReference`: a program (and a node
 * build) per distinct gain was one relink per new flame asset. */
export const SETTLEMENT_FLAME_GAIN_PROPERTY = "esSettlementFlameGain";

/** The material's own slots before the surface wrapped them: a re-wrap (a
 * changed glow kind, a variant clone) starts from these, never stacks. */
interface SettlementSurfaceBase {
  colorNode: TslNode | null;
  emissiveNode: TslNode | null;
  roughnessNode: TslNode | null;
  lights: boolean;
}

/** Warm lamplight colour of a lit window at full night (linear RGB), and its
 * gain over the glTF emissive (the NIF's Glow_Map mask at factor 1). */
export const WINDOW_GLOW_RGB: readonly [number, number, number] = [1.0, 0.6, 0.28];
export const WINDOW_GLOW_GAIN = 2.0;
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

/** Surface state and base slots live on `userData` as NON-enumerable keys:
 * `Material.copy` JSON-copies userData, and node graphs neither serialise nor
 * belong on a clone (a clone re-wraps from the base, `cloneSettlementMaterial`). */
function hidden<T>(m: THREE.Material, key: string, value?: T): T | undefined {
  if (value !== undefined) {
    Object.defineProperty(m.userData, key, { value, enumerable: false, writable: true, configurable: true });
  }
  return (m.userData as Record<string, T | undefined>)[key];
}
const STATE_KEY = "esSettlementSurface";
const BASE_KEY = "esSettlementBase";

function isStandardNode(m: THREE.Material): m is NodeMaterial & THREE.MeshStandardMaterial {
  return isNodeMaterial(m) && (m as unknown as { isMeshStandardNodeMaterial?: boolean }).isMeshStandardNodeMaterial === true;
}

/**
 * Building wetness, night windows and additive flame cards as node features
 * on a converted kit material (a `MeshStandardNodeMaterial`: kit.ts converts
 * once at load). Re-applying the same state changes nothing (no relink); a
 * changed glow kind re-wraps once from the material's own slots, never
 * stacking. The shadow pass reuses these slots: there is no depth twin.
 */
export function applySettlementSurface(
  material: THREE.Material,
  uniforms: SettlementMaterialUniforms,
  glowMaterial: SettlementGlow = false,
): void {
  if (!isStandardNode(material)) return;
  const m = material;
  m.userData.esAerial = true;
  // a shell's emissive (colour x its diffuse) is set before the first draw
  if (glowMaterial === "lamp-shell") applyLanternShell(m);
  (m as unknown as Record<string, number>)[SETTLEMENT_FLAME_GAIN_PROPERTY] = additiveGain(m);
  const held = hidden<SettlementSurfaceState>(m, STATE_KEY);
  // Same state again (every rebuild re-applies it): nothing to relink.
  if (held && held.uniforms === uniforms && held.glowMaterial === glowMaterial) return;
  hidden(m, STATE_KEY, { uniforms, glowMaterial });
  const base = hidden<SettlementSurfaceBase>(m, BASE_KEY) ?? hidden<SettlementSurfaceBase>(m, BASE_KEY, {
    colorNode: m.colorNode ?? null,
    emissiveNode: (m as { emissiveNode?: TslNode }).emissiveNode ?? null,
    roughnessNode: (m as { roughnessNode?: TslNode }).roughnessNode ?? null,
    lights: m.lights,
  })!;
  const graph = surfaceGraph(uniforms, glowMaterial, base);
  const nodes = m as unknown as { colorNode: TslNode; emissiveNode: TslNode; roughnessNode: TslNode };
  nodes.colorNode = graph.colorNode;
  nodes.emissiveNode = graph.emissiveNode;
  nodes.roughnessNode = graph.roughnessNode;
  m.lights = graph.lights;
  m.needsUpdate = true;
}

/** Wetness of a wall at height `h` m above its ground line under rain `rain` (0..1). */
export function settlementWallWetness(rain: number, heightAboveGroundM: number): number {
  const t = THREE.MathUtils.clamp(Math.max(0, heightAboveGroundM) / 4, 0, 1);
  const s = t * t * (3 - 2 * t);
  return rain * (0.55 + (1 - 0.55) * (1 - s));
}

/** Albedo scale of a wet wall (1 dry .. 0.62 x at full wet share). */
export function settlementWetAlbedoScale(wet: number): number {
  return 1 + (0.62 - 1) * (wet * 0.55);
}

interface SurfaceGraph { colorNode: TslNode; emissiveNode: TslNode; roughnessNode: TslNode; lights: boolean }
const GRAPHS_KEY = "esSettlementGraphs";

/**
 * The surface slots for a glow kind over a base, built ONCE per uniforms set
 * and shared by every material with that kind and base: three 0.184 keys a
 * node by its id, so shared nodes are what makes materials share one node
 * build and one program (the kit materials' base is three's shared
 * `materialColor` / `materialEmissive` / `materialRoughness`).
 */
function surfaceGraph(uniforms: SettlementMaterialUniforms, glow: SettlementGlow, base: SettlementSurfaceBase): SurfaceGraph {
  let graphs = (uniforms as unknown as Record<string, Map<string, SurfaceGraph> | undefined>)[GRAPHS_KEY];
  if (!graphs) {
    graphs = new Map();
    Object.defineProperty(uniforms, GRAPHS_KEY, { value: graphs, enumerable: false });
  }
  const id = (n: TslNode | null) => (n ? n.id : "-");
  const key = `${String(glow)}|${id(base.colorNode)}|${id(base.emissiveNode)}|${id(base.roughnessNode)}|${base.lights}`;
  let graph = graphs.get(key);
  if (graph) return graph;
  const { esSettlementRain: rain, esSettlementNight: night } = uniforms;
  // world height above the instance's ground line (vertex stage; instanced
  // and merged draws alike carry the ground-line attribute)
  const heightAbove = varying(positionWorld.y.sub(attribute(SETTLEMENT_GROUND_ATTRIBUTE, "float")), "esSettlementHeightAboveGround");
  const wet = rain.mul(mix(float(0.55), float(1.0), float(1.0).sub(smoothstep(0.0, 4.0, max(heightAbove, 0.0)))));
  const baseColor: TslNode = base.colorNode ? vec4(base.colorNode) : materialColor;
  const wetColour: TslNode = vec4(baseColor.rgb.mul(mix(float(1.0), float(0.62), wet.mul(0.55))), baseColor.a);
  if (glow === "flame" || glow === "lamp-flame") {
    // An additive card is unlit: texture x vertex colour x gain x strength
    // (`flameOutputRgb`), alpha kept for the additive blend; fog and tone
    // mapping follow as they did after the old output line.
    const strength = glow === "flame"
      ? float(ALWAYS_LIT_DAY_FACTOR).add(float(1 - ALWAYS_LIT_DAY_FACTOR).mul(night)) : night;
    const gain = materialReference(SETTLEMENT_FLAME_GAIN_PROPERTY, "float");
    graph = {
      colorNode: vec4(wetColour.rgb.mul(gain).mul(strength), wetColour.a),
      emissiveNode: vec3(0),
      roughnessNode: base.roughnessNode,
      lights: false,
    };
  } else {
    graph = {
      colorNode: wetColour,
      // Night windows in the EMISSIVE stage: the kit's glow mask (emissive
      // map x factor) x warm lamplight x the lamp clock (lighting.ts). By
      // day the factor is 0, so the glTF's emissive never shows.
      // A lantern shell (fixtureGlow.ts): its own emissive x the lamp clock.
      emissiveNode: glow === "lamp-shell"
        ? vec3(base.emissiveNode ?? materialEmissive).mul(night)
        : glow
        ? vec3(base.emissiveNode ?? materialEmissive).mul(vec3(...WINDOW_GLOW_RGB)).mul(night).mul(WINDOW_GLOW_GAIN)
        : base.emissiveNode,
      roughnessNode: mix(base.roughnessNode ?? materialRoughness, float(0.32), wet.mul(0.55)),
      lights: base.lights,
    };
  }
  graphs.set(key, graph);
  return graph;
}

/**
 * A copy of a surfaced material for another glow kind (`materialVariant`):
 * the classic properties copied, the node slots reset to the material's own
 * (pre-surface) ones and every feature marker cleared, so the copy is
 * surfaced and patched afresh, never double-wrapped.
 */
export function cloneSettlementMaterial<T extends THREE.Material>(material: T): T {
  // three 0.184's NodeMaterial.clone() drops map, color, roughness and side
  const copy = (isNodeMaterial(material) ? cloneNodeMaterial(material) : material.clone()) as T;
  const base = hidden<SettlementSurfaceBase>(material, BASE_KEY);
  if (base && isNodeMaterial(copy)) {
    const nodes = copy as unknown as { colorNode: TslNode; emissiveNode: TslNode; roughnessNode: TslNode };
    nodes.colorNode = base.colorNode; nodes.emissiveNode = base.emissiveNode;
    nodes.roughnessNode = base.roughnessNode; copy.lights = base.lights;
  }
  for (const key of Object.keys(copy.userData)) if (key.startsWith("esNode_")) delete copy.userData[key];
  return copy;
}

/** The glow kind and gain a surfaced material holds (tests, probes). */
export function settlementSurfaceOf(material: THREE.Material): { glowMaterial: SettlementGlow; flameGain: number } | null {
  const held = hidden<SettlementSurfaceState>(material, STATE_KEY);
  return held ? {
    glowMaterial: held.glowMaterial,
    flameGain: (material as unknown as Record<string, number>)[SETTLEMENT_FLAME_GAIN_PROPERTY],
  } : null;
}

/** An additive card's strength on the lamp clock: `lighting.ts fixtureFactor`
 * (a fire burns by day at ALWAYS_LIT_DAY_FACTOR; a lamp follows the clock). */
export function flameStrength(glow: "flame" | "lamp-flame", night: number): number {
  return glow === "flame" ? ALWAYS_LIT_DAY_FACTOR + (1 - ALWAYS_LIT_DAY_FACTOR) * night : night;
}

/** What an additive card outputs before fog and tone mapping (the graph in
 * `surfaceGraph` mirrors it): its colour (texture x vertex colour, wetted) x
 * gain x strength; a plain surface or window returns null (lit as usual). */
export function flameOutputRgb(
  glow: SettlementGlow, diffuseRgb: readonly [number, number, number], gain: number, night: number,
): [number, number, number] | null {
  if (glow !== "flame" && glow !== "lamp-flame") return null;
  const k = gain * flameStrength(glow, night);
  return [diffuseRgb[0] * k, diffuseRgb[1] * k, diffuseRgb[2] * k];
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

/**
 * Everything a kit part's bucket material gets before it draws, in the
 * layer's order (the ONE sequence the layer and the harness share): the
 * decal bias, the additive blend for a flame card, the still-water look,
 * then the surface features. Returns how its meshes are flagged.
 */
export function prepareSettlementMaterial(
  material: THREE.Material,
  uniforms: SettlementMaterialUniforms,
  glowMaterial: SettlementGlow,
  flame: boolean,
): { castShadow: boolean; renderOrder: number } {
  applySettlementDecal(material);
  if (flame) applySettlementAdditive(material);
  applySettlementStillWater(material);
  applySettlementSurface(material, uniforms, glowMaterial);
  return settlementMeshDrawFlags(material);
}
