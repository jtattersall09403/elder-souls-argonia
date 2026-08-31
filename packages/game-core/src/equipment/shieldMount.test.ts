import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { RIG_GLB } from "../anim/animationManifest";
import { shieldById } from "./arsenal";
import manifest from "../anim/generated/rig-skyrim-humanoid.animations.json";

/**
 * Which way does a mounted shield face?
 *
 * A socket offset tuned by eye is the failure the animation contract warns
 * about, so this measures the real thing: it replicates the runtime mount —
 * the rig's socket convention, then the item's own offset — against the rig's
 * actual rest pose and the shield's actual geometry, and asks whether the
 * outer face ends up pointing away from the wearer.
 *
 * It exists because shields shipped facing the wrong way. They inherited a
 * convention measured from *weapons*, whose attach node points down the blade,
 * and a Bethesda shield node does not share that basis: the arm sat correctly
 * in the straps and the face was turned in toward the body. That reads as
 * "slightly odd" rather than "broken", which is exactly why it wants a number
 * rather than a glance.
 */

const ASSETS = new URL("../../../character-assets/files/", import.meta.url);

type Gltf = {
  nodes: { name?: string; children?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] }[];
  meshes?: { primitives: { attributes: Record<string, number> }[] }[];
  accessors?: { min?: number[]; max?: number[] }[];
};

async function readGltfJson(relative: string): Promise<Gltf> {
  const buffer = await readFile(fileURLToPath(new URL(relative, ASSETS)));
  return JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString("utf8"));
}

/**
 * Rest-pose world transform of a node, by walking its parents.
 *
 * Looked up by the node's raw name: three.js sanitizes names when it *loads* a
 * GLB, but the file itself carries Bethesda's originals.
 */
function restWorldQuaternion(gltf: Gltf, nodeName: string) {
  const parentOf = new Map<number, number>();
  gltf.nodes.forEach((node, i) => (node.children ?? []).forEach((c) => parentOf.set(c, i)));
  const target = gltf.nodes.findIndex((n) => n.name === nodeName);
  expect(target, `rig has no ${nodeName} node`).toBeGreaterThanOrEqual(0);

  const matrix = new THREE.Matrix4();
  for (let cursor: number | undefined = target; cursor !== undefined; cursor = parentOf.get(cursor)) {
    const node = gltf.nodes[cursor];
    matrix.premultiply(new THREE.Matrix4().compose(
      new THREE.Vector3().fromArray(node.translation ?? [0, 0, 0]),
      new THREE.Quaternion().fromArray(node.rotation ?? [0, 0, 0, 1]),
      new THREE.Vector3().fromArray(node.scale ?? [1, 1, 1]),
    ));
  }
  return matrix;
}

describe("shield mounting", () => {
  let rig: Gltf;
  beforeAll(async () => { rig = await readGltfJson(RIG_GLB); });

  it("puts the shield's outer face away from the wearer, point down", async () => {
    const shield = shieldById("steel-shield");
    const socket = restWorldQuaternion(rig, "Shield");
    const mount = new THREE.Quaternion();
    socket.decompose(new THREE.Vector3(), mount, new THREE.Vector3());
    // Exactly what `SkyrimFighter.mountOnSocket` does: rig convention, then
    // whatever offset the item declares for itself.
    mount
      .multiply(new THREE.Quaternion().fromArray([...manifest.rig.socketRotation]))
      .multiply(new THREE.Quaternion().fromArray([...shield.visual.held.localRotation]));

    // Measured on the built meshes: the thin axis is Y and the body hangs to
    // -Y of the attach node, so the convex outer face is the shield's local
    // -Y; the pointed foot of a kite shield is -Z.
    const outward = new THREE.Vector3(0, -1, 0).applyQuaternion(mount);
    const foot = new THREE.Vector3(0, 0, -1).applyQuaternion(mount);

    const mountPosition = new THREE.Vector3().setFromMatrixPosition(socket);
    const spine = new THREE.Vector3()
      .setFromMatrixPosition(restWorldQuaternion(rig, "NPC Spine2 [Spn2]"));
    const awayFromBody = mountPosition.clone().sub(spine).setY(0).normalize();

    // With the offset removed this reads about -0.98: the face turned inward,
    // which is the defect. Correct is the same magnitude, opposite sign.
    expect(outward.dot(awayFromBody)).toBeGreaterThan(0.8);
    // And the shield must not be fixed by standing it on its point, which the
    // other in-plane axis would also have done.
    expect(foot.y).toBeLessThan(-0.2);
  });

  it("keeps every shield on one convention", async () => {
    const rotations = new Set(
      ["iron-shield", "steel-shield", "dwarven-shield", "elven-shield", "orcish-shield", "ebony-shield"]
        .map((id) => shieldById(id).visual.held.localRotation.join(",")),
    );
    // A per-item quaternion is how a mount offset stops being a convention and
    // starts being six numbers nobody can re-derive.
    expect([...rotations]).toHaveLength(1);
  });
});
