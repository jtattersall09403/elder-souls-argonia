import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useRapier } from "@react-three/rapier";
import type { RigidBody } from "@dimforge/rapier3d-compat";
import type { SettlementSolid } from "@elder-souls/game-core/settlement/types";

/** Imperative fixed-body diff for the package's nearby architecture solids. */
export function SettlementColliders({ solidsRef }: {
  solidsRef: React.MutableRefObject<SettlementSolid[]>;
}) {
  const { world, rapier } = useRapier();
  const bodies = useRef(new Map<string, RigidBody>());
  const revision = useRef("");
  useEffect(() => {
    const live = bodies.current;
    return () => { for (const body of live.values()) world.removeRigidBody(body); live.clear(); };
  }, [world]);
  useFrame(() => {
    const solids = solidsRef.current;
    const nextRevision = solids.map((s) => s.id).join("|");
    if (revision.current === nextRevision) return;
    revision.current = nextRevision;
    const wanted = new Set(solids.map((s) => s.id));
    for (const [id, body] of bodies.current) {
      if (!wanted.has(id)) { world.removeRigidBody(body); bodies.current.delete(id); }
    }
    for (const solid of solids) {
      if (bodies.current.has(solid.id)) continue;
      const half = solid.yaw / 2;
      const body = world.createRigidBody(rapier.RigidBodyDesc.fixed()
        .setTranslation(...solid.position)
        .setRotation({ x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) }));
      for (const part of solid.parts) {
        world.createCollider(rapier.ColliderDesc.cuboid(
          part.halfExtentsM[0] * solid.scale,
          part.halfExtentsM[1] * solid.scale,
          part.halfExtentsM[2] * solid.scale,
        ).setTranslation(
          part.offsetM[0] * solid.scale,
          part.offsetM[1] * solid.scale,
          part.offsetM[2] * solid.scale,
        ), body);
      }
      bodies.current.set(solid.id, body);
    }
  });
  return null;
}
