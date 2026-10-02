import type * as THREE from "three";

/**
 * Run `prepare(object, material)` before every draw of `scene` (perf10 f3).
 *
 * Wraps the renderer's `renderBufferDirect`, which three calls for every draw
 * after the object's `onBeforeRender` and BEFORE it picks the material's
 * program, so a material patched in `prepare` (CSM, fixture light) compiles
 * patched at its very first draw. This replaces a per-frame walk of the whole
 * scene: the cost is one call per draw, and only new materials do any work.
 * Draws of other scenes (shadow depth passes pass `null`) are not touched.
 * Returns the uninstall.
 */
export function installDrawPatcher(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Object3D,
  prepare: (object: THREE.Object3D, material: THREE.Material) => void,
): () => void {
  const original = renderer.renderBufferDirect;
  const wrapped: THREE.WebGLRenderer["renderBufferDirect"] = (camera, drawn, geometry, material, object, group) => {
    if (drawn === scene) prepare(object, material);
    original.call(renderer, camera, drawn, geometry, material, object, group);
  };
  renderer.renderBufferDirect = wrapped;
  return () => {
    if (renderer.renderBufferDirect === wrapped) renderer.renderBufferDirect = original;
  };
}
