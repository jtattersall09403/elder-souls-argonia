/**
 * Real collision (16h item 4, 0071 §5).
 *
 * A `mesh` piece collides as its own LOD0 triangles, not as a box: the gate
 * arch at Lilmoth has a road through it. The kit GLB is read from the RAW
 * build (`tooling/asset-pipeline/output/kits`): the published pair is
 * UASTC/meshopt and needs the browser's decoders.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { buildArchitectureKit } from "./kit";
import { solidFrom } from "./SettlementLayer";
import { placementTransform } from "./anchoring";
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

async function loadRawKit(kit: string) {
  const bytes = readFileSync(resolve(ROOT, `tooling/asset-pipeline/output/kits/${kit}.glb`));
  const length = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + length).toString());
  const binary = bytes.subarray(28 + length);
  json.images = []; json.textures = []; json.materials = [];
  for (const mesh of json.meshes ?? []) for (const primitive of mesh.primitives) {
    delete primitive.material;
  }
  json.buffers[0].uri = `data:application/octet-stream;base64,${binary.toString("base64")}`;
  return new GLTFLoader().parseAsync(JSON.stringify(json), "");
}

const bundle: SettlementBundle = JSON.parse(readFileSync(
  resolve(ROOT, "apps/world-studio/public/province/settlements.json"), "utf8"));
const gate = bundle.placements.find((p) => p.assetId.endsWith(GATE_ASSET))!;

/** kit id -> asset id -> its material list (one entry per LOD0 primitive). */
const manifestAssets = new Map<string, Map<string, string[]>>(Object.keys(bundle.kits).map((id) => [
  id,
  new Map((JSON.parse(readFileSync(
    resolve(ROOT, `apps/world-studio/public/kits/${id}.kit.json`), "utf8",
  ) as string).assets as { id: string; materials?: string[] }[])
    .map((asset) => [asset.id, asset.materials ?? []])),
]));

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
    const gltf = await loadRawKit(gate.kit);
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
    // `solidFrom` makes one trimesh per LOD0 primitive, and a kit manifest
    // lists one material per primitive (checked above against the gate: six
    // materials, six trimeshes), so the manifest counts the parts the runtime
    // will build without loading 21 GLBs here.
    const parts = (placement: SettlementPlacement): number => {
      // `solidFrom` returns null for kind "none": it builds no part and is no
      // residency candidate (the exporter's resident_collision_parts agrees).
      if (placement.collision.kind === "none") return 0;
      if (placement.collision.kind === "mesh") {
        return Math.max(1, manifestAssets.get(placement.kit)?.get(placement.assetId)?.length ?? 1);
      }
      return Math.max(1, placement.collision.parts?.length ?? 1);
    };
    const byId = new Map(bundle.placements.map((p) => [p.id, p]));
    const worst = Math.max(...bundle.settlements.map((settlement) => settlement.placementIds
      .reduce((sum, id) => sum + (byId.has(id) ? parts(byId.get(id)!) : 0), 0)));
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
