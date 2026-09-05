import { createHash } from "node:crypto";
import { open, readFile } from "node:fs/promises";

const publicUrl = (path) => new URL(`./files/${path}`, import.meta.url);

async function assertBinaryGltf(path) {
  let handle;
  try {
    handle = await open(publicUrl(path), "r");
    const magic = Buffer.alloc(4);
    const { bytesRead } = await handle.read(magic, 0, 4, 0);
    if (bytesRead !== 4 || magic.toString("ascii") !== "glTF") {
      throw new Error("not a binary glTF file");
    }
  } catch (error) {
    throw new Error(`Required tracked runtime asset is missing or invalid: files/${path}`, { cause: error });
  } finally {
    await handle?.close();
  }
}

/**
 * A valid GLB header is not enough. The animation manifest holds time-indexed
 * support curves and a fitted hurtbox measured from one exact binary, so a
 * staged/working-tree mismatch has to fail before Vite can produce a build that
 * is subtly wrong rather than obviously broken.
 */
async function assertMatchingGltf(path, expectedSha) {
  await assertBinaryGltf(path);
  if (typeof expectedSha !== "string" || !/^[a-f0-9]{64}$/.test(expectedSha)) {
    throw new Error(`files/${path} has no valid recorded sha256`);
  }
  const actual = createHash("sha256").update(await readFile(publicUrl(path))).digest("hex");
  if (actual !== expectedSha) {
    throw new Error(`files/${path} does not match its manifest: expected ${expectedSha}, got ${actual}`);
  }
}

/** Node names and skin joint names out of a GLB's JSON chunk. */
async function readGltfNames(path) {
  const buffer = await readFile(publicUrl(path));
  const chunkLength = buffer.readUInt32LE(12);
  const json = JSON.parse(buffer.subarray(20, 20 + chunkLength).toString("utf8"));
  const nodes = (json.nodes ?? []).map((node) => node.name);
  const joints = new Set();
  for (const skin of json.skins ?? []) {
    for (const index of skin.joints) joints.add(nodes[index]);
  }
  return { nodes: new Set(nodes), joints };
}

async function assertReadable(path) {
  try {
    await readFile(publicUrl(path));
  } catch (error) {
    throw new Error(`Required tracked runtime asset is missing: files/${path}`, { cause: error });
  }
}

// The deployment assets are intentionally versioned: GitHub Pages builds from a
// clean checkout and cannot recreate owned Skyrim-derived binaries. Fail before
// TypeScript/Vite if a future change accidentally drops one.
//
// A character is two downloads: one rig carrying the skeleton and every clip,
// and one body per race. Both halves must be present and must be the exact
// binaries their manifests describe, or a race renders posed by clips that were
// measured against a different skeleton.
const roster = JSON.parse(await readFile(
  new URL("../game-core/src/actors/generated/races.json", import.meta.url),
  "utf8",
));
await assertMatchingGltf(roster.rig.asset, roster.rig.sha256);

// The rig ships as one GLB per animation pack — a core set every actor loads
// plus one per weapon family, fetched on demand. A missing or stale pack is not
// a cosmetic gap: the actor suspends forever waiting for a clip, or worse binds
// a moveset measured against a different build. Check every one against the
// hash the animation manifest recorded for it.
const animations = JSON.parse(await readFile(
  new URL("../game-core/src/anim/generated/rig-skyrim-humanoid.animations.json", import.meta.url),
  "utf8",
));
const packs = Object.entries(animations.packs ?? {});
if (packs.length === 0) throw new Error("Animation manifest declares no packs");
const packedClips = new Set();
for (const [id, pack] of packs) {
  if (typeof pack.asset !== "string") throw new Error(`Animation pack ${id} is missing its asset path`);
  await assertMatchingGltf(pack.asset, pack.sha256);
  for (const clip of pack.clips ?? []) packedClips.add(clip);
}
// Every semantic state the game can ask for must live in exactly one shipped
// pack. A clip in the manifest but in no pack is one the runtime would ask a
// mixer for and silently never get.
const unpacked = Object.keys(animations.animations ?? {}).filter((clip) => !packedClips.has(clip));
if (unpacked.length > 0) {
  throw new Error(`Animation manifest declares clips that ship in no pack: ${unpacked.join(", ")}`);
}
const races = Object.entries(roster.races ?? {});
if (races.length === 0) throw new Error("Race roster declares no races");
for (const [id, race] of races) {
  if (typeof race.asset !== "string") throw new Error(`Race ${id} is missing its asset path`);
  await assertMatchingGltf(race.asset, race.sha256);
}

// Every bone any race body offers. Armour is rebound onto these by name.
const rigBones = new Set();
for (const [, race] of races) {
  for (const name of (await readGltfNames(race.asset)).nodes) rigBones.add(name);
}

// Every item the game can reference must actually be deployed. The arsenal
// manifest is generated beside the GLBs it describes, so checking it here
// catches a partial copy long before a player clicks an empty inventory cell.
const arsenal = JSON.parse(await readFile(
  new URL("../game-core/src/equipment/generated/arsenal.items.json", import.meta.url),
  "utf8",
));
const items = Object.entries(arsenal.items ?? {});
if (items.length === 0) throw new Error("Arsenal manifest declares no items");
for (const [id, item] of items) {
  if (typeof item.asset !== "string" || typeof item.icon !== "string") {
    throw new Error(`Arsenal item ${id} is missing its asset or icon path`);
  }
  await assertBinaryGltf(item.asset);
  await assertReadable(item.icon);
}

// Armour is skinned to the same rig, so a missing piece is not a cosmetic gap:
// the wearer's own body meshes are hidden underneath it and the actor would
// render with a hole where the cuirass should be.
const armoury = JSON.parse(await readFile(
  new URL("../game-core/src/equipment/generated/armour.items.json", import.meta.url),
  "utf8",
));
const pieces = Object.entries(armoury.items ?? {});
if (pieces.length === 0) throw new Error("Armour manifest declares no pieces");
for (const [id, piece] of pieces) {
  if (typeof piece.asset !== "string" || typeof piece.icon !== "string") {
    throw new Error(`Armour piece ${id} is missing its asset or icon path`);
  }
  await assertBinaryGltf(piece.asset);
  await assertReadable(piece.icon);
  // Mounting rebinds the piece onto the wearer's skeleton by bone name, so a
  // joint the bodies do not have makes the piece unwearable — invisible in game
  // and impossible to diagnose from the symptom. Importing an armour NIF adds
  // bones for unknown skin partitions, and Bethesda ships truncated names, so
  // this has happened and will happen again.
  const { joints } = await readGltfNames(piece.asset);
  const stray = [...joints].filter((joint) => !rigBones.has(joint));
  if (stray.length > 0) {
    throw new Error(
      `Armour piece ${id} is skinned to ${stray.join(", ")}, which no race body has. `
      + "Rebuild it: pipeline/build_armour.py folds stray bones back onto the rig.",
    );
  }
}

// Arrows are their own set: one mesh per material, which the game composes
// into shaft archetypes. A missing one is an invisible projectile.
const quiver = JSON.parse(await readFile(
  new URL("../game-core/src/equipment/generated/arrows.items.json", import.meta.url),
  "utf8",
));
const shafts = Object.entries(quiver.items ?? {});
if (shafts.length === 0) throw new Error("Arrow manifest declares no arrows");
for (const [id, shaft] of shafts) {
  if (typeof shaft.asset !== "string" || typeof shaft.icon !== "string") {
    throw new Error(`Arrow ${id} is missing its asset or icon path`);
  }
  await assertBinaryGltf(shaft.asset);
  await assertReadable(shaft.icon);
  // The worn half. A missing quiver is an archer drawing arrows out of thin
  // air, which is exactly the defect the quiver was added to fix.
  if (typeof shaft.quiver === "string") await assertBinaryGltf(shaft.quiver);
}

console.log(
  `verified ${packs.length} animation packs, ${races.length} race bodies, ${items.length} arsenal items, `
  + `${pieces.length} armour pieces and ${shafts.length} arrows`,
);
