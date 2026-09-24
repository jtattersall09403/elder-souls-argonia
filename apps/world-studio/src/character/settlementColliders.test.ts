/**
 * The Studio's settlement bodies must build a Rapier trimesh for a mesh piece
 * and a scaled cuboid only for a measured proxy box (16h item 4).
 */
import { describe, expect, it } from "vitest";
import { settlementColliderDesc } from "./SettlementColliders";

type Desc = { kind: string; vertices?: Float32Array; indices?: Uint32Array;
  half?: number[]; translation?: number[] };

const rapier = {
  ColliderDesc: {
    trimesh: (vertices: Float32Array, indices: Uint32Array): Desc =>
      ({ kind: "trimesh", vertices, indices }),
    cuboid: (x: number, y: number, z: number) => ({
      setTranslation: (tx: number, ty: number, tz: number): Desc =>
        ({ kind: "cuboid", half: [x, y, z], translation: [tx, ty, tz] }),
    }),
  },
};

describe("settlement collider descriptions", () => {
  it("gives a mesh piece its own triangles, unscaled (the vertices carry it)", () => {
    const vertices = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const indices = new Uint32Array([0, 1, 2]);
    expect(settlementColliderDesc(rapier, { kind: "trimesh", vertices, indices }, 2))
      .toEqual({ kind: "trimesh", vertices, indices });
  });

  it("scales a measured proxy box and its offset by the placement scale", () => {
    expect(settlementColliderDesc(rapier, {
      kind: "box", halfExtentsM: [1, 2, 3], offsetM: [0, 2, 0],
    }, 2)).toEqual({ kind: "cuboid", half: [2, 4, 6], translation: [0, 4, 0] });
  });
});
