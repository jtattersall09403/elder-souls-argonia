import * as THREE from "three";

interface FadeBase { transparent: boolean; opacity: number; depthWrite: boolean }

/**
 * Link both programs a fade toggles between (opaque and transparent) before
 * the first fade. A fade flips `transparent`, which changes the program key:
 * without this the first short camera arm linked every player material in
 * one frame (16k walk 10: 41-57 ms, mostly in the GPU process). three keeps
 * every program a material has used (its per-material program map), so the
 * warm flips each new material's `transparent`, compiles, flips it back and
 * compiles again: the same state change a fade makes, with the material's own
 * hooks (CSM, skin tint) run in the same order, ending on its drawn state.
 * `compile` must compile synchronously (`gl.compile`, or `compileAsync`,
 * whose compile step is synchronous). Returns how many materials it warmed.
 */
export function warmPlayerFadePrograms(group: THREE.Object3D, compile: (object: THREE.Object3D) => void): number {
  const fresh: THREE.Material[] = [];
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) if (!material.userData.esPlayerFadeWarm) {
      material.userData.esPlayerFadeWarm = true;
      fresh.push(material);
    }
  });
  if (!fresh.length) return 0;
  for (let pass = 0; pass < 2; pass++) {
    for (const material of fresh) { material.transparent = !material.transparent; material.needsUpdate = true; }
    compile(group);
  }
  return fresh.length;
}

/**
 * Fade the player model when the follow camera's arm is short (16h check-in
 * 2 item 3; Skyrim's blend-out). Works on the wrapper group only: `visible`
 * on the group, material opacity on its meshes, each material's own values
 * kept in userData and restored at full opacity. Per-mesh `visible` stays
 * the armour and first-person systems' (actors/meshVisibility.ts).
 * Idempotent: a repeated opacity costs one comparison.
 */
export function fadePlayerModel(group: THREE.Group, opacity: number): void {
  const last = group.userData.esPlayerFade as number | undefined;
  if (last === opacity || (last === undefined && opacity >= 1)) return;
  group.userData.esPlayerFade = opacity;
  group.visible = opacity > 0;
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      const base = (material.userData.esPlayerFadeBase ??= {
        transparent: material.transparent, opacity: material.opacity, depthWrite: material.depthWrite,
      }) as FadeBase;
      const fading = opacity < 1;
      const transparent = fading || base.transparent;
      // `transparent` is compiled into the program (three's OPAQUE define
      // forces alpha to 1), so a change needs a recompile to fade at all.
      if (material.transparent !== transparent) {
        material.transparent = transparent;
        material.needsUpdate = true;
      }
      material.opacity = base.opacity * opacity;
      // Keep writing depth: the body hides its own far side, not a ghost.
      material.depthWrite = base.depthWrite;
    }
  });
}
