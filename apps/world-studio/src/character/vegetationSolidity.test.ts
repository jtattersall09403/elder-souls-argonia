/**
 * End-to-end trunk-solidity proof, in the real physics engine.
 *
 * Loads the SHIPPED kit manifest and the SHIPPED vegetation bundle for the
 * chunk the owner reported walking through trunks in (Phase 10 round 10,
 * 4.12 km E · 4.51 km S), builds Rapier bodies exactly as
 * `VegetationColliders` does (same quaternion composition, same scaling),
 * then samples the trees' actual wood-mesh surfaces out of the shipped GLB
 * and asserts the physics world contains them. This is the check the owner
 * otherwise does by walking into trees: if it goes red, trunks are
 * walk-through again — fix the kit post-pass (`pipeline/trunk_solids.py`)
 * or the body construction, not this test.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import {
  collidersFor,
  isSolid,
  type FloraCollisionAsset,
} from "@elder-souls/game-core/physics/floraSolids";

const PUBLIC = join(__dirname, "../../public");
const FOCUS = { x: 4120, z: 4510 };
const RING_M = 30;

interface Instance {
  species: string; x: number; y: number; z: number;
  yaw: number; scale: number; tiltX: number; tiltZ: number;
}

function decodeBundle(buffer: Buffer, speciesOrder: string[]): Instance[] {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const groups = view.getUint32(8, true);
  const headers: { index: number; count: number; scaleMin: number; scaleMax: number }[] = [];
  let offset = 12;
  for (let i = 0; i < groups; i++) {
    headers.push({
      index: view.getUint32(offset, true),
      count: view.getUint32(offset + 4, true),
      scaleMin: view.getFloat32(offset + 8, true),
      scaleMax: view.getFloat32(offset + 12, true),
    });
    offset += 28;
  }
  const out: Instance[] = [];
  for (const h of headers) {
    for (let i = 0; i < h.count; i++) {
      const x = view.getFloat32(offset, true);
      const y = view.getFloat32(offset + 4, true);
      const z = view.getFloat32(offset + 8, true);
      const yaw = (view.getUint8(offset + 12) / 255) * Math.PI * 2;
      const scale = h.scaleMin
        + (view.getUint8(offset + 13) / 255) * ((h.scaleMax - h.scaleMin) || 1);
      const tiltX = (view.getUint8(offset + 14) / 255 - 0.5) * Math.PI;
      const tiltZ = (view.getUint8(offset + 15) / 255 - 0.5) * Math.PI;
      offset += 17;
      out.push({ species: speciesOrder[h.index], x, y, z, yaw, scale, tiltX, tiltZ });
    }
  }
  return out;
}

/** Wood-classifier twin of pipeline/trunk_solids.py (kept tiny on purpose). */
const WOOD = ["bark", "trunk", "wood", "stump", "log", "giant_tree", "branch", "wolene", "root"];
const NOT_WOOD = ["leaf", "conifer", "maple", "moss", "comp", "frond", "valenwood",
  "palmmiddle", "grandoak", "gkbbranch3dark"];
const isWood = (t: string) => {
  const lower = t.toLowerCase();
  return WOOD.some((w) => lower.includes(w)) && !NOT_WOOD.some((v) => lower.includes(v));
};

/** Per-species wood-mesh VERTICES from the shipped GLB, pivot space (Y-up). */
function woodVertices(glb: Buffer): Map<string, [number, number, number][]> {
  const jsonLength = glb.readUInt32LE(12);
  const gltf = JSON.parse(glb.subarray(20, 20 + jsonLength).toString());
  const binOffset = 20 + jsonLength + 8;
  const accessor = (i: number): Float32Array | Uint16Array | Uint32Array => {
    const a = gltf.accessors[i];
    const bv = gltf.bufferViews[a.bufferView];
    const start = binOffset + (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const parts = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type as string]!;
    const Ctor = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array }[
      a.componentType as number]!;
    return new Ctor(glb.buffer, glb.byteOffset + start, a.count * parts);
  };
  const textureName = (mi: number | undefined): string => {
    if (mi === undefined) return "?";
    const material = gltf.materials[mi];
    const t = material.pbrMetallicRoughness?.baseColorTexture;
    if (!t) return material.name ?? "?";
    const image = gltf.images[gltf.textures[t.index].source];
    return image.uri ?? image.name ?? "?";
  };
  const out = new Map<string, [number, number, number][]>();
  for (const node of gltf.nodes) {
    const assetId = node.extras?.assetId;
    if (!assetId || !node.children) continue;
    const vertices: [number, number, number][] = [];
    for (const childIndex of node.children) {
      const child = gltf.nodes[childIndex];
      const extras = child.extras ?? {};
      if (extras.lod || extras.billboard || child.mesh === undefined) continue;
      const [tx, ty, tz] = child.translation ?? [0, 0, 0];
      for (const prim of gltf.meshes[child.mesh].primitives) {
        if (!isWood(textureName(prim.material))) continue;
        const pos = accessor(prim.attributes.POSITION) as Float32Array;
        for (let i = 0; i < pos.length; i += 3) {
          vertices.push([pos[i] + tx, pos[i + 1] + ty, pos[i + 2] + tz]);
        }
      }
    }
    if (vertices.length) out.set(assetId, vertices);
  }
  return out;
}

let world: RAPIER.World;
let assets: Map<string, FloraCollisionAsset>;
let instances: Instance[];
let wood: Map<string, [number, number, number][]>;

beforeAll(async () => {
  await RAPIER.init();
  const manifest = JSON.parse(
    readFileSync(join(PUBLIC, "kits/flora-province-v1.kit.json"), "utf8"));
  assets = new Map(manifest.assets.map((a: FloraCollisionAsset) => [a.id, a]));
  const index = JSON.parse(
    readFileSync(join(PUBLIC, "province/vegetation/vegetation-index.json"), "utf8"));
  const chunkX = Math.floor(FOCUS.x / index.chunkMetres);
  const chunkZ = Math.floor(FOCUS.z / index.chunkMetres);
  const bundle = readFileSync(join(
    PUBLIC, `province/vegetation/chunk_${chunkX}_${chunkZ}_vegetation.bin`));
  instances = decodeBundle(bundle, index.speciesOrder).filter((inst) =>
    Math.hypot(inst.x - FOCUS.x, inst.z - FOCUS.z) <= RING_M
    && isSolid(assets.get(inst.species)));
  wood = woodVertices(readFileSync(join(PUBLIC, "kits/flora-province-v1.glb")));

  // Build the bodies exactly as VegetationColliders does.
  world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  for (const inst of instances) {
    const shapes = collidersFor(assets.get(inst.species));
    if (!shapes.length) continue;
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(inst.tiltX, inst.yaw, inst.tiltZ, "YXZ"));
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(inst.x, inst.y, inst.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }));
    for (const shape of shapes) {
      const desc = shape.kind === "capsule"
        ? RAPIER.ColliderDesc.capsule(shape.halfHeightM * inst.scale, shape.radiusM * inst.scale)
        : RAPIER.ColliderDesc.cuboid(
            shape.halfExtentsM[0] * inst.scale,
            shape.halfExtentsM[1] * inst.scale,
            shape.halfExtentsM[2] * inst.scale);
      desc.setTranslation(
        shape.offsetM[0] * inst.scale,
        shape.offsetM[1] * inst.scale,
        shape.offsetM[2] * inst.scale);
      if (shape.kind === "capsule") {
        desc.setRotation({ x: shape.rotation[0], y: shape.rotation[1],
          z: shape.rotation[2], w: shape.rotation[3] });
      }
      world.createCollider(desc, body);
    }
  }
  // Spatial queries read the broad-phase, which is built on the first step.
  world.step();
});

describe("trunks at the owner's reported coordinates are solid", () => {
  it("found trees to test against (the bundle really covers the spot)", () => {
    expect(instances.length).toBeGreaterThan(5);
    expect(instances.some((i) => i.species.includes("anvil-canopy"))).toBe(true);
  });

  it("wood surfaces at body height sit on or inside physics colliders", () => {
    // For every solid tree near the spot, transform its wood-mesh vertices by
    // the instance transform and measure the distance from each to the
    // nearest collider. At walking height nothing may sit further outside
    // the collided volume than half a body's width.
    const euler = new THREE.Euler();
    const quaternion = new THREE.Quaternion();
    const point = new THREE.Vector3();
    let tested = 0;
    let uncovered = 0;
    const offenders = new Map<string, number>();
    for (const inst of instances) {
      const vertices = wood.get(inst.species);
      if (!vertices) continue; // species without separable wood (shrubs)
      euler.set(inst.tiltX, inst.yaw, inst.tiltZ, "YXZ");
      quaternion.setFromEuler(euler);
      for (const [vx, vy, vz] of vertices) {
        if (vy * inst.scale > 2.2 || vy < -0.5) continue; // walking heights
        point.set(vx, vy, vz).multiplyScalar(inst.scale).applyQuaternion(quaternion);
        const worldPoint = {
          x: point.x + inst.x, y: point.y + inst.y, z: point.z + inst.z };
        tested += 1;
        const projection = world.projectPoint(worldPoint, true);
        const inside = projection !== null && projection.isInside;
        const distance = projection === null
          ? Infinity
          : Math.hypot(
              projection.point.x - worldPoint.x,
              projection.point.y - worldPoint.y,
              projection.point.z - worldPoint.z);
        if (!inside && distance > 0.35) {
          uncovered += 1;
          offenders.set(inst.species, (offenders.get(inst.species) ?? 0) + 1);
        }
      }
    }
    expect(tested).toBeGreaterThan(1000);
    // Thin twigs at the edge of the wood classifier may poke out; trunks may
    // not. 5% is far below any walkable gap and far above float noise.
    expect(
      uncovered / tested,
      `uncovered wood at walking height: ${[...offenders].map(([s, n]) => `${s}:${n}`).join(", ")}`,
    ).toBeLessThan(0.05);
  });

  it("the reported tree itself (anvil canopy at 4121, 4511) blocks a walk-through", () => {
    // The owner's screenshot: head embedded in the big mossy trunk. Cast the
    // player capsule's centre straight through where that trunk stands; the
    // segment must intersect a collider.
    const tree = instances.find((i) =>
      i.species === "composite:jungle/anvil-canopy-tree"
      && Math.hypot(i.x - 4121, i.z - 4511) < 2);
    expect(tree).toBeDefined();
    const ray = new RAPIER.Ray(
      { x: tree!.x - 8, y: tree!.y + 1.2, z: tree!.z },
      { x: 1, y: 0, z: 0 });
    const hit = world.castRay(ray, 16, true);
    expect(hit, "no collider across the reported trunk").not.toBeNull();
  });
});
