import * as THREE from "three";

/**
 * Wearing armour on a skinned actor.
 *
 * A piece of armour is not a prop bolted to a bone: it is its own skinned mesh,
 * authored against the same rig the body is, and it has to be driven by *this*
 * actor's skeleton rather than the one it shipped with. That is the whole job
 * here — rebind, parent, and hide whatever the piece now covers.
 *
 * Deliberately free of React and of this repo's components: it takes three.js
 * objects and returns three.js objects, so the real game can mount armour on
 * an actor, a paper doll, a shop preview or a cutscene rig with the same call.
 */

/** What the caller must know about a piece to mount it. */
export type ArmourPiece = {
  id: string;
  /**
   * A *fresh* clone of the piece's GLB scene. Mounting rebinds and reparents
   * it, so a shared cache instance must not be handed in.
   */
  scene: THREE.Object3D;
  /** Biped slots the piece occupies, from the pipeline manifest. */
  coversBipedSlots: readonly number[];
};

/** Biped slots, in Bethesda's numbering. */
export const TORSO_BIPED_SLOT = 32;
export const HANDS_BIPED_SLOT = 33;

export type MountedArmour = {
  /** Meshes now bound to the actor's skeleton, in mount order. */
  meshes: THREE.SkinnedMesh[];
  /** Meshes covering the torso, which a first-person view puts the camera in. */
  torsoMeshes: THREE.SkinnedMesh[];
  /** Meshes on the hands, which sit at arm's length from a first-person eye. */
  handMeshes: THREE.SkinnedMesh[];
  /** Body meshes hidden underneath, so they can be restored on unequip. */
  hidden: THREE.Mesh[];
  /** Pieces that could not bind, with the reason. Never throws on bad content. */
  problems: { id: string; reason: string }[];
};

function bonesByName(root: THREE.Object3D) {
  const bones = new Map<string, THREE.Bone>();
  root.traverse((object) => {
    if (object instanceof THREE.Bone) bones.set(object.name, object);
  });
  return bones;
}

function firstSkinnedMesh(root: THREE.Object3D): THREE.SkinnedMesh | null {
  let found: THREE.SkinnedMesh | null = null;
  root.traverse((object) => {
    if (!found && object instanceof THREE.SkinnedMesh) found = object;
  });
  return found;
}

/**
 * Mount armour onto an actor's model root.
 *
 * `bodyMeshSlots` maps body mesh name to the biped slots it occupies (the race
 * roster's `meshBipedSlots`). Any body mesh sharing a slot with a worn piece is
 * hidden rather than removed, because unequipping has to be free and because a
 * removed mesh would take its bounding box out of the hurtbox fit.
 */
export function mountArmour(
  modelRoot: THREE.Object3D,
  pieces: readonly ArmourPiece[],
  bodyMeshSlots: Readonly<Record<string, readonly number[]>>,
): MountedArmour {
  const result: MountedArmour = {
    meshes: [], hidden: [], problems: [], torsoMeshes: [], handMeshes: [],
  };
  const bones = bonesByName(modelRoot);
  const bodyMesh = firstSkinnedMesh(modelRoot);
  if (!bodyMesh) {
    result.problems.push({ id: "*", reason: "actor has no skinned mesh to mount onto" });
    return result;
  }
  // Parent armour beside the body meshes, not at the model root: the two share
  // whatever armature transform the exporter wrote, and a skinned mesh's world
  // matrix still positions its bind space.
  const parent = bodyMesh.parent ?? modelRoot;

  // glTF mesh names are sanitised on load ("MaleUnderwearBody:0" arrives as
  // "MaleUnderwearBody0"), while the roster records the authored names. Key the
  // lookup by the sanitised form so both sides agree.
  const slotsByMesh = new Map<string, readonly number[]>();
  for (const [name, slots] of Object.entries(bodyMeshSlots)) {
    slotsByMesh.set(THREE.PropertyBinding.sanitizeNodeName(name), slots);
  }

  const covered = new Set<number>();
  for (const piece of pieces) {
    const mounted: THREE.SkinnedMesh[] = [];
    let failure: string | null = null;
    piece.scene.traverse((object) => {
      if (failure || !(object instanceof THREE.SkinnedMesh)) return;
      const mapped: THREE.Bone[] = [];
      for (const bone of object.skeleton.bones) {
        const match = bones.get(bone.name);
        if (!match) {
          failure = `bone "${bone.name}" is not on the actor's skeleton`;
          return;
        }
        mapped.push(match);
      }
      // Same bind matrix and same inverses: the piece was authored against this
      // rig, so only the bone *instances* change.
      object.bind(new THREE.Skeleton(mapped, object.skeleton.boneInverses), object.bindMatrix);
      mounted.push(object);
    });

    if (failure) {
      result.problems.push({ id: piece.id, reason: failure });
      continue;
    }
    if (mounted.length === 0) {
      result.problems.push({ id: piece.id, reason: "piece contains no skinned mesh" });
      continue;
    }

    for (const mesh of mounted) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // Skinned bounds are recomputed per frame by the hurtbox pass; a stale
      // authored sphere would cull the piece the moment the actor moves.
      mesh.frustumCulled = false;
      parent.add(mesh);
      result.meshes.push(mesh);
      if (piece.coversBipedSlots.includes(TORSO_BIPED_SLOT)) result.torsoMeshes.push(mesh);
      if (piece.coversBipedSlots.includes(HANDS_BIPED_SLOT)) result.handMeshes.push(mesh);
    }
    for (const slot of piece.coversBipedSlots) covered.add(slot);
  }

  // Recomputed from scratch, not toggled.
  //
  // This used to hide covered meshes and remember which ones to put back, which
  // is only correct if every mount is paired with exactly one unmount in the
  // right order. It is not: a Suspense boundary re-suspending on an equip tears
  // down and re-runs this component's layout effects, and a second mount over a
  // first one sees an already-hidden body, records nothing, and then "restores"
  // nothing — leaving a headless, bodiless figure wearing armour, or bare air
  // once the armour came off. Setting visibility from the covered set every
  // time makes the result depend only on what is worn now.
  for (const [name, slots] of slotsByMesh) {
    const mesh = findBodyMesh(modelRoot, name, result.meshes);
    if (!mesh) continue;
    const isCovered = bodyMeshIsCovered(slots, covered);
    mesh.visible = !isCovered;
    if (isCovered) result.hidden.push(mesh);
  }

  return result;
}

/**
 * Whether a worn set covers a body mesh enough to hide it.
 *
 * Not "shares any slot", which is what this used to be and which had a
 * spectacular failure mode: Bethesda's body mesh occupies **32 torso, 34
 * forearms and 38 calves** in one object, and a pair of boots covers **37 feet
 * and 38 calves**. They overlap on the calves, so putting boots on an otherwise
 * naked actor deleted its entire body. That is the archer who turned up with no
 * body, and the paper doll that went empty the moment a cuirass came off — one
 * bug reported twice.
 *
 * The rule is the mesh's **primary slot**: the lowest-numbered one it occupies.
 * Bethesda's numbering runs head 30, hair 31, body 32, hands 33, forearms 34 …
 * feet 37, calves 38, so the lowest slot is the part the mesh principally *is*,
 * and the rest are the regions it happens to extend into. A cuirass covers 32
 * and hides the body; boots cover 37 and hide the feet; neither reaches into
 * the other's territory.
 *
 * A set that covers *every* slot a mesh occupies still hides it, which costs
 * nothing and keeps the old behaviour wherever the old behaviour was right.
 *
 * The genuinely correct model is per-partition visibility, which is what Skyrim
 * does — but our meshes arrive from the pipeline as whole objects with a union
 * of slots, and hiding half an object is not something this data supports.
 */
function bodyMeshIsCovered(slots: readonly number[], covered: ReadonlySet<number>) {
  if (slots.length === 0) return false;
  const primary = Math.min(...slots);
  return covered.has(primary) || slots.every((slot) => covered.has(slot));
}

/** A body mesh by its sanitised name, excluding anything just mounted. */
function findBodyMesh(
  modelRoot: THREE.Object3D,
  sanitisedName: string,
  mounted: readonly THREE.SkinnedMesh[],
): THREE.Mesh | null {
  let found: THREE.Mesh | null = null;
  modelRoot.traverse((object) => {
    if (found || !(object instanceof THREE.Mesh)) return;
    if (mounted.includes(object as THREE.SkinnedMesh)) return;
    if (THREE.PropertyBinding.sanitizeNodeName(object.name) !== sanitisedName) return;
    found = object;
  });
  return found;
}

/**
 * A note on grounding, because it looks like a bug and is not.
 *
 * A boot sole reaches a centimetre or two below bare skin, so a shod actor's
 * sole clips the floor by that much. Lifting the actor to compensate is worse:
 * the grounding solve reads the pose back out of the scene graph and cancels a
 * root-position lift, and raising the plane it aims at instead breaks *paired*
 * animations, which align two actors whose boots are not the same thickness.
 * Skyrim ships the same small clip for the same reason.

/** Undo `mountArmour`, leaving the actor exactly as it was found. */
export function unmountArmour(mounted: MountedArmour) {
  for (const mesh of mounted.meshes) mesh.removeFromParent();
  for (const mesh of mounted.hidden) mesh.visible = true;
  mounted.meshes.length = 0;
  mounted.hidden.length = 0;
  mounted.torsoMeshes.length = 0;
  mounted.handMeshes.length = 0;
}
