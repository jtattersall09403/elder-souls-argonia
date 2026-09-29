/**
 * Node-material composition helpers (decision 0107, docs/standards/tsl-shaders.md).
 *
 * Every shader customisation in the game is a TSL node graph on a NodeMaterial.
 * These helpers replace the old `onBeforeCompile` string patches: a feature
 * (wind sway, LOD fade, aerial haze, wetness...) WRAPS the node already in a
 * slot, so any number of features compose in call order on one material, and
 * the shadow pass inherits `positionNode` / `maskNode` automatically (no depth
 * twin material; use `castShadowPositionNode` / `maskShadowNode` only when the
 * shadow must differ).
 *
 * No module-level mutable state: every helper takes the material it patches.
 */
import * as THREE from "three";
import {
  MeshBasicNodeMaterial,
  MeshLambertNodeMaterial,
  MeshPhongNodeMaterial,
  MeshPhysicalNodeMaterial,
  MeshStandardNodeMaterial,
  NodeMaterial,
  PointsNodeMaterial,
  SpriteNodeMaterial,
  LineBasicNodeMaterial,
  MeshMatcapNodeMaterial,
  MeshNormalNodeMaterial,
  MeshToonNodeMaterial,
} from "three/webgpu";
import { bool, materialColor, output, positionLocal, vec4 } from "three/tsl";
// TSL node values are typed loosely on purpose: the typings for chained TSL
// expressions are too deep for tsc to check usefully (standard, 0107 §3).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TslNode = any;

type NodeMaterialCtor = new () => NodeMaterial;

const NODE_CLASS_BY_TYPE: Record<string, NodeMaterialCtor> = {
  MeshBasicMaterial: MeshBasicNodeMaterial,
  MeshLambertMaterial: MeshLambertNodeMaterial,
  MeshPhongMaterial: MeshPhongNodeMaterial,
  MeshStandardMaterial: MeshStandardNodeMaterial,
  MeshPhysicalMaterial: MeshPhysicalNodeMaterial,
  MeshMatcapMaterial: MeshMatcapNodeMaterial,
  MeshNormalMaterial: MeshNormalNodeMaterial,
  MeshToonMaterial: MeshToonNodeMaterial,
  PointsMaterial: PointsNodeMaterial,
  SpriteMaterial: SpriteNodeMaterial,
  LineBasicMaterial: LineBasicNodeMaterial,
};

/** True when `material` is already a NodeMaterial. */
export function isNodeMaterial(material: THREE.Material): material is NodeMaterial {
  return (material as NodeMaterial).isNodeMaterial === true;
}

/**
 * The node twin of a classic material (the same property copy three's
 * NodeLibrary.fromMaterial does at render time, done once at load so the
 * feature helpers have node slots to wrap). Idempotent: a NodeMaterial comes
 * back unchanged. `userData` is shared by reference so feature state follows.
 */
export function toNodeMaterial<T extends THREE.Material>(material: T): NodeMaterial {
  if (isNodeMaterial(material)) return material;
  const Ctor = NODE_CLASS_BY_TYPE[material.type];
  if (!Ctor) {
    throw new Error(`toNodeMaterial: no node class for ${material.type} (${material.name})`);
  }
  const node = new Ctor();
  const source = material as unknown as Record<string, unknown>;
  const target = node as unknown as Record<string, unknown>;
  for (const key of Object.keys(source)) {
    if (key === "uuid" || key === "id" || key === "type" || key === "version") continue;
    if (key.startsWith("is") || key.startsWith("_")) continue;
    if (key === "onBeforeCompile" || key === "customProgramCacheKey") continue;
    target[key] = source[key];
  }
  node.name = material.name;
  node.needsUpdate = true;
  return node;
}

/**
 * Convert every material on a loaded object tree in place (arrays included),
 * sharing one node twin per source material. Returns the conversion map so a
 * caller that caches materials by identity can re-key.
 */
export function convertObjectMaterials(
  root: THREE.Object3D,
  cache: Map<THREE.Material, NodeMaterial> = new Map(),
): Map<THREE.Material, NodeMaterial> {
  const convert = (m: THREE.Material): NodeMaterial => {
    const hit = cache.get(m);
    if (hit) return hit;
    const n = toNodeMaterial(m);
    cache.set(m, n);
    return n;
  };
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.material) return;
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map(convert)
      : convert(mesh.material);
  });
  return cache;
}

function touch(material: NodeMaterial): void {
  material.needsUpdate = true;
}

/**
 * Wrap the object-space vertex position (the old `#include <begin_vertex>`
 * `transformed` patch point). `fn` receives the current position node.
 */
export function wrapPosition(material: NodeMaterial, fn: (position: TslNode) => TslNode): void {
  material.positionNode = fn(material.positionNode ?? positionLocal);
  touch(material);
}

/** Wrap the shadow-only position (defaults to the colour pass position). */
export function wrapShadowPosition(material: NodeMaterial, fn: (position: TslNode) => TslNode): void {
  material.castShadowPositionNode = fn(
    material.castShadowPositionNode ?? material.positionNode ?? positionLocal,
  );
  touch(material);
}

/**
 * Wrap the base colour (the old `diffuseColor` / `map_fragment` patch point).
 * `fn` receives a vec4 (rgb, alpha) node: material.color × map by default.
 */
export function wrapColor(material: NodeMaterial, fn: (color: TslNode) => TslNode): void {
  material.colorNode = fn(material.colorNode ? vec4(material.colorNode) : materialColor);
  touch(material);
}

/**
 * AND a keep-this-fragment condition into the mask (the old `discard` patch).
 * A fragment is drawn only when every mask added is true. Applies to the
 * shadow pass too unless `maskShadowNode` is set.
 */
export function andMask(material: NodeMaterial, keep: TslNode): void {
  material.maskNode = material.maskNode ? bool(material.maskNode).and(keep) : bool(keep);
  touch(material);
}

/** AND a condition into the shadow-only mask (starts from the colour mask). */
export function andShadowMask(material: NodeMaterial, keep: TslNode): void {
  const base = material.maskShadowNode ?? material.maskNode;
  material.maskShadowNode = base ? bool(base).and(keep) : bool(keep);
  touch(material);
}

/**
 * Wrap the final lit colour before fog/tone mapping (the old
 * `gl_FragColor = ...` / `#include <opaque_fragment>` patch point).
 * `fn` receives the vec4 output node.
 */
export function wrapOutput(material: NodeMaterial, fn: (out: TslNode) => TslNode): void {
  material.outputNode = fn(material.outputNode ?? output);
  touch(material);
}

/** Wrap the emissive term (the old `totalEmissiveRadiance` patch point). */
export function wrapEmissive(material: NodeMaterial, fn: (emissive: TslNode | null) => TslNode): void {
  (material as NodeMaterial & { emissiveNode: TslNode }).emissiveNode = fn(
    (material as NodeMaterial & { emissiveNode?: TslNode }).emissiveNode ?? null,
  );
  touch(material);
}

/**
 * Feature marker: record that `feature` has patched this material so a second
 * apply is a no-op (the node-world replacement for the old
 * "never double-patch" string checks and `customProgramCacheKey` suffixes).
 * Returns true when the feature was NOT yet applied (caller should patch).
 */
export function claimFeature(material: THREE.Material, feature: string): boolean {
  const key = `esNode_${feature}`;
  if (material.userData[key]) return false;
  material.userData[key] = true;
  return true;
}
