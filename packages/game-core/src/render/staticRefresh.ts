/**
 * Static draws skip three's per-frame node refresh (walk 10, webgpu-webgl-attr §3).
 *
 * three 0.184's NodeMaterialObserver.needsRefresh returns true for every
 * material holding a node (NodeMaterialObserver.js:690) before its own
 * `object.static` check, so every node-material draw re-runs its object
 * node updates, its geometry check and its bindings walk every frame: about
 * 25 of 34 ms main-thread at Riverwalk. This wraps `renderer._nodes.needsRefresh`
 * (NodeManager.js:959) and answers false for a draw whose object carries
 * `userData.esStatic === true` once that draw has refreshed with the current
 * world matrix, material version, geometry (attribute and index versions,
 * draw range, instance fill and count, indirect args), sampled-texture versions and the scene's
 * fixture-light epoch. Model matrices are safe: modelViewMatrix is
 * cameraViewMatrix x modelWorldMatrix on the GPU (ModelNode.js:138).
 *
 * A shared uniform buffer (renderGroup: camera, `sharedUniform` values) is
 * one binding object for every draw of a render context with the same
 * uniform set (NodeBuilder.js:578-600), written by whichever of those draws
 * refreshes first in a render call; so a static draw still refreshes when
 * one of its shared bindings has not been written in this render call.
 *
 * Mark an object static only when every objectGroup uniform its material
 * reads is constant or derives from the key above: a plain `uniform()` whose
 * `.value` the app writes after the first frame would stay stale. A value
 * the same for every draw of a render call belongs in `sharedUniform`
 * (written from `onBeforeRender` of EVERY draw that reads it when it follows
 * the render call, as FlameSystem's draw state); an `onObjectUpdate` value
 * is safe only when it derives from the key (a texture picked by the object,
 * the fixture-light slots by epoch). Marked: terrain chunks, vegetation,
 * groundcover, settlement merged draws, fire draws.
 */
import type * as THREE from "three";
import { fixtureLightEpochOf } from "./fixtureLights/fixtureLightField";

/** Per-renderer counts since install (probes, `__DIAG.staticRefresh`). */
export interface StaticRefreshCounts {
  /** needsRefresh calls answered true (a refresh ran). */
  refreshes: number;
  /** Static draws answered false (refresh skipped). */
  skips: number;
}

interface RenderObjectLike {
  object: THREE.Object3D;
  material: THREE.Material;
  geometry: THREE.BufferGeometry;
  scene: THREE.Object3D;
  getBindings?: () => Array<{ bindings: BindingLike[] }>;
}

interface BindingLike {
  isSampledTexture?: boolean;
  texture?: { version: number };
  isNodeUniformsGroup?: boolean;
  groupNode?: { shared?: boolean };
}

interface NodesLike {
  needsRefresh(renderObject: RenderObjectLike): boolean;
  getNodeFrameForRender(renderObject: RenderObjectLike): { renderId: number };
}

interface Seen {
  matrix: Float32Array;
  materialVersion: number;
  geometry: THREE.BufferGeometry;
  geometryKey: number;
  textureKey: number;
  epoch: number;
  shared: BindingLike[];
}

const COUNTS_KEY = "esStaticRefresh";

function versionOf(attribute: object): number {
  const a = attribute as { version?: number; data?: { version: number } };
  return a.data?.version ?? a.version ?? 0;
}

function geometryKey(object: THREE.Object3D, geometry: THREE.BufferGeometry): number {
  const { start, count } = geometry.drawRange;
  let k = (start * 31 + (Number.isFinite(count) ? count : -1)) | 0;
  // an interleaved attribute carries its version on its buffer (`data`)
  for (const name in geometry.attributes) k = (k * 31 + versionOf(geometry.attributes[name])) | 0;
  if (geometry.index) k = (k * 31 + geometry.index.version) | 0;
  const g = geometry as THREE.BufferGeometry & { instanceCount?: number; indirect?: { version: number } | null; indirectOffset?: number | number[] };
  k = (k * 31 + (Number.isFinite(g.instanceCount) ? g.instanceCount! : -1)) | 0;
  if (g.indirect) {
    k = (k * 31 + g.indirect.version) | 0;
    const off = g.indirectOffset ?? 0;
    for (const o of Array.isArray(off) ? off : [off]) k = (k * 31 + o) | 0;
  }
  const inst = object as THREE.InstancedMesh;
  if (inst.isInstancedMesh) {
    k = (k * 31 + inst.instanceMatrix.version) | 0;
    k = (k * 31 + inst.count) | 0;
    if (inst.instanceColor) k = (k * 31 + inst.instanceColor.version) | 0;
  }
  return k;
}

function textureKey(renderObject: RenderObjectLike): number {
  let k = 0;
  for (const group of renderObject.getBindings?.() ?? []) {
    for (const b of group.bindings) if (b.isSampledTexture && b.texture) k = (k * 31 + b.texture.version) | 0;
  }
  return k;
}

function sharedBindings(renderObject: RenderObjectLike): BindingLike[] {
  const out: BindingLike[] = [];
  for (const group of renderObject.getBindings?.() ?? []) {
    for (const b of group.bindings) if (b.isNodeUniformsGroup && b.groupNode?.shared === true) out.push(b);
  }
  return out;
}

function sameMatrix(a: Float32Array, b: ArrayLike<number>): boolean {
  for (let i = 0; i < 16; i++) if (a[i] !== Math.fround(b[i])) return false;
  return true;
}

/** Install the skip on `renderer` (idempotent); returns its live counts. */
export function skipStaticRefresh(renderer: object): StaticRefreshCounts {
  const r = renderer as { _nodes: NodesLike; [COUNTS_KEY]?: StaticRefreshCounts };
  if (r[COUNTS_KEY]) return r[COUNTS_KEY];
  const counts: StaticRefreshCounts = { refreshes: 0, skips: 0 };
  const seen = new WeakMap<RenderObjectLike, Seen>();
  const nodes = r._nodes;
  const original = nodes.needsRefresh.bind(nodes);
  const writtenAt = new WeakMap<BindingLike, number>();
  nodes.needsRefresh = (renderObject: RenderObjectLike): boolean => {
    const { object, material, geometry } = renderObject;
    const renderId = nodes.getNodeFrameForRender(renderObject).renderId;
    const s = object.userData.esStatic === true ? seen.get(renderObject) : undefined;
    if (s && s.shared.every((b) => writtenAt.get(b) === renderId)) {
      if (s.materialVersion === material.version && s.geometry === geometry
        && s.epoch === fixtureLightEpochOf(renderObject.scene)
        && sameMatrix(s.matrix, object.matrixWorld.elements)
        && s.geometryKey === geometryKey(object, geometry)
        && s.textureKey === textureKey(renderObject)) {
        counts.skips += 1;
        return false;
      }
    }
    const refresh = original(renderObject);
    if (refresh) {
      counts.refreshes += 1;
      const shared = sharedBindings(renderObject);
      for (const b of shared) writtenAt.set(b, renderId);
      if (object.userData.esStatic === true) {
        const next = s ?? { matrix: new Float32Array(16) } as Seen;
        next.matrix.set(object.matrixWorld.elements);
        next.materialVersion = material.version;
        next.geometry = geometry;
        next.geometryKey = geometryKey(object, geometry);
        next.textureKey = textureKey(renderObject);
        next.epoch = fixtureLightEpochOf(renderObject.scene);
        next.shared = shared;
        seen.set(renderObject, next);
      }
    }
    return refresh;
  };
  Object.defineProperty(r, COUNTS_KEY, { value: counts, enumerable: false });
  return counts;
}

/** The counts of a renderer the skip is installed on, else null. */
export function staticRefreshOf(renderer: object): StaticRefreshCounts | null {
  return (renderer as { [COUNTS_KEY]?: StaticRefreshCounts })[COUNTS_KEY] ?? null;
}
