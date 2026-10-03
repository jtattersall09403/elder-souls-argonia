/**
 * Real collision (16h item 4, 0071 §5).
 *
 * A `mesh` piece collides as its own LOD0 triangles, not as a box: the gate
 * arch at Lilmoth has a road through it. The kit GLB is the PUBLISHED one
 * (`apps/world-studio/public/kits`, meshopt geometry decoded here; its UASTC
 * textures are stripped), so the test reads what ships, on CI too.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { buildArchitectureKit } from "./kit";
import { solidFrom } from "./SettlementLayer";
import { placementTransform } from "./anchoring";
import { readPublishedSettlements } from "./publishedBundles.testHelper";
import { selectCollisionResidency } from "./collisionResidency";
import {
  SETTLEMENT_COLLISION_FRAME,
  type SettlementBundle,
  type SettlementPlacement,
  type SettlementSolid,
} from "./types";

const ROOT = resolve(import.meta.dirname, "../../../..");
const GATE_ASSET = "mwimparchwallgate01";

/** Node's data-URI loader needs this event type; no textures are decoded. */
(globalThis as { ProgressEvent?: unknown }).ProgressEvent ??=
  class { constructor(public type: string, public options: unknown) {} };

/** The PUBLISHED part files of a kit (decision 0120: the tracked copy that
 * ships, so the runner and CI read the same bytes; raw builds are never tracked), by asset id. */
function publishedPartFiles(kit: string): Map<string, string> {
  const dir = resolve(ROOT, `apps/world-studio/public/kits/${kit}/parts`);
  const index = JSON.parse(readFileSync(resolve(dir, "index.json"), "utf8")) as { assets: Record<string, { file: string }> };
  return new Map(Object.entries(index.assets).map(([id, row]) => [id, resolve(dir, row.file)]));
}

/** One PUBLISHED part: meshopt-decoded geometry, textures and materials
 * stripped (no KTX2 decode in node). */
async function loadPublishedPart(kit: string, assetId: string) {
  const bytes = readFileSync(publishedPartFiles(kit).get(assetId)!);
  const length = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + length).toString());
  const binary = bytes.subarray(28 + length);
  json.images = []; json.textures = []; json.materials = [];
  const drop = new Set(["KHR_texture_basisu"]);
  json.extensionsRequired = (json.extensionsRequired ?? []).filter((e: string) => !drop.has(e));
  json.extensionsUsed = (json.extensionsUsed ?? []).filter((e: string) => !drop.has(e));
  for (const mesh of json.meshes ?? []) for (const primitive of mesh.primitives) {
    delete primitive.material;
  }
  json.buffers[0].uri = `data:application/octet-stream;base64,${binary.toString("base64")}`;
  await MeshoptDecoder.ready;
  return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(JSON.stringify(json), "");
}

const bundle: SettlementBundle = readPublishedSettlements(
  resolve(ROOT, "apps/world-studio/public/province"));
const gate = bundle.placements.find((p) => p.assetId.endsWith(GATE_ASSET))!;


/** kit id -> asset id -> its LOD0 glTF primitive count, read from the GLB's JSON
 * chunk alone (no geometry decode): three.js builds one Mesh, so one collision
 * part, per primitive, and only LOD0 collides. The exporter's lod0_part_counts
 * reads the same chunk the same way. A manifest's material list is not this
 * count (horsetrough01: three materials, four primitives). */
const lod0Cache = new Map<string, Map<string, number>>();
function lod0Primitives(kit: string): Map<string, number> {
  const hit = lod0Cache.get(kit);
  if (hit) return hit;
  const counts = new Map<string, number>();
  for (const file of publishedPartFiles(kit).values()) {
    for (const [assetId, n] of lod0PrimitivesOf(readFileSync(file))) counts.set(assetId, n);
  }
  lod0Cache.set(kit, counts);
  return counts;
}

function lod0PrimitivesOf(glb: Buffer): Map<string, number> {
  const jsonLength = glb.readUInt32LE(12);
  type Node = { mesh?: number; children?: number[]; extras?: { lod?: number; assetId?: string } };
  const doc = JSON.parse(glb.subarray(20, 20 + jsonLength).toString("utf8")) as {
    nodes?: Node[]; meshes?: { primitives?: unknown[] }[]; scene?: number;
    scenes: { nodes?: number[] }[] };
  const nodes = doc.nodes ?? [];
  const walk = (index: number): number => {
    const node = nodes[index];
    let total = node.mesh !== undefined && (node.extras?.lod ?? 0) === 0
      ? (doc.meshes?.[node.mesh]?.primitives?.length ?? 0) : 0;
    for (const child of node.children ?? []) total += walk(child);
    return total;
  };
  const counts = new Map<string, number>();
  for (const index of doc.scenes[doc.scene ?? 0].nodes ?? []) {
    const assetId = nodes[index].extras?.assetId;
    if (typeof assetId === "string") counts.set(assetId, walk(index));
  }
  return counts;
}

/** The solid's parts as world-space three.js meshes, for an honest ray test. */
function worldMesh(solid: SettlementSolid): THREE.Mesh[] {
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...solid.position),
    new THREE.Quaternion(...solid.rotation),
    new THREE.Vector3(1, 1, 1),
  );
  return solid.parts.map((part) => {
    if (part.kind !== "trimesh") throw new Error("a mesh piece must not collide as a box");
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(part.vertices, 3));
    geometry.setIndex(new THREE.BufferAttribute(part.indices, 1));
    geometry.applyMatrix4(matrix);
    return new THREE.Mesh(geometry);
  });
}

describe("settlement collision is the real shape", () => {
  it("collides Lilmoth's gate arch as triangles, with the road still open", async () => {
    const gltf = await loadPublishedPart(gate.kit, gate.assetId);
    const asset = buildArchitectureKit(gltf).get(gate.assetId)!;
    expect(asset).toBeTruthy();
    const transform = placementTransform(gate, gate.positionM[1]);
    const solid = solidFrom(gate, transform, 0, asset.levels[0])!;
    expect(solid.parts.length).toBeGreaterThan(0);
    expect(solid.parts.every((part) => part.kind === "trimesh")).toBe(true);
    const meshes = worldMesh(solid);

    // The arch opening: the piece's own local frame has the pivot on the
    // road's centre line at the base, the road running along local +Z.
    const orientation = new THREE.Quaternion(...solid.rotation);
    const along = new THREE.Vector3(0, 0, 1).applyQuaternion(orientation);
    const centre = new THREE.Vector3(...solid.position);
    const raycaster = new THREE.Raycaster();
    const through = (heightM: number) => {
      const from = centre.clone().addScaledVector(along, -12).setY(centre.y + heightM);
      raycaster.set(from, along);
      raycaster.far = 24;
      return raycaster.intersectObjects(meshes, false).length;
    };
    // The archway is open from the road up to the springing of the arch
    // (measured LOD0 bounds: the piece is 13.1 m tall, the opening clear to
    // ~8 m); the wall above the arch is solid. A bounding box would block
    // every one of these heights.
    expect(through(2.0)).toBe(0);
    expect(through(6.0)).toBe(0);
    expect(through(11.0)).toBeGreaterThan(0);
    meshes.forEach((mesh) => mesh.geometry.dispose());
  }, 120_000);

  it("refuses a mesh placement whose geometry is not loaded or has no index", () => {
    const transform = placementTransform(gate, 0);
    expect(() => solidFrom(gate, transform, 0, [])).toThrow(/needs LOD0 geometry/);
    const unindexed = new THREE.BufferGeometry();
    unindexed.setAttribute("position", new THREE.Float32BufferAttribute(new Array(9).fill(0), 3));
    expect(() => solidFrom(gate, transform, 0, [{
      geometry: unindexed, material: new THREE.MeshBasicMaterial(),
      localMatrix: new THREE.Matrix4(), triangles: 1,
    }])).toThrow(/no index buffer/);
  });

  it("never gives a mesh piece a box, and keeps the measured part budget honest", () => {
    const meshPlacements = bundle.placements.filter((p) => p.collision.kind === "mesh");
    expect(meshPlacements.length).toBeGreaterThan(0);
    // `solidFrom` makes one trimesh per LOD0 primitive; `lod0Primitives`
    // counts them from each kit's GLB JSON chunk, without decoding geometry.
    const parts = (placement: SettlementPlacement): number => {
      // `solidFrom` returns null for kind "none": it builds no part and is no
      // residency candidate (the exporter's resident_collision_parts agrees).
      if (placement.collision.kind === "none") return 0;
      // `mesh` and `convex` both collide as one trimesh per LOD0 primitive
      // (SettlementLayer TRIMESH_COLLISION_KINDS), whatever `parts` they carry;
      // a box-kind piece builds its measured parts, else one box per primitive.
      const primitives = Math.max(1, lod0Primitives(placement.kit).get(placement.assetId) ?? 1);
      if (placement.collision.kind === "mesh" || placement.collision.kind === "convex") return primitives;
      return placement.collision.parts?.length ? placement.collision.parts.length : primitives;
    };
    const byId = new Map(bundle.placements.map((p) => [p.id, p]));
    // a bound run of mesh pieces is ONE joined part (runColliders.ts, 0101 rule 9)
    const residentParts = (ids: string[]): number => {
      const placed = ids.map((id) => byId.get(id)).filter((p): p is SettlementPlacement =>
        !!p && p.collision.kind !== "none");
      const runs = new Map<string, SettlementPlacement[]>();
      for (const p of placed) if (p.run) runs.set(p.run.id, [...(runs.get(p.run.id) ?? []), p]);
      const joined = new Set([...runs].filter(([, m]) => m.length >= 2
        && m.every((p) => (p.collision.kind === "mesh" || p.collision.kind === "convex")
          && !p.collision.parts?.length)).map(([id]) => id));
      return joined.size + placed.filter((p) => !(p.run && joined.has(p.run.id)))
        .reduce((sum, p) => sum + parts(p), 0);
    };
    const worst = Math.max(...bundle.settlements.map((settlement) =>
      residentParts(settlement.placementIds)));
    // Decision 0052, one source: the published budget seats the worst place's
    // resident parts and is exactly round(worst x 1.55) of THIS bundle.
    expect(worst).toBeGreaterThan(0);
    expect(bundle.lod.colliderPartBudget).toBeGreaterThanOrEqual(worst);
    expect(bundle.lod.colliderPartBudget).toBe(Math.round(worst * 1.55));

    // One part over the budget must fail loudly, never drop a wall silently.
    const focus = { x: bundle.settlements[0].boundaryM[0][0],
      z: bundle.settlements[0].boundaryM[0][1] };
    const candidates = bundle.settlements[0].placementIds.map((id) => ({
      value: id, placementId: id, distanceM: 1, parts: 1,
    }));
    const budget = candidates.length;
    expect(selectCollisionResidency(candidates, bundle.settlements, focus, 200, budget)
      .budgetExceeded).toBeNull();
    const over = selectCollisionResidency(
      candidates, bundle.settlements, focus, 200, budget - 1);
    expect(over.budgetExceeded?.requiredResidentParts).toBe(budget);
    expect(over.chosen).toEqual([]);
  });

  it("carries the collision frame and the drawn rotation onto the solid", () => {
    const transform = placementTransform(gate, 12);
    const box = { ...gate, collision: { frame: SETTLEMENT_COLLISION_FRAME, kind: "proxy",
      parts: [{ halfExtentsM: [1, 1, 1] as [number, number, number],
        offsetM: [0, 1, 0] as [number, number, number] }] } } as SettlementPlacement;
    const solid = solidFrom(box, transform, 0, [])!;
    expect(solid.frame).toBe(SETTLEMENT_COLLISION_FRAME);
    expect(solid.parts[0].kind).toBe("box");
    const drawn = new THREE.Quaternion();
    transform.decompose(new THREE.Vector3(), drawn, new THREE.Vector3());
    expect(new THREE.Quaternion(...solid.rotation).angleTo(drawn)).toBeLessThan(1e-6);
  });
});
