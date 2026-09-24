import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useRapier } from "@react-three/rapier";
import type { RigidBody } from "@dimforge/rapier3d-compat";
import type {
  SettlementCollisionShape, SettlementSolid,
} from "@elder-souls/game-core/settlement/types";
import { bodySetAlive, captureBodySet } from "@elder-souls/game-core/physics/rapierWorldAlive";
import { useFrameWork } from "@elder-souls/game-core/scheduling/frameWorkContext";
import type { FrameJobHandle } from "@elder-souls/game-core/scheduling/frameWork";

/**
 * One collider of a placed piece.
 *
 * A mesh piece collides as its own triangles (0071 §5, 16h item 4): those
 * vertices already carry the part transform and the placement scale, so only
 * the measured box proxies are scaled here. The body carries the position and
 * the drawn rotation.
 */
export function settlementColliderDesc<D>(
  rapier: { ColliderDesc: {
    trimesh: (v: Float32Array, i: Uint32Array) => D;
    cuboid: (x: number, y: number, z: number) => { setTranslation: (x: number, y: number, z: number) => D };
  } },
  part: SettlementCollisionShape,
  scale: number,
): D {
  if (part.kind === "trimesh") return rapier.ColliderDesc.trimesh(part.vertices, part.indices);
  return rapier.ColliderDesc.cuboid(
    part.halfExtentsM[0] * scale, part.halfExtentsM[1] * scale, part.halfExtentsM[2] * scale,
  ).setTranslation(part.offsetM[0] * scale, part.offsetM[1] * scale, part.offsetM[2] * scale);
}

/** Imperative fixed-body diff for the package's nearby architecture solids. */
export function SettlementColliders({ solidsRef, focusRef }: {
  solidsRef: React.MutableRefObject<SettlementSolid[]>;
  /** Where the player is, when the caller has it: bodies are then created
   * nearest first, so what could be touched this second is solid first. */
  focusRef?: React.MutableRefObject<{ x: number; z: number }>;
}) {
  const { world, rapier } = useRapier();
  const bodies = useRef(new Map<string, RigidBody>());
  const revision = useRef("");
  // One body per step on the shared queue (priority 10, with the flora
  // colliders): a settlement arriving used to create every wall at once.
  const queue = useFrameWork();
  const running = useRef<FrameJobHandle | null>(null);
  useEffect(() => () => { running.current?.cancel(); running.current = null; }, []);
  useEffect(() => {
    const live = bodies.current;
    const bodySet = captureBodySet(world);
    return () => {
      // Physics frees the world before child cleanups run
      // (react-three-rapier 2.2 proxy); a dead set means nothing to remove.
      if (!bodySetAlive(bodySet)) { live.clear(); return; }
      for (const body of live.values()) world.removeRigidBody(body);
      live.clear();
    };
  }, [world]);
  useFrame(() => {
    const solids = solidsRef.current;
    const nextRevision = solids.map((s) => s.id).join("|");
    if (revision.current === nextRevision) return;
    revision.current = nextRevision;
    running.current?.cancel();
    running.current = null;
    const wanted = new Set(solids.map((s) => s.id));
    for (const [id, body] of bodies.current) {
      if (!wanted.has(id)) { world.removeRigidBody(body); bodies.current.delete(id); }
    }
    const toBuild = solids.filter((solid) => !bodies.current.has(solid.id));
    const focus = focusRef?.current;
    if (focus) {
      toBuild.sort((a, b) =>
        Math.hypot(a.position[0] - focus.x, a.position[2] - focus.z)
        - Math.hypot(b.position[0] - focus.x, b.position[2] - focus.z));
    }
    function* buildJob(): Generator<void> {
      for (const solid of toBuild) {
        const [rx, ry, rz, rw] = solid.rotation;
        const body = world.createRigidBody(rapier.RigidBodyDesc.fixed()
          .setTranslation(...solid.position)
          .setRotation({ x: rx, y: ry, z: rz, w: rw }));
        for (const part of solid.parts) {
          world.createCollider(settlementColliderDesc(rapier, part, solid.scale), body);
        }
        bodies.current.set(solid.id, body);
        yield;
      }
      running.current = null;
    }
    running.current = queue.add(buildJob(), { priority: 10, label: "settlement-colliders" });
  });
  return null;
}
