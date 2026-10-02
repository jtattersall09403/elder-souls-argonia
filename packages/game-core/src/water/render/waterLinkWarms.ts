import type * as THREE from "three";
import type { LinkWarm } from "../../render/drawTargetLinker";

interface Variants { above: THREE.Material; below: THREE.Material }

/**
 * What the water links at mount, each the real mesh in every material it
 * swaps to and against the target that draw binds (WaterPipeline): above
 * water the surface layer draws in pass 3 to the SCREEN (tone-mapped); under
 * water the `below` variants and the falls draw in pass 1 into the linear
 * half-float scene TARGET, and the bubbles into the bubble pass's half-float
 * target with their own scene. The underwater set linked on the first dive
 * (16k walk 10: es-water-below-high-field-ftex, strip-ftex and the bubble
 * material in one 30 ms burst) because the earlier warm compiled only
 * the `above` material, into the scene pass's target.
 *
 * `held`: the falls, chute strips and pools, which can draw on the first
 * frame and so stay hidden until linked (DrawTargetLinker `holdUntilLinked`;
 * perf10 diag 6 C3). `observed`: the field's variants and the bubbles, whose
 * linked variant first draws later (DrawTargetLinker `linkWhenObserved`).
 * Every warm names its pass, so its key matches its draw.
 */
export function waterLinkWarms(parts: {
  field: THREE.Mesh | null;
  fieldMaterials: Variants;
  strips: { mesh: THREE.Mesh; materials: Variants } | null;
  pools: { mesh: THREE.Mesh; materials: Variants } | null;
  falls: THREE.Object3D | null;
  bubbles: { object3d: THREE.Object3D; scene: THREE.Scene } | null;
}): { held: LinkWarm[]; observed: LinkWarm[] } {
  const held: LinkWarm[] = [];
  const observed: LinkWarm[] = [];
  const surface = (warms: LinkWarm[], mesh: THREE.Mesh | null, materials: Variants) => {
    if (!mesh) return;
    warms.push({ object: mesh, materials: [materials.above], pass: "screen" });
    warms.push({ object: mesh, materials: [materials.below], pass: "target" });
  };
  surface(observed, parts.field, parts.fieldMaterials);
  if (parts.strips) surface(held, parts.strips.mesh, parts.strips.materials);
  if (parts.pools) surface(held, parts.pools.mesh, parts.pools.materials);
  if (parts.falls) held.push({ object: parts.falls, pass: "screen" }, { object: parts.falls, pass: "target" });
  if (parts.bubbles) observed.push({ object: parts.bubbles.object3d, pass: "target", scene: parts.bubbles.scene });
  return { held, observed };
}
