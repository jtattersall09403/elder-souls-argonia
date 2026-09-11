import { createHash } from "node:crypto";
import { open, readFile } from "node:fs/promises";

const publicUrl = (path) => new URL(`./files/${path}`, import.meta.url);
const binaryCache = new Map();
const jsonCache = new Map();

async function readBinary(path) {
  let pending = binaryCache.get(path);
  if (!pending) {
    pending = readFile(publicUrl(path));
    binaryCache.set(path, pending);
  }
  return pending;
}

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
  const actual = createHash("sha256").update(await readBinary(path)).digest("hex");
  if (actual !== expectedSha) {
    throw new Error(`files/${path} does not match its manifest: expected ${expectedSha}, got ${actual}`);
  }
}

/** Parsed JSON chunk from a binary glTF. */
async function readGltfJson(path) {
  let pending = jsonCache.get(path);
  if (!pending) {
    pending = readBinary(path).then((buffer) => {
      const chunkLength = buffer.readUInt32LE(12);
      return JSON.parse(buffer.subarray(20, 20 + chunkLength).toString("utf8"));
    });
    jsonCache.set(path, pending);
  }
  return pending;
}

async function embeddedImageHash(path, json, imageIndex) {
  const buffer = await readBinary(path);
  const jsonLength = buffer.readUInt32LE(12);
  const binaryStart = 20 + jsonLength + 8;
  const image = json.images?.[imageIndex];
  const view = json.bufferViews?.[image?.bufferView];
  if (!view) throw new Error(`files/${path} image ${imageIndex} is not embedded`);
  const start = binaryStart + (view.byteOffset ?? 0);
  return createHash("sha256").update(buffer.subarray(start, start + view.byteLength)).digest("hex");
}

/** Node names and skin joint names out of a GLB's JSON chunk. */
async function readGltfNames(path) {
  const json = await readGltfJson(path);
  const nodes = (json.nodes ?? []).map((node) => node.name);
  const joints = new Set();
  for (const skin of json.skins ?? []) {
    for (const index of skin.joints) joints.add(nodes[index]);
  }
  return { nodes: new Set(nodes), joints };
}

function meshBounds(json, node) {
  const primitives = json.meshes?.[node.mesh]?.primitives ?? [];
  const bounds = primitives.map((primitive) => (
    json.accessors?.[primitive.attributes?.POSITION]
  )).filter((accessor) => accessor?.min && accessor?.max);
  if (bounds.length === 0) throw new Error(`${node.name} has no position bounds`);
  return {
    min: [0, 1, 2].map((axis) => Math.min(...bounds.map((accessor) => accessor.min[axis]))),
    max: [0, 1, 2].map((axis) => Math.max(...bounds.map((accessor) => accessor.max[axis]))),
  };
}

function boundsCentre(bounds) {
  return bounds.min.map((value, axis) => (value + bounds.max[axis]) / 2);
}

/**
 * FaceGen exports contain both armature-space and head-local shapes. A bad
 * conversion can still be a valid, correctly hashed GLB while placing its
 * skull above the neck and leaving the eyes and mouth behind. Prove the final
 * shipped geometry is one assembled face for every race.
 */
async function assertAssembledFace(id, path, appearance) {
  const json = await readGltfJson(path);
  const meshNodes = (json.nodes ?? []).filter((node) => node.mesh !== undefined);
  const one = (label, predicate) => {
    const matches = meshNodes.filter(predicate);
    if (matches.length !== 1) {
      throw new Error(`Race ${id} must ship one ${label} mesh; found ${matches.map((node) => node.name).join(", ") || "none"}`);
    }
    return matches[0];
  };
  const bodyNode = one("body", (node) => node.name?.includes("UnderwearBody"));
  const body = meshBounds(json, bodyNode);
  const head = meshBounds(json, one("FaceGen head", (node) => node.name?.includes("Head") && !node.name.includes("Hair")));
  const eyes = meshBounds(json, one("FaceGen eyes", (node) => node.name?.includes("Eyes")));
  const mouth = meshBounds(json, one("FaceGen mouth", (node) => node.name?.includes("Mouth")));

  const hairTintMeshes = new Set(appearance?.hairMeshes ?? []);
  for (const node of meshNodes.filter((candidate) => candidate.name?.startsWith("Brows"))) {
    if (!hairTintMeshes.has(node.name)) {
      throw new Error(`Race ${id} brow ${node.name} is missing from its HairTint meshes`);
    }
  }
  for (const node of meshNodes.filter((candidate) => hairTintMeshes.has(candidate.name))) {
    for (const primitive of json.meshes?.[node.mesh]?.primitives ?? []) {
      const material = json.materials?.[primitive.material];
      if (material?.alphaMode !== "MASK" || material.alphaCutoff !== 0.5) {
        throw new Error(`Race ${id} HairTint head part ${node.name} is not a 0.5-cutoff alpha mask`);
      }
    }
  }

  if (head.min[1] > body.max[1] + 0.02) {
    throw new Error(`Race ${id} FaceGen head floats ${Number(head.min[1] - body.max[1]).toFixed(3)} rig units above its body`);
  }
  for (const node of meshNodes.filter((candidate) => candidate.name?.startsWith("Marks"))) {
    for (const primitive of json.meshes?.[node.mesh]?.primitives ?? []) {
      const material = json.materials?.[primitive.material];
      if (!material || material.alphaMode === undefined || material.alphaMode === "OPAQUE") {
        throw new Error(`Race ${id} FaceGen overlay ${node.name} is opaque`);
      }
    }
  }
  for (const [label, feature] of [["eyes", eyes], ["mouth", mouth]]) {
    const centre = boundsCentre(feature);
    const outside = centre.some((value, axis) => value < head.min[axis] - 0.1 || value > head.max[axis] + 0.1);
    if (outside) {
      throw new Error(`Race ${id} ${label} centre lies outside its FaceGen head`);
    }
  }
  const primitive = json.meshes?.[bodyNode.mesh]?.primitives?.[0];
  const textureIndex = json.materials?.[primitive?.material]?.pbrMetallicRoughness?.baseColorTexture?.index;
  const imageIndex = json.textures?.[textureIndex]?.source;
  if (imageIndex === undefined) throw new Error(`Race ${id} body has no embedded diffuse`);
  return embeddedImageHash(path, json, imageIndex);
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
// Builds, not races: a race is lore and carries no asset (decision 0054).
const races = Object.entries(roster.builds ?? {});
if (races.length === 0) throw new Error("Race roster declares no character builds");
const bodyTextureHashes = new Map();
for (const [id, race] of races) {
  if (typeof race.asset !== "string") throw new Error(`Race ${id} is missing its asset path`);
  await assertMatchingGltf(race.asset, race.sha256);
  bodyTextureHashes.set(id, await assertAssembledFace(id, race.asset, race.appearance));
}
for (const beast of Object.keys(roster.builds ?? {}).filter((id) => /^(khajiit|argonian)-/.test(id))) {
  const human = `nord-${beast.split("-").slice(1).join("-")}`;
  if (bodyTextureHashes.get(beast) === bodyTextureHashes.get(human)) {
    throw new Error(`Race ${beast} still ships the generic human body diffuse`);
  }
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
if (armoury.schemaVersion !== 2) {
  throw new Error(`Armour manifest is schemaVersion ${armoury.schemaVersion}, expected 2`);
}
// One GLB per sex, because Bethesda authored two and a woman in a man's cuirass
// has a hole between her head and her collar (decision 0056). Both are checked,
// and both against their recorded hash: a half-installed rebuild that leaves the
// female half stale is exactly the failure the sexes were split to remove.
let armourBuilds = 0;
for (const [id, piece] of pieces) {
  if (typeof piece.icon !== "string") {
    throw new Error(`Armour piece ${id} is missing its icon path`);
  }
  await assertReadable(piece.icon);
  const assets = Object.entries(piece.assets ?? {});
  if (assets.length !== roster.sexes.length) {
    throw new Error(
      `Armour piece ${id} ships ${assets.length} asset(s) for ${roster.sexes.length} sexes`,
    );
  }
  for (const [sex, asset] of assets) {
    if (typeof asset !== "string") {
      throw new Error(`Armour piece ${id} is missing its ${sex} asset path`);
    }
    await assertMatchingGltf(asset, piece.sha256?.[sex]);
    if (!Array.isArray(piece.coversBipedSlots?.[sex])) {
      throw new Error(`Armour piece ${id} declares no ${sex} biped coverage`);
    }
    armourBuilds += 1;
    // Mounting rebinds the piece onto the wearer's skeleton by bone name, so a
    // joint the bodies do not have makes the piece unwearable — invisible in
    // game and impossible to diagnose from the symptom. Importing an armour NIF
    // adds bones for unknown skin partitions, and Bethesda ships truncated
    // names, so this has happened and will happen again.
    const { joints } = await readGltfNames(asset);
    const stray = [...joints].filter((joint) => !rigBones.has(joint));
    if (stray.length > 0) {
      throw new Error(
        `Armour piece ${id} (${sex}) is skinned to ${stray.join(", ")}, which no race body `
        + "has. Rebuild it: pipeline/build_armour.py folds stray bones back onto the rig.",
      );
    }
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
  + `${pieces.length} armour pieces (${armourBuilds} builds) and ${shafts.length} arrows`,
);
