/**
 * Cylindrical billboarding for baked card quads — the third node feature in
 * the same family as `windSway.ts` and `lodFade.ts`, and deliberately the
 * same shape (a function wrapping `positionNode`; decision 0111).
 *
 * What it is for: the ground-cover ring's mid and far tiers draw a species as
 * a single baked card instead of its full mesh. A card is only convincing
 * while it faces the viewer, and a card placed with the instance's own yaw
 * faces wherever the scatter happened to point it — edge-on half the time,
 * which reads as plants winking out. Rotating the quad on the CPU would mean
 * rewriting every instance matrix every frame (the whole cost the card tier
 * exists to avoid), so the rotation is done in the vertex shader.
 *
 * CYLINDRICAL, not spherical: the card turns about its own Y axis only, so it
 * stays rooted and upright. Grass seen from above should foreshorten like
 * grass, not tip over to face the camera.
 *
 * The view position is `esLodViewPos`, the SAME uniform `lodFade.ts` owns —
 * one camera position for the whole vegetation stack, and in the shadow pass
 * it is still the camera rather than the light (a card that turned to face the
 * sun would cast a shadow of a different shape than the one on screen).
 * The two features share the one `uniform()` node, so install order no
 * longer matters for declarations.
 */

import type { NodeMaterial } from "three/webgpu";
import * as tsl from "three/tsl";
import type { LodFadeUniforms } from "./lodFade";
import { instanceMatrixNode, matrixColumn, whenInstanced } from "./instanceNodes";
import {
  claimFeature, sel, wrapPosition, wrapShadowPosition, type TslNode,
} from "../render/nodes/materialNodes";

// TSL chains are typed loosely on purpose (tsl-shaders.md §1).
const { dot, length, mat3, max, sqrt, transpose, vec2, vec3 } =
  tsl as unknown as Record<string, TslNode>;

/**
 * The world-space right vector of a cylindrical billboard, for a horizontal
 * view direction (pivot → viewer) of (`vx`, `vz`).
 *
 * `right = normalize(cross(up, viewDir))` with `up = (0,1,0)`, which reduces
 * to `(vz, -vx)` normalised. A viewer directly above the card leaves the
 * direction degenerate; the card then keeps its world +X axis, which is what
 * the GLSL below does too. Pure, so the arithmetic is testable without a GPU.
 */
export function billboardRightVector(vx: number, vz: number): [number, number] {
  const length = Math.hypot(vx, vz);
  if (!(length > 1e-6)) return [1, 0];
  return [vz / length, -vx / length];
}

/**
 * The node form: `p` is the object-space vertex (three applies the instance
 * matrix AFTER `positionNode`, as it did after `begin_vertex`). The quad is
 * rebuilt in WORLD space around its pivot — width along the view-facing right
 * vector, height straight up — so the instance's own yaw is ignored, then
 * brought back to object space (basisᵀ/s², the basis being rotation ×
 * uniform scale) for the instance matrix to place. Only on an InstancedMesh
 * (the old USE_INSTANCING).
 */
function billboardNode(uniforms: LodFadeUniforms, p: TslNode): TslNode {
  return whenInstanced(() => {
    const m = instanceMatrixNode();
    const c0 = matrixColumn(m, 0);
    const basis = mat3(c0, matrixColumn(m, 1), matrixColumn(m, 2));
    const origin = matrixColumn(m, 3);
    // Uniform instance scale, so any basis column's length is s.
    const scaleSq = max(dot(c0, c0), 1e-6);
    const scale = sqrt(scaleSq);
    const v = uniforms.esLodViewPos.xz.sub(origin.xz);
    const len = length(v);
    const right2 = sel(len.greaterThan(1e-6), vec2(v.y, v.x.negate()).div(max(len, 1e-6)), vec2(1, 0));
    const right = vec3(right2.x, 0, right2.y);
    // Forward completes the frame; a planar card has z ~ 0.
    const fwd = vec3(right2.y.negate(), 0, right2.x);
    const world = right.mul(p.x.mul(scale))
      .add(vec3(0, p.y.mul(scale), 0))
      .add(fwd.mul(p.z.mul(scale)));
    return transpose(basis).mul(world).div(scaleSq);
  }, () => p, "vec3");
}

/** Patch one card material to face the viewer. Safe to call repeatedly. */
export function applyCylindricalBillboard(
  material: NodeMaterial,
  uniforms: LodFadeUniforms,
): void {
  if (!claimFeature(material, "billboard")) return;
  wrapPosition(material, (p) => billboardNode(uniforms, p));
  if (material.castShadowPositionNode) {
    wrapShadowPosition(material, (p) => billboardNode(uniforms, p));
  }
}
