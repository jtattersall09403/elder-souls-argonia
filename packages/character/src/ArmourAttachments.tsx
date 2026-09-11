import { assetUrl } from "./assetBase";
import { useGLTF } from "@react-three/drei";
import { useLayoutEffect, useMemo } from "react";
import type * as THREE from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";

import { mountArmour, unmountArmour, type MountedArmour } from "@elder-souls/game-core/actors/armourMounting";
import type { CharacterBuild } from "@elder-souls/game-core/actors/races";
import { armourAsset, armourCoverage, type ArmourDefinition } from "@elder-souls/game-core/equipment/armour";

/**
 * Worn armour, mounted on an actor's model.
 *
 * Its own component so the GLB downloads suspend independently: an actor
 * renders unarmoured while its plate is still arriving rather than the whole
 * fighter popping in late. All the actual work lives in the renderer-agnostic
 * `armourMounting` helper; this is only the React lifecycle around it.
 *
 * Which GLB, and how far it is blended, is the wearer's business: a piece ships
 * one mesh per sex carrying its maximum-weight geometry with the minimum-weight
 * one as a morph target, exactly as Skyrim ships the pair, and the influence is
 * `1 - weight`. Blended to the wearer, a vanilla cuirass's neck ring *is* that
 * wearer's neck ring, bit for bit, so the head meets the collar with no gap and
 * nothing has to be deformed to make it so (decision 0056).
 */
export function ArmourAttachments({
  model,
  wearer,
  armour,
  bodyMeshSlots,
  hideTorso = false,
  hideHands = false,
  onMountedChange,
}: {
  /** The actor's cloned race body, already in the scene. */
  model: THREE.Object3D;
  /** Whose body this is. Supplies the sex of the mesh and the weight to blend to. */
  wearer: Pick<CharacterBuild, "sex" | "bodyWeight">;
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
    () => armour.map((piece) => assetUrl(armourAsset(piece, wearer.sex))),
    [armour, wearer.sex],
  );
  const loaded = useGLTF(urls) as unknown as { scene: THREE.Object3D }[];

  useLayoutEffect(() => {
    const mounted = mountArmour(
      model,
      armour.map((piece, index) => ({
        id: piece.id,
        // A fresh clone per actor: two fighters in the same cuirass must not
        // share one skinned mesh bound to one of their skeletons.
        scene: blendToWeight(clone(loaded[index].scene), wearer.bodyWeight),
        coversBipedSlots: armourCoverage(piece, wearer.sex),
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
  }, [model, armour, loaded, bodyMeshSlots, hideHands, hideTorso, onMountedChange, wearer]);

  return null;
}

/**
 * Blend a cloned piece to the wearer's body weight.
 *
 * The exported geometry is the `_1` (maximum-weight) mesh and its single morph
 * target is `_0`, so the influence is the complement of the weight — the same
 * average Skyrim's own engine takes. A piece Bethesda authored as one
 * weight-independent mesh (both iron helmets, both orcish helmets) has no
 * target and needs no blend.
 */
function blendToWeight(scene: THREE.Object3D, bodyWeight: number): THREE.Object3D {
  const influence = 1 - Math.min(100, Math.max(0, bodyWeight)) / 100;
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.morphTargetInfluences?.length) return;
    mesh.morphTargetInfluences.fill(influence);
  });
  return scene;
}
