import type * as THREE from "three";

/**
 * Switching a light or its shadow without re-keying the node renderer
 * (engineering standard, performance checklist: "a light's castShadow,
 * visible and the light count are pipeline cache keys").
 *
 * three's LightsNode hashes every light's castShadow and the set of visible
 * lights into each lit render object's cache key, so flipping either after the
 * first frame re-creates every lit render object and rebuilds its program
 * (walk 10: the world vanished and refilled over minutes on WebGPU each time
 * a cloud flipped the sun's shadow). Off is intensity 0, and for a shadow
 * shadow.intensity 0 with its map updates stopped; both are uniforms.
 */

/** userData flag a host sets on a light it holds dark (the cell hides the exterior's lights). */
export const LIGHT_HELD_OFF = "esHeldOff";

/** True when a host holds `light` dark: whoever drives its intensity writes 0. */
export function lightHeldOff(light: THREE.Object3D): boolean {
  return light.userData[LIGHT_HELD_OFF] === true;
}

/** A light that may carry a shadow (three types `shadow` only on the shadow-casting subclasses). */
export type MaybeShadowLight = THREE.Light & { shadow?: THREE.LightShadow };

interface ShadowWithCascades { shadowNode?: { lights?: Array<{ shadow?: THREE.LightShadow }> } }

/**
 * Show or hide `light`'s shadow with `castShadow` left as it is: the shadow's
 * strength goes to 0 and its map stops re-rendering (CSMShadowNode's cascade
 * lights carry cloned shadows, so they are switched too).
 */
export function setShadowShown(light: MaybeShadowLight, shown: boolean): void {
  const shadow = light.shadow;
  if (!shadow) return;
  const set = (s: THREE.LightShadow) => { s.intensity = shown ? 1 : 0; s.autoUpdate = shown; };
  set(shadow);
  for (const l of (shadow as unknown as ShadowWithCascades).shadowNode?.lights ?? []) if (l.shadow) set(l.shadow);
}

/**
 * Far-cascade update rota (quality `shadowCascadeRota`): cascade i re-renders
 * its map every `rota[i]` frames (1 or absent: every frame), staggered so two
 * slow cascades do not land on the same frame. Run after `setShadowShown`
 * each frame; a hidden shadow (intensity 0) stays fully stopped. A skipped
 * cascade keeps its map AND its shadow matrix (three writes the matrix only
 * when it renders the map, ShadowNode.updateShadow), so a stale far map is
 * sampled where it was drawn: at most rota-1 frames late, never misplaced.
 * castShadow is never touched (it is a pipeline cache key).
 */
export function applyCascadeRota(light: MaybeShadowLight, frame: number, rota: readonly number[]): void {
  const cascades = (light.shadow as unknown as ShadowWithCascades | undefined)?.shadowNode?.lights ?? [];
  cascades.forEach((l, i) => {
    const s = l.shadow;
    const period = Math.max(1, Math.round(rota[i] ?? 1));
    if (!s || s.intensity === 0 || period === 1) return;
    s.autoUpdate = false;
    if (frame % period === i % period) s.needsUpdate = true;
  });
}
