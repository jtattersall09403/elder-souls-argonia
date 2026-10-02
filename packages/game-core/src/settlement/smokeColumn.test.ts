/**
 * Chimney smoke (16k fix round 2, lane effects): the fx placement contract,
 * the distance ladder, the wind drift and the one-draw quad buffer.
 */
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createPlacementResolver } from "./anchoring";
import {
  effectTextureFile, isSmokeColumnPlacement, SMOKE_COLUMN_ASSET_ID, SMOKE_MAX_DISTANCE_M,
  SMOKE_NIGHT_BRIGHTNESS, SmokeColumns, smokeDistanceFade, smokeNightScale, smokePuff, smokeQuadsAt,
} from "./smokeColumn";
import { MeshBasicNodeMaterial } from "three/webgpu";
import { uniform } from "three/tsl";
import { SETTLEMENT_COLLISION_FRAME, type SettlementPlacement } from "./types";
import { PRECIP_LAYER } from "../water/render/waterMaterial";

function placement(over: Partial<SettlementPlacement>): SettlementPlacement {
  return {
    id: "p", sourceId: "s", kind: "settlement", assetId: "a", kit: "k",
    positionM: [0, 0, 0], yawDeg: 0, scale: 1, footprintM: [],
    anchor: { mode: "streamed-origin", groundFit: "direct",
      originOffsetM: [0, 0, 0], buryM: 0, buryCapM: 0.25, slopeBuryPerM: 0 },
    collision: { frame: SETTLEMENT_COLLISION_FRAME, kind: "none" },
    ...over,
  };
}

const house = placement({ id: "house", positionM: [100, 0, 200], yawDeg: 90,
  footprintM: [[95, 195], [105, 195], [105, 205], [95, 205]] });
const smoke = placement({ id: "house.smoke", kind: "effect", assetId: SMOKE_COLUMN_ASSET_ID,
  kit: "works-v1", positionM: [100, 9, 200], parentPlacementId: "house",
  mountOffsetM: [3, 8.5, 0] });

describe("chimney smoke placement contract", () => {
  it("recognises only kind effect with the smoke asset id", () => {
    expect(isSmokeColumnPlacement(smoke)).toBe(true);
    expect(isSmokeColumnPlacement({ kind: "dressing", assetId: SMOKE_COLUMN_ASSET_ID })).toBe(false);
    expect(isSmokeColumnPlacement({ kind: "effect", assetId: "fx:other" })).toBe(false);
  });

  it("sits at the parent's final transform times its mount offset", () => {
    const resolve = createPlacementResolver([house, smoke],
      (p) => (isSmokeColumnPlacement(p) ? { anchorClass: "fx" }
        : { designedSinkM: { p25: 0, p50: 0, p75: 0, n: 1, evidence: "plugin" } }),
      () => 10);
    const at = new THREE.Vector3().setFromMatrixPosition(resolve(smoke)!.matrix);
    const parent = new THREE.Vector3().setFromMatrixPosition(resolve(house)!.matrix);
    // yaw 90 rotates the parent-local +x offset onto world -z (three.js -yaw about +Y)
    expect(at.y - parent.y).toBeCloseTo(8.5, 5);
    expect(Math.hypot(at.x - parent.x, at.z - parent.z)).toBeCloseTo(3, 5);
  });

  it("refuses an fx placement with no parent instead of grounding it", () => {
    const orphan = { ...smoke, parentPlacementId: null, mountOffsetM: undefined };
    const resolve = createPlacementResolver([orphan], () => ({ anchorClass: "fx" }), () => 10);
    expect(() => resolve(orphan)).toThrow(/fx placement names no parentPlacementId/);
  });

  it("names a kit manifest with no effect texture row", () => {
    expect(effectTextureFile({ effectTextures: { [SMOKE_COLUMN_ASSET_ID]: {
      file: "works-v1-fx/smokeparticles01.png" } } }, SMOKE_COLUMN_ASSET_ID, "m"))
      .toBe("works-v1-fx/smokeparticles01.png");
    expect(() => effectTextureFile({ assets: [] }, SMOKE_COLUMN_ASSET_ID, "m"))
      .toThrow(/no effectTextures row for fx:smoke-column/);
  });
});

describe("chimney smoke distance ladder", () => {
  it("steps 16 / 12 / 8 puffs on the 0075 rungs and draws nothing past 150 m", () => {
    expect([10, 39, 60, 120, 150, 151].map(smokeQuadsAt)).toEqual([16, 16, 12, 8, 8, 0]);
  });
  it("fades over the last 30 m", () => {
    expect(smokeDistanceFade(100)).toBe(1);
    expect(smokeDistanceFade(135)).toBeCloseTo(0.5, 5);
    expect(smokeDistanceFade(SMOKE_MAX_DISTANCE_M)).toBe(0);
  });
});

describe("chimney smoke motion", () => {
  it("rises and drifts downwind, further with a stronger wind", () => {
    const calm = smokePuff(8, 16, 0, { dirXZ: [0, 1], speedMS: 1 });
    const gale = smokePuff(8, 16, 0, { dirXZ: [0, 1], speedMS: 8 });
    expect(calm.offset[1]).toBeGreaterThan(0);
    expect(gale.offset[2]).toBeGreaterThan(calm.offset[2]);
    expect(gale.offset[2]).toBeGreaterThan(0);
  });
  it("is continuous: puffs are phased evenly over the lifetime", () => {
    const heights = Array.from({ length: 16 }, (_, i) => smokePuff(i, 16, 3, { dirXZ: [1, 0], speedMS: 0 }).offset[1]);
    const sorted = [...heights].sort((a, b) => a - b);
    const gaps = sorted.slice(1).map((h, i) => h - sorted[i]);
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThan(1e-6);
  });
});

describe("SmokeColumns draw", () => {
  it("carries a position attribute from construction (walk 10 node-builder warning)", () => {
    const columns = new SmokeColumns(new THREE.Texture());
    expect(columns.mesh.geometry.getAttribute("position")).toBeDefined();
    for (const a of ["normal", "uv", "color"]) expect(columns.mesh.geometry.getAttribute(a)).toBeDefined();
    const camera = new THREE.PerspectiveCamera();
    camera.updateMatrixWorld();
    expect(columns.update(1, camera, { dirXZ: [1, 0], speedMS: 2 })).toBe(0);
    columns.dispose();
  });
  it("writes quads only for columns inside 150 m, in one draw", () => {
    const columns = new SmokeColumns(new THREE.Texture());
    columns.setAnchors([
      { id: "near", position: new THREE.Vector3(0, 10, 0) },
      { id: "far", position: new THREE.Vector3(400, 10, 0) },
    ]);
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 12, 20);
    camera.lookAt(0, 10, 0);
    camera.updateMatrixWorld();
    const quads = columns.update(1, camera, { dirXZ: [1, 0], speedMS: 2 });
    expect(quads).toBe(16);
    expect(columns.mesh.geometry.drawRange.count).toBe(16 * 6);
    columns.dispose();
  });
});

describe("smoke night dimming (16k fix 2 round 4 E3)", () => {
  it("dims to SMOKE_NIGHT_BRIGHTNESS at full night, not at all by day", () => {
    expect(smokeNightScale(0)).toBe(1);
    expect(smokeNightScale(1)).toBeCloseTo(SMOKE_NIGHT_BRIGHTNESS, 9);
    expect(smokeNightScale(0.5)).toBeCloseTo((1 + SMOKE_NIGHT_BRIGHTNESS) / 2, 9);
  });

  it("reads the settlement night uniform by reference in its colour slot", () => {
    const night = { value: 0 };
    const columns = new SmokeColumns(new THREE.Texture(), night);
    const material = columns.mesh.material as MeshBasicNodeMaterial;
    expect(material.isNodeMaterial).toBe(true);
    expect(material.colorNode).not.toBeNull();
    // A classic { value } is bridged with reference(): it reads night.value each frame.
    expect((columns.nightNode as { object?: unknown }).object).toBe(night);
    // A uniform node is used as is.
    const node = uniform(0.3);
    expect(new SmokeColumns(new THREE.Texture(), node).nightNode).toBe(node);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.fog).toBe(true);
    columns.dispose();
  });
});

describe("smoke draws after the water surface (walk 2 D8)", () => {
  it("sits on the post-water layer, like rain", () => {
    const smoke = new SmokeColumns(new THREE.Texture());
    expect(smoke.mesh.layers.mask).toBe(1 << PRECIP_LAYER);
    smoke.dispose();
  });
});

describe("smoke lighting (0112 §3)", () => {
  it("setLighting turns the lit path on and normalises the sun direction", () => {
    const columns = new SmokeColumns(new THREE.Texture());
    const light = (columns as unknown as { light: { sunDir: { value: THREE.Vector3 }; sunIrr: { value: THREE.Color }; lit: { value: number } } }).light;
    expect(light.lit.value).toBe(0);
    columns.setLighting(new THREE.Vector3(0, 3, 4), new THREE.Color(2, 1, 0.5), new THREE.Color(0.1, 0.2, 0.3));
    expect(light.lit.value).toBe(1);
    expect(light.sunDir.value.length()).toBeCloseTo(1, 6);
    expect(light.sunDir.value.y).toBeCloseTo(0.6, 6);
    expect(light.sunIrr.value.r).toBeCloseTo(2, 6);
  });
});
