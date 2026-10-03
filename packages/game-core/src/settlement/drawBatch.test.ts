import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  addToBatch, drawBatchKey, drawCellOf, SETTLEMENT_CHUNK_M, SETTLEMENT_COARSE_CELL_M, SETTLEMENT_LAMP_BAND_M, type DrawBatch,
} from "./SettlementLayer";
import { LIGHTS_ACTIVE_M } from "./lighting";
import { mergeTransformedParts, vertexLayoutKey } from "./lod";

function part(vertices: number, withUv = true): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(vertices * 3), 3));
  if (withUv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(vertices * 2), 2));
  g.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2]), 1));
  return g;
}
const flags = { castShadow: true, renderOrder: 0 };
const at = (x: number) => new THREE.Matrix4().makeTranslation(x, 0, 0);

describe("settlement draw batches (one draw per material per cell)", () => {
  it("puts two parts of one material and layout in one chunk into one draw", () => {
    const material = new THREE.MeshStandardMaterial();
    const a = part(3), b = part(4);
    const batches = new Map<string, DrawBatch>();
    for (const [g, sig] of [[a, "a"], [b, "b"]] as const) {
      addToBatch(batches, drawBatchKey(material, g, "1,2", flags), {
        material, drawFlags: flags, far: false, signature: sig,
        entry: { geometry: g, transforms: [at(0), at(5)], groundLinesM: [0, 1] },
      });
    }
    expect(batches.size).toBe(1);
    const merged = mergeTransformedParts([...batches.values()][0].entries)!;
    // every copy of every part is in the one geometry, with its ground line
    expect(merged.getAttribute("position").count).toBe(2 * 3 + 2 * 4);
    expect(merged.getAttribute("esSettlementGroundY").count).toBe(14);
    expect(merged.index!.count).toBe(12);
  });

  it("keeps chunks, materials, layouts and draw flags apart", () => {
    const m1 = new THREE.MeshStandardMaterial(), m2 = new THREE.MeshStandardMaterial();
    const g = part(3);
    const keys = new Set([
      drawBatchKey(m1, g, "0,0", flags),
      drawBatchKey(m1, g, "0,1", flags),
      drawBatchKey(m2, g, "0,0", flags),
      drawBatchKey(m1, part(3, false), "0,0", flags),
      drawBatchKey(m1, g, "0,0", { castShadow: false, renderOrder: 0 }),
      drawBatchKey(m1, g, "0,0", { castShadow: true, renderOrder: 2 }),
    ]);
    expect(keys.size).toBe(6);
    expect(vertexLayoutKey(part(3))).toBe(vertexLayoutKey(part(9)));
  });

  it("keys a chunk by itself inside the lamp band and by its coarse cell beyond", () => {
    const focus = { x: 0, z: 0 };
    // the band covers every chunk a lamp can light before the next build
    expect(SETTLEMENT_LAMP_BAND_M).toBeGreaterThan(LIGHTS_ACTIVE_M + SETTLEMENT_CHUNK_M);
    expect(drawCellOf("0,0", focus)).toBe("c0,0");
    expect(drawCellOf("1,0", focus)).not.toBe(drawCellOf("0,0", focus));
    // two chunks far out in one coarse cell share it; the next cell does not
    const far = Math.ceil(SETTLEMENT_LAMP_BAND_M / SETTLEMENT_COARSE_CELL_M) + 1;
    const per = SETTLEMENT_COARSE_CELL_M / SETTLEMENT_CHUNK_M;
    const a = drawCellOf(`${far * per},0`, focus), b = drawCellOf(`${far * per + 1},0`, focus);
    expect(a).toBe(`C${far},0`);
    expect(b).toBe(a);
    expect(drawCellOf(`${(far + 1) * per},0`, focus)).not.toBe(a);
    // a near chunk never shares a key with a coarse cell
    expect(drawCellOf("0,0", focus).startsWith("c")).toBe(true);
  });
});
