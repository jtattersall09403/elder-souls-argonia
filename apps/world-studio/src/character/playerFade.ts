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
 * whose compile step is synchronous). Returns how many materials it warmed
 * and a promise that settles when every compile it ran has (the caller holds
 * the player hidden until then before its first show; perf10 diag 6 C3).
 */
export function warmPlayerFadePrograms(group: THREE.Object3D,
  compile: (object: THREE.Object3D) => unknown): { warmed: number; linked: Promise<unknown> } {
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
  if (!fresh.length) return { warmed: 0, linked: Promise.resolve() };
  const links: unknown[] = [];
  for (let pass = 0; pass < 2; pass++) {
    for (const material of fresh) { material.transparent = !material.transparent; material.needsUpdate = true; }
    links.push(compile(group));
  }
  return { warmed: fresh.length, linked: Promise.allSettled(links) };
}

/**
 * Keep the player group hidden until its fade programs have linked, then
 * show it once (perf10 diag 6 C3: the warm ran after the player's first draw,
 * so the draw linked every player material synchronously). Call every frame
 * before `fadePlayerModel`; `observed` is the linker's "scene pass seen"
 * (the warm's key needs the pass's target). Waits for the model's first mesh.
 * The link is bounded by DrawTargetLinker's settle timeout, so the player
 * always appears. Returns whether the group has been shown.
 */
export function gatePlayerFirstShow(group: THREE.Object3D, observed: boolean,
  compile: (object: THREE.Object3D) => unknown): boolean {
  const state = group.userData.esPlayerShow as "linking" | "shown" | undefined;
  if (state === "shown") return true;
  group.visible = false;
  if (state === "linking" || !observed) return false;
  let hasMesh = false;
  group.traverse((object) => { if ((object as THREE.Mesh).isMesh) hasMesh = true; });
  if (!hasMesh) return false;
  group.userData.esPlayerShow = "linking";
  void warmPlayerFadePrograms(group, compile).linked.then(() => {
    group.userData.esPlayerShow = "shown";
    group.visible = true;
    delete group.userData.esPlayerFade; // fadePlayerModel re-applies the arm's opacity
  });
  return false;
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
