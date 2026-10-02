/**
 * One collider per modular run (decision 0101 rule 9, planner 2026-09-26).
 *
 * A bound run (a retaining wall, a fence, a wall run) is seated as one rigid
 * chain (`anchoring.ts anchorRun`, 259b200a), so it collides as one: every
 * member's LOD0 triangles are joined into ONE trimesh part in the first
 * member's frame. The resident part count the export gates
 * (`export_settlement_bundle.resident_collision_parts`) counts a run once for
 * the same reason. A run whose members are not all trimesh (measured proxy
 * boxes) keeps one solid per member: boxes cannot be joined into one part.
 */
import * as THREE from "three";
import type { CollisionResidencyCandidate } from "./collisionResidency";
import type { SettlementCollisionShape, SettlementSolid } from "./types";

type Candidate = CollisionResidencyCandidate<SettlementSolid>;

function isTrimesh(part: SettlementCollisionShape): part is Extract<SettlementCollisionShape, { kind: "trimesh" }> {
  return part.kind === "trimesh";
}

/** The candidates with every run's members replaced by one joined candidate
 * (placement id and frame of the run's first member by id, the nearest
 * member's distance, one part). `runOf` names a placement's run id.
 *
 * `cache` (owned by the caller, one per layer) keeps each run's joined solid
 * while its member solids are the same objects: the settlement layer reuses
 * solids across rebuilds, so a rebuild while walking re-joins nothing (walk
 * 10 f7: the re-join was a 7 ms step plus the garbage of its number arrays).
 * Runs not seen in this call leave the cache. */
export function mergeRunColliders(
  candidates: readonly Candidate[],
  runOf: (placementId: string) => string | undefined,
  cache?: RunColliderCache,
): Candidate[] {
  const seen = new Set<string>();
  const runs = new Map<string, Candidate[]>();
  const out: Candidate[] = [];
  for (const candidate of candidates) {
    const run = runOf(candidate.placementId);
    if (!run) { out.push(candidate); continue; }
    const members = runs.get(run) ?? [];
    members.push(candidate);
    runs.set(run, members);
  }
  for (const [run, members] of [...runs.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (members.length < 2 || !members.every((m) => m.value.parts.every(isTrimesh))) {
      out.push(...members);
      continue;
    }
    members.sort((a, b) => a.placementId.localeCompare(b.placementId));
    seen.add(run);
    const solids = members.map((m) => m.value);
    const hit = cache?.get(run);
    const value = hit && hit.solids.length === solids.length && hit.solids.every((s, i) => s === solids[i])
      ? hit.value : joinRun(run, solids);
    cache?.set(run, { solids, value });
    out.push({
      placementId: members[0].placementId,
      distanceM: Math.min(...members.map((m) => m.distanceM)),
      parts: 1,
      value,
    });
  }
  if (cache) for (const run of [...cache.keys()]) if (!seen.has(run)) cache.delete(run);
  return out;
}

/** Joined run colliders by run id, with the member solids they were joined from. */
export type RunColliderCache = Map<string, { solids: readonly SettlementSolid[]; value: SettlementSolid }>;

/** One trimesh part in the first member's frame, written straight into typed arrays. */
function joinRun(run: string, solids: readonly SettlementSolid[]): SettlementSolid {
  const first = solids[0];
  let vertexCount = 0, indexCount = 0;
  for (const solid of solids) for (const part of solid.parts) {
    if (!isTrimesh(part)) continue;
    vertexCount += part.vertices.length;
    indexCount += part.indices.length;
  }
  const vertices = new Float32Array(vertexCount);
  const indices = new Uint32Array(indexCount);
  let vi = 0, ii = 0;
  const toFirst = new THREE.Matrix4().compose(
    new THREE.Vector3(...first.position), new THREE.Quaternion(...first.rotation),
    new THREE.Vector3(1, 1, 1)).invert();
  const toWorld = new THREE.Matrix4();
  const matrix = new THREE.Matrix4();
  const point = new THREE.Vector3();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  for (const solid of solids) {
    toWorld.compose(position.set(...solid.position), rotation.set(...solid.rotation), one);
    matrix.multiplyMatrices(toFirst, toWorld);
    for (const part of solid.parts) {
      if (!isTrimesh(part)) continue;
      const base = vi / 3;
      for (let i = 0; i < part.vertices.length; i += 3) {
        point.set(part.vertices[i], part.vertices[i + 1], part.vertices[i + 2]).applyMatrix4(matrix);
        vertices[vi++] = point.x; vertices[vi++] = point.y; vertices[vi++] = point.z;
      }
      for (let i = 0; i < part.indices.length; i++) indices[ii++] = base + part.indices[i];
    }
  }
  return { ...first, id: `run:${run}`, parts: [{ kind: "trimesh", vertices, indices }] };
}
