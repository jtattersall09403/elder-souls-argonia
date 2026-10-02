import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { solidSteps, type SolidCache } from "./SettlementLayer";
import { SETTLEMENT_COLLISION_FRAME, type SettlementPlacement } from "./types";

const placement = (id: string, kind: string) => ({
  id, kit: "k", assetId: "a", scale: 1, collision: { kind, frame: SETTLEMENT_COLLISION_FRAME },
}) as unknown as SettlementPlacement;
const box = new THREE.BoxGeometry(1, 1, 1);
const parts = [{ geometry: box, material: new THREE.MeshBasicMaterial(), localMatrix: new THREE.Matrix4(), triangles: 12 }];

/** Runs the steps; returns [how many next() yields, the solid]. */
function drain(gen: Generator<void, unknown>): [number, unknown] {
  let yields = 0;
  for (let r = gen.next(); ; r = gen.next()) { if (r.done) return [yields, r.value]; yields++; }
}

describe("solidSteps (perf10 O5)", () => {
  it("bakes each trimesh collider in its own pump step and reuses an unchanged one with none", () => {
    const at = new THREE.Matrix4().makeTranslation(3, 0, 4);
    const kept: SolidCache = new Map();
    const [yields, solid] = drain(solidSteps(placement("p1", "mesh"), at, 0, parts, new Map(), kept));
    expect(yields).toBe(1);
    expect((solid as { parts: { kind: string }[] }).parts[0].kind).toBe("trimesh");
    const again: SolidCache = new Map();
    const [yields2, solid2] = drain(solidSteps(placement("p1", "mesh"), at, 0, parts, kept, again));
    expect(yields2).toBe(0);
    expect(solid2).toBe(solid);
    expect(again.get("p1")?.solid).toBe(solid);
    const moved = new THREE.Matrix4().makeTranslation(3, 0, 5);
    const [yields3, solid3] = drain(solidSteps(placement("p1", "mesh"), moved, 0, parts, kept, new Map()));
    expect(yields3).toBe(1);
    expect(solid3).not.toBe(solid);
  });

  it("a box or no-collision piece takes no extra step", () => {
    const [yields, solid] = drain(solidSteps(placement("p2", "none"), new THREE.Matrix4(), 0, parts, new Map(), new Map()));
    expect(yields).toBe(0);
    expect(solid).toBeNull();
  });
});
