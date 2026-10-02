import type * as THREE from "three";

/**
 * Enable every light under `root` on every layer.
 *
 * three collects, per render() call, only the lights whose layers intersect
 * the camera's mask, and bumps its lights-state version whenever that set
 * changes shape. The water pipeline renders the scene once per layer pass
 * (scene, water, precip, overlay, bloom source), so a light missing from one
 * pass bumped the version twice a frame, and every lit material re-derived
 * its program parameters each frame (16k walk 10, perf10: ~25-30 % of the
 * main thread). With every light on every layer, each pass sees one light
 * set. Lights do nothing else with their layers, and the materials of the
 * unlit passes ignore lights, so no pixel changes.
 */
export function lightEveryLayer(root: THREE.Object3D): void {
  root.traverse((o) => {
    if ((o as THREE.Light).isLight) o.layers.enableAll();
  });
}
