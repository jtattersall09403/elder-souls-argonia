import { describe, expect, it } from "vitest";
import * as THREE from "three";

import { mountArmour, unmountArmour } from "./armourMounting";

/**
 * Rebinding is the one thing that has to be right about worn armour: a piece
 * still bound to the skeleton it shipped with renders in a T-pose in the middle
 * of the arena, and a piece that fails to bind at all is invisible. Both are
 * cheap to test without a renderer.
 */

const BONE_NAMES = ["NPC Root", "NPC Spine", "NPC L Hand", "NPC R Hand"];

function buildSkeletonRoot() {
  const root = new THREE.Group();
  const bones = BONE_NAMES.map((name) => {
    const bone = new THREE.Bone();
    bone.name = name;
    return bone;
  });
  for (let i = 1; i < bones.length; i += 1) bones[i - 1].add(bones[i]);
  root.add(bones[0]);
  return { root, bones };
}

function buildSkinnedMesh(name: string, bones: THREE.Bone[]) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const count = geometry.attributes.position.count;
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(new Array(count * 4).fill(0), 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(
    Array.from({ length: count * 4 }, (_, i) => (i % 4 === 0 ? 1 : 0)),
    4,
  ));
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  mesh.name = name;
  mesh.bind(new THREE.Skeleton(bones));
  return mesh;
}

/** An actor: a skeleton plus body meshes hung beside it. */
function buildActor(bodyMeshNames: string[]) {
  const { root, bones } = buildSkeletonRoot();
  const holder = new THREE.Group();
  root.add(holder);
  const body = bodyMeshNames.map((name) => {
    const mesh = buildSkinnedMesh(name, bones);
    holder.add(mesh);
    return mesh;
  });
  return { root, bones, body };
}

/** A piece of armour: its own skeleton, same bone names. */
function buildPiece(id: string, coversBipedSlots: number[]) {
  const { root, bones } = buildSkeletonRoot();
  const holder = new THREE.Group();
  root.add(holder);
  holder.add(buildSkinnedMesh(`${id}-mesh`, bones));
  return { id, scene: root, coversBipedSlots, ownBones: bones };
}

describe("mounting armour on an actor", () => {
  it("rebinds the piece onto the actor's own bones", () => {
    const actor = buildActor(["Body"]);
    const piece = buildPiece("steel-cuirass", [32]);
    const mounted = mountArmour(actor.root, [piece], { Body: [32] });

    expect(mounted.problems).toEqual([]);
    expect(mounted.meshes).toHaveLength(1);
    for (const bone of mounted.meshes[0].skeleton.bones) {
      expect(actor.bones).toContain(bone);
      expect(piece.ownBones).not.toContain(bone);
    }
  });

  it("parents the piece beside the body it is worn over", () => {
    const actor = buildActor(["Body"]);
    const mounted = mountArmour(actor.root, [buildPiece("steel-cuirass", [32])], { Body: [32] });
    expect(mounted.meshes[0].parent).toBe(actor.body[0].parent);
  });

  it("hides only the body meshes the piece covers, and restores them", () => {
    const actor = buildActor(["Torso", "Hands", "Head"]);
    const slots = { Torso: [32, 34], Hands: [33], Head: [30] };
    const mounted = mountArmour(actor.root, [buildPiece("steel-cuirass", [32, 34, 38])], slots);

    expect(mounted.hidden.map((mesh) => mesh.name)).toEqual(["Torso"]);
    expect(actor.body.map((mesh) => mesh.visible)).toEqual([false, true, true]);

    unmountArmour(mounted);
    expect(actor.body.every((mesh) => mesh.visible)).toBe(true);
    expect(actor.root.getObjectByName("steel-cuirass-mesh")).toBeUndefined();
  });

  it("matches body meshes whose authored names glTF sanitises", () => {
    // "MaleUnderwearBody:0" in the roster arrives as "MaleUnderwearBody0".
    const actor = buildActor(["MaleUnderwearBody0"]);
    const mounted = mountArmour(actor.root, [buildPiece("steel-cuirass", [32])], {
      "MaleUnderwearBody:0": [32],
    });
    expect(mounted.hidden.map((mesh) => mesh.name)).toEqual(["MaleUnderwearBody0"]);
  });

  it("reports a piece skinned to a bone the actor does not have, rather than mounting it broken", () => {
    const actor = buildActor(["Body"]);
    const piece = buildPiece("iron-cuirass", [32]);
    // The pipeline hazard this guards: a truncated Bethesda bone name.
    piece.ownBones[2].name = "NPC L Han";
    piece.scene.traverse((object) => {
      if (object instanceof THREE.SkinnedMesh) object.bind(new THREE.Skeleton(piece.ownBones));
    });

    const mounted = mountArmour(actor.root, [piece], { Body: [32] });
    expect(mounted.meshes).toHaveLength(0);
    expect(mounted.problems[0].id).toBe("iron-cuirass");
    expect(mounted.problems[0].reason).toContain("NPC L Han");
    // A piece that could not bind must not have hidden the body underneath it.
    expect(actor.body[0].visible).toBe(true);
  });
});
