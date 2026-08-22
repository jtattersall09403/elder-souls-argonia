import { useGLTF } from "@react-three/drei";
import { useLayoutEffect, useMemo } from "react";
import type * as THREE from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";

import { mountArmour, unmountArmour, type MountedArmour } from "../game/actors/armourMounting";
import type { ArmourDefinition } from "../game/equipment/armour";

/**
 * Worn armour, mounted on an actor's model.
 *
 * Its own component so the GLB downloads suspend independently: an actor
 * renders unarmoured while its plate is still arriving rather than the whole
 * fighter popping in late. All the actual work lives in the renderer-agnostic
 * `armourMounting` helper; this is only the React lifecycle around it.
 */
export function ArmourAttachments({
  model,
  armour,
  bodyMeshSlots,
  hideTorso = false,
  hideHands = false,
  onMountedChange,
}: {
  /** The actor's cloned race body, already in the scene. */
  model: THREE.Object3D;
  armour: readonly ArmourDefinition[];
  /** The wearer's per-mesh biped slots, from the race roster. */
  bodyMeshSlots: Readonly<Record<string, readonly number[]>>;
  /**
   * Hide anything covering the torso.
   *
   * A first-person camera sits inside the wearer's chest, and a cuirass with
   * pauldrons fills the whole view the moment the draw turns the shoulders into
   * it. Skyrim shows first-person gauntlets and nothing else for the same
   * reason.
   */
  hideTorso?: boolean;
  /** Hide anything on the hands, for the same reason. */
  hideHands?: boolean;
  /**
   * Called with the mount result, and with null on unmount. The parent uses it
   * to re-collect skinned meshes — which is what keeps armour inside the
   * per-frame skeleton refresh and the actor's mesh bounds — and to stand the
   * actor on its boot soles rather than its bare feet.
   */
  onMountedChange?: (mounted: MountedArmour | null) => void;
}) {
  const urls = useMemo(
    () => armour.map((piece) => `${import.meta.env.BASE_URL}${piece.asset}`),
    [armour],
  );
  const loaded = useGLTF(urls) as unknown as { scene: THREE.Object3D }[];

  useLayoutEffect(() => {
    const mounted = mountArmour(
      model,
      armour.map((piece, index) => ({
        id: piece.id,
        // A fresh clone per actor: two fighters in the same cuirass must not
        // share one skinned mesh bound to one of their skeletons.
        scene: clone(loaded[index].scene),
        coversBipedSlots: piece.coversBipedSlots,
      })),
      bodyMeshSlots,
    );
    for (const problem of mounted.problems) {
      console.warn(`[armour] ${problem.id}: ${problem.reason}`);
    }
    for (const mesh of mounted.torsoMeshes) mesh.visible = !hideTorso;
    for (const mesh of mounted.handMeshes) mesh.visible = !hideHands;
    onMountedChange?.(mounted);
    return () => {
      unmountArmour(mounted);
      onMountedChange?.(null);
    };
  }, [model, armour, loaded, bodyMeshSlots, hideHands, hideTorso, onMountedChange]);

  return null;
}
