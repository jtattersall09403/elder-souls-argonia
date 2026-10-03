import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
import { toEpochMinutes } from "@elder-souls/world-time";
import { MeshStandardNodeMaterial } from "three/webgpu";
import {
  applySettlementSurface,
  cloneSettlementMaterial,
  createSettlementMaterialUniforms,
  isSettlementGlowMaterial,
  settlementSurfaceOf,
  settlementWallWetness,
  settlementWetAlbedoScale,
  updateSettlementEnvironment,
  SETTLEMENT_GROUND_ATTRIBUTE,
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

  it("applies a yFinal placement's measured y verbatim and re-anchors the rest (16k walk 2)", () => {
    // The workbench measured the pivot at 36.6375 on the padded chunks; the
    // terrain here would seat it at 4.25. yFinal wins; without it, the anchor.
    const measured = { ...placement, positionM: [5, 36.6375, 5] as [number, number, number], yFinal: true as const };
    const final = anchorPlacement(measured, (x) => x / 20, -4);
    expect(final.complete).toBe(true);
    expect(final.y).toBe(36.6375);
    expect(final.groundLineM).toBeCloseTo(.25);          // still audited
    expect(anchorPlacement({ ...measured, yFinal: undefined }, (x) => x / 20, -4).y).toBeCloseTo(4.25);
    // a final y needs no terrain to be placed
    const noGround = anchorPlacement(measured, () => null, -4);
    expect(noGround.complete).toBe(true);
    expect(noGround.y).toBe(36.6375);
    expect(anchorPlacement(placement, () => null, -4).complete).toBe(false);
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

  it("draws a mounted child at its own scale, not its parent's", () => {
    // CLAYWATER2 ruling 2: the brazier flame is 0.336 of its mesh in a
    // brazier at scale 1.2; a child compiled at its parent's scale stays 1:1.
    const parent = new THREE.Matrix4().compose(
      new THREE.Vector3(10, 2, 5), new THREE.Quaternion(), new THREE.Vector3(1.2, 1.2, 1.2));
    const flame: SettlementPlacement = {
      ...placement, id: "flame", assetId: "flame", anchorClass: "fx",
      parentPlacementId: "p", mountOffsetM: [0, 0.5, 0], yawDeg: 0, scale: 0.336,
    };
    const scaleOf = (m: THREE.Matrix4) => new THREE.Vector3().setFromMatrixScale(m).x;
    expect(scaleOf(mountedTransform(parent, flame))).toBeCloseTo(0.336);
    expect(new THREE.Vector3().setFromMatrixPosition(mountedTransform(parent, flame)).y)
      .toBeCloseTo(2 + 0.5 * 1.2);
    expect(scaleOf(mountedTransform(parent, { ...flame, scale: 1.2 }))).toBeCloseTo(1.2);
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
      // ...unless the workbench seated it: a yFinal pose is the record (0097)
      const posed = resolvePlacement({ ...placement, anchorClass, yFinal: true }, anchorClass, lookup)!;
      expect(new THREE.Vector3().setFromMatrixPosition(posed.matrix).y).toBeCloseTo(placement.positionM[1]);
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

  it("draws a workbench-seated (yFinal) water piece at its measured y, not the kit waterline", () => {
    // Claywater walk 5: dockstrent02 (waterline -1.5931) seated at 35.51 over
    // water 35.24 was drawn at 36.83.
    const dock: SettlementPlacement = {
      ...placement, id: "dock", anchorClass: "water", waterLevelM: 35.24,
      positionM: [0, 35.51, 0], yFinal: true,
    };
    const lookup = { groundAt: () => 0, designedSinkM: 0, designedWaterlineM: -1.5931, parentTransform: () => null };
    const seated = resolvePlacement(dock, "water", lookup)!;
    expect(new THREE.Vector3().setFromMatrixPosition(seated.matrix).y).toBeCloseTo(35.51);
    const floated = resolvePlacement({ ...dock, yFinal: undefined }, "water", lookup)!;
    expect(new THREE.Vector3().setFromMatrixPosition(floated.matrix).y).toBeCloseTo(36.8331);
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

  it("lets small dressing ship one tier and keeps three for architecture (0102 decision 6)", () => {
    const contract = { absoluteTriangleFloor: [120, 80] as const,
      distancePerFootprintDiagonal: [4, 12] as const, farMergeDistanceM: 900 };
    // chickennest01 as published: the imperial kit GLB carries LOD0 only
    // (no `__lod1`/`__lod2` nodes), and its measured size is read here.
    const nest = (JSON.parse(readFileSync(resolve(import.meta.dirname,
      "../../../../apps/world-studio/public/kits/settlement-imperial-v1.kit.json"), "utf8"))
      .assets as { id: string; sizeM: number[] }[])
      .find((asset) => asset.id === "vanilla:plants/chickennest01")!;
    const nestPiece = { longestSideM: Math.max(...nest.sizeM), kind: "dressing" };
    expect(nestPiece.longestSideM).toBeLessThan(1.5);
    expect(() => validateLodTriangles([1088], contract, nestPiece)).not.toThrow();
    expect(architectureLod(20, 1.3, 1, contract, 1, 350, nestPiece).level).toBe(0);
    expect(architectureLod(300, 1.3, 1, contract, 1, 350, nestPiece).level).toBe(0);
    // Clutter under the bar may too; the kind is what the placement says it is.
    expect(() => architectureLod(5, 1, 1, contract, 1, 350,
      { longestSideM: 0.4, kind: "clutter" })).not.toThrow();
    // Size alone is not enough: a small architecture piece keeps three tiers.
    expect(() => architectureLod(5, 1, 1, contract, 1, 350,
      { longestSideM: 0.9, kind: "settlement" })).toThrow(/three-tier/);
    expect(() => validateLodTriangles([1088], contract,
      { longestSideM: 0.9, kind: "fence" })).toThrow(/three-tier/);
    // Kind alone is not enough: dressing at or over 1.5 m keeps three tiers.
    expect(() => architectureLod(5, 2, 1, contract, 1, 350,
      { longestSideM: 1.5, kind: "dressing" })).toThrow(/three-tier/);
    expect(() => validateLodTriangles([1088], contract,
      { longestSideM: 2.1, kind: "dressing" })).toThrow(/three-tier/);
  });
});

describe("settlement material node features", () => {
  it("wraps the colour, emissive and roughness slots once; the same state again changes nothing", () => {
    const material = new MeshStandardNodeMaterial();
    const uniforms = createSettlementMaterialUniforms();
    applySettlementSurface(material, uniforms, true);
    expect(material.userData.esAerial).toBe(true);
    const slots = [material.colorNode, material.emissiveNode, material.roughnessNode];
    expect(slots.every(Boolean)).toBe(true);
    const version = material.version;
    applySettlementSurface(material, uniforms, true);
    expect([material.colorNode, material.emissiveNode, material.roughnessNode]).toEqual(slots);
    expect(material.version).toBe(version);
    // state and base slots never land in the JSON-copied userData
    expect(Object.keys(material.userData)).toEqual(["esAerial"]);
    expect(settlementSurfaceOf(material)?.glowMaterial).toBe(true);
  });

  it("a classic material is left alone (kit.ts converts at load)", () => {
    const classic = new THREE.MeshStandardMaterial();
    applySettlementSurface(classic, createSettlementMaterialUniforms(), true);
    expect(settlementSurfaceOf(classic)).toBeNull();
  });

  // Check-in 2 item 8: the night glow is the kit's emissive mask, lit in the
  // EMISSIVE stage, chosen by the emissive map, ramped on the lamp clock.
  it("lights a glow material in the emissive stage and leaves a plain one's emissive alone", () => {
    const glow = new MeshStandardNodeMaterial({ emissive: 0xffffff });
    glow.name = "Farmhouse01:14.Mat"; // no "window" in the name, as shipped
    glow.emissiveMap = new THREE.Texture();
    const plain = new MeshStandardNodeMaterial();
    plain.name = "window-frame"; // a name match must not make it glow
    expect(isSettlementGlowMaterial(glow)).toBe(true);
    expect(isSettlementGlowMaterial(plain)).toBe(false);
    const uniforms = createSettlementMaterialUniforms();
    applySettlementSurface(glow, uniforms, isSettlementGlowMaterial(glow));
    applySettlementSurface(plain, uniforms, isSettlementGlowMaterial(plain));
    expect(glow.emissiveNode).toBeTruthy();
    expect(plain.emissiveNode).toBeNull();
    expect(glow.lights).toBe(true);
  });

  it("wetness: full at the ground line, 0.55 of the rain from 4 m up; albedo to 0.62 x at the wet share", () => {
    expect(settlementWallWetness(1, 0)).toBe(1);
    expect(settlementWallWetness(1, -2)).toBe(1);
    expect(settlementWallWetness(1, 4)).toBeCloseTo(0.55, 12);
    expect(settlementWallWetness(0.5, 2)).toBeCloseTo(0.5 * (0.55 + 0.45 * 0.5), 12);
    expect(settlementWetAlbedoScale(0)).toBe(1);
    expect(settlementWetAlbedoScale(1)).toBeCloseTo(1 - 0.38 * 0.55, 12);
  });

  it("lights windows on the lamp clock (lighting.ts), not the sun", () => {
    const uniforms = createSettlementMaterialUniforms();
    const at = (minuteOfDay: number) => {
      updateSettlementEnvironment(uniforms, 0,
        toEpochMinutes({ era: 4, year: 201, month: 6, day: 14, minuteOfDay }), 22);
      return uniforms.esSettlementNight.value;
    };
    expect(at(720)).toBe(0);
    expect(at(0)).toBe(1);
    expect(at(17 * 60 + 30)).toBe(1);
    expect(at(17 * 60 + 20)).toBeCloseTo(0.5, 6);
  });

  it("the shadow pass reuses the colour material: no depth twin, the textures and alpha test are the material's own", () => {
    const material = new MeshStandardNodeMaterial({ alphaTest: .42, side: THREE.DoubleSide });
    material.map = new THREE.Texture();
    applySettlementSurface(material, createSettlementMaterialUniforms(), false);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
    expect(mesh.customDepthMaterial).toBeUndefined();
    expect(material.castShadowPositionNode).toBeNull();
    expect(material.maskShadowNode).toBeNull();
    expect(material.alphaTest).toBe(.42);
  });

  it("a glow-kind variant copies the textures and re-wraps from the material's own slots, never stacking", () => {
    const material = new MeshStandardNodeMaterial({ alphaTest: .3, side: THREE.DoubleSide });
    material.map = new THREE.Texture();
    material.userData = { additive: true, gain: 2.5 };
    const uniforms = createSettlementMaterialUniforms();
    applySettlementSurface(material, uniforms, "lamp-flame");
    material.userData.esNode_mipAlphaBoost = true;
    const variant = cloneSettlementMaterial(material);
    expect([variant.map, variant.alphaTest, variant.side]).toEqual([material.map, .3, THREE.DoubleSide]);
    expect(variant.colorNode).toBeNull();
    expect(variant.lights).toBe(true);
    expect(variant.userData.esNode_mipAlphaBoost).toBeUndefined();
    applySettlementSurface(variant, uniforms, "flame");
    expect(settlementSurfaceOf(variant)).toEqual({ glowMaterial: "flame", flameGain: 2.5 });
    expect(settlementSurfaceOf(material)?.glowMaterial).toBe("lamp-flame");
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

  it("keeps every far-merge vertex buffer 4-byte aligned for WebGPU (walk 8)", () => {
    // the kit layout: octahedral int8 normals padded to stride 4 in an interleaved buffer
    const source = new THREE.BoxGeometry(1, 1, 1);
    const count = source.getAttribute("position").count;
    const packed = new Int8Array(count * 4);
    const normal = source.getAttribute("normal");
    for (let i = 0; i < count; i += 1) {
      packed[i * 4] = Math.round(normal.getX(i) * 127);
      packed[i * 4 + 1] = Math.round(normal.getY(i) * 127);
      packed[i * 4 + 2] = Math.round(normal.getZ(i) * 127);
    }
    source.setAttribute("normal", new THREE.InterleavedBufferAttribute(
      new THREE.InterleavedBuffer(packed, 4), 3, 0, true));
    const merged = mergeTransformedGeometry(source, [new THREE.Matrix4(), new THREE.Matrix4().makeTranslation(5, 0, 0)])!;
    for (const [name, attribute] of Object.entries(merged.attributes)) {
      const a = attribute as THREE.BufferAttribute;
      expect([name, (a.array.BYTES_PER_ELEMENT * a.itemSize) % 4]).toEqual([name, 0]);
    }
    expect(merged.getAttribute("normal").getY(2)).toBeCloseTo(normal.getY(2), 1);
    merged.dispose(); source.dispose();
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
