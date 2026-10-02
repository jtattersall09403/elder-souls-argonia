/**
 * One node build per material for every InstancedMesh, not one per mesh
 * (walk 9, the WebGPU vanishing-world cause).
 *
 * three 0.184 (and 0.186) appends `object.uuid` to the material cache key of
 * every InstancedMesh (RenderObject.getMaterialCacheKey, the TODO on
 * three.js#29066), because the InstanceNode a build makes reads THAT mesh's
 * matrices. So each of the studio's hundreds of instanced tiles builds its own
 * node graph in JS (over 50 ms each on the VM; the GPU pipeline is shared, the
 * build is not), the shader-build budget admits one such build per frame, and
 * every tile still waiting is not drawn: the world draws a piece at a time,
 * a re-created tile vanishes until its turn, and the character waits in the
 * same queue (boot check, Riverwalk t=22: 771 distinct objects waiting over
 * a 40 s hold, 90 built, ~1,000 draws held back per second).
 *
 * With `shareInstancedPrograms` every InstancedMesh reads its matrices (and
 * colours) from instanced vertex buffers, so a build is valid for any mesh
 * with the same material, geometry layout and instance-buffer layout; only
 * the buffers differ. Per renderer, this:
 * - keys an InstancedMesh's render object WITHOUT its uuid, adding instead
 *   what the build depends on (matrix usage; whether it has colours, and
 *   their usage), so meshes share the node build;
 * - swaps the shared build's instance-matrix and instance-colour vertex
 *   buffers in each render object's attribute list for that mesh's own
 *   (made once per mesh, its version following the mesh's attribute).
 * A mesh whose matrices are a storage buffer (the GPU cull pools: every draw
 * of a pool reads ONE shared StorageInstancedBufferAttribute) shares its build
 * with the meshes reading that same buffer; nothing is swapped, the key names
 * the buffer. Morph-targeted and skinned instancing keep three's own path.
 */
import * as THREE from "three";

type Attr = THREE.BufferAttribute | THREE.InterleavedBufferAttribute;

interface RenderObjectLike {
  object: THREE.Object3D;
  initialCacheKey: unknown;
  getMaterialCacheKey(): unknown;
  getCacheKey(): unknown;
  getAttributes(): Attr[];
  attributes: Attr[] | null;
  vertexBuffers: unknown[] | null;
}

type Owner = { mesh: THREE.InstancedMesh; kind: "matrix" | "color" };

/** The per-renderer state: which typed array belongs to which mesh's matrices or colours,
 *  and each mesh's own replacement buffers. */
export interface InstancedShareState {
  owners: WeakMap<ArrayLike<number>, Owner>;
  /** per mesh: one matrix replacement per source instance buffer of the shared build (a build may read
   *  the matrices through several, e.g. three's InstanceNode and EsInstanceMatrixNode; the swapped list
   *  keeps their count and order, which the shared pipeline's vertex-buffer slots require) */
  own: WeakMap<THREE.InstancedMesh, { matrix: Map<THREE.InterleavedBuffer, THREE.InstancedInterleavedBuffer>; color?: THREE.InstancedBufferAttribute }>;
  /** a stable number per storage buffer (its builds are shared only with draws reading the same one) */
  storageIds: WeakMap<object, number>;
  storageCount: number;
}

export function createInstancedShareState(): InstancedShareState {
  return { owners: new WeakMap(), own: new WeakMap(), storageIds: new WeakMap(), storageCount: 0 };
}

/** Whether this object's builds can be shared (three's attribute instancing path). */
export function shareable(object: THREE.Object3D): object is THREE.InstancedMesh {
  const m = object as THREE.InstancedMesh & { isSkinnedMesh?: boolean };
  return m.isInstancedMesh === true && !m.isSkinnedMesh && !Array.isArray(m.morphTargetInfluences)
    && m.instanceMatrix?.isInstancedBufferAttribute === true;
}

const isStorage = (a: unknown): boolean => (a as { isStorageInstancedBufferAttribute?: boolean } | null)?.isStorageInstancedBufferAttribute === true;

/** The parts of an instanced mesh a node build depends on beyond the material and geometry:
 *  the usage of its instance buffers, and a storage buffer's identity (a build binds it). */
function instanceKey(m: THREE.InstancedMesh, state: InstancedShareState): string {
  const part = (a: THREE.BufferAttribute | null, tag: string): string => {
    if (!a) return "-";
    if (!isStorage(a)) return `${tag}${a.usage}`;
    let id = state.storageIds.get(a);
    if (id === undefined) state.storageIds.set(a, (id = ++state.storageCount));
    return `${tag}s${id}`;
  };
  return `inst:${part(m.instanceMatrix, "m")}:${part(m.instanceColor, "c")}:`;
}


/** A buffer whose version and update ranges are the source attribute's. */
function follow<T extends { version: number; updateRanges: unknown[] }>(target: T, source: THREE.BufferAttribute): T {
  Object.defineProperty(target, "version", { get: () => source.version, set: () => {}, configurable: true });
  Object.defineProperty(target, "updateRanges", { get: () => source.updateRanges, configurable: true });
  return target;
}

function ownState(state: InstancedShareState, mesh: THREE.InstancedMesh) {
  let own = state.own.get(mesh);
  if (!own) state.own.set(mesh, (own = { matrix: new Map() }));
  return own;
}

/** This mesh's replacement for one source instance buffer of the shared build. */
function ownMatrix(state: InstancedShareState, mesh: THREE.InstancedMesh, source: THREE.InterleavedBuffer): THREE.InstancedInterleavedBuffer {
  const own = ownState(state, mesh);
  let m = own.matrix.get(source);
  if (!m || m.array !== mesh.instanceMatrix.array) {
    m = follow(new THREE.InstancedInterleavedBuffer(mesh.instanceMatrix.array as Float32Array, source.stride, 1), mesh.instanceMatrix);
    m.setUsage(mesh.instanceMatrix.usage);
    own.matrix.set(source, m);
  }
  return m;
}

function ownColor(state: InstancedShareState, mesh: THREE.InstancedMesh): THREE.InstancedBufferAttribute | null {
  if (!mesh.instanceColor) return null;
  const own = ownState(state, mesh);
  if (!own.color || own.color.array !== mesh.instanceColor.array) {
    own.color = follow(new THREE.InstancedBufferAttribute(mesh.instanceColor.array as Float32Array, 3), mesh.instanceColor);
    own.color.setUsage(mesh.instanceColor.usage);
  }
  return own.color;
}

/**
 * Re-key one new render object and make its attribute list read its own mesh's
 * instance buffers. Returns false (untouched) for an object three must key itself.
 */
export function shareRenderObject(ro: RenderObjectLike, state: InstancedShareState): boolean {
  const mesh = ro.object;
  if (!shareable(mesh)) return false;
  // vertex-buffer instancing: each mesh's own buffers are swapped in below (storage ones are shared as they are)
  if (!isStorage(mesh.instanceMatrix)) state.owners.set(mesh.instanceMatrix.array, { mesh, kind: "matrix" });
  if (mesh.instanceColor && !isStorage(mesh.instanceColor)) state.owners.set(mesh.instanceColor.array, { mesh, kind: "color" });
  const materialKey = ro.getMaterialCacheKey; // unbound: it runs on the view below
  // three's key with a stand-in object that is not "instanced" (no uuid), plus the instance layout
  const standIn = {
    geometry: mesh.geometry, skeleton: undefined, isBatchedMesh: false, isInstancedMesh: false, count: 1,
    morphTargetInfluences: undefined, receiveShadow: mesh.receiveShadow,
  };
  ro.getMaterialCacheKey = function () {
    standIn.geometry = mesh.geometry; standIn.receiveShadow = mesh.receiveShadow;
    const view = Object.create(this) as RenderObjectLike;
    Object.defineProperty(view, "object", { value: standIn });
    return instanceKey(mesh, state) + String(materialKey.call(view));
  };
  ro.initialCacheKey = ro.getCacheKey();
  const attributes = ro.getAttributes.bind(ro);
  ro.getAttributes = function () {
    if (this.attributes !== null) return this.attributes;
    const list = attributes();
    let swapped = false;
    const out = list.map((a) => {
      const array = (a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute
        ? (a as THREE.InterleavedBufferAttribute).data.array : (a as THREE.BufferAttribute).array;
      const owner = state.owners.get(array);
      if (!owner || owner.mesh === mesh) return a;
      swapped = true;
      if (owner.kind === "matrix") {
        const ia = a as THREE.InterleavedBufferAttribute;
        const view = new THREE.InterleavedBufferAttribute(ownMatrix(state, mesh, ia.data), ia.itemSize, ia.offset, ia.normalized);
        return view;
      }
      return ownColor(state, mesh) ?? a;
    });
    if (swapped) {
      this.attributes = out;
      this.vertexBuffers = [...new Set(out.map((a) => ((a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute
        ? (a as THREE.InterleavedBufferAttribute).data : a)))];
    }
    return out;
  };
  return true;
}

/** Install on a renderer: every render object it creates from now on goes through shareRenderObject. */
export function shareInstancedBuilds(renderer: object): InstancedShareState {
  const objects = (renderer as { _objects: { createRenderObject: (...a: unknown[]) => RenderObjectLike } })._objects;
  const state = createInstancedShareState();
  const create = objects.createRenderObject.bind(objects);
  objects.createRenderObject = (...a: unknown[]) => {
    const ro = create(...a);
    shareRenderObject(ro, state);
    return ro;
  };
  return state;
}
