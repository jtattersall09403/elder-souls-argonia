import type { NodeMaterial } from "three/webgpu";
import * as tsl from "three/tsl";
import { claimFeature, type TslNode } from "../../render/nodes/materialNodes";
import { addReceiverCaustics, type GroundWetnessUniforms } from "./groundWetness";

// Loosely typed on purpose (docs/standards/tsl-shaders.md §1).
const { float, normalWorld, positionWorld, reference } = tsl as TslNode;

/** A vertical scale as a node: a number is a constant, a `{ value }` holder is
 * read every frame (reference), a node is used as is. */
function scaleNode(verticalScale: TslNode | number | { value: number }): TslNode {
  if (typeof verticalScale === "number") return float(verticalScale);
  if ((verticalScale as TslNode).isNode) return verticalScale;
  return reference("value", "float", verticalScale);
}

/** Opt-in for physical submerged props/hulls. Shares the terrain's injected
 * water/light state, but owns no world singleton or material lifecycle. Adds
 * caustics only to shadowed direct diffuse light (lighting finish), and works
 * with skinning, instancing and batched meshes (positionWorld includes them).
 * Idempotent. */
export function applyCausticReceiver(material: NodeMaterial, uniforms: GroundWetnessUniforms,
  verticalScale: TslNode | number | { value: number } = 1): void {
  if (!claimFeature(material, "water-caustic-receiver")) return;
  addReceiverCaustics(material, uniforms, {
    worldPosition: positionWorld, worldNormal: normalWorld, verticalScale: scaleNode(verticalScale),
  });
}

/** @deprecated name kept for callers; same as applyCausticReceiver. */
export const applySubmergedCaustics = applyCausticReceiver;
