import { describe, expect, it } from "vitest";
import {
  anchorPlacement,
  mountedTransform,
  placementTransform,
  waterPlacementY,
  finalPartTransform,
  finalPlacementTransform,
  footprintDiagonalM,
  placementGroundAudit,
  resolvePlacement,
  settlementGroundAudits,
} from "./anchoring";
import {
  architectureLod,
  mergeTransformedGeometry,
  selectCollisionRing,
  validateLodTriangles,
  validateMaterialTextureCap,
} from "./lod";
import {
  pointInSettlementBoundary,
  selectCollisionResidency,
} from "./collisionResidency";
import {
  SETTLEMENT_COLLISION_FRAME,
  type SettlementBundle,
  type SettlementPlacement,
} from "./types";
import * as THREE from "three";
import {
  applySettlementSurface,
  applySettlementSurfaceWithShadow,
  SETTLEMENT_GROUND_ATTRIBUTE,
  reapplySettlementSurface,
  settlementShadowPairErrors,
} from "./materials";

const placement: SettlementPlacement = {
  id: "p", sourceId: "s", kind: "settlement", assetId: "a", kit: "k",
  positionM: [5, 99, 5], yawDeg: 13, scale: 1,
  footprintM: [[0, 0], [10, 0], [10, 10], [0, 10]],
  anchor: { mode: "streamed-perimeter", groundFit: "plinth",
    originOffsetM: [2, 3, 4], buryM: .25, buryCapM: .9, slopeBuryPerM: .08 },
  collision: { frame: SETTLEMENT_COLLISION_FRAME, kind: "mesh" },
};

describe("settlement placement contract", () => {
  it("sinks by the asset's own designed sink from the mean of its footprint", () => {
    // Ground 0 .. 0.5 m across the footprint; the asset's makers put its pivot
    // 4 m ABOVE the ground line (a negative sink), which is exactly its own
    // pivot-to-base, so its base lands on the mean.
    const anchored = anchorPlacement(placement, (x) => x / 20, -4);
    expect(anchored.complete).toBe(true);
    expect(anchored.buryM).toBeCloseTo(-4);
    expect(anchored.requestedBuryM).toBeCloseTo(-4);
    expect(anchored.overBuryM).toBe(0);
    expect(anchored.y).toBeCloseTo(4.25);
    expect(anchored.terrainMinM).toBe(0);
    expect(anchored.terrainMaxM).toBe(.5);
    expect(anchored.groundLineM).toBeCloseTo(.25);
    expect(anchored.pivotToBaseM).toBe(4);
    expect(anchored.gapM).toBeCloseTo(.25);
  });

  it("anchors a dug-in fit on the lowest ground under it and every other fit on the mean", () => {
    // A sloped 4-sample footprint: ground 0, 1, 1, 0 m (mean 0.5, lowest 0).
    const slope = (x: number) => x / 10;
    const sink = 0.3;
    const dugIn = anchorPlacement(placement, slope, sink, "dug-in");
    const direct = anchorPlacement(placement, slope, sink, "direct");
    expect(dugIn.y).toBeCloseTo(0 - sink);
    expect(dugIn.groundLineM).toBe(0);
    expect(direct.y).toBeCloseTo(0.5 - sink);
    expect(anchorPlacement(placement, slope, sink).y).toBeCloseTo(direct.y);
  });

  it("refuses to place an asset whose manifest carries no designed sink", () => {
    expect(() => anchorPlacement(placement, () => 1, NaN))
      .toThrow(/has no designedSinkM/);
  });

  it("gives a stilt no exemption: it is grounded by its sink like everything else", () => {
    const stilt = { ...placement, anchor: { ...placement.anchor, groundFit: "stilt" as const } };
    const anchored = anchorPlacement(stilt, (x) => x / 10, -4);
    expect(anchored.groundLineM).toBeCloseTo(.5);
    expect(anchored.y).toBeCloseTo(4.5);
    // The old stilt branch hard-zeroed this, so no stilt could ever float.
    expect(anchored.gapM).toBeCloseTo(.5);
  });

  it("hangs a mounted child off its parent's final transform, wherever the parent moved", () => {
    // A wall lantern one metre out and three metres up from the hut's pivot.
    const lantern: SettlementPlacement = {
      ...placement, id: "lantern", assetId: "lantern", anchorClass: "wall",
      parentPlacementId: "p", mountOffsetM: [1, 3, 0], yawDeg: 0,
    };
    const low = anchorPlacement(placement, () => 0, -4);
    const high = anchorPlacement(placement, () => 10, -4);
    const at = (parent: ReturnType<typeof anchorPlacement>) =>
      new THREE.Vector3().setFromMatrixPosition(
        mountedTransform(finalPlacementTransform(placement, parent), lantern));
    // The parent's yaw carries the mount point round with it, and the child
    // rises exactly as far as the parent does: no terrain sample anywhere.
    const t = -THREE.MathUtils.degToRad(placement.yawDeg);
    expect(at(low).x).toBeCloseTo(placement.positionM[0] + Math.cos(t));
    expect(at(low).z).toBeCloseTo(placement.positionM[2] - Math.sin(t));
    expect(at(high).y - at(low).y).toBeCloseTo(10);
    expect(at(low).y).toBeCloseTo(low.y + 3);
    // A child with no mount offset is a named error, never a guess at 0.
    expect(() => mountedTransform(new THREE.Matrix4(), { ...lantern, mountOffsetM: undefined }))
      .toThrow(/carries no mountOffsetM/);
  });

  it("grounds a parentless deck piece and refuses a parentless wall or hanging piece", () => {
    const lookup = {
      groundAt: () => 2,
      designedSinkM: -4,
      designedWaterlineM: 0.75,
      parentTransform: () => null,
    };
    // A deck piece the compile found no parent for stands on the terrain
    // exactly as a ground piece does (decision 2).
    const deck = { ...placement, id: "deck", anchorClass: "deck" as const };
    const grounded = resolvePlacement(deck, "deck", lookup)!;
    expect(grounded.anchored?.complete).toBe(true);
    expect(grounded.anchored?.y).toBeCloseTo(6);
    expect(new THREE.Vector3().setFromMatrixPosition(grounded.matrix).y).toBeCloseTo(6);
    // Wall and hanging have nothing to hang from and are a named error.
    for (const anchorClass of ["wall", "hanging"] as const) {
      expect(() => resolvePlacement({ ...placement, anchorClass }, anchorClass, lookup))
        .toThrow(new RegExp(`${anchorClass} placement names no parentPlacementId`));
    }
  });

  it("seats a deck child on its parent's final transform when one is placed", () => {
    const parent = finalPlacementTransform(placement, anchorPlacement(placement, () => 7.25, -4));
    const child: SettlementPlacement = {
      ...placement, id: "crate", anchorClass: "deck",
      parentPlacementId: "p", mountOffsetM: [0, 2.5, 0], yawDeg: 0,
    };
    const seated = resolvePlacement(child, "deck", {
      groundAt: () => 0, designedSinkM: -4, designedWaterlineM: 0.75,
      parentTransform: () => parent,
    })!;
    // No terrain sample: the ground here is 0 and the crate is at the parent's
    // top face, 2.5 m over its pivot.
    expect(seated.anchored).toBeNull();
    expect(new THREE.Vector3().setFromMatrixPosition(seated.matrix).y).toBeCloseTo(11.25 + 2.5);
    // A parent that has not resolved yet is "not yet", never a guess.
    expect(resolvePlacement(child, "deck", {
      groundAt: () => 0, designedSinkM: -4, designedWaterlineM: 0.75,
      parentTransform: () => null,
    })).toBeNull();
  });

  it("floats a hull on its berth's recorded water level, never on the ground", () => {
    const hull: SettlementPlacement = {
      ...placement, id: "hull", anchorClass: "water", waterLevelM: 12.5, scale: 2,
    };
    expect(waterPlacementY(hull, 0.75)).toBeCloseTo(11);
    expect(new THREE.Vector3().setFromMatrixPosition(
      placementTransform(hull, waterPlacementY(hull, 0.75))).y).toBeCloseTo(11);
    expect(() => waterPlacementY({ ...hull, waterLevelM: undefined }, 0.75))
      .toThrow(/no waterLevelM/);
    expect(() => waterPlacementY(hull, NaN)).toThrow(/no designedWaterlineM/);
  });

  it("does not guess a height while a streamed sample is absent", () => {
    const anchored = anchorPlacement(placement, (x) => x === 0 ? null : 1, -4);
    expect(anchored.complete).toBe(false);
    expect(placementGroundAudit(placement, anchored).status).toBe("terrain-unavailable");
  });

  it("uses the same final graded anchor for near instances and far merged vertices", () => {
    // Treat 7.25 m as the final pad surface after the compiler's grade has
    // been consumed. The source blueprint's old Y=99 must never survive.
    const padPlacement = { ...placement, anchor: { ...placement.anchor, groundFit: "pad" as const } };
    const graded = anchorPlacement(padPlacement, () => 7.25, -4);
    const final = finalPlacementTransform(padPlacement, graded);
    const local = new THREE.Matrix4().makeTranslation(2, 1, -3);
    const part = finalPartTransform(padPlacement, graded, local);
    const source = new THREE.BoxGeometry(1, 1, 1);
    const sourceVertex = new THREE.Vector3().fromBufferAttribute(
      source.getAttribute("position") as THREE.BufferAttribute, 0,
    );
    const nearWorld = sourceVertex.clone().applyMatrix4(part);
    const far = mergeTransformedGeometry(source, [part], [graded.groundLineM])!;
    const farWorld = new THREE.Vector3().fromBufferAttribute(
      far.getAttribute("position") as THREE.BufferAttribute, 0,
    );
    expect(farWorld.distanceTo(nearWorld)).toBeLessThan(1e-6);
    expect(new THREE.Vector3().setFromMatrixPosition(final).y).toBeCloseTo(11.25);
    expect(far.getAttribute(SETTLEMENT_GROUND_ATTRIBUTE).getX(0)).toBeCloseTo(7.25);
    far.dispose(); source.dispose();
  });

  it("refuses a final transform until every streamed ground sample exists", () => {
    const incomplete = anchorPlacement(placement, () => null, -4);
    expect(() => finalPlacementTransform(placement, incomplete)).toThrow(/before terrain anchoring/);
  });

  it("reports applied burial and residual floating per settlement", () => {
    const anchored = anchorPlacement(placement, (x) => x / 5, -4);
    const row = placementGroundAudit(placement, anchored);
    expect(anchored.requestedBuryM).toBeCloseTo(-4);
    expect(anchored.buryM).toBeCloseTo(-4);
    expect(row.status).toBe("floating");
    expect(row.gapM).toBeCloseTo(1);
    expect(row.overBuryM).toBe(0);
    const settlements = [{
      id: "s", placementIds: ["p", "missing"], boundaryM: [],
      budgetReport: null, floodBandReport: {}, variants: [],
    }] satisfies SettlementBundle["settlements"];
    const dressing = {
      ...row,
      placementId: "missing",
      settlementId: "s",
      status: "grounded" as const,
      gapM: 0,
      overBuryM: 0,
    };
    const report = settlementGroundAudits(settlements,
      [{ ...row, settlementId: "s" }, dressing])[0];
    expect(report).toMatchObject({
      settlementId: "s", placementsExpected: 2, placementsAudited: 2,
      floating: 1, overBuried: 0, terrainUnavailable: 0,
    });
    expect(report.maxGapM).toBeCloseTo(1);
    expect(report.maxOverBuryM).toBe(0);
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
    expect(material.customProgramCacheKey()).toContain("es-settlement-surface-v1|1|colour");
    material.onBeforeCompile = () => undefined; // exactly what CSM does
    reapplySettlementSurface(material);
    expect(material.onBeforeCompile).not.toBe(first);
    const shader = { uniforms: {}, vertexShader: "#include <common>\n#include <begin_vertex>",
      fragmentShader: "#include <common>\n#include <color_fragment>\n#include <roughnessmap_fragment>" };
    material.onBeforeCompile(shader as never, {} as never);
    expect(shader.vertexShader).toContain(SETTLEMENT_GROUND_ATTRIBUTE);
    expect(shader.vertexShader).toContain("esSettlementHeightAboveGround");
    expect(shader.fragmentShader).toContain("esWallWet");
    expect(Object.keys(shader.uniforms)).toContain("esSettlementNight");
  });

  it("creates an alpha/displacement-matched shadow twin with the same state", () => {
    const material = new THREE.MeshStandardMaterial({ alphaTest: .42, side: THREE.DoubleSide });
    material.name = "reed-window";
    material.map = new THREE.Texture();
    material.alphaMap = new THREE.Texture();
    material.displacementMap = new THREE.Texture();
    material.displacementScale = 1.7;
    material.displacementBias = -.2;
    const uniforms = { esSettlementRain: { value: .8 }, esSettlementNight: { value: 0 } };
    const depth = applySettlementSurfaceWithShadow(material, uniforms, true)!;
    expect(depth.map).toBe(material.map);
    expect(depth.alphaMap).toBe(material.alphaMap);
    expect(depth.alphaTest).toBe(.42);
    expect(depth.displacementMap).toBe(material.displacementMap);
    expect(depth.displacementScale).toBe(1.7);
    expect(depth.userData.esSettlementSurface.uniforms).toBe(uniforms);
    expect(settlementShadowPairErrors(material, depth)).toEqual([]);
    expect(depth.customProgramCacheKey()).toContain("es-settlement-surface-v1|0|depth");
    const shader = { uniforms: {}, vertexShader: "#include <common>\n#include <begin_vertex>",
      fragmentShader: "#include <common>" };
    depth.onBeforeCompile(shader as never, {} as never);
    expect(shader.vertexShader).toContain(SETTLEMENT_GROUND_ATTRIBUTE);
    expect(shader.vertexShader).toContain("esSettlementHeightAboveGround");
    depth.dispose(); material.dispose();
  });

  it("rebuilds and verifies the colour/depth pair at every LOD swap", () => {
    const contract = { absoluteTriangleFloor: [120, 80] as const,
      distancePerFootprintDiagonal: [4, 12] as const, farMergeDistanceM: 900 };
    const uniforms = { esSettlementRain: { value: 0 }, esSettlementNight: { value: 0 } };
    const levels = [20, 100, 1000].map((distance) => {
      const level = architectureLod(distance, 14, 3, contract).level;
      const colour = new THREE.MeshStandardMaterial({ alphaTest: .3 });
      colour.name = `lod-${level}`;
      colour.map = new THREE.Texture();
      const depth = applySettlementSurfaceWithShadow(colour, uniforms)!;
      return { level, colour, depth };
    });
    expect(levels.map((row) => row.level)).toEqual([0, 1, 2]);
    for (const row of levels) expect(settlementShadowPairErrors(row.colour, row.depth)).toEqual([]);
    levels[2].depth.alphaTest = 0;
    expect(settlementShadowPairErrors(levels[2].colour, levels[2].depth))
      .toContain("alpha test differs from shadow-depth alpha test");
    for (const row of levels) { row.depth.dispose(); row.colour.dispose(); }
  });

  it("refuses an architecture draw that cannot carry a verified depth pair", () => {
    expect(settlementShadowPairErrors(new THREE.MeshBasicMaterial(), undefined))
      .toContain("architecture colour material is not a supported physically lit material");
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

  it("bakes each far instance's streamed ground line into its vertices", () => {
    const source = new THREE.BoxGeometry(1, 1, 1);
    const merged = mergeTransformedGeometry(source, [
      new THREE.Matrix4().makeTranslation(0, 4, 0),
      new THREE.Matrix4().makeTranslation(10, 9, 0),
    ], [3.5, 8.25])!;
    const ground = merged.getAttribute(SETTLEMENT_GROUND_ATTRIBUTE);
    const sourceVertices = source.getAttribute("position").count;
    expect(ground.count).toBe(sourceVertices * 2);
    expect(ground.getX(0)).toBeCloseTo(3.5);
    expect(ground.getX(sourceVertices)).toBeCloseTo(8.25);
    expect(() => mergeTransformedGeometry(source,
      [new THREE.Matrix4()], [])).toThrow(/ground-line count/);
    merged.dispose(); source.dispose();
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

  it("keeps every settlement collider resident across focus-ring and chunk boundaries", () => {
    const settlements = [{
      id: "settlement.a", placementIds: ["west", "east"],
      boundaryM: [[0, 0], [130, 0], [130, 100], [0, 100]] as [number, number][],
      budgetReport: null, floodBandReport: {}, variants: [],
    }] satisfies SettlementBundle["settlements"];
    const at = (x: number) => selectCollisionResidency([
      { value: "west", placementId: "west", distanceM: Math.abs(x - 10), parts: 2 },
      { value: "east", placementId: "east", distanceM: Math.abs(x - 120), parts: 2 },
      { value: "outside", placementId: "outside", distanceM: Math.abs(x - 135), parts: 1 },
    ], settlements, { x, z: 50 }, 30, 8);
    // 63 → 65 crosses a 64 m terrain-chunk edge; 20 → 110 also reverses
    // which building would have fallen inside an ordinary 30 m focus ring.
    for (const x of [20, 63, 65, 110]) {
      expect(at(x).residentPlacementIds).toEqual(["east", "west"]);
      expect(at(x).chosen).toEqual(expect.arrayContaining(["east", "west"]));
      expect(at(x).activeSettlementIds).toEqual(["settlement.a"]);
    }
    expect(pointInSettlementBoundary(130, 50, settlements[0].boundaryM)).toBe(true);
  });

  it("fails explicitly rather than dropping an over-budget resident building", () => {
    const settlements = [{
      id: "settlement.a", placementIds: ["large", "small"],
      boundaryM: [[0, 0], [10, 0], [10, 10], [0, 10]] as [number, number][],
      budgetReport: null, floodBandReport: {}, variants: [],
    }] satisfies SettlementBundle["settlements"];
    const selected = selectCollisionResidency([
      { value: "large", placementId: "large", distanceM: 1, parts: 5 },
      { value: "small", placementId: "small", distanceM: 2, parts: 1 },
    ], settlements, { x: 5, z: 5 }, 20, 4);
    expect(selected.chosen).toEqual([]);
    expect(selected.budgetExceeded).toMatchObject({
      activeSettlementIds: ["settlement.a"], requiredResidentParts: 6, partBudget: 4,
      residentPlacementIds: ["large", "small"],
    });
  });
});
