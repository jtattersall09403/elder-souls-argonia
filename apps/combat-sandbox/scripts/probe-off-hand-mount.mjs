import { readFile } from "node:fs/promises";
import * as THREE from "three";

/**
 * Where an off-hand item actually sits, from the built rig (combat-sandbox lane
 * round 3, decision 0091 §7). Numbers, not a picture: for each candidate item
 * rotation on the `Shield` node, the grip's distance from the left hand bone
 * and the direction the item's +Z (blade tip, flame end) points in the actor's
 * own frame, beside the right-hand weapon's for the mirror comparison.
 *
 * Usage: node scripts/probe-off-hand-mount.mjs [CLIP[@seconds] ...]
 *   defaults: DW_IDLE TORCH_POSE
 */

const ASSETS = new URL("../../../packages/character-assets/files/", import.meta.url);
const MANIFEST = new URL("../../../packages/game-core/src/anim/generated/rig-skyrim-humanoid.animations.json", import.meta.url);
const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const TYPED = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const sanitize = (name) => name.replace(/\s/g, "_").replace(/[[\].:/]/g, "");

function parseGlb(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(buffer.subarray(20, 20 + jsonLength)));
  return { json, bin: buffer.subarray(20 + jsonLength + 8) };
}
function readAccessor({ json, bin }, index) {
  const accessor = json.accessors[index];
  const view = json.bufferViews[accessor.bufferView];
  const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  return new TYPED[accessor.componentType](bin.buffer, bin.byteOffset + offset, accessor.count * COMPONENTS[accessor.type]);
}
function buildNodes(gltf) {
  const nodes = gltf.json.nodes.map((node, index) => ({
    index, name: sanitize(node.name ?? `node${index}`), children: node.children ?? [], parent: -1,
    t: new THREE.Vector3().fromArray(node.translation ?? [0, 0, 0]),
    r: new THREE.Quaternion().fromArray(node.rotation ?? [0, 0, 0, 1]),
    s: new THREE.Vector3().fromArray(node.scale ?? [1, 1, 1]),
    world: new THREE.Matrix4(),
  }));
  for (const node of nodes) {
    node.rest = { t: node.t.clone(), r: node.r.clone(), s: node.s.clone() };
    for (const child of node.children) nodes[child].parent = node.index;
  }
  const order = [];
  const walk = (i) => { order.push(i); for (const c of nodes[i].children) walk(c); };
  for (const node of nodes) if (node.parent < 0) walk(node.index);
  return { nodes, order };
}
function poseAt(gltf, { nodes, order }, animation, time) {
  for (const node of nodes) { node.t.copy(node.rest.t); node.r.copy(node.rest.r); node.s.copy(node.rest.s); }
  for (const channel of animation.channels) {
    const sampler = animation.samplers[channel.sampler];
    const input = readAccessor(gltf, sampler.input);
    const output = readAccessor(gltf, sampler.output);
    const node = nodes[channel.target.node];
    let i = 0;
    while (i < input.length - 1 && input[i + 1] < time) i += 1;
    const j = Math.min(i + 1, input.length - 1);
    const span = input[j] - input[i];
    const a = span <= 1e-9 ? 0 : Math.min(1, Math.max(0, (time - input[i]) / span));
    if (channel.target.path === "rotation") {
      node.r.fromArray(output, i * 4).slerp(new THREE.Quaternion().fromArray(output, j * 4), a);
    } else {
      const target = channel.target.path === "scale" ? node.s : node.t;
      target.fromArray(output, i * 3).lerp(new THREE.Vector3().fromArray(output, j * 3), a);
    }
  }
  const local = new THREE.Matrix4();
  for (const index of order) {
    const node = nodes[index];
    local.compose(node.t, node.r, node.s);
    if (node.parent < 0) node.world.copy(local);
    else node.world.multiplyMatrices(nodes[node.parent].world, local);
  }
}

const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
const scale = manifest.rig.recommendedScale;
const convention = new THREE.Quaternion().fromArray(manifest.rig.socketRotation ?? [0, 0, 0, 1]);
const CANDIDATES = {
  identity: [0, 0, 0, 1],
  "half-turn Z": [0, 0, 1, 0],
  "half-turn X": [1, 0, 0, 0],
  "half-turn Y": [0, 1, 0, 0],
};
const MAIN_HAND = [0, 0, 1, 0];

const wanted = process.argv.slice(2).length ? process.argv.slice(2) : ["DW_IDLE", "TORCH_POSE"];
const loaded = new Map();
for (const arg of wanted) {
  const [clip, at] = arg.split("@");
  const pack = manifest.animations[clip]?.pack ?? "core";
  const asset = new URL(manifest.packs?.[pack]?.asset ?? "rig-skyrim-humanoid.glb", ASSETS);
  if (!loaded.has(asset.href)) {
    const gltf = parseGlb(await readFile(asset));
    loaded.set(asset.href, { gltf, graph: buildNodes(gltf) });
  }
  const { gltf, graph } = loaded.get(asset.href);
  const animation = gltf.json.animations.find((entry) => entry.name === clip);
  if (!animation) throw new Error(`no clip ${clip}`);
  poseAt(gltf, graph, animation, Number(at ?? 0));
  const byName = new Map(graph.nodes.map((n) => [n.name, n]));
  const pos = (name) => new THREE.Vector3().setFromMatrixPosition(byName.get(name).world).multiplyScalar(scale);
  const footNode = byName.get("NPC_Foot_ft_L") ?? byName.get("NPC_L_Foot_ft");
  const toeNode = byName.get("NPC_Toe0_ToeL") ?? byName.get("NPC_L_Toe0_ToeL");
  const forward = new THREE.Vector3().setFromMatrixPosition(toeNode.world)
    .sub(new THREE.Vector3().setFromMatrixPosition(footNode.world)).setY(0).normalize();
  const lateral = new THREE.Vector3(0, 1, 0).cross(forward).normalize(); // actor's left
  const pelvis = pos("NPC_Pelvis_Pelv");
  if (process.env.PROBE_DEBUG) {
    for (const n of ["NPC_Head_Head", "NPC_Pelvis_Pelv", "NPC_Hand_HndL", "NPC_Hand_HndR", "NPC_Foot_ft_L", "NPC_Toe0_ToeL", "NPC_L_Foot_ft", "NPC_L_Toe0_ToeL"]) {
      if (byName.get(n)) console.log(n, pos(n).toArray().map((v) => v.toFixed(3)).join(" "));
    }
    console.log("forward", forward.toArray().map((v) => v.toFixed(2)).join(" "));
  }
  const frame = (v) => ({ fwd: v.dot(forward), left: v.dot(lateral), up: v.y });
  const fmt = (o) => `fwd ${o.fwd.toFixed(2)} left ${o.left.toFixed(2)} up ${o.up.toFixed(2)}`;
  const mount = (socket, itemRotation) => {
    const node = byName.get(socket);
    const m = new THREE.Matrix4().multiplyMatrices(
      node.world,
      new THREE.Matrix4().makeRotationFromQuaternion(convention.clone().multiply(new THREE.Quaternion().fromArray(itemRotation))),
    );
    const grip = new THREE.Vector3().setFromMatrixPosition(m).multiplyScalar(scale);
    const basis = new THREE.Matrix3().setFromMatrix4(m);
    const z = new THREE.Vector3(0, 0, 1).applyMatrix3(basis).normalize();
    const x = new THREE.Vector3(1, 0, 0).applyMatrix3(basis).normalize();
    return { grip, z, x };
  };
  const lHand = pos("NPC_Hand_HndL");
  const rHand = pos("NPC_Hand_HndR");
  // Wrist to knuckles: hand bone to the middle finger's first joint. The
  // main hand's half turn exists to put the weapon's +X (an axe's bit) on
  // this side (weaponClasses.ts MAIN_HAND_NODE_HALF_TURN), so the same test
  // decides the off hand's roll.
  const knuckles = (side) => pos(`NPC_Finger20_F20${side}`).sub(pos(`NPC_Hand_Hnd${side}`)).normalize();
  // The grip in the hand bone's own frame, metres: comparable left to right.
  const inHand = (grip, side) => {
    const bone = byName.get(`NPC_Hand_Hnd${side}`);
    const inverse = bone.world.clone().invert();
    return grip.clone().divideScalar(scale).applyMatrix4(inverse).multiplyScalar(
      new THREE.Vector3().setFromMatrixScale(bone.world).x * scale);
  };
  const vec = (v) => v.toArray().map((x) => x.toFixed(3)).join(" ");
  const right = mount("Weapon", MAIN_HAND);
  console.log(`  main grip in R hand frame (m): ${vec(inHand(right.grip, "R"))}; edge.knuckles ${right.x.dot(knuckles("R")).toFixed(2)}`);
  console.log(`\n${clip}@${at ?? 0}  (actor frame; left = actor's left)`);
  console.log(`  L hand bone rel pelvis: ${fmt(frame(lHand.clone().sub(pelvis)))}`);
  console.log(`  main hand (Weapon, half-turn Z): grip-to-R-hand ${(right.grip.distanceTo(rHand) * 100).toFixed(1)} cm;`
    + ` tip ${fmt(frame(right.z))}; edge ${fmt(frame(right.x))}`);
  const mirror = (v) => { const f = frame(v); return { ...f, left: -f.left }; };
  console.log(`  mirrored main tip: ${fmt(mirror(right.z))}; mirrored edge: ${fmt(mirror(right.x))}`);
  for (const [label, rotation] of Object.entries(CANDIDATES)) {
    const left = mount("Shield", rotation);
    const outward = left.z.clone().setY(0).dot(lateral);
    console.log(`  Shield + ${label.padEnd(12)} grip-to-L-hand ${(left.grip.distanceTo(lHand) * 100).toFixed(1)} cm;`
      + ` tip ${fmt(frame(left.z))} (outward ${outward.toFixed(2)}); edge.knuckles ${left.x.dot(knuckles("L")).toFixed(2)}`
      + `; grip in L hand frame ${vec(inHand(left.grip, "L"))}`);
  }
}
