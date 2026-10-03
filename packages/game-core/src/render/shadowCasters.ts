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

/** userData flag on a subtree whose casters cast for its own light, whose
 * shadow camera is not layer-aimed (an interior cell's sun: interiorLoader). */
export const CELL_SHADOW_OWNER = "esCellShadowOwner";

function cellOwned(o: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p.userData[CELL_SHADOW_OWNER]) return true;
  return false;
}

/** DEV (studio debug handle, gpu-lane dev hooks): every mesh flagged
 * castShadow that no caster layer carries (expect none). A non-mesh draws
 * nothing in a shadow pass, and a cell-owned mesh (`CELL_SHADOW_OWNER`)
 * casts for its cell's light, so neither is listed (vol10 c8 C). */
export function castersMissingLayer(root: THREE.Object3D): CasterMissingLayer[] {
  const out: CasterMissingLayer[] = [];
  root.traverse((o) => {
    if (!o.castShadow || !(o as THREE.Mesh).isMesh || (o.layers.mask & CASTER_BITS) !== 0 || cellOwned(o)) return;
    let owner = o.parent;
    while (owner && !owner.name) owner = owner.parent;
    const flags = Object.keys(o.userData).filter((k) => k.startsWith("es") && o.userData[k]);
    out.push({ name: o.name || "<unnamed>", owner: owner?.name ?? "<scene>", kind: [o.type, ...flags].join(" ") });
  });
  return out;
}
