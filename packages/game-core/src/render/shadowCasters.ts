import * as THREE from "three";

/**
 * Shadow caster layers (webgpu10 diag20 E5). three's shadow pass renders the
 * WHOLE scene from each cascade camera and drops non-casters only after
 * projecting and sorting them (ShadowNode.js getShadowRenderObjectFunction),
 * once per cascade. The sun's cascade cameras therefore see only the caster
 * layers: `SHADOW_CASTER_LAYER` (every cascade) and one bit per cascade
 * (`CASCADE_LAYER_BASE + i`) for casters that reach only some cascades.
 *
 * Every caster is set through `setCastShadow` / `setCastShadowCascades`, so
 * the flag and the layer cannot disagree; a bare `castShadow = true` under a
 * caster-layer sun casts nothing (`castersMissingLayer` names it).
 */
export const SHADOW_CASTER_LAYER = 30;
/** Cascade i's own layer; four cascades at most (layers 26..29). */
export const CASCADE_LAYER_BASE = 26;
export const MAX_CASCADE_LAYERS = 4;

const CASCADE_BITS = ((1 << MAX_CASCADE_LAYERS) - 1) << CASCADE_LAYER_BASE;
const CASTER_BITS = CASCADE_BITS | (1 << SHADOW_CASTER_LAYER);

/** Cast into every cascade (on) or none (off): flag and layer together. */
export function setCastShadow(obj: THREE.Object3D, on: boolean): void {
  obj.castShadow = on;
  obj.layers.mask &= ~CASTER_BITS;
  if (on) obj.layers.mask |= 1 << SHADOW_CASTER_LAYER;
}

/** Cast into the cascades whose bits are set in `cascades` (bit i: cascade
 * i); 0 casts nothing. */
export function setCastShadowCascades(obj: THREE.Object3D, cascades: number): void {
  obj.castShadow = cascades !== 0;
  obj.layers.mask = (obj.layers.mask & ~CASTER_BITS)
    | ((cascades & ((1 << MAX_CASCADE_LAYERS) - 1)) << CASCADE_LAYER_BASE);
}

/** Set every caster in a subtree (a loaded model's meshes). */
export function setCastShadowDeep(root: THREE.Object3D, on: boolean): void {
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) setCastShadow(o, on); });
}

/** A shadow camera that sees only the caster layer, plus cascade `index`'s
 * own bit when given. Re-applied each frame by the sky (a cascade camera is
 * cloned from the sun's at the cascade node's first render). */
export function aimShadowCameraAtCasters(camera: THREE.Camera, index = -1): void {
  camera.layers.mask = (1 << SHADOW_CASTER_LAYER)
    | (index >= 0 && index < MAX_CASCADE_LAYERS ? 1 << (CASCADE_LAYER_BASE + index) : 0);
}

/** One castShadow object no caster layer carries: its name, the nearest
 * named ancestor (the layer or model that owns it) and its kind (three type
 * plus its `es*` userData flags, e.g. `Mesh esSettlementBatch`). */
export interface CasterMissingLayer { name: string; owner: string; kind: string }

/** DEV (studio debug handle, gpu-lane dev hooks): every object flagged
 * castShadow that no caster layer carries (expect none). */
export function castersMissingLayer(root: THREE.Object3D): CasterMissingLayer[] {
  const out: CasterMissingLayer[] = [];
  root.traverse((o) => {
    if (!o.castShadow || (o as THREE.Light).isLight || (o.layers.mask & CASTER_BITS) !== 0) return;
    let owner = o.parent;
    while (owner && !owner.name) owner = owner.parent;
    const flags = Object.keys(o.userData).filter((k) => k.startsWith("es") && o.userData[k]);
    out.push({ name: o.name || "<unnamed>", owner: owner?.name ?? "<scene>", kind: [o.type, ...flags].join(" ") });
  });
  return out;
}

const STABLE_ALPHA_TEST = Symbol("esStableAlphaTest");

/** Make a shadow-pass material's `alphaTest` a plain value (webgpu10 c9 H1).
 * three's Renderer.renderObject copies each caster's alphaTest onto the
 * light's ONE shared shadow-pass material; the stock setter bumps `version`
 * whenever the value crosses 0, so alternating cutout and solid casters
 * re-keyed every shadow render object every frame (getMaterialCacheKey,
 * ~46 MB/s garbage). Storing without the bump is correct: each render object
 * belongs to one caster whose alphaTest is fixed, its pipeline key and its
 * `alphaTest > 0` discard branch are built from that caster's value, and the
 * alpha-test uniform reads the current value at draw time. Idempotent. */
export function stabiliseShadowAlphaTest(material: THREE.Material): void {
  const m = material as THREE.Material & { [STABLE_ALPHA_TEST]?: true };
  if (m[STABLE_ALPHA_TEST]) return;
  let value = m.alphaTest;
  Object.defineProperty(m, "alphaTest", {
    configurable: true,
    enumerable: true,
    get: () => value,
    set: (v: number) => { value = v; },
  });
  m[STABLE_ALPHA_TEST] = true;
}

/** Every shadow-pass material three sets as `scene.overrideMaterial` (one
 * per light, made at its first shadow render, before any caster draws) gets
 * `stabiliseShadowAlphaTest`. Per-scene accessor, no module state. */
export function stabiliseShadowPassMaterials(scene: THREE.Scene): void {
  const s = scene as THREE.Scene & { [STABLE_ALPHA_TEST]?: true };
  if (s[STABLE_ALPHA_TEST]) return;
  let current = scene.overrideMaterial;
  Object.defineProperty(scene, "overrideMaterial", {
    configurable: true,
    enumerable: true,
    get: () => current,
    set: (mat: THREE.Material | null) => {
      if (mat && (mat as { isShadowPassMaterial?: boolean }).isShadowPassMaterial) stabiliseShadowAlphaTest(mat);
      current = mat;
    },
  });
  s[STABLE_ALPHA_TEST] = true;
}
