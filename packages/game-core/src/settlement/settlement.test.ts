import { describe, expect, it } from "vitest";
import { anchorPlacement, footprintDiagonalM } from "./anchoring";
import {
  architectureLod,
  mergeTransformedGeometry,
  selectCollisionRing,
  validateLodTriangles,
  validateMaterialTextureCap,
} from "./lod";
import { SETTLEMENT_COLLISION_FRAME, type SettlementPlacement } from "./types";
import * as THREE from "three";
import { applySettlementSurface, reapplySettlementSurface } from "./materials";

const placement: SettlementPlacement = {
  id: "p", sourceId: "s", kind: "settlement", assetId: "a", kit: "k",
  positionM: [5, 99, 5], yawDeg: 13, scale: 1,
  footprintM: [[0, 0], [10, 0], [10, 10], [0, 10]],
  anchor: { mode: "streamed-perimeter", groundFit: "plinth",
    originOffsetM: [2, 3, 4], buryM: .25, buryCapM: .9, slopeBuryPerM: .08 },
  collision: { frame: SETTLEMENT_COLLISION_FRAME, kind: "mesh" },
};

describe("settlement placement contract", () => {
  it("re-grounds from every streamed perimeter point with bounded per-fit bury", () => {
    const anchored = anchorPlacement(placement, (x) => x / 20);
    expect(anchored.complete).toBe(true);
    expect(anchored.buryM).toBeCloseTo(.79);
    expect(anchored.y).toBeCloseTo(3.71);
    expect(anchored.gapM).toBe(0);
  });

  it("does not guess a height while a streamed sample is absent", () => {
    expect(anchorPlacement(placement, (x) => x === 0 ? null : 1).complete).toBe(false);
  });

  it("scales LOD reach by footprint and has one deterministic authority", () => {
    const contract = { absoluteTriangleFloor: [120, 80] as const,
      distancePerFootprintDiagonal: [4, 12] as const, farMergeDistanceM: 900 };
    expect(footprintDiagonalM(placement)).toBeCloseTo(Math.sqrt(200));
    expect(architectureLod(20, 14, 3, contract).level).toBe(0);
    expect(architectureLod(100, 14, 3, contract).level).toBe(1);
    expect(architectureLod(1000, 14, 3, contract)).toEqual({ level: 2, farMerged: true });
  });

  it("refuses a landmark/asset with a missing or over-decimated far tier", () => {
    const contract = { absoluteTriangleFloor: [120, 80] as const,
      distancePerFootprintDiagonal: [4, 12] as const, farMergeDistanceM: 900 };
    expect(() => validateLodTriangles([1000, 119, 90], contract)).toThrow(/floor/);
    expect(() => validateLodTriangles([6, 6, 6], contract)).not.toThrow();
    expect(() => architectureLod(1, 1, 2, contract)).toThrow(/three-tier/);
  });
});

describe("settlement material patch contract", () => {
  it("stores state, chains cache identity, and can be restored after CSM", () => {
    const material = new THREE.MeshStandardMaterial();
    const uniforms = { esSettlementRain: { value: 1 }, esSettlementNight: { value: 1 } };
    applySettlementSurface(material, uniforms, true);
    const first = material.onBeforeCompile;
    expect(material.userData.esAerial).toBe(true);
    expect(material.customProgramCacheKey()).toContain("es-settlement-surface-v1|1");
    material.onBeforeCompile = () => undefined; // exactly what CSM does
    reapplySettlementSurface(material);
    expect(material.onBeforeCompile).not.toBe(first);
    const shader = { uniforms: {}, vertexShader: "#include <common>\n#include <begin_vertex>",
      fragmentShader: "#include <common>\n#include <color_fragment>\n#include <roughnessmap_fragment>" };
    material.onBeforeCompile(shader as never, {} as never);
    expect(shader.vertexShader).toContain("esSettlementLocalHeight");
    expect(shader.fragmentShader).toContain("esWallWet");
    expect(Object.keys(shader.uniforms)).toContain("esSettlementNight");
  });

  it("validates the dimensions of the texture actually bound for drawing", () => {
    const material = new THREE.MeshStandardMaterial();
    const texture = new THREE.Texture({ width: 2048, height: 1024 } as HTMLImageElement);
    material.map = texture;
    expect(() => validateMaterialTextureCap(material, 4096)).not.toThrow();
    expect(() => validateMaterialTextureCap(material, 1024)).toThrow(/exceeds/);
    material.map = new THREE.Texture();
    expect(() => validateMaterialTextureCap(material, 4096)).toThrow(/unmeasured/);
  });
});

describe("settlement far geometry and collision budgets", () => {
  it("bakes far instances into one actual geometry", () => {
    const source = new THREE.BoxGeometry(1, 1, 1);
    const merged = mergeTransformedGeometry(source, [
      new THREE.Matrix4().makeTranslation(0, 0, 0),
      new THREE.Matrix4().makeTranslation(10, 0, 0),
    ]);
    expect(merged).not.toBeNull();
    merged!.computeBoundingBox();
    expect(merged!.boundingBox!.min.x).toBeCloseTo(-0.5);
    expect(merged!.boundingBox!.max.x).toBeCloseTo(10.5);
    expect(merged!.getAttribute("position").count).toBe(source.getAttribute("position").count * 2);
    merged!.dispose(); source.dispose();
  });

  it("spends a collider-part budget and reports the genuinely covered radius", () => {
    const candidates = [
      { value: "near", distanceM: 3, parts: 2 },
      { value: "next", distanceM: 8, parts: 3 },
      { value: "far", distanceM: 12, parts: 1 },
    ];
    expect(selectCollisionRing(candidates, 20, 4)).toEqual({
      chosen: ["near"], coveredRadiusM: 8, parts: 2,
    });
    expect(selectCollisionRing(candidates, 20, 20).coveredRadiusM).toBe(20);
  });
});
