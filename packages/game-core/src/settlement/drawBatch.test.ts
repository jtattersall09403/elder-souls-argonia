import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import {
  addToBatch, applyBatchVisibility, drawBatchKey, settlementBatchCell, settlementChunkCentre, type DrawBatch,
} from "./SettlementLayer";
import {
  batchVisibleAt, ladderClassKey, ladderLevelAt, mergeTransformedParts, quantizedLadder, settlementLadder, vertexLayoutKey,
} from "./lod";

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

  // F40: a 40 m walk with a level change merged mid-walk on the main thread
  // because the key followed the camera; every level is now prebuilt.
  const contract = { absoluteTriangleFloor: [120, 60] as const, distancePerFootprintDiagonal: [4, 12] as const, farMergeDistanceM: 300 };
  const ladder = quantizedLadder(settlementLadder(20, 3, contract, 900));
  const ladderClass = ladderClassKey(ladder, 900);
  const chunk = "0,0";
  const centre = settlementChunkCentre(chunk);
  const material = new THREE.MeshStandardMaterial();
  const g = part(3);
  /** The batch keys a build makes: every level of the ladder, no camera input. */
  const keysOf = () => [...new Set(ladder.map((r) => r.level))]
    .map((level) => drawBatchKey(material, g, settlementBatchCell(chunk, level, ladderClass), flags));

  it("keys every batch without the camera: two camera positions make the same keys", () => {
    expect(keysOf()).toEqual(keysOf());
    expect(new Set(keysOf()).size).toBe(3);
    expect(ladder.every((r) => r.lo % 10 === 0 || !Number.isFinite(r.lo))).toBe(true);
  });

  it("swaps prebuilt batches across a 40 m walk with a level change and never merges", () => {
    const merge = vi.fn(mergeTransformedParts);
    const group = new THREE.Group();
    for (const level of [0, 1, 2]) {
      const batches = new Map<string, DrawBatch>();
      const view = { x: centre.x, z: centre.z, level, ladder, capM: 900 };
      addToBatch(batches, drawBatchKey(material, g, settlementBatchCell(chunk, level, ladderClass), flags), {
        material, drawFlags: flags, far: level > 0, signature: `${level}`, view,
        entry: { geometry: g, transforms: [at(0)], groundLinesM: [0] },
      });
      const mesh = new THREE.Mesh(merge([...batches.values()][0].entries)!, material);
      mesh.userData.esSettlementView = view;
      group.add(mesh);
    }
    expect(merge).toHaveBeenCalledTimes(3);
    merge.mockClear();
    const visibleLevels = () => group.children.filter((c) => c.visible)
      .map((c) => (c.userData.esSettlementView as { level: number }).level);
    // walk out from the chunk centre in 40 m steps: exactly one level shows
    // at each spot, the level changes on the way, and nothing is merged
    const seen = new Set<number>();
    for (let d = 0; d <= 400; d += 40) {
      applyBatchVisibility(group, { x: centre.x + d, z: centre.z });
      const shown = visibleLevels();
      expect(shown).toHaveLength(1);
      expect(shown[0]).toBe(ladderLevelAt(ladder, d));
      seen.add(shown[0]);
    }
    expect(seen.size).toBeGreaterThan(1);
    expect(merge).not.toHaveBeenCalled();
    // beyond its cap nothing of it draws
    applyBatchVisibility(group, { x: centre.x + 1000, z: centre.z });
    expect(visibleLevels()).toHaveLength(0);
    expect(batchVisibleAt({ x: 0, z: 0, level: 0, ladder, capM: 900 }, { x: 0, z: 0 })).toBe(true);
  });
});
