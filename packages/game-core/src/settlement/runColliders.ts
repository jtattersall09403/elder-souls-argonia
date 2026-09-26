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
 * member's distance, one part). `runOf` names a placement's run id. */
export function mergeRunColliders(
  candidates: readonly Candidate[],
  runOf: (placementId: string) => string | undefined,
): Candidate[] {
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
    const first = members[0].value;
    const toFirst = new THREE.Matrix4().compose(
      new THREE.Vector3(...first.position), new THREE.Quaternion(...first.rotation),
      new THREE.Vector3(1, 1, 1)).invert();
    const vertices: number[] = [];
    const indices: number[] = [];
    const point = new THREE.Vector3();
    for (const member of members) {
      const solid = member.value;
      const toWorld = new THREE.Matrix4().compose(
        new THREE.Vector3(...solid.position), new THREE.Quaternion(...solid.rotation),
        new THREE.Vector3(1, 1, 1));
      const matrix = toFirst.clone().multiply(toWorld);
      for (const part of solid.parts) {
        if (!isTrimesh(part)) continue;
        const base = vertices.length / 3;
        for (let i = 0; i < part.vertices.length; i += 3) {
          point.set(part.vertices[i], part.vertices[i + 1], part.vertices[i + 2]).applyMatrix4(matrix);
          vertices.push(point.x, point.y, point.z);
        }
        for (let i = 0; i < part.indices.length; i++) indices.push(base + part.indices[i]);
      }
    }
    out.push({
      placementId: members[0].placementId,
      distanceM: Math.min(...members.map((m) => m.distanceM)),
      parts: 1,
      value: {
        ...first,
        id: `run:${run}`,
        parts: [{ kind: "trimesh", vertices: new Float32Array(vertices), indices: new Uint32Array(indices) }],
      },
    });
  }
  return out;
}
