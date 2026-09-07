import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { AnimationMixer, Group, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { ARSENAL_BLUEPRINT_WEAPONS } from "../../../packages/game-core/src/equipment/arsenalBlueprints";
import { ANIMATION_PACKS, CHARACTER_SCALE, clipConfig } from "../../../packages/game-core/src/anim/animationManifest";
import { DEFAULT_RACE, raceById } from "../../../packages/game-core/src/actors/races";
import { groundTrackAt, localMotionToWorld } from "../../../packages/game-core/src/locomotion/footAnchoredMotion";
import { measureHeldObject, hitCapsuleFor } from "../../../packages/game-core/src/combat/hitVolume";
import { capsulePlanarReach } from "../../../packages/game-core/src/combat/weaponReach";

import { applyWeaponSocketTransform } from "../../../packages/game-core/src/anim/weaponMount";

const ROOT = process.cwd();
const ASSETS = resolve(ROOT, "packages/character-assets/files");
const OUTPUT = resolve(ROOT, "packages/game-core/src/equipment/generated/weapon-reach.json");
const ATTACKS = ["light1", "light2", "light3", "heavy", "heavy2", "riposte", "backstab"] as const;
const HZ = 240;
const hashes: Record<string, string> = {};
const digest = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");
// Node's data-URI loader needs this event type; no browser or image decoding.
(globalThis as any).ProgressEvent ??= class { constructor(public type: string, public options: unknown) {} };
async function load(asset: string) {
  const bytes = await readFile(resolve(ASSETS, asset));
  hashes[asset] = digest(bytes);
  const length = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + length).toString());
  const binary = bytes.subarray(28 + length);
  // Keep source geometry, skins and animations; textures are irrelevant here.
  json.images = []; json.textures = []; json.materials = [];
  for (const mesh of json.meshes ?? []) for (const primitive of mesh.primitives) delete primitive.material;
  json.buffers[0].uri = `data:application/octet-stream;base64,${binary.toString("base64")}`;
  return new GLTFLoader().parseAsync(JSON.stringify(json), "");
}

const race = raceById(DEFAULT_RACE);
const rig = await load(race.asset);
const root = new Group(); root.scale.setScalar(CHARACTER_SCALE); root.add(rig.scene);
root.updateMatrixWorld(true);
const mixer = new AnimationMixer(root);
const packs = new Map<string, Awaited<ReturnType<typeof load>>>();
const weapons: Record<string, unknown> = {};
const round = (v: number) => Number(v.toFixed(6));
const inputs: unknown[] = [];
for (const weapon of Object.values(ARSENAL_BLUEPRINT_WEAPONS)) {
  if (weapon.stats.ranged) continue;
  const gltf = await load(weapon.visual.asset);
  const box = measureHeldObject(gltf.scene), capsule = hitCapsuleFor(box);
  // The manifest rounds dimensions to five decimal places. Detect stale
  // display length/geometry as well as stale attack measurements.
  if ([box.width, box.height, box.length].some((v, i) => Math.abs(v - weapon.visual.sizeMeters[i]) > 0.00001)) {
    throw Error(`Mesh dimensions disagree with the item manifest: ${weapon.id}`);
  }
  const socket = rig.scene.getObjectByName(weapon.visual.held.socket);
  if (!socket) throw Error(`Missing socket ${weapon.visual.held.socket}`);
  mixer.stopAllAction(); root.updateMatrixWorld(true);
  const mount = new Group();
  applyWeaponSocketTransform(mount, socket, weapon.visual.held);
  socket.add(mount); mount.add(gltf.scene);
  const attacks: Record<string, unknown> = {};
  for (const id of ATTACKS) {
    const attack = weapon.attacks[id], config = clipConfig(attack.animation);
    const packId = config.pack ?? "core";
    if (!packs.has(packId)) packs.set(packId, await load(ANIMATION_PACKS[packId].asset));
    const clip = packs.get(packId)!.animations.find(c => c.name === attack.animation);
    if (!clip) throw Error(`Missing ${attack.animation}`);
    mixer.stopAllAction();
    const action = mixer.clipAction(clip); action.reset().play(); action.paused = true;
    const start = config.playbackStartTime ?? 0;
    const end = config.playbackEndTime ?? clip.duration;
    const motionOrigin = groundTrackAt(attack.animation, start);
    let best = { range: 0, stationaryRange: 0, atSeconds: 0, sourceTime: 0 };
    let maxStationaryRange = 0;
    const count = Math.max(1, Math.ceil(attack.active * HZ));
    for (let i = 0; i < count; i++) {
      const elapsed = attack.windup + i * attack.active / count;
      const time = Math.min(end, start + elapsed * config.playbackRate / (attack.timeScale || 1));
      action.time = time; mixer.update(0); root.updateMatrixWorld(true);
      const a = new Vector3(0, 0, capsule.centerOffset - capsule.halfLength).applyMatrix4(mount.matrixWorld);
      const b = new Vector3(0, 0, capsule.centerOffset + capsule.halfLength).applyMatrix4(mount.matrixWorld);
      const stationaryRange = capsulePlanarReach(a, b, capsule.radius);
      maxStationaryRange = Math.max(maxStationaryRange, stationaryRange);
      // Same clock as production footAnchoredVelocity. Native ground track
      // uses +X lateral and +Z forward in the exported rig; character yaw
      // rotates both at runtime. Blender track -Y is already converted by groundTrackAt.
      const motion = groundTrackAt(attack.animation, start + elapsed * config.playbackRate);
      const displacement = localMotionToWorld({ lateral: motion.lateral - motionOrigin.lateral,
        forward: motion.forward - motionOrigin.forward }, { x: 0, z: 1 });
      const travel = new Vector3(displacement.x, 0, displacement.z);
      // Paired criticals use their authored alignment, not free attack travel.
      if (id !== "riposte" && id !== "backstab") { a.add(travel); b.add(travel); }
      const range = capsulePlanarReach(a, b, capsule.radius);
      if (range > best.range) best = { range, stationaryRange, atSeconds: elapsed, sourceTime: time };
    }
    best.stationaryRange = maxStationaryRange;
    attacks[id] = { animation: attack.animation,
      activeSourceWindow: [attack.windup, attack.windup + attack.active].map(t => round(Math.min(end, start + t * config.playbackRate / (attack.timeScale || 1)))),
      ...Object.fromEntries(Object.entries(best).map(([k,v]) => [k, round(v)])) };
    const { range: _range, measuredReach: _measured, ...definition } = attack;
    inputs.push({ weapon: weapon.id, id, definition, config, mount: weapon.visual.held });
  }
  weapons[weapon.id] = { lengthMeters: round(box.length), attacks };
  socket.remove(mount); mixer.stopAllAction();
}
const manifestBytes = await readFile(resolve(ROOT,"packages/game-core/src/anim/generated/rig-skyrim-humanoid.animations.json"));
const result = { schemaVersion: 1, method: "active-capsule-horizontal-extent-v1", sampleHz: HZ,
  reference: { race: DEFAULT_RACE, characterScale: CHARACTER_SCALE, origin: "starting actor axis", targetRadius: 0,
    criticals: "stationary weapon extent; entry limits remain paired choreography" },
  provenance: { inputsSha256: digest(JSON.stringify(inputs)), animationManifestSha256: digest(manifestBytes), assets: hashes }, weapons };
const serialized = JSON.stringify(result, null, 2) + "\n";
if (process.argv.includes("--check")) {
  if (await readFile(OUTPUT,"utf8") !== serialized) throw Error("Weapon reach is stale; run npm run weapons:reach");
  console.log(`Verified measured reach for ${Object.keys(weapons).length} weapons and ${inputs.length} attacks.`);
} else {
  await writeFile(OUTPUT, serialized);
  console.log(`Baked ${Object.keys(weapons).length} weapons and ${inputs.length} attacks.`);
}
