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
const ARSENAL_MANIFEST = new URL("../../../packages/game-core/src/equipment/generated/arsenal.items.json", import.meta.url);

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
/** Where the cutting edge begins, as a fraction from grip to tip. */
const BLADE_EDGE_START = 0.45;
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

function measure(gltf, nodes, order, animationName, socketRotation, scale, victimPack) {
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
    // The cutting part only, for the critical pass: the grip half is the
    // attacker's own hands, and they pass close to a victim during any lunge.
    // Including them found "contact" during the entry blend, at a moment the
    // hand audit of the one-handed execution explicitly rejected.
    // In *world* metres, not relative to the attacker's pelvis. A critical
    // lunges: the attacker travels several tens of centimetres during the clip
    // while the victim stands still. Measuring the blade against a victim held
    // at a fixed offset from the moving attacker is measuring the wrong thing,
    // and it found "contact" during the entry blend — a moment the one-handed
    // hand audit had explicitly rejected.
    const blade = [];
    for (let i = 0; i < BLADE_SAMPLES; i += 1) {
      const along = gripPoint.clone().lerp(tip, BLADE_EDGE_START + (1 - BLADE_EDGE_START) * (i / (BLADE_SAMPLES - 1)));
      blade.push(along.clone().multiplyScalar(scale));
    }
    samples.push({
      time,
      blade,
      grip: grip.clone(),
      origin: origin.clone(),
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
  if (process.env.MEASURE_RUNS) {
    // Every contact phase, not just the longest. A packaged execution is a
    // multi-hit sequence and the game plays one hit of it, so choosing which
    // phase to trim to needs the whole list.
    const flags = usable.map((sample) => sample.speed >= peak * SWEEP_THRESHOLD && sample.reachable);
    const runs = [];
    let from = -1;
    for (let i = 0; i <= flags.length; i += 1) {
      if (flags[i]) { if (from < 0) from = i; continue; }
      if (from >= 0) { runs.push([usable[from].time, usable[i - 1].time]); from = -1; }
    }
    console.log("  phases", runs
      .filter(([a, b]) => b - a >= 0.05)
      .map(([a, b]) => `${a.toFixed(3)}..${b.toFixed(3)}`).join("  "));
  }
  const live = longestRun(
    usable.map((sample) => sample.speed >= peak * SWEEP_THRESHOLD && sample.reachable),
    RUN_BRIDGE_SAMPLES,
  );
  if (live === null) return { animation: animationName, duration, peak, start: null, end: null };
  const first = usable[live.from];
  const last = usable[live.to];

  if (criticalFlag) {
    const weapon = weaponCapsule(WEAPON_ID);
    const victim = victimHurtbox(victimPack, VICTIM_CLIP, VICTIM_TIME, scale);
    // The attacker's own frame at the start of the clip: the pairing places the
    // victim relative to where the attacker *stands*, not to world axes.
    const anchor = samples[0].origin.clone().multiplyScalar(scale).setY(0);
    console.log(`  ${animationName}: ${WEAPON_ID} capsule vs a ${VICTIM_CLIP} hurtbox`);
    const rows = [];
    for (const separation of SEPARATIONS) {
      const placed = placeVictim(victim, anchor, forward, separation, VICTIM_FACING);
      // Depth per frame, then the *first* contiguous phase of it. A packaged
      // execution strikes three or four times; the game plays one, and it is
      // the first that the trim and the damage time belong to. Taking first and
      // last touch across the whole clip would span the entire sequence.
      // Surface-to-surface penetration of the victim's torso by the business
      // end of the weapon.
      //
      // Deliberately *not* the tighter "point inside the chest" test the visual
      // gate applies. This model has a static attacker, and a real execution
      // lunges — the two actors close during the clip by an amount that belongs
      // to the attack spec and the alignment easing, not to the animation. So
      // this measures what the clip itself can be held to (when the weapon
      // arrives, and how far out it still reaches), and the separation it
      // recommends is a starting point that the visual scenario then confirms.
      // Trying to make this the whole answer is what broke it against the known
      // answer: the audited one-handed execution does not satisfy the gate's
      // measure from a standing start either, because in play it lunges first.
      const depths = samples.map((sample) => {
        const blade = weaponSegment(sample, weapon, scale, EXECUTION_TIP_SHARE);
        let depth = -Infinity;
        for (const part of placed) {
          const gap = segmentDistance(blade.a, blade.b, part.a, part.b) - weapon.radius - part.radius;
          depth = Math.max(depth, -gap);
        }
        return depth;
      });
      const phases = contactPhases(depths, samples);
      if (process.env.CRITICAL_PHASES) {
        console.log(`    ${separation.toFixed(2)} phases`, phases
          .map((x) => `${x.opens.toFixed(3)}..${x.closes.toFixed(3)}@${x.depth.toFixed(3)}`).join(" "));
      }
      const phase = null;
      const closest = depths.reduce(
        (best, depth, i) => (depth > best.depth ? { depth, time: samples[i].time } : best),
        { depth: -Infinity, time: samples[0].time },
      );
      void phase;
      const hit = chooseStrike(phases);
      const verdict = hit === null
        ? `no contact (closest ${(-closest.depth).toFixed(3)} m at t=${closest.time.toFixed(4)}s)`
        : `contact ${hit.opens.toFixed(4)}..${hit.closes.toFixed(4)}s, deepest ${hit.depth.toFixed(3)} m at t=${hit.contact.toFixed(4)}s`;
      rows.push({ separation, hit });
      console.log(`    ${separation.toFixed(2)} m  ->  ${verdict}`);
    }

    // The recommendation: the *furthest* separation that still reaches the
    // torso. Furthest, not deepest, and the reason is the one the one-handed
    // audit gave — stand the pair closer than this and the blade is already
    // beside the victim while the entry blend is still running, which reads as
    // a hit that never lands. This rule reproduces that audit's own choice.
    // The recommendation, from the visual gate's own test.
    //
    // Everything above profiles the clip; this decides the two numbers that go
    // into the profile, and it does so with the exact measure that will judge
    // the result — does the grip-to-tip segment pass within
    // `maxAttackerBladeDistanceMeters` of the victim's spine or pelvis.
    //
    // Using the gate's measure rather than a proxy is what finally reconciled
    // this tool with the hand-audited execution. A penetration test against the
    // full hurtbox picks whichever phase first touches *any* body part, and for
    // the greatsword that is a shoulder graze at 1.45 s — while the moment the
    // blade actually goes into the chest is at 2.98 s. Only the gate's own
    // measure tells those apart.
    const torso = victimTorsoPoints(victimPack, VICTIM_CLIP, VICTIM_TIME, scale);
    console.log("    gate check (grip-to-tip vs spine and pelvis):");
    const gate = [];
    for (const separation of SEPARATIONS) {
      const points = placePoints(torso, anchor, forward, separation, VICTIM_FACING);
      let best = { distance: Infinity, time: 0 };
      let leaves = null;
      for (const sample of samples) {
        const blade = weaponSegment(sample, weapon, scale, 1);
        for (const point of points) {
          const distance = pointSegmentDistance(point, blade.a, blade.b);
          if (distance < best.distance) best = { distance, time: sample.time };
        }
      }
      for (const sample of samples) {
        if (sample.time <= best.time) continue;
        const blade = weaponSegment(sample, weapon, scale, 1);
        const distance = Math.min(...points.map((point) => pointSegmentDistance(point, blade.a, blade.b)));
        if (distance > GATE_RELEASE_METERS) { leaves = sample.time; break; }
      }
      gate.push({ separation, ...best, leaves });
      console.log(`      ${separation.toFixed(2)} m  ->  closest ${best.distance.toFixed(3)} m at t=${best.time.toFixed(4)}s`
        + (best.distance <= GATE_STANDING_LIMIT_METERS ? "   reaches" : ""));
    }

    const reaching = gate.filter((row) => row.distance <= GATE_STANDING_LIMIT_METERS);
    const pick = reaching[reaching.length - 1];
    if (!pick) {
      console.log("    -> no separation reaches the torso; this clip needs a different victim pose");
    } else {
      const release = pick.leaves ?? Math.min(duration, pick.time + 0.1);
      const start = Math.max(0, pick.time - CRITICAL_LEAD_IN_SECONDS);
      const end = Math.min(duration, pick.time + CRITICAL_TAIL_SECONDS);
      console.log(`    -> startingSeparation ${pick.separation.toFixed(2)}`
        + `, contact ${pick.time.toFixed(4)}s`
        + `, release ${release.toFixed(4)}s`);
      console.log(`       trim playbackStartTime ${start.toFixed(4)} playbackEndTime ${end.toFixed(4)}`
        + `  (contact at ${(pick.time - start).toFixed(4)}s into the trimmed clip,`
        + ` release at ${(release - start).toFixed(4)}s)`);
    }
  }

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

/**
 * The weapon's sensor capsule, by the same rule the runtime uses.
 *
 * `combat/hitVolume.hitCapsuleFor` on the item manifest's measured extents —
 * radius from the thickest cross-section with the sampling floor, length the
 * whole object, centred on it. Duplicated here rather than imported because
 * this script is plain Node with no bundler; the numbers are asserted equal by
 * `hitVolume.test.ts`, which reads the same manifest.
 */
function weaponCapsule(itemId) {
  const built = ARSENAL.items[itemId];
  if (!built) throw new Error(`no built weapon "${itemId}" in the item manifest`);
  const [width, height, length] = built.sizeMeters;
  const radius = Math.max(MIN_HIT_RADIUS_METERS, Math.max(width, height) / 2);
  return {
    radius,
    centerOffset: length / 2,
    halfLength: Math.max(0, length / 2 - radius),
  };
}
/** Keep in step with `combat/hitVolume.MIN_HIT_RADIUS_METERS`. */
const MIN_HIT_RADIUS_METERS = 0.055;

/**
 * The weapon capsule's two end points this frame, in world metres.
 *
 * `share` selects how much of it to use, measured back from the tip. A swing is
 * the whole weapon; an *execution* is the point of it. Testing an execution
 * against the whole capsule accepts a separation at which the middle of the
 * blade grazes a shoulder — which is contact, but it is not running somebody
 * through, and it renders as a weapon tip most of a metre from the body on the
 * damage frame. Restricting the test to the business end picks the distance at
 * which the thing that is supposed to go in, goes in.
 */
function weaponSegment(sample, capsule, scale, share = 1) {
  const tip = capsule.centerOffset + capsule.halfLength;
  const back = tip - (capsule.halfLength * 2 + capsule.radius * 2) * share;
  const near = new THREE.Vector3(0, 0, back / scale);
  const far = new THREE.Vector3(0, 0, tip / scale);
  return {
    a: near.applyMatrix4(sample.grip).multiplyScalar(scale),
    b: far.applyMatrix4(sample.grip).multiplyScalar(scale),
  };
}

/** How much of the weapon, measured back from the tip, executes. */
const EXECUTION_TIP_SHARE = 0.35;


/**
 * The victim's fitted hurtbox, posed in the clip the critical holds them in.
 *
 * The same per-bone capsules `SkeletalHurtbox` drives at runtime, from the same
 * manifest, so the volume being struck here is the volume that will be struck
 * in game. Returned in the victim's own frame with its feet at y=0.
 */
function victimTorsoPoints(pack, clipName, time, scale) {
  const { gltf, nodes, order } = pack;
  const clip = gltf.json.animations.find((entry) => entry.name === clipName);
  if (!clip) throw new Error(`no victim clip named ${clipName}`);
  poseAt(gltf, nodes, order, clip, time);
  const byName = new Map(nodes.map((node) => [node.name, node]));
  // The two points the visual gate measures against, and only those: it reads
  // `spine2` and `pelvis` off the victim's probe sample.
  return ["NPC Spine2 [Spn2]", "NPC Pelvis [Pelv]"].map((bone) => {
    const node = byName.get(sanitize(bone));
    if (!node) throw new Error(`the rig has no ${bone}`);
    return new THREE.Vector3().setFromMatrixPosition(node.world).multiplyScalar(scale);
  });
}

function victimHurtbox(pack, clipName, time, scale) {
  const { gltf, nodes, order } = pack;
  const clip = gltf.json.animations.find((entry) => entry.name === clipName);
  if (!clip) throw new Error(`no victim clip named ${clipName}`);
  poseAt(gltf, nodes, order, clip, time);
  const byName = new Map(nodes.map((node) => [node.name, node]));
  const parts = [];
  for (const segment of HURTBOX_SEGMENTS) {
    const bone = byName.get(sanitize(segment.bone));
    if (!bone) continue;
    // Torso and head only.
    //
    // A full-body hurtbox includes arms and legs, and over a four-second
    // execution a sword sweeps through a limb repeatedly — which reports the
    // blade as "in contact" for more than a second and gives no usable moment
    // to hang the damage on. An execution is a blow to the body; the arms are
    // what the victim is failing to defend with.
    if (!TORSO_BONES.some((part) => segment.bone.includes(part))) continue;
    const a = new THREE.Vector3().fromArray(segment.from).applyMatrix4(bone.world).multiplyScalar(scale);
    const b = new THREE.Vector3().fromArray(segment.to).applyMatrix4(bone.world).multiplyScalar(scale);
    parts.push({ a, b, radius: segment.radius });
  }
  if (parts.length === 0) throw new Error("the manifest has no hurtbox segments to pose");
  return parts;
}

/** The bones an execution is aimed at. Matched by substring on the rig names. */
const TORSO_BONES = ["Spine", "Pelvis", "Head", "Clavicle"];

/** Distance from a point to a segment, as the visual gate computes it. */
function pointSegmentDistance(point, a, b) {
  const ab = b.clone().sub(a);
  const lengthSq = ab.lengthSq();
  if (lengthSq < 1e-12) return point.distanceTo(a);
  const t = clamp01(point.clone().sub(a).dot(ab) / lengthSq);
  return point.distanceTo(a.clone().addScaledVector(ab, t));
}

/** The same placement as `placeVictim`, for bare points. */
function placePoints(points, anchor, forward, separation, facing) {
  const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), facing);
  const centre = anchor.clone().addScaledVector(forward, separation);
  return points.map((point) => point.clone().applyQuaternion(turn).add(centre));
}

/** Stand the posed victim `separation` metres ahead of the attacker, turned. */
function placeVictim(parts, anchor, forward, separation, facing) {
  const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), facing);
  const centre = anchor.clone().addScaledVector(forward, separation);
  const move = (point) => point.clone().applyQuaternion(turn).add(centre);
  return parts.map((part) => ({ a: move(part.a), b: move(part.b), radius: part.radius }));
}

/**
 * Shortest distance between two capsule axes, metres.
 *
 * The standard clamped segment-segment solve. Capsule overlap is then this
 * minus the two radii, which is exactly the test Rapier runs on the sensors.
 */
function segmentDistance(p1, q1, p2, q2) {
  const d1 = q1.clone().sub(p1);
  const d2 = q2.clone().sub(p2);
  const r = p1.clone().sub(p2);
  const a = d1.dot(d1);
  const e = d2.dot(d2);
  const f = d2.dot(r);
  let s;
  let t;
  if (a <= 1e-9 && e <= 1e-9) return r.length();
  if (a <= 1e-9) { s = 0; t = clamp01(f / e); }
  else {
    const c = d1.dot(r);
    if (e <= 1e-9) { t = 0; s = clamp01(-c / a); }
    else {
      const b = d1.dot(d2);
      const denom = a * e - b * b;
      s = denom > 1e-9 ? clamp01((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp01(-c / a); }
      else if (t > 1) { t = 1; s = clamp01((b - c) / a); }
    }
  }
  return p1.clone().addScaledVector(d1, s).sub(p2.clone().addScaledVector(d2, t)).length();
}

const clamp01 = (value) => Math.min(1, Math.max(0, value));

/** Distance from a blade point to the victim's torso capsule, metres. */
function victimDistance(point, startPelvis, forward, separation) {
  const cx = startPelvis.x + forward.x * separation;
  const cz = startPelvis.z + forward.z * separation;
  const height = Math.min(VICTIM.high, Math.max(VICTIM.low, point.y));
  const radial = Math.hypot(point.x - cx, point.z - cz);
  return Math.hypot(radial, point.y - height) - VICTIM.radius;
}

/** Every contiguous run of penetration, with when and how deep it got. */
function contactPhases(depths, samples) {
  const phases = [];
  let from = -1;
  for (let i = 0; i <= depths.length; i += 1) {
    if (depths[i] >= 0) { if (from < 0) from = i; continue; }
    if (from < 0) continue;
    let deepest = from;
    for (let j = from; j < i; j += 1) if (depths[j] > depths[deepest]) deepest = j;
    phases.push({
      opens: samples[from].time,
      closes: samples[i - 1].time,
      contact: samples[deepest].time,
      depth: depths[deepest],
    });
    from = -1;
  }
  return phases;
}

/**
 * Which penetration is *the* strike.
 *
 * Not simply the first. A long execution brushes its victim in passing — the
 * one-handed clip's hand audit rejected exactly such a moment, "the source
 * 0.10s stray blade pass", before settling on the real one. A brush is shallow
 * and brief; a strike drives in. So: the first phase that both lasts a while
 * and gets at least halfway to the deepest penetration anywhere in the clip.
 */
function chooseStrike(phases) {
  if (phases.length === 0) return null;
  const deepest = Math.max(...phases.map((phase) => phase.depth));
  const solid = phases.filter((phase) =>
    phase.depth >= deepest * STRIKE_DEPTH_SHARE
    && phase.closes - phase.opens >= STRIKE_MINIMUM_SECONDS);
  return solid[0] ?? phases.reduce((a, b) => (b.depth > a.depth ? b : a));
}

/** A strike drives at least this far in, relative to the clip's deepest. */
const STRIKE_DEPTH_SHARE = 0.5;
/**
 * And lasts at least this long. About one frame of the 30 Hz source.
 *
 * Calibrated on the known answer: the one-handed execution brushes its victim
 * for 17 ms and again for 8 ms before driving in for 50 ms at the moment the
 * hand audit selected. This separates them with room to spare either side.
 */
const STRIKE_MINIMUM_SECONDS = 0.03;

/**
 * How close the blade has to come *from a standing start* to count as reaching.
 *
 * Looser than the gate's own 0.25 m, and the difference is not slack — it is
 * the distance the two actors close during the execution itself, which this
 * static model does not have. A critical lunges: the attacker translates toward
 * the victim over the clip, and the gate measures the result. Calibrated on the
 * known answer: the audited one-handed execution measures 0.403 m here at the
 * separation it ships with, and passes the 0.25 m gate in play.
 */
const GATE_STANDING_LIMIT_METERS = 0.41;
/** Once the blade is this far off again, the alignment can be released. */
const GATE_RELEASE_METERS = 0.6;

/** Anticipation and follow-through kept around a critical's contact, seconds. */
const CRITICAL_LEAD_IN_SECONDS = 0.4;
const CRITICAL_TAIL_SECONDS = 0.733;

/**
 * Longest run of true, allowing runs to be joined across up to `bridge` false.
 * With `first`, returns the first such run instead of the longest — which is
 * what a multi-hit execution wants, since the game plays only its opening hit.
 */
function longestRun(flags, bridge, first = false) {
  let best = null;
  let from = -1;
  let last = -1;
  for (let i = 0; i < flags.length; i += 1) {
    if (!flags[i]) continue;
    if (from < 0 || i - last > bridge + 1) {
      if (from >= 0) {
        if (first) return { from, to: last };
        if (best === null || last - from > best.to - best.from) best = { from, to: last };
      }
      from = i;
    }
    last = i;
  }
  if (from >= 0 && (best === null || last - from > best.to - best.from)) best = { from, to: last };
  return best;
}

const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
const ARSENAL = JSON.parse(await readFile(ARSENAL_MANIFEST, "utf8"));
const HURTBOX_SEGMENTS = manifest.hurtbox?.segments ?? [];
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

/**
 * Critical mode: where a paired execution actually lands.
 *
 * A packaged Rim execution is a three- or four-hit sequence and the game plays
 * one hit of it, so a `PairedCriticalProfile` needs numbers no sweep test can
 * give: which phase to trim to, when to deal the damage, when to release the
 * alignment, and how far apart to stand the two actors.
 *
 * The first attempt at this approximated both bodies — a straight line from the
 * weapon socket against a guessed torso cylinder — and could not be reconciled
 * with the one execution that had been audited by hand. Approximating was the
 * mistake. This models **exactly the two volumes the game collides**:
 *
 *   - the attacker's weapon capsule, built by the same rule the runtime uses
 *     (`combat/hitVolume.hitCapsuleFor` on the item manifest's measured mesh
 *     extents), riding the Weapon socket through the rig's grip convention;
 *   - the victim's own skeleton-fitted hurtbox — the manifest's per-bone
 *     capsules, posed in the victim clip the critical actually holds them in,
 *     placed at the candidate separation and facing.
 *
 * So "contact" is not a proxy for what the game will do. It is what the game
 * will do, and the known-answer check is that the shipped, owner-approved
 * one-handed riposte connects at its audited separation and time.
 *
 * Usage:
 *   node scripts/measure-contact-windows.mjs --critical RIPOSTE
 *   node scripts/measure-contact-windows.mjs --critical --weapon steel-greatsword \
 *        --victim-clip GUARD_BREAK --victim-time 0.55 GREATSWORD_RIPOSTE
 */
const criticalFlag = process.argv.includes("--critical");
const flagValue = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
/** Which built weapon's volume to swing. Its measured extents set the capsule. */
const WEAPON_ID = flagValue("--weapon", "steel-sword");
/**
 * The victim's pose during the attacker's approach.
 *
 * An event-driven execution holds its victim in a vulnerable stance until the
 * attacker's contact annotation dispatches the reaction, so the pose that has
 * to be *reached* is the lead-in one. Defaults match the one-handed riposte
 * profile's `victimLeadIn`.
 */
const VICTIM_CLIP = flagValue("--victim-clip", "GUARD_BREAK");
const VICTIM_TIME = Number(flagValue("--victim-time", "0.55"));
/** Half turn: a riposte faces its victim. Pass 0 for a backstab. */
const VICTIM_FACING = Number(flagValue("--facing", String(Math.PI)));
const SEPARATIONS = [0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.6, 1.8, 2.0];

/** Flags that consume the argument after them, so it is not a clip name. */
const VALUE_FLAGS = new Set(["--blade", "--weapon", "--victim-clip", "--victim-time", "--facing"]);
const clips = process.argv.slice(2).filter((arg, i, all) =>
  !arg.startsWith("--") && !VALUE_FLAGS.has(all[i - 1]));
const wanted = clips.length > 0
  ? clips
  : ["LIGHT_1", "LIGHT_2", "LIGHT_3", "HEAVY", "HEAVY_2"];

console.log(`blade ${BLADE_LENGTH} m`);
console.log("clip                     dur    sweep start..end (fraction)   seconds        peak tip m/s");
for (const name of wanted) {
  const { gltf, nodes, order } = await packFor(name);
  // The victim's clip lives in whichever pack carries it, which is rarely the
  // attacker's — a guard-break stagger is core, not criticals.
  const victimPack = criticalFlag ? await packFor(VICTIM_CLIP) : null;
  const result = measure(gltf, nodes, order, name, socketRotation, scale, victimPack);
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
