import { readFile } from "node:fs/promises";
import * as THREE from "three";

/**
 * Measure when a weapon is actually cutting, from the built GLB.
 *
 * Contact windows are the one piece of combat timing that *must* agree with the
 * art: a window that closes early makes a swing pass visibly through a body
 * without connecting, and one that opens early makes a wind-up hit. They were
 * measured by hand once and have drifted every time the grip or a clip changed.
 * This makes the measurement repeatable.
 *
 * Method, for each attack clip:
 *   - sample the animation onto the skeleton and take the weapon socket's world
 *     transform, so the grip convention the rig applies is included;
 *   - project the blade tip into the actor's own frame (forward taken from the
 *     rest-pose foot-to-toe axis, so it needs no assumption about world axes);
 *   - report the contiguous interval where the tip is *sweeping* — moving above
 *     a share of its peak speed — and *in front of* the actor, which is the
 *     part a defender can be standing in.
 *
 * Usage: node scripts/measure-contact-windows.mjs [CLIP ...]
 */

const ASSETS = new URL("../../../packages/character-assets/files/", import.meta.url);
const MANIFEST = new URL("../../../packages/game-core/src/anim/generated/rig-skyrim-humanoid.animations.json", import.meta.url);

/**
 * Blade tip, in metres along the weapon frame's +Z from the grip.
 *
 * A property of the weapon, not of the clip: a greatsword reaches half a metre
 * further than a sword from the same pose, and measuring its swing against a
 * sword's tip finds contact late. Pass `--blade <metres>` (the class's
 * `lengthMeters`) when measuring a moveset for a longer weapon.
 */
const bladeFlag = process.argv.indexOf("--blade");
const BLADE_LENGTH = bladeFlag >= 0 ? Number(process.argv[bladeFlag + 1]) : 0.92;
/** Share of peak tip speed above which the blade counts as sweeping. */
const SWEEP_THRESHOLD = 0.3;
/**
 * Where a defender can be, in the attacker's own frame.
 *
 * A half-disc in front of the actor, not a corridor dead ahead. This was a
 * narrow box centred on the forward axis, which is wrong for the question being
 * asked: a swing *arcs across* the front, so it crosses any one point in that
 * corridor for two or three frames, and the tool duly reported active windows
 * of 25 ms. The defender is not pinned to the centreline — the moveset has to
 * work against someone anywhere in the arc, which is what the reach and arc
 * numbers on the attack already say. So contact is: some part of the blade is
 * in the front half-plane, within striking distance of the actor's own axis,
 * at a height a standing body occupies.
 */
const TARGET = { near: 0.6, far: 2.3, low: 0.4, high: 2 };
/** Points sampled along the blade, grip to tip. */
const BLADE_SAMPLES = 9;
/**
 * How many non-qualifying samples a single contact window may span.
 *
 * At 120 Hz this is about a fortieth of a second: enough to bridge a blade
 * flicking a hand's width outside the target box mid-sweep, far too short to
 * join a wind-up to the swing that follows it.
 */
const RUN_BRIDGE_SAMPLES = 3;
/** Frames ignored at each end, where a clip's channels have not all started. */
const EDGE_GUARD = 8;
const SAMPLE_HZ = 120;

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const TYPED = {
  5120: Int8Array, 5121: Uint8Array, 5122: Int16Array,
  5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array,
};

function parseGlb(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(buffer.subarray(20, 20 + jsonLength)));
  const binStart = 20 + jsonLength + 8;
  return { json, bin: buffer.subarray(binStart) };
}

function readAccessor({ json, bin }, index) {
  const accessor = json.accessors[index];
  const view = json.bufferViews[accessor.bufferView];
  const Type = TYPED[accessor.componentType];
  const size = COMPONENTS[accessor.type];
  const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  return new Type(bin.buffer, bin.byteOffset + offset, accessor.count * size);
}

/** three sanitises node names on load; match it so bone names line up. */
const sanitize = (name) => name.replace(/\s/g, "_").replace(/[[\].:/]/g, "");

function buildNodes(gltf) {
  const nodes = gltf.json.nodes.map((node, index) => ({
    index,
    name: sanitize(node.name ?? `node${index}`),
    children: node.children ?? [],
    parent: -1,
    translation: new THREE.Vector3().fromArray(node.translation ?? [0, 0, 0]),
    rotation: new THREE.Quaternion().fromArray(node.rotation ?? [0, 0, 0, 1]),
    scale: new THREE.Vector3().fromArray(node.scale ?? [1, 1, 1]),
    rest: null,
    world: new THREE.Matrix4(),
  }));
  for (const node of nodes) {
    node.rest = {
      translation: node.translation.clone(),
      rotation: node.rotation.clone(),
      scale: node.scale.clone(),
    };
    for (const child of node.children) nodes[child].parent = node.index;
  }
  return { nodes, order: parentsFirst(nodes) };
}

/**
 * Node indices ordered so a parent always precedes its children.
 *
 * glTF does not require it, and this rig does not have it — which is what broke
 * this tool. Composing world matrices in file order meant a child could be
 * multiplied by its parent's matrix from the *previous* call, so `poseAt` was
 * not idempotent: sampling the same clip at the same time twice gave two
 * different answers, and the armature's 0.1 import scale landed once too often
 * or once too few. The visible symptom was a sword measured as nine
 * centimetres long, which is why no swing was ever found to be "in reach" and
 * why every window this tool reported disagreed with the calibrated ones.
 */
function parentsFirst(nodes) {
  const order = [];
  const walk = (index) => {
    order.push(index);
    for (const child of nodes[index].children) walk(child);
  };
  for (const node of nodes) if (node.parent < 0) walk(node.index);
  // Anything unreachable from a root (a malformed file) still gets posed, at
  // its own local transform, rather than silently dropped.
  if (order.length !== nodes.length) {
    const seen = new Set(order);
    for (const node of nodes) if (!seen.has(node.index)) order.push(node.index);
  }
  return order;
}

function updateWorld(nodes, order) {
  const local = new THREE.Matrix4();
  for (const index of order) {
    const node = nodes[index];
    local.compose(node.translation, node.rotation, node.scale);
    if (node.parent < 0) node.world.copy(local);
    else node.world.multiplyMatrices(nodes[node.parent].world, local);
  }
}

function poseAt(gltf, nodes, order, animation, time) {
  for (const node of nodes) {
    node.translation.copy(node.rest.translation);
    node.rotation.copy(node.rest.rotation);
    node.scale.copy(node.rest.scale);
  }
  for (const channel of animation.channels) {
    const sampler = animation.samplers[channel.sampler];
    const step = (sampler.interpolation ?? "LINEAR") === "STEP";
    const input = readAccessor(gltf, sampler.input);
    const output = readAccessor(gltf, sampler.output);
    const node = nodes[channel.target.node];
    const path = channel.target.path;
    const size = path === "rotation" ? 4 : 3;

    let index = 0;
    while (index < input.length - 1 && input[index + 1] < time) index += 1;
    const next = Math.min(index + 1, input.length - 1);
    const span = input[next] - input[index];
    const alpha = step || span <= 1e-9
      ? 0
      : Math.min(1, Math.max(0, (time - input[index]) / span));

    if (path === "rotation") {
      const a = new THREE.Quaternion().fromArray(output, index * 4);
      const b = new THREE.Quaternion().fromArray(output, next * 4);
      node.rotation.copy(a).slerp(b, alpha);
    } else {
      const a = new THREE.Vector3().fromArray(output, index * size);
      const b = new THREE.Vector3().fromArray(output, next * size);
      const target = path === "scale" ? node.scale : node.translation;
      target.copy(a).lerp(b, alpha);
    }
  }
  updateWorld(nodes, order);
}

/**
 * The actor's own forward, taken from the rest pose.
 *
 * Toe ahead of foot: true of every humanoid, and it means the measurement needs
 * no assumption about which way the exporter decided was north.
 */
function actorFrame(nodes) {
  const byName = new Map(nodes.map((node) => [node.name, node]));
  const foot = byName.get("NPC_Foot_ft_L") ?? byName.get("NPC_L_Foot_ft");
  const toe = byName.get("NPC_Toe0_ToeL") ?? byName.get("NPC_L_Toe0_ToeL");
  const pelvis = byName.get("NPC_Pelvis_Pelv");
  if (!foot || !toe || !pelvis) throw new Error("rig is missing the bones this measurement needs");
  const from = new THREE.Vector3().setFromMatrixPosition(foot.world);
  const to = new THREE.Vector3().setFromMatrixPosition(toe.world);
  const forward = to.sub(from).setY(0).normalize();
  return { forward, pelvis };
}

function measure(gltf, nodes, order, animationName, socketRotation, scale) {
  const animation = gltf.json.animations.find((entry) => entry.name === animationName);
  if (!animation) throw new Error(`no clip named ${animationName}`);
  const socket = nodes.find((node) => node.name === "Weapon");
  if (!socket) throw new Error("rig has no Weapon socket");

  poseAt(gltf, nodes, order, animation, 0);
  const { forward, pelvis } = actorFrame(nodes);

  const duration = Math.max(...animation.samplers.map((sampler) => {
    const input = readAccessor(gltf, sampler.input);
    return input[input.length - 1];
  }));

  const grip = new THREE.Matrix4();
  const convention = new THREE.Matrix4().makeRotationFromQuaternion(
    new THREE.Quaternion().fromArray(socketRotation),
  );
  // The blade length is metres; the socket lives in rig units, whose size is
  // whatever the armature scale and the character scale multiply to. Deriving
  // it from the socket's own world matrix means the measurement never has to
  // know what those were.
  poseAt(gltf, nodes, order, animation, 0);
  const socketScale = new THREE.Vector3().setFromMatrixScale(socket.world).x || 1;
  const tipLocal = new THREE.Vector3(0, 0, BLADE_LENGTH / (scale * socketScale));
  const samples = [];
  for (let step = 0; step <= Math.round(duration * SAMPLE_HZ); step += 1) {
    const time = Math.min(duration, step / SAMPLE_HZ);
    poseAt(gltf, nodes, order, animation, time);
    grip.multiplyMatrices(socket.world, convention);
    const tip = tipLocal.clone().applyMatrix4(grip);
    const origin = new THREE.Vector3().setFromMatrixPosition(pelvis.world);
    const offset = tip.clone().sub(origin).multiplyScalar(scale);
    const gripPoint = new THREE.Vector3().setFromMatrixPosition(grip);
    let reachable = false;
    for (let i = 0; i < BLADE_SAMPLES && !reachable; i += 1) {
      const along = gripPoint.clone().lerp(tip, i / (BLADE_SAMPLES - 1));
      const local = along.clone().sub(origin).multiplyScalar(scale);
      const ahead = local.dot(forward);
      const range = Math.hypot(local.x, local.z);
      const height = along.y * scale;
      reachable = ahead > 0
        && range >= TARGET.near && range <= TARGET.far
        && height >= TARGET.low && height <= TARGET.high;
    }
    samples.push({
      time,
      tip: tip.clone().multiplyScalar(scale),
      ahead: offset.dot(forward),
      reachable,
    });
  }

  for (let i = 1; i < samples.length; i += 1) {
    samples[i].speed = samples[i].tip.distanceTo(samples[i - 1].tip) * SAMPLE_HZ;
  }
  samples[0].speed = samples[1]?.speed ?? 0;
  // A clip's very first and last frames land before every channel has a key,
  // which reads as the whole arm teleporting. Guard the ends rather than let
  // one bad frame set the peak everything else is measured against.
  const usable = samples.slice(EDGE_GUARD, samples.length - EDGE_GUARD);
  // A percentile, not the maximum. One bad frame — a quaternion that has not
  // been keyed yet, a channel starting late — otherwise sets a peak nothing
  // else in the clip can reach, and the window collapses to nothing.
  const ordered = usable.map((sample) => sample.speed).sort((a, b) => a - b);
  const peak = ordered[Math.floor(ordered.length * 0.95)] ?? 0;

  if (process.env.MEASURE_DEBUG) {
    const aheads = samples.map((s) => s.ahead);
    const speeds = samples.map((s) => s.speed ?? 0);
    console.log("  debug", animationName,
      "ahead", Math.min(...aheads).toFixed(2), "..", Math.max(...aheads).toFixed(2),
      "speed", Math.min(...speeds).toFixed(1), "..", Math.max(...speeds).toFixed(1),
      "tipY", Math.min(...samples.map((s) => s.tip.y)).toFixed(2), "..", Math.max(...samples.map((s) => s.tip.y)).toFixed(2));
    const stride = Math.max(1, Math.round(samples.length / 24));
    console.log("  profile", samples.filter((_, i) => i % stride === 0)
      .map((s) => `${(s.time / duration).toFixed(2)}:${(s.speed ?? 0).toFixed(0)}${s.reachable ? "*" : ""}`).join(" "));
  }
  if (process.env.MEASURE_RAW) {
    console.log("  raw", samples.map((x) => (x.speed ?? 0).toFixed(0)).join(" "));
  }
  // The *longest contiguous run*, not every qualifying frame.
  //
  // Taking the first and last qualifying sample is what the code used to do,
  // and it is not what the docstring above promises. One incidental frame early
  // in a wind-up — the blade momentarily crossing the target box as the arm
  // comes back — stretched the reported window across the whole clip, which is
  // how LIGHT_2 came out as contacting from 6% to 41% of its swing. A short
  // bridge is allowed, because a fast blade can flick outside the box for a
  // frame or two in the middle of a single genuine sweep.
  const live = longestRun(
    usable.map((sample) => sample.speed >= peak * SWEEP_THRESHOLD && sample.reachable),
    RUN_BRIDGE_SAMPLES,
  );
  if (live === null) return { animation: animationName, duration, peak, start: null, end: null };
  const first = usable[live.from];
  const last = usable[live.to];

  return {
    animation: animationName,
    duration,
    peakTipSpeed: peak,
    start: first.time / duration,
    end: last.time / duration,
    startSeconds: first.time,
    endSeconds: last.time,
  };
}

/** Longest run of true, allowing runs to be joined across up to `bridge` false. */
function longestRun(flags, bridge) {
  let best = null;
  let from = -1;
  let last = -1;
  for (let i = 0; i < flags.length; i += 1) {
    if (!flags[i]) continue;
    if (from < 0 || i - last > bridge + 1) {
      if (from >= 0 && (best === null || last - from > best.to - best.from)) best = { from, to: last };
      from = i;
    }
    last = i;
  }
  if (from >= 0 && (best === null || last - from > best.to - best.from)) best = { from, to: last };
  return best;
}

const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
const scale = manifest.rig.recommendedScale;
const socketRotation = manifest.rig.socketRotation ?? [0, 0, 0, 1];

/**
 * The rig ships as one GLB per animation pack, so a clip has to be looked up
 * in the file that actually carries it. Reading the pack out of the manifest
 * keeps this correct as movesets are added.
 */
const loaded = new Map();
async function packFor(clip) {
  const pack = manifest.animations[clip]?.pack ?? "core";
  const asset = manifest.packs?.[pack]?.asset ?? "rig-skyrim-humanoid.glb";
  if (!loaded.has(asset)) {
    const gltf = parseGlb(await readFile(new URL(asset, ASSETS)));
    loaded.set(asset, { gltf, ...buildNodes(gltf) });
  }
  return loaded.get(asset);
}

const clips = process.argv.slice(2).filter((arg, i, all) =>
  !arg.startsWith("--") && all[i - 1] !== "--blade");
const wanted = clips.length > 0
  ? clips
  : ["LIGHT_1", "LIGHT_2", "LIGHT_3", "HEAVY", "HEAVY_2"];

console.log(`blade ${BLADE_LENGTH} m`);
console.log("clip                     dur    sweep start..end (fraction)   seconds        peak tip m/s");
for (const name of wanted) {
  const { gltf, nodes, order } = await packFor(name);
  const result = measure(gltf, nodes, order, name, socketRotation, scale);
  if (result.start === null) {
    console.log(`${name.padEnd(24)} ${result.duration.toFixed(3)}  no sweep found in reach`);
    continue;
  }
  console.log(
    `${name.padEnd(24)} ${result.duration.toFixed(3)}  `
    + `${result.start.toFixed(3)} .. ${result.end.toFixed(3)}          `
    + `${result.startSeconds.toFixed(3)}..${result.endSeconds.toFixed(3)}   `
    + `${result.peakTipSpeed.toFixed(1)}`,
  );
}
