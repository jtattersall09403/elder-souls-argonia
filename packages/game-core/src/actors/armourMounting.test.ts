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

  it("leaves the body showing when a mount is repeated without an unmount", () => {
    // The paper-doll defect: unequip a cuirass and the figure is empty air.
    // A Suspense boundary re-suspending on an equip re-runs this component's
    // layout effects, so a second mount can land on top of a first. The old
    // hide-and-remember recorded nothing the second time — the body was already
    // hidden — so the eventual unmount had nothing to restore. Visibility is
    // now recomputed from what is worn, which makes repeats harmless.
    const actor = buildActor(["Torso", "Hands"]);
    const slots = { Torso: [32], Hands: [33] };
    mountArmour(actor.root, [buildPiece("steel-cuirass", [32])], slots);
    const second = mountArmour(actor.root, [buildPiece("steel-cuirass", [32])], slots);
    expect(actor.body[0].visible).toBe(false);

    unmountArmour(second);
    expect(actor.body[0].visible).toBe(true);
  });

  it("shows the body again when the piece covering it is taken off", () => {
    // Mounting the reduced set is what actually happens on unequip: React runs
    // the new effect for [boots] after the old one for [cuirass, boots].
    const actor = buildActor(["Torso", "Feet"]);
    const slots = { Torso: [32], Feet: [37] };
    mountArmour(actor.root, [buildPiece("cuirass", [32]), buildPiece("boots", [37])], slots);
    expect(actor.body[0].visible).toBe(false);

    const remaining = mountArmour(actor.root, [buildPiece("boots", [37])], slots);
    expect(actor.body[0].visible).toBe(true);
    expect(actor.body[1].visible).toBe(false);
    expect(remaining.hidden.map((mesh) => mesh.name)).toEqual(["Feet"]);
  });

  it("does not delete the whole body because boots reach the calves", () => {
    // Reported twice from one bug: the sandbox archer turned up with no body,
    // and the paper doll went empty as soon as the cuirass came off. Bethesda's
    // body mesh is torso *and* forearms *and* calves in one object (32/34/38),
    // and boots cover feet and calves (37/38). Under "hide any mesh sharing a
    // slot" the calves overlap deleted the torso.
    const actor = buildActor(["MaleUnderwearBody0", "FootMale_Big"]);
    const slots = { "MaleUnderwearBody:0": [32, 34, 38], FootMale_Big: [37] };
    mountArmour(actor.root, [buildPiece("iron-boots", [37, 38])], slots);
    expect(actor.body[0].visible).toBe(true);
    expect(actor.body[1].visible).toBe(false);
  });

  it("still hides the body under a real cuirass", () => {
    const actor = buildActor(["MaleUnderwearBody0"]);
    const slots = { "MaleUnderwearBody:0": [32, 34, 38] };
    mountArmour(actor.root, [buildPiece("iron-cuirass", [32, 34, 38])], slots);
    expect(actor.body[0].visible).toBe(false);
  });

  it("hides a mesh whose every slot is covered even without its primary", () => {
    // Belt and braces: a set that covers all of a mesh keeps hiding it, so the
    // primary-slot rule only ever *adds* cases where the body stays visible.
    const actor = buildActor(["Calves"]);
    mountArmour(actor.root, [buildPiece("greaves", [38, 39])], { Calves: [38, 39] });
    expect(actor.body[0].visible).toBe(false);
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
