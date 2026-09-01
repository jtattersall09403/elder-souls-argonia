import { useEffect, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import type { EcctrlHandle } from "ecctrl";

import type { Stance } from "@elder-souls/game-core/locomotion/stance";
import {
  CHARACTER_CAPSULE_COLLIDER_NAME,
  applyStanceCapsule,
  type ResizableCapsule,
} from "@elder-souls/game-core/physics/stanceCapsule";

/**
 * Keep an actor's navigation capsule the shape its stance says it is.
 *
 * Reshapes the controller's own collider rather than replacing it. Ecctrl
 * creates one named capsule and holds a private ref to it; swapping it out
 * would mean forking the controller, and the whole point of the adapter
 * boundary is not to. Rapier lets a capsule be resized and re-offset in place,
 * which is all this needs, and it costs nothing on the frames where the stance
 * has not changed.
 *
 * Polled rather than driven by a prop because stance lives in a ref on the
 * game's own update loop — the same reason the animation command does. A stance
 * change is not a React render.
 */
export function useStanceCapsule(
  controller: RefObject<EcctrlHandle | null>,
  stance: RefObject<Stance>,
) {
  const applied = useRef<Stance | null>(null);

  // Re-apply from scratch when the controller itself changes, so a respawned
  // actor never inherits the previous body's crouch.
  useEffect(() => { applied.current = null; }, [controller]);

  useFrame(() => {
    const body = controller.current?.body;
    const wanted = stance.current;
    if (!body || applied.current === wanted) return;
    const collider = findCapsule(body);
    if (!collider) return;
    applyStanceCapsule(collider, wanted);
    applied.current = wanted;
  });
}

type ColliderOwner = {
  numColliders(): number;
  collider(index: number): unknown;
};

/**
 * The controller's own capsule, by the name Ecctrl gives it.
 *
 * By name rather than by index: an actor carries other colliders, and which
 * index the capsule lands on depends on mount order. `setHalfHeight` is only
 * present on capsule colliders, so the duck-type check also rules out matching
 * something that merely shares the name.
 */
function findCapsule(body: unknown): ResizableCapsule | null {
  const owner = body as ColliderOwner;
  if (typeof owner?.numColliders !== "function") return null;
  for (let index = 0; index < owner.numColliders(); index += 1) {
    const collider = owner.collider(index) as
      (ResizableCapsule & { _shape?: unknown; parent?: unknown }) | null;
    if (!collider || typeof collider.setHalfHeight !== "function") continue;
    const named = collider as unknown as { name?: string };
    if (named.name && named.name !== CHARACTER_CAPSULE_COLLIDER_NAME) continue;
    return collider;
  }
  return null;
}
