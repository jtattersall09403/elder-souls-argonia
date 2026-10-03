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
  });
  return false;
}

/**
 * Fade the player model when the camera is about to enter the body (16h
 * check-in 2 item 3; Skyrim's blend-out; vol10 diag6 C1 keyed it on the
 * camera's distance to the body capsule). Works on the wrapper group only:
 * `visible` on the group, material opacity on its meshes, each material's
 * own values kept in userData and restored at full opacity. Per-mesh
 * `visible` stays the armour and first-person systems' (actors/meshVisibility.ts).
 * Every material is checked every call (vol10 diag6 C2: a group-level
 * early return skipped armour swapped in mid-fade, which stayed opaque while
 * the body faded): a material already at this opacity costs one comparison,
 * one swapped in takes the current opacity at once. Allocation-free.
 */
export function fadePlayerModel(group: THREE.Group, opacity: number): void {
  const visible = opacity > 0;
  if (group.visible !== visible) group.visible = visible;
  fadeTree(group, opacity);
}

function fadeTree(object: THREE.Object3D, opacity: number): void {
  const mesh = object as THREE.Mesh;
  if (mesh.isMesh) {
    const material = mesh.material;
    if (Array.isArray(material)) for (let i = 0; i < material.length; i++) fadeMaterial(material[i], opacity);
    else fadeMaterial(material, opacity);
  }
  const children = object.children;
  for (let i = 0; i < children.length; i++) fadeTree(children[i], opacity);
}

function fadeMaterial(material: THREE.Material, opacity: number): void {
  const data = material.userData;
  const at = data.esPlayerFadeAt as number | undefined;
  if (at === opacity || (at === undefined && opacity >= 1)) return;
  // The material's own values, taken the first time it fades (at that
  // moment it is still drawn as authored) and restored at full opacity.
  const base = (data.esPlayerFadeBase ??= {
    transparent: material.transparent, opacity: material.opacity, depthWrite: material.depthWrite,
  }) as FadeBase;
  data.esPlayerFadeAt = opacity;
  const transparent = opacity < 1 || base.transparent;
  // `transparent` is compiled into the program (three's OPAQUE define
  // forces alpha to 1), so a change needs a recompile to fade at all.
  if (material.transparent !== transparent) {
    material.transparent = transparent;
    material.needsUpdate = true;
  }
  material.opacity = base.opacity * opacity;
  // No depth write while part-faded (diag7 O12: a fading head or shield that
  // wrote depth hid the body behind it and read detached); the material's own
  // value comes back at full opacity.
  material.depthWrite = opacity > 0 && opacity < 1 ? false : base.depthWrite;
}
