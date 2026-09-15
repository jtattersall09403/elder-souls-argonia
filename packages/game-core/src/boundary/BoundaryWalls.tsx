import { useEffect } from "react";
import { useRapier } from "@react-three/rapier";
import type { RigidBody } from "@dimforge/rapier3d-compat";
import { PROVINCE_BOUNDARY } from "@elder-souls/contracts";
import { boundaryWallBoxes } from "./walls";

/**
 * Four invisible fixed cuboids closing the square of built ground (16d).
 *
 * Imperative bodies (the settlement-collider template): they are static for
 * the life of the world, so they cost one creation and nothing per frame.
 * Heights are true metres scaled by the display scale, exactly as the terrain
 * colliders are, or the wall would stand in the wrong place vertically.
 */
export function BoundaryWalls({ extentM = PROVINCE_BOUNDARY.extentM, verticalScale = 1 }: {
  /** The chunk manifest's `terrainSupportExtentM` when it is loaded. */
  extentM?: number;
  verticalScale?: number;
}) {
  const { world, rapier } = useRapier();
  useEffect(() => {
    const bodies: RigidBody[] = [];
    for (const box of boundaryWallBoxes(extentM)) {
      const body = world.createRigidBody(rapier.RigidBodyDesc.fixed()
        .setTranslation(box.centre[0], box.centre[1] * verticalScale, box.centre[2]));
      world.createCollider(
        rapier.ColliderDesc.cuboid(box.halfExtents[0], box.halfExtents[1] * verticalScale, box.halfExtents[2]),
        body,
      );
      bodies.push(body);
    }
    return () => { for (const body of bodies) world.removeRigidBody(body); };
  }, [world, rapier, extentM, verticalScale]);
  return null;
}
