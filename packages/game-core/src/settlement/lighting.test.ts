/**
 * Settlement lighting (walk 2 D7): the lamp clock, the fixture light, the
 * nearest-eight budget and the window lights.
 */
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  ALWAYS_LIT_DAY_FACTOR, artificialLightFactor, fixtureFromFireSocket, fixtureFromPiece,
  fixtureLightOf, FIXTURE_CANDELA, FIXTURE_DEFAULT_RADIUS_M, isAlwaysLitFixture, isFireSocket,
  isLightFixturePlacement, LIGHT_BUDGET, LIGHTS_ACTIVE_M, nearestFixtures,
  SettlementLightFixtures, windowFixturesFromPiece,
} from "./lighting";
import { PRECIP_LAYER } from "../water/render/waterMaterial";
import type { SettlementKitAssetMeta } from "./types";

const hm = (h: number, m = 0) => h * 60 + m;

describe("artificialLightFactor", () => {
  it("is 1 from 17:30 to 06:30, 0 from 06:50 to 17:10, linear between", () => {
    for (const t of [hm(17, 30), hm(20), hm(0), hm(3), hm(6, 30)]) expect(artificialLightFactor(t)).toBe(1);
    for (const t of [hm(6, 50), hm(9), hm(12), hm(17, 10)]) expect(artificialLightFactor(t)).toBe(0);
    expect(artificialLightFactor(hm(6, 40))).toBeCloseTo(0.5, 9);
    expect(artificialLightFactor(hm(17, 20))).toBeCloseTo(0.5, 9);
    expect(artificialLightFactor(hm(6, 35))).toBeCloseTo(0.75, 9);
    expect(artificialLightFactor(hm(17, 15))).toBeCloseTo(0.25, 9);
  });

  it("reads the minute of day from any epoch minute, negative included", () => {
    expect(artificialLightFactor(1440 * 37 + hm(12))).toBe(0);
    expect(artificialLightFactor(-1440 + hm(22))).toBe(1);
  });
});

describe("light fixtures", () => {
  const box = new THREE.Box3(new THREE.Vector3(-0.2, 0, -0.2), new THREE.Vector3(0.2, 0.6, 0.2));

  it("a fixture without a recorded radius gets 6 m and the warm default", () => {
    const { radiusM, colour } = fixtureLightOf(undefined);
    expect(radiusM).toBe(FIXTURE_DEFAULT_RADIUS_M);
    expect(radiusM).toBe(6);
    const srgb = colour.clone().convertLinearToSRGB();
    expect([srgb.r, srgb.g, srgb.b].map((v) => Math.round(v * 255))).toEqual([255, 190, 120]);
  });

  it("a recorded LIGH record sets radius and colour", () => {
    const { radiusM } = fixtureLightOf({ formId: "00088243", burnSeconds: -1, radiusUnits: 256,
      colourRgb: [197, 156, 112], flags: [] });
    expect(radiusM).toBeCloseTo(256 * 0.01428, 6);
  });

  it("is a light-layer piece or a piece with a LIGH record; never an effect", () => {
    expect(isLightFixturePlacement({ kind: "settlement", layer: "light" }, undefined)).toBe(true);
    expect(isLightFixturePlacement({ kind: "settlement", layer: "clutter" }, undefined)).toBe(false);
    const lit: SettlementKitAssetMeta = { light: { formId: "1", burnSeconds: -1, radiusUnits: 1,
      colourRgb: [1, 1, 1], flags: [] } };
    expect(isLightFixturePlacement({ kind: "settlement" }, lit)).toBe(true);
    expect(isLightFixturePlacement({ kind: "effect", layer: "light" }, lit)).toBe(false);
    expect(isFireSocket({ provenance: { ruleId: "effect-socket/fire" } })).toBe(true);
    expect(isFireSocket({})).toBe(false);
  });

  it("billboards a flame on top unless the kit has its own flame submesh", () => {
    const at = new THREE.Matrix4().makeTranslation(10, 2, 5);
    const candle = fixtureFromPiece("c", {}, at, box);
    expect(candle.flame?.position.y).toBeCloseTo(2 + 0.6 + 0.1, 6);
    expect(candle.position.toArray()).toEqual(candle.flame?.position.toArray());
    const fire = fixtureFromPiece("f", { additiveMaterials: ["Glow:2.Mat"] }, at, box);
    expect(fire.flame).toBeNull();
  });

  it("puts one 4 m window light 0.5 m inside each glow facing of an architecture piece", () => {
    const house = new THREE.Box3(new THREE.Vector3(-10, 0, -5), new THREE.Vector3(10, 10, 5));
    const meta: SettlementKitAssetMeta = { category: "architecture", glowFacingsDeg: [90, 270] };
    const windows = windowFixturesFromPiece("h", meta, new THREE.Matrix4(), house);
    expect(windows.map((w) => [w.position.x, w.position.y, w.position.z, w.radiusM]))
      .toEqual([[9.5, 1.5, expect.closeTo(0, 9), 4], [expect.closeTo(-9.5, 9), 1.5, expect.closeTo(0, 9), 4]]);
    expect(windowFixturesFromPiece("f", { ...meta, category: "misc" }, new THREE.Matrix4(), house))
      .toEqual([]);
  });

  it("the budget lights the nearest 8, re-chosen once a second, scaled by the factor", () => {
    const fixtures = Array.from({ length: 12 }, (_, i) => fixtureFromPiece(`f${i}`, {},
      new THREE.Matrix4().makeTranslation(i * 10, 0, 0), box));
    expect(nearestFixtures(fixtures, new THREE.Vector3(55, 0, 0))).toEqual([5, 6, 4, 7, 3, 8, 2, 9]);
    const factor = { value: 1 };
    const manager = new SettlementLightFixtures(factor);
    expect(manager.lights).toHaveLength(LIGHT_BUDGET);
    manager.setFixtures(fixtures);
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 0, 0); camera.updateMatrixWorld();
    manager.update(0, camera);
    expect(manager.litIds).toEqual(["f0", "f1", "f2", "f3", "f4", "f5", "f6", "f7"]);
    expect(manager.lights.every((l) => l.intensity > 0 && l.decay === 2 && !l.castShadow)).toBe(true);
    camera.position.set(110, 0, 0); camera.updateMatrixWorld();
    manager.update(0.5, camera);
    expect(manager.litIds[0]).toBe("f0");
    manager.update(1.0, camera);
    expect(manager.litIds[0]).toBe("f11");
    expect(manager.lights.every((l) => l.visible)).toBe(true);
    factor.value = 0;
    manager.update(1.2, camera);
    expect(manager.lights.every((l) => l.intensity === 0 && !l.visible)).toBe(true);
    // lamps lit but no fixture within LIGHTS_ACTIVE_M: the pool is off
    factor.value = 1;
    camera.position.set(110 + LIGHTS_ACTIVE_M + 1, 0, 0); camera.updateMatrixWorld();
    manager.update(3, camera);
    expect(manager.lights.some((l) => l.visible)).toBe(false);
    manager.dispose();
  });

  it("draws billboard flames on the post-water layer", () => {
    const manager = new SettlementLightFixtures({ value: 1 });
    manager.setFlameTexture(new THREE.Texture());
    const flames = manager.group.getObjectByName("settlement-fixture-flames")!;
    expect(flames.layers.mask).toBe(1 << PRECIP_LAYER);
    const first = (flames as THREE.Mesh).material as THREE.MeshBasicMaterial;
    const old = first.map!;
    let disposed = false;
    old.addEventListener("dispose", () => { disposed = true; });
    const next = new THREE.Texture();
    manager.setFlameTexture(next);
    expect(first.map).toBe(next);
    expect(disposed).toBe(true);
    manager.dispose();
  });
});

describe("fires that burn by day (planner ruling, walk 2)", () => {
  const box = new THREE.Box3(new THREE.Vector3(-0.2, 0, -0.2), new THREE.Vector3(0.2, 0.6, 0.2));
  const light = (fixtureKind: string): SettlementKitAssetMeta => ({ light: { formId: "1",
    burnSeconds: -1, radiusUnits: 256, colourRgb: [200, 150, 100], flags: [], fixtureKind } });
  const drawn = (manager: SettlementLightFixtures) => {
    const flames = manager.group.getObjectByName("settlement-fixture-flames") as THREE.Mesh;
    const geometry = flames.geometry;
    const quads = geometry.drawRange.count / 6;
    const color = geometry.getAttribute("color") as THREE.BufferAttribute;
    return Array.from({ length: quads }, (_, q) => color.getX(q * 4));
  };
  const intensityOf = (manager: SettlementLightFixtures, id: string) =>
    manager.lights[manager.litIds.indexOf(id)].intensity;

  it("braziers, cook-fires, forges, campfires and fire sockets are always lit; lamps are not", () => {
    for (const kind of ["brazier", "cook-fire", "forge", "campfire"]) {
      expect(isAlwaysLitFixture(light(kind))).toBe(true);
      expect(isAlwaysLitFixture({ category: kind })).toBe(true);
    }
    for (const kind of ["lantern", "candle", "sconce", "torch"]) expect(isAlwaysLitFixture(light(kind))).toBe(false);
    expect(isAlwaysLitFixture(undefined)).toBe(false);
    expect(fixtureFromFireSocket("s", new THREE.Vector3()).alwaysLit).toBe(true);
    expect(fixtureFromPiece("c", light("candle"), new THREE.Matrix4(), box).alwaysLit).toBe(false);
  });

  it("a brazier at noon has flame and light at 0.5, a candle none; both 1.0 at night", () => {
    const factor = { value: artificialLightFactor(12 * 60) };
    expect(factor.value).toBe(0);
    const manager = new SettlementLightFixtures(factor);
    manager.setFlameTexture(new THREE.Texture());
    manager.setFixtures([
      fixtureFromPiece("brazier", light("brazier"), new THREE.Matrix4().makeTranslation(2, 0, 0), box),
      fixtureFromPiece("candle", light("candle"), new THREE.Matrix4().makeTranslation(-2, 0, 0), box),
    ]);
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 1, 5); camera.updateMatrixWorld();
    manager.update(0, camera);
    expect(ALWAYS_LIT_DAY_FACTOR).toBe(0.5);
    expect(manager.lights.every((l) => l.visible)).toBe(true);
    expect(intensityOf(manager, "brazier")).toBeCloseTo(FIXTURE_CANDELA * 0.5, 9);
    expect(intensityOf(manager, "candle")).toBe(0);
    expect(drawn(manager)).toEqual([0.5]);
    factor.value = artificialLightFactor(22 * 60);
    manager.update(0.1, camera);
    expect(intensityOf(manager, "brazier")).toBeCloseTo(FIXTURE_CANDELA, 9);
    expect(intensityOf(manager, "candle")).toBeCloseTo(FIXTURE_CANDELA, 9);
    expect(drawn(manager)).toEqual([1, 1]);
    manager.dispose();
  });

  it("a lamp-only settlement by day keeps the pool off", () => {
    const manager = new SettlementLightFixtures({ value: 0 });
    manager.setFixtures([fixtureFromPiece("candle", light("candle"), new THREE.Matrix4(), box)]);
    const camera = new THREE.PerspectiveCamera(); camera.updateMatrixWorld();
    manager.update(0, camera);
    expect(manager.lights.some((l) => l.visible)).toBe(false);
    manager.dispose();
  });
});

describe("the recorded LIGH offset places the light, never the flame", () => {
  it("the lantern's light sits at its recorded offset and its flame on its candle's wick", () => {
    // settlement-imperial-v1 candlelanternwithcandle01 (DefaultCandleLight01NSDesat, n 246)
    const lantern: SettlementKitAssetMeta = { light: { formId: "00088241", burnSeconds: -1,
      radiusUnits: 256, colourRgb: [242, 240, 223], flags: ["dynamic", "flicker", "portalStrict"],
      offsetM: [0.03, 0.63, 0.05], flameOffsetM: [0.0037, 0.103, -0.0015], fixtureKind: "lantern" } };
    const bounds = new THREE.Box3(new THREE.Vector3(-0.129, -0.024, -0.12), new THREE.Vector3(0.131, 0.591, 0.127));
    const at = new THREE.Matrix4().makeTranslation(10, 2, 5);
    const fixture = fixtureFromPiece("l", lantern, at, bounds);
    // vanilla stands the LIGH beside and above the piece (review: a brazier's
    // offset [-0.09, 1.3, -0.18] floated its flame 0.8 m over the bowl)
    expect(fixture.position.toArray().map((v) => +v.toFixed(6))).toEqual([10.03, 2.63, 5.05]);
    // the flame seats on the candle submesh top (0.103 m), not the frame top (0.591 m)
    const wick = 0.103 + 0.4 * (fixture.flame?.sizeM ?? 0);
    expect(fixture.flame?.position.toArray().map((v) => +v.toFixed(6)))
      .toEqual([10.0037, +(2 + wick).toFixed(6), 4.9985]);
    expect(fixture.radiusM).toBeCloseTo(256 * 0.01428, 6);
    const srgb = fixture.colour.clone().convertLinearToSRGB();
    expect([srgb.r, srgb.g, srgb.b].map((v) => Math.round(v * 255))).toEqual([242, 240, 223]);
  });
});
