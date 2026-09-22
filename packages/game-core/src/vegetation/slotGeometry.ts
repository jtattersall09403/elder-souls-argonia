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
 * only the named attributes are owned.
 */
export function makeSlotGeometry(
  source: THREE.BufferGeometry,
  ownedAttrs: Record<string, THREE.BufferAttribute | THREE.InstancedBufferAttribute>,
): THREE.BufferGeometry {
  const view = new THREE.BufferGeometry();
  for (const name of Object.keys(source.attributes)) {
    // An owned name is never taken from the source: that is the whole point.
    if (name in ownedAttrs) continue;
    view.setAttribute(name, source.attributes[name]);
  }
  if (source.index) view.setIndex(source.index);
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
 * Free a view's OWNED buffers and nothing else.
 *
 * Three keys GL buffers by the attribute object, and `WebGLGeometries`'
 * dispose handler deletes the buffer of every attribute (and the index) the
 * disposed geometry still references, without fixing up the other geometries
 * that share them. So every attribute that belongs to the source is dropped
 * from the view FIRST; what is left when `dispose()` fires is the owned set
 * alone, which no other mesh can see.
 */
export function disposeSlotGeometry(
  geometry: THREE.BufferGeometry,
  source: THREE.BufferGeometry,
): void {
  for (const name of Object.keys(geometry.attributes)) {
    if (geometry.attributes[name] === source.attributes[name]) {
      geometry.deleteAttribute(name);
    }
  }
  if (geometry.index && geometry.index === source.index) geometry.setIndex(null);
  geometry.dispose();
}
