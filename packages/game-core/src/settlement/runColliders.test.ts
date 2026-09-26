import { describe, expect, it } from "vitest";
import { mergeRunColliders } from "./runColliders";
import {
  SETTLEMENT_COLLISION_FRAME, type SettlementCollisionShape, type SettlementSolid,
} from "./types";

const tri = () => ({ kind: "trimesh" as const, vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  indices: new Uint32Array([0, 1, 2]) });

function solid(id: string, x: number,
  parts: SettlementCollisionShape[] = [tri(), tri()]): SettlementSolid {
  return { id, frame: SETTLEMENT_COLLISION_FRAME, position: [x, 0, 0], rotation: [0, 0, 0, 1],
    scale: 1, parts };
}

describe("one collider per modular run (0101 rule 9)", () => {
  it("joins a run's trimesh members into one part in the first member's frame", () => {
    const candidates = ["w.1", "w.2", "w.3"].map((id, i) => ({
      value: solid(id, i * 3), placementId: id, distanceM: 10 - i, parts: 2 }));
    candidates.push({ value: solid("hut", 20), placementId: "hut", distanceM: 5, parts: 2 });
    const before = candidates.reduce((n, c) => n + c.parts, 0);
    const out = mergeRunColliders(candidates, (id) => (id.startsWith("w.") ? "run.w" : undefined));
    expect(before).toBe(8);
    expect(out.reduce((n, c) => n + c.parts, 0)).toBe(3);
    const run = out.find((c) => c.value.id === "run:run.w")!;
    expect(run.placementId).toBe("w.1");
    expect(run.distanceM).toBe(8);
    const part = run.value.parts[0] as { vertices: Float32Array; indices: Uint32Array };
    expect(part.vertices.length).toBe(3 * 3 * 6);
    expect(part.indices.length).toBe(3 * 6);
    // the third member's first vertex stands 6 m east of the first member's frame
    expect(part.vertices[3 * 3 * 4]).toBeCloseTo(6);
  });

  it("keeps box members as they are", () => {
    const box: SettlementCollisionShape = { kind: "box", halfExtentsM: [1, 1, 1], offsetM: [0, 0, 0] };
    const candidates = ["w.1", "w.2"].map((id, i) => ({
      value: solid(id, i, [box]), placementId: id, distanceM: 1, parts: 1 }));
    expect(mergeRunColliders(candidates, () => "run.w")).toHaveLength(2);
  });
});
