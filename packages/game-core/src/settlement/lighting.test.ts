/**
 * Settlement lighting (walk 2 D7): the lamp clock, the fixture light, the
 * lights band (R3: every burning fixture within 200 m, capped at 16), the
 * stepped light counts and flame reach (R11).
 */
import * as THREE from "three";
import * as lighting from "./lighting";
import { describe, expect, it } from "vitest";
import {
  ALWAYS_LIT_DAY_FACTOR, artificialLightFactor, fixtureFromFireSocket, fixtureFromPiece,
  fixtureLightOf, FIXTURE_CANDELA, FIXTURE_DEFAULT_RADIUS_M, FIXTURE_LIGHT_RGB, isAlwaysLitFixture,
  isFireSocket, fixturesInBand, FLAME_FLICKER_ALPHA, FLAME_MAX_DISTANCE_M, FLAME_MIN_ANGLE_RAD,
  FLAME_RISE, FLAME_TEXTURE_ASSET_ID, isLightFixturePlacement, isSpriteHolderPlacement,
  LIGHT_COUNT_STEPS, lightCountStep,
  LIGHTS_ACTIVE_M, LIGHTS_CAP,
  SettlementLightFixtures,
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

  const srgbOf = (colour: THREE.Color) => {
    const srgb = colour.clone().convertLinearToSRGB();
    return [srgb.r, srgb.g, srgb.b].map((v) => Math.round(v * 255));
  };

  it("a fixture without a recorded radius gets 6 m; every fixture is the fire's orange", () => {
    const { radiusM, colour } = fixtureLightOf(undefined);
    expect(radiusM).toBe(FIXTURE_DEFAULT_RADIUS_M);
    expect(radiusM).toBe(6);
    expect(FIXTURE_LIGHT_RGB).toEqual([226, 140, 63]);
    expect(srgbOf(colour)).toEqual([226, 140, 63]);
  });

  it("a recorded LIGH record sets the radius, never the colour (walk 4)", () => {
    const { radiusM, colour } = fixtureLightOf({ formId: "00088241", burnSeconds: -1, radiusUnits: 256,
      colourRgb: [242, 240, 223], flags: [] });
    expect(radiusM).toBeCloseTo(256 * 0.01428, 6);
    expect(srgbOf(colour)).toEqual([226, 140, 63]);
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

  it("a piece with no mined flame gets one fallback flame on top, unless its own flame cards burn", () => {
    const at = new THREE.Matrix4().makeTranslation(10, 2, 5);
    const candle = fixtureFromPiece("c", {}, at, box);
    expect(candle.flames).toHaveLength(1);
    expect(candle.flames[0].texture).toBe(FLAME_TEXTURE_ASSET_ID);
    expect(candle.flames[0].atlas).toEqual([2, 2]);
    expect(candle.flames[0].position.y).toBeCloseTo(2 + 0.6 + 0.1, 6);
    expect(candle.position.toArray()).toEqual(candle.flames[0].position.toArray());
    // log glow overlays are no flame: the fallback stays
    expect(fixtureFromPiece("g", { additiveMaterials: ["Glow:2.Mat"] }, at, box).flames).toHaveLength(1);
    const brazierFire = fixtureFromPiece("f", { additiveMaterials: ["L2_Flames02grant:0.Mat"],
      flameCardMaterials: ["L2_Flames02grant:0.Mat"] }, at, box);
    expect(brazierFire.flames).toHaveLength(0);
  });

  it("the band and the cap are the R3 numbers the place gate reads", () => {
    expect(LIGHTS_ACTIVE_M).toBe(200);
    expect(LIGHTS_CAP).toBe(16);
  });

  const ring = (n: number, radiusM: number, prefix = "f") => Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return fixtureFromPiece(`${prefix}${i}`, {},
      new THREE.Matrix4().makeTranslation(Math.cos(a) * radiusM, 0, Math.sin(a) * radiusM), box);
  });
  const lit = (manager: SettlementLightFixtures) =>
    manager.lights.filter((l) => l.visible && l.intensity > 0);
  const flameQuads = (manager: SettlementLightFixtures) => manager.spriteQuads();
  const at = (x: number) => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(x, 0, 0); camera.updateMatrixWorld();
    return camera;
  };

  it("20 fixtures at 50 m: the 16 nearest emit, the other 4 keep their sprite", () => {
    const manager = new SettlementLightFixtures({ value: 1 });
    manager.setFlameTexture(new THREE.Texture());
    // the camera 2 m off centre gives every fixture a distinct distance near 50 m
    manager.setFixtures(ring(20, 50));
    manager.update(0, at(2));
    expect(lit(manager)).toHaveLength(16);
    expect(manager.lights).toHaveLength(16);
    expect(manager.litIds).toHaveLength(16);
    expect(flameQuads(manager)).toBe(20);
    expect(manager.lights.every((l) => l.decay === 2 && !l.castShadow)).toBe(true);
    manager.dispose();
  });

  it("5 fixtures at 150 m: all 5 emit, padded to 8 visible lights and no more made", () => {
    const manager = new SettlementLightFixtures({ value: 1 });
    manager.setFixtures(ring(5, 150));
    manager.update(0, at(0));
    expect(lit(manager)).toHaveLength(5);
    expect(manager.lights).toHaveLength(8);
    expect(manager.lights.filter((l) => l.visible)).toHaveLength(8);
    expect(manager.visibleLightCount).toBe(8);
    manager.dispose();
  });

  it("the visible light count steps 0/4/8/16 only (R11)", () => {
    expect(LIGHT_COUNT_STEPS).toEqual([0, 4, 8, 16]);
    expect([0, 1, 3, 4, 5, 8, 9, 15, 16].map(lightCountStep)).toEqual([0, 4, 4, 4, 8, 8, 16, 16, 16]);
    const manager = new SettlementLightFixtures({ value: 1 });
    const seen = new Set<number>();
    for (const n of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 16, 20, 3, 0]) {
      manager.setFixtures(ring(n, 50));
      manager.update(n, at(2));
      const visible = manager.lights.filter((l) => l.visible).length;
      expect(visible).toBe(lightCountStep(Math.min(n, LIGHTS_CAP)));
      expect(lit(manager)).toHaveLength(Math.min(n, LIGHTS_CAP));
      seen.add(visible);
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([0, 4, 8, 16]);
    manager.dispose();
  });

  it("the pool grows only to the step needed", () => {
    const manager = new SettlementLightFixtures({ value: 1 });
    manager.setFixtures(ring(3, 50));
    manager.update(0, at(2));
    expect(manager.lights).toHaveLength(4);
    manager.setFixtures(ring(6, 50));
    manager.update(1, at(2));
    expect(manager.lights).toHaveLength(8);
    manager.setFixtures(ring(2, 50));
    manager.update(2, at(2));
    // made lights are kept; the unused ones past the step are hidden
    expect(manager.lights).toHaveLength(8);
    expect(manager.lights.filter((l) => l.visible)).toHaveLength(4);
    manager.dispose();
  });

  it("a lit window is no fixture: nothing builds a light for it (R11)", () => {
    // window glow is the kit's emissive mask under the lamp clock (materials.ts)
    expect(Object.keys(lighting).filter((k) => /window/i.test(k))).toEqual([]);
  });

  it("flame sprites are drawn to 250 m", () => {
    expect(FLAME_MAX_DISTANCE_M).toBe(250);
    const manager = new SettlementLightFixtures({ value: 1 });
    manager.setFlameTexture(new THREE.Texture());
    manager.setFixtures([...ring(1, 240, "near"), ...ring(1, 260, "far")]);
    manager.update(0, at(0));
    expect(flameQuads(manager)).toBe(1);
    expect(manager.lights).toHaveLength(0);
    manager.dispose();
  });

  it("1 fixture at 250 m: none emit and no light is made", () => {
    const manager = new SettlementLightFixtures({ value: 1 });
    manager.setFixtures(ring(1, 250));
    manager.update(0, at(0));
    expect(lit(manager)).toHaveLength(0);
    expect(manager.lights).toHaveLength(0);
    manager.dispose();
  });

  it("the lit set is re-chosen once a second, nearest first, and hides when the lamps go out", () => {
    const fixtures = Array.from({ length: 12 }, (_, i) => fixtureFromPiece(`f${i}`, {},
      new THREE.Matrix4().makeTranslation(i * 30, 0, 0), box));
    expect(fixturesInBand(fixtures, new THREE.Vector3(155, 0, 0), LIGHTS_ACTIVE_M, 4)).toEqual([5, 6, 4, 7]);
    const factor = { value: 1 };
    const manager = new SettlementLightFixtures(factor);
    manager.setFixtures(fixtures);
    manager.update(0, at(0));
    // 0..180 m of 0..330 m are in the band
    expect(manager.litIds).toEqual(["f0", "f1", "f2", "f3", "f4", "f5", "f6"]);
    manager.update(0.5, at(330));
    expect(manager.litIds[0]).toBe("f0");
    manager.update(1.0, at(330));
    expect(manager.litIds).toEqual(["f11", "f10", "f9", "f8", "f7", "f6", "f5"]);
    expect(lit(manager)).toHaveLength(7);
    factor.value = 0;
    // lamps out between refreshes: zero intensity, the visible count holds at 8
    manager.update(1.2, at(330));
    expect(manager.lights.every((l) => l.intensity === 0)).toBe(true);
    expect(manager.lights.filter((l) => l.visible)).toHaveLength(8);
    manager.update(2.5, at(330));
    expect(manager.litIds).toEqual([]);
    expect(manager.lights.some((l) => l.visible)).toBe(false);
    manager.dispose();
  });

  it("draws billboard flames on the post-water layer", () => {
    const manager = new SettlementLightFixtures({ value: 1 });
    manager.setFlameTexture(new THREE.Texture());
    const flames = manager.spriteMesh()!;
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
    const geometry = manager.spriteMesh()!.geometry;
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
    // a candle that is out holds no light at all
    expect(manager.litIds).toEqual(["brazier"]);
    expect(manager.lights).toHaveLength(4);
    expect(drawn(manager)).toHaveLength(1);
    expect(drawn(manager)[0]).toBeGreaterThanOrEqual(0.5 * (1 - FLAME_FLICKER_ALPHA) - 1e-9);
    expect(drawn(manager)[0]).toBeLessThanOrEqual(0.5 + 1e-9);
    factor.value = artificialLightFactor(22 * 60);
    manager.update(1, camera);
    expect(intensityOf(manager, "brazier")).toBeCloseTo(FIXTURE_CANDELA, 9);
    expect(intensityOf(manager, "candle")).toBeCloseTo(FIXTURE_CANDELA, 9);
    expect(drawn(manager)).toHaveLength(2);
    for (const v of drawn(manager)) expect(v).toBeGreaterThanOrEqual(1 - FLAME_FLICKER_ALPHA - 1e-9);
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

describe("the NIF's own flames (16k walk 4)", () => {
  // settlement-imperial-v1 candlelanternwithcandle01: two AddOnNode49 wicks
  // (build_kit mine_fire_layer), DefaultCandleLight01NSDesat at offsetM
  const flame = (offsetM: [number, number, number]) => ({ offsetM, texture: FLAME_TEXTURE_ASSET_ID,
    atlas: [2, 2] as [number, number], fps: 3, sizeM: 0.036 });
  const lantern: SettlementKitAssetMeta = {
    light: { formId: "00088241", burnSeconds: -1, radiusUnits: 256, colourRgb: [242, 240, 223],
      flags: ["dynamic", "flicker", "portalStrict"], offsetM: [0.03, 0.63, 0.05], fixtureKind: "lantern" },
    flames: [flame([0.0087, 0.0933, 0.0243]), flame([-0.0119, 0.0652, -0.0369])] };
  const bounds = new THREE.Box3(new THREE.Vector3(-0.129, -0.024, -0.12), new THREE.Vector3(0.131, 0.591, 0.127));
  const camera = (x: number, z: number) => {
    const c = new THREE.PerspectiveCamera(); c.position.set(x, 2, z); c.updateMatrixWorld(); return c;
  };

  it("the lantern's light sits at its recorded offset and a flame on each wick", () => {
    const fixture = fixtureFromPiece("l", lantern, new THREE.Matrix4().makeTranslation(10, 2, 5), bounds);
    expect(fixture.position.toArray().map((v) => +v.toFixed(6))).toEqual([10.03, 2.63, 5.05]);
    expect(fixture.flames.map((f) => f.position.toArray().map((v) => +v.toFixed(4)))).toEqual([
      [10.0087, +(2 + 0.0933 + 0.036 * FLAME_RISE).toFixed(4), 5.0243],
      [9.9881, +(2 + 0.0652 + 0.036 * FLAME_RISE).toFixed(4), 4.9631]]);
    expect(fixture.flames[0].seed).not.toBe(fixture.flames[1].seed);
  });

  it("a fixture with 2 flames draws 2 quads, each one flipbook cell", () => {
    const manager = new SettlementLightFixtures({ value: 1 });
    manager.setFlameTexture(new THREE.Texture());
    manager.setFixtures([fixtureFromPiece("l", lantern, new THREE.Matrix4(), bounds)]);
    manager.update(0, camera(0, 3));
    expect(manager.spriteQuads()).toBe(2);
    const uv = manager.spriteMesh()!.geometry.getAttribute("uv") as THREE.BufferAttribute;
    for (let q = 0; q < 2; q++) {
      const us = [0, 1, 2, 3].map((c) => uv.getX(q * 4 + c));
      const vs = [0, 1, 2, 3].map((c) => uv.getY(q * 4 + c));
      // a 2x2 atlas: each quad spans half the texture on both axes
      expect(Math.max(...us) - Math.min(...us)).toBeCloseTo(0.5, 9);
      expect(Math.max(...vs) - Math.min(...vs)).toBeCloseTo(0.5, 9);
    }
    manager.dispose();
  });

  it("the flipbook steps at the flame's fps", () => {
    const manager = new SettlementLightFixtures({ value: 1 });
    manager.setFlameTexture(new THREE.Texture());
    manager.setFixtures([fixtureFromPiece("l", { ...lantern, flames: [lantern.flames![0]] },
      new THREE.Matrix4(), bounds)]);
    const cell = (t: number) => {
      manager.update(t, camera(0, 3));
      const uv = manager.spriteMesh()!.geometry.getAttribute("uv") as THREE.BufferAttribute;
      return `${Math.min(...[0, 1, 2, 3].map((c) => uv.getX(c)))},${Math.min(...[0, 1, 2, 3].map((c) => uv.getY(c)))}`;
    };
    const cells = new Set([0, 1 / 3, 2 / 3, 1].map((t) => cell(t + 0.01)));
    expect(cells.size).toBe(4);
    manager.dispose();
  });

  it("a candle flame never draws smaller than FLAME_MIN_ANGLE_RAD, so it reads at 50 m", () => {
    const manager = new SettlementLightFixtures({ value: 1 });
    manager.setFlameTexture(new THREE.Texture());
    manager.setFixtures([fixtureFromPiece("l", { ...lantern, flames: [lantern.flames![0]] },
      new THREE.Matrix4(), bounds)]);
    manager.update(0, camera(0, 50));
    const position = manager.spriteMesh()!.geometry.getAttribute("position") as THREE.BufferAttribute;
    const edge = new THREE.Vector3().fromBufferAttribute(position, 0)
      .distanceTo(new THREE.Vector3().fromBufferAttribute(position, 1));
    expect(edge).toBeGreaterThanOrEqual(50 * FLAME_MIN_ANGLE_RAD * 0.99);
    manager.dispose();
  });

  it("a glow disc is a still sprite set off toward the viewer, tinted the fire's orange", () => {
    const campfire: SettlementKitAssetMeta = { light: { formId: "000af8ba", burnSeconds: -1,
      radiusUnits: 512, colourRgb: [226, 140, 63], flags: [], fixtureKind: "campfire" },
      glows: [{ offsetM: [0, 0.831, 0], sizeM: 3.7, texture: "fx:glowslightflash", towardCameraM: 0.841 }] };
    const fixture = fixtureFromPiece("c", campfire, new THREE.Matrix4(), bounds);
    const glow = fixture.flames.find((f) => f.glow)!;
    expect(glow.texture).toBe("fx:glowslightflash");
    // no mined flames and no flame cards: the fallback flame is kept beside the glow
    expect(fixture.flames.filter((f) => !f.glow)).toHaveLength(1);
    const manager = new SettlementLightFixtures({ value: 1 });
    manager.setFlameTexture(new THREE.Texture(), "fx:glowslightflash");
    manager.setFixtures([fixture]);
    manager.update(0, camera(0, 10));
    expect(manager.spriteQuads("fx:glowslightflash")).toBe(1);
    const geometry = manager.spriteMesh("fx:glowslightflash")!.geometry;
    const position = geometry.getAttribute("position") as THREE.BufferAttribute;
    const centreZ = [0, 1, 2, 3].reduce((z, c) => z + position.getZ(c), 0) / 4;
    expect(centreZ).toBeGreaterThan(0.8);
    const color = geometry.getAttribute("color") as THREE.BufferAttribute;
    expect(color.getX(0)).toBeGreaterThan(color.getZ(0));
    manager.dispose();
  });
});

describe("sprite holders: mined flames on a piece that is no light fixture (16k walk 4)", () => {
  // settlement-mud-v1 ferryraft01: two mined candle flames, no LIGH record, dressing layer
  const flame = (offsetM: [number, number, number]) => ({ offsetM, texture: FLAME_TEXTURE_ASSET_ID,
    atlas: [2, 2] as [number, number], fps: 3, sizeM: 0.036 });
  const raft: SettlementKitAssetMeta = { flames: [flame([0.4, 0.3, 0.2]), flame([-0.4, 0.3, -0.2])] };
  const placement = { kind: "dressing" as const, layer: "dressing" };
  const bounds = new THREE.Box3(new THREE.Vector3(-1, 0, -2), new THREE.Vector3(1, 0.5, 2));
  /** SettlementLayer's rule: a light fixture, else a sprite holder casting no light. */
  const built = (meta: SettlementKitAssetMeta) => {
    const fixture = isLightFixturePlacement(placement, meta);
    return fixture || isSpriteHolderPlacement(placement, meta)
      ? [fixtureFromPiece("r", meta, new THREE.Matrix4(), bounds, fixture)] : [];
  };

  it("a non-fixture piece with 2 flames draws 2 quads and 0 point lights", () => {
    const manager = new SettlementLightFixtures({ value: 1 });
    manager.setFlameTexture(new THREE.Texture());
    manager.setFixtures(built(raft));
    const c = new THREE.PerspectiveCamera(); c.position.set(0, 2, 3); c.updateMatrixWorld();
    manager.update(0, c);
    expect(manager.spriteQuads()).toBe(2);
    expect(manager.litIds).toHaveLength(0);
    expect(manager.visibleLightCount).toBe(0);
    expect(manager.lights).toHaveLength(0);
    // place_gates' fixture count stays light fixtures only
    expect(manager.fixtureCount).toBe(0);
    manager.dispose();
  });

  it("a holder gets no fallback flame; a piece with neither flames nor glows is no holder", () => {
    const forge: SettlementKitAssetMeta = { category: "clutter",
      glows: [{ offsetM: [0, 0.525, 0], sizeM: 2.39, texture: "fx:glowslightflash", towardCameraM: 0.667 }] };
    const [holder] = built(forge);
    expect(holder.castsLight).toBe(false);
    expect(holder.flames.map((f) => f.glow)).toEqual([true]);
    expect(isSpriteHolderPlacement(placement, { category: "clutter" })).toBe(false);
    // a light fixture is never also a holder
    expect(isSpriteHolderPlacement({ kind: "dressing", layer: "light" }, raft)).toBe(false);
  });

  it("a glow with its own NIF colour draws in it, not the fire's orange", () => {
    const welkynd: SettlementKitAssetMeta = { glows: [{ offsetM: [0, 0.34, 0], sizeM: 0.5,
      texture: "fx:glowsoft01", tintRgb: [0.5, 0, 0] }] };
    const manager = new SettlementLightFixtures({ value: 1 });
    manager.setFlameTexture(new THREE.Texture(), "fx:glowsoft01");
    manager.setFixtures(built(welkynd));
    const c = new THREE.PerspectiveCamera(); c.position.set(0, 1, 3); c.updateMatrixWorld();
    manager.update(0, c);
    const color = manager.spriteMesh("fx:glowsoft01")!.geometry.getAttribute("color") as THREE.BufferAttribute;
    expect(color.getX(0)).toBeGreaterThan(0);
    expect(color.getY(0)).toBe(0);
    expect(color.getZ(0)).toBe(0);
    manager.dispose();
  });
});
