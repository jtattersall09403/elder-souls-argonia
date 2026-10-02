import * as THREE from "three";

/**
 * Draw a transparent double-sided material in one pass. Without
 * `forceSinglePass`, three's renderObject splits each such draw into a back
 * and a front pass and sets `needsUpdate` twice per draw, so the material's
 * program parameters are re-derived (getParameters, `get alphaTest`) every
 * draw of every frame (perf10 diag10 C3a). The single pass draws both faces
 * in index order: right for additive or depth-write-off surfaces, a minor
 * ordering trade for the rest. Returns whether the material changed.
 */
export function ensureSinglePass(material: THREE.Material): boolean {
  if (!material.transparent || material.side !== THREE.DoubleSide || material.forceSinglePass) return false;
  material.forceSinglePass = true;
  return true;
}
