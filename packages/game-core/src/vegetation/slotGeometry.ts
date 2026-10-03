import * as THREE from "three";

/**
 * A SHALLOW view of a kit geometry: the source's vertex buffers and index by
 * REFERENCE, plus this view's own per-instance attributes.
 *
 * One kit geometry is drawn by many meshes at once (one per batch key, one
 * per quadrant/tier slot), and an instanced attribute lives on the geometry,
 * not on the mesh — so a shared attribute would let the last writer re-band
 * or re-slot every other mesh. `clone()` would copy every vertex instead and
 * upload the kit again per mesh. A view is the middle: nothing is copied,
 * only the named attributes are owned. Disposing a view frees its owned
 * attributes; the shared ones are marked `KIT_SHARED` and survive.
 */
export function makeSlotGeometry(
  source: THREE.BufferGeometry,
  ownedAttrs: Record<string, THREE.BufferAttribute | THREE.InstancedBufferAttribute>,
): THREE.BufferGeometry {
  const view = new THREE.BufferGeometry();
  for (const name of Object.keys(source.attributes)) {
    // An owned name is never taken from the source: that is the whole point.
    if (name in ownedAttrs) continue;
    markKitShared(source.attributes[name]);
    view.setAttribute(name, source.attributes[name]);
  }
  if (source.index) {
    markKitShared(source.index);
    view.setIndex(source.index);
  }
  for (const group of source.groups) {
    view.addGroup(group.start, group.count, group.materialIndex);
  }
  for (const [name, attribute] of Object.entries(ownedAttrs)) {
    view.setAttribute(name, attribute);
  }
  // Bounds are a property of the shared vertices, so they come from the
  // source rather than being recomputed per view.
  if (!source.boundingSphere) source.computeBoundingSphere();
  if (!source.boundingBox) source.computeBoundingBox();
  view.boundingSphere = source.boundingSphere ? source.boundingSphere.clone() : null;
  view.boundingBox = source.boundingBox ? source.boundingBox.clone() : null;
  return view;
}

/**
 * The mark a kit's SHARED buffers carry (every source attribute and index a
 * view references). The renderer's attribute store refuses to delete a
 * marked buffer (`guardSharedBuffers`, render/gpuCull/GpuCullPool.ts):
 * three r184's geometry dispose handler (Geometries.js onDispose) deletes
 * every attribute in the render object's CACHED attribute list
 * (RenderObject.getAttributes, built at first render), not the geometry's
 * current ones, so disposing one view would otherwise destroy the kit
 * buffers every other view still draws ("used in submit while destroyed",
 * a whole render context dropped per frame; webgpu10 diag19 D1). Swapping
 * attributes on the view before dispose protects nothing. Kit geometries
 * live for the session; a caller that ever frees one deletes this key from
 * its buffers first.
 */
export const KIT_SHARED = "esKitShared";

function markKitShared(buffer: object): void {
  (buffer as Record<string, unknown>)[KIT_SHARED] = true;
}

/** True for a buffer `makeSlotGeometry` took from a kit by reference. */
export function isKitShared(buffer: object): boolean {
  return (buffer as Record<string, unknown>)[KIT_SHARED] === true;
}

/**
 * Replace a PAGE buffer a released GPU-cull member still names (`esSlot`, a
 * payload) by an empty stand-in of the same item size, so the detached mesh
 * never draws from a page buffer its page may free (`releasePage`). The name
 * stays present because the material's nodes read it. This does not stop a
 * later dispose from deleting the page buffer (the cached attribute list
 * still names it); the store guard does that.
 */
export function detachSharedAttribute(geometry: THREE.BufferGeometry, name: string): void {
  const shared = geometry.attributes[name];
  geometry.setAttribute(name, new THREE.BufferAttribute(new Float32Array(shared.itemSize), shared.itemSize));
}
