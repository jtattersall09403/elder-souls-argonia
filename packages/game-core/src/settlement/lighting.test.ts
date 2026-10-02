/**
 * Settlement lighting (walk 2 D7): the lamp clock, the fixture light, the
 * lights band (R3: every burning fixture within 200 m, capped at 100, held
 * in the scene's FixtureLightField, never three lights) and flame reach.
 */
import * as THREE from "three";
import * as lighting from "./lighting";
import { BLOOM_SOURCE_LAYER } from "../render/post/BloomPass";
import { describe, expect, it } from "vitest";
import {
  ALWAYS_LIT_DAY_FACTOR, artificialLightFactor, fixtureFromFireSocket, fixtureFromPiece,
  burnsByDay, drawsOwnFire, fixtureLightOf, FIXTURE_DEFAULT_RADIUS_M, FIXTURE_LIGHT_RGB, isAlwaysLitFixture,
  isFireSocket, fixturesInBand, FLAME_MAX_DISTANCE_M, FLAME_MIN_ANGLE_RAD,
  FLAME_TEXTURE_ASSET_ID, isLightFixturePlacement, isSpriteHolderPlacement,
  bandFade, LIGHTS_ACTIVE_M, LIGHTS_CAP, LIGHTS_FADE_M,
  SettlementLightFixtures,
} from "./lighting";
import { PRECIP_LAYER } from "../water/render/waterMaterial";
import type { SettlementKitAssetMeta } from "./types";
import { FIRE_LIGHTS, FIRE_PRESETS } from "../fx/fire/fireTypes";
import { FIXTURE_LIGHTS_MAX } from "../render/fixtureLights";

const hm = (h: number, m = 0) => h * 60 + m;

/** Flame cards one emitter of a preset draws (every preset is 3 or more, fire walk 5). */
const cardsOf = (id: keyof typeof FIRE_PRESETS) => FIRE_PRESETS[id].layers.core + FIRE_PRESETS[id].layers.outer;

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
    // the fallback emitter stands on the top of the bounds (the card rises from it)
    expect(candle.flames[0].position.y).toBeCloseTo(2 + 0.6, 6);
    expect(candle.flames[0].preset).toBe("candle");
    expect(candle.position.toArray()).toEqual(candle.flames[0].position.toArray());
    // log glow overlays are no flame: the fallback stays
    expect(fixtureFromPiece("g", { additiveMaterials: ["Glow:2.Mat"] }, at, box).flames).toHaveLength(1);
    // flame cards (fxfirewithembers01) burn one brazier bed, never a fallback candle (walk 5)
    const brazierFire = fixtureFromPiece("f", { id: "vanilla:effects/fxfirewithembers01",
      additiveMaterials: ["L2_Flames02grant:0.Mat"], flameCardMaterials: ["L2_Flames02grant:0.Mat"] }, at, box);
    expect(brazierFire.flames.map((f) => f.preset)).toEqual(["brazier"]);
  });

  it("a hanging lantern's fallback flame burns at its body, never its cord's top (walk 5)", () => {
    // settlement-mud-v1 argonianlanterns03: pivot at the cord's top, 2.236 m
    // tall, 0.655 x 0.639 plan, no mined emitter
    const cord = new THREE.Box3(new THREE.Vector3(-0.317, -2.149, -0.322), new THREE.Vector3(0.338, 0.087, 0.317));
    const meta: SettlementKitAssetMeta = { anchorClass: "hanging", light: { formId: "000d0e40",
      burnSeconds: -1, radiusUnits: 512, colourRgb: [247, 139, 43], flags: [], fixtureKind: "lantern" } };
    const hung = new THREE.Matrix4().makeTranslation(4, 5, 6);
    const f = fixtureFromPiece("lamp", meta, hung, cord);
    expect(f.flames).toHaveLength(1);
    expect(f.flames[0].preset).toBe("lanternHanging");
    // 0.32 m above the lantern's base, 1.83 m below the cord's top
    expect(f.flames[0].position.y).toBeCloseTo(5 - 2.149 + 0.639 / 2, 6);
    // its class's light (walk 9): a third of the candle's candela, inside
    // vanilla's candle-lantern radius, not the mod's 7.3 m
    expect(f.candela).toBe(FIRE_LIGHTS.lanternHanging.candela);
    expect(f.candela).toBeCloseTo(FIRE_LIGHTS.candle.candela / 3, 6);
    expect(f.radiusM).toBe(3.65);
  });

  it("candles, the candle lantern and the campfire keep the torch's 6 cd at their LIGH radius (walk 9)", () => {
    const box = new THREE.Box3(new THREE.Vector3(-0.1, 0, -0.1), new THREE.Vector3(0.1, 0.3, 0.1));
    const light = { formId: "00088241", burnSeconds: -1, radiusUnits: 256, colourRgb: [242, 240, 223] as [number, number, number], flags: [] };
    const lantern = fixtureFromPiece("l", { id: "vanilla:clutter/common/candlelanternwithcandle01",
      light: { ...light, fixtureKind: "lantern" },
      flames: [{ offsetM: [0, 0.09, 0], texture: "fx:candleflame01", atlas: [2, 2], fps: 3, sizeM: 0.036,
        source: "AddOnNode49 -> MPSCandleFlame01/CandleFlame01" }] }, new THREE.Matrix4(), box);
    expect(lantern.flames[0].preset).toBe("lanternStanding");
    expect([lantern.candela, lantern.radiusM]).toEqual([6, 256 * 0.01428]);
    const candle = fixtureFromPiece("c", { light: { ...light, fixtureKind: "candle" } }, new THREE.Matrix4(), box);
    expect(candle.candela).toBe(6);
    const fire = fixtureFromPiece("f", { id: "vanilla:clutter/woodfires/campfire01burning",
      light: { ...light, radiusUnits: 512, fixtureKind: "campfire" } }, new THREE.Matrix4(), box);
    expect([fire.candela, fire.radiusM]).toEqual([6, 512 * 0.01428]);
  });

  it("the band and the cap are the R3 numbers the place gate reads", () => {
    expect(LIGHTS_ACTIVE_M).toBe(200);
    expect(LIGHTS_CAP).toBe(100);
    expect(LIGHTS_CAP).toBe(FIXTURE_LIGHTS_MAX);
  });

  const ring = (n: number, radiusM: number, prefix = "f") => Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return fixtureFromPiece(`${prefix}${i}`, {},
      new THREE.Matrix4().makeTranslation(Math.cos(a) * radiusM, 0, Math.sin(a) * radiusM), box);
  });
  /** Fixture ids whose field slot carries light now. */
  const lit = (manager: SettlementLightFixtures) =>
    manager.litIds.filter((_, slot) => manager.field.radianceOf(slot)[0] > 0);
  const pointLights = (manager: SettlementLightFixtures) => {
    let n = 0;
    manager.group.traverse((o) => { if ((o as THREE.Light).isLight) n += 1; });
    return n;
  };
  const flameQuads = (manager: SettlementLightFixtures) => manager.fire.flameInstances;
  const at = (x: number) => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(x, 0, 0); camera.updateMatrixWorld();
    return camera;
  };

  it("120 fixtures at 50 m: the 100 nearest light the world, the other 20 keep their flame", () => {
    const manager = new SettlementLightFixtures({ value: 1 });
    manager.setFlameTexture(new THREE.Texture());
    // the camera 2 m off centre gives every fixture a distinct distance near 50 m
    manager.setFixtures(ring(120, 50));
    manager.update(0, at(2));
    expect(lit(manager)).toHaveLength(100);
    expect(manager.field.count).toBe(100);
    expect(flameQuads(manager)).toBe(120 * cardsOf("candle"));
    // no three light is made for any fixture: the program never sees a count
    expect(pointLights(manager)).toBe(0);
    manager.dispose();
  });

  it("any count 0..100 is held as is, with no step and no padding", () => {
    const manager = new SettlementLightFixtures({ value: 1 });
    for (const n of [0, 1, 5, 7, 40, 99, 100, 3, 0]) {
      manager.setFixtures(ring(n, 50));
      manager.update(n, at(2));
      expect(manager.field.count).toBe(n);
      expect(lit(manager)).toHaveLength(n);
    }
    expect(pointLights(manager)).toBe(0);
    manager.dispose();
  });

  it("a light fades out over the band's last LIGHTS_FADE_M, never popping at the edge", () => {
    expect(LIGHTS_FADE_M).toBe(20);
    expect(bandFade(0)).toBe(1);
    expect(bandFade(LIGHTS_ACTIVE_M - LIGHTS_FADE_M)).toBe(1);
    expect(bandFade(LIGHTS_ACTIVE_M - LIGHTS_FADE_M / 2)).toBeCloseTo(0.5, 9);
    expect(bandFade(LIGHTS_ACTIVE_M)).toBe(0);
  });

  it("a lit window is no fixture: nothing builds a light for it (R11)", () => {
    // window glow is the kit's emissive mask under the lamp clock (materials.ts)
    expect(Object.keys(lighting).filter((k) => /window/i.test(k))).toEqual([]);
  });

  it("flames are drawn to 250 m (the shader fades them out by distance)", () => {
    expect(FLAME_MAX_DISTANCE_M).toBe(250);
    const manager = new SettlementLightFixtures({ value: 1 });
    manager.setFixtures([...ring(1, 240, "near"), ...ring(1, 260, "far")]);
    manager.update(0, at(0));
    expect(flameQuads(manager)).toBe(2 * cardsOf("candle"));
    // the flame and ember materials share the fire system's uniforms
    expect(manager.fire.uniforms.uMaxDistance.value).toBe(250);
    expect(manager.field.count).toBe(0);
    manager.dispose();
  });

  it("1 fixture at 250 m: none emit and no light is made", () => {
    const manager = new SettlementLightFixtures({ value: 1 });
    manager.setFixtures(ring(1, 250));
    manager.update(0, at(0));
    expect(lit(manager)).toHaveLength(0);
    expect(manager.field.count).toBe(0);
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
    // lamps out between refreshes: zero intensity at once, the set held to the refresh
    manager.update(1.2, at(330));
    expect(lit(manager)).toHaveLength(0);
    expect(manager.field.count).toBe(7);
    manager.update(2.5, at(330));
    expect(manager.litIds).toEqual([]);
    expect(manager.field.count).toBe(0);
    manager.dispose();
  });

  it("draws flames and glows on the post-water layer, untonemapped and premultiplied", () => {
    const manager = new SettlementLightFixtures({ value: 1 });
    manager.setFixtures(ring(1, 5));
    for (const name of ["fire-flame-cards", "fire-embers"]) {
      const mesh = manager.group.getObjectByName(name) as THREE.Mesh;
      expect(mesh.layers.mask).toBe((1 << PRECIP_LAYER) | (1 << BLOOM_SOURCE_LAYER));
      const m = mesh.material as THREE.Material;
      // tone mapping is the fire graph's own (fx/fire fireNodes displayToScene):
      // the node path reads no material toneMapped flag
      expect([m.blending, m.blendSrc, m.blendDst, m.depthWrite])
        .toEqual([THREE.CustomBlending, THREE.OneFactor, THREE.OneMinusSrcAlphaFactor, false]);
    }
    manager.setFlameTexture(new THREE.Texture());
    const flames = manager.spriteMesh()!;
    // canvas (tone-mapped) and bloom RT (linear) draws each own a material,
    // so neither re-derives its program per frame (perf10 f3)
    expect(flames.layers.mask).toBe(1 << PRECIP_LAYER);
    const bloom = manager.group.getObjectByName(`${flames.name}:bloom`) as THREE.Mesh;
    expect(bloom.layers.mask).toBe(1 << BLOOM_SOURCE_LAYER);
    expect(bloom.geometry).toBe(flames.geometry);
    expect(bloom.material).not.toBe(flames.material);
    // the bloom draw follows the canvas draw: visible only while textured and drawing a quad
    expect(bloom.visible).toBe(flames.visible);
    const first = (flames as THREE.Mesh).material as THREE.MeshBasicMaterial;
    const old = first.map!;
    let disposed = false;
    old.addEventListener("dispose", () => { disposed = true; });
    const next = new THREE.Texture();
    manager.setFlameTexture(next);
    expect(first.map).toBe(next);
    expect((bloom.material as THREE.MeshBasicMaterial).map).toBe(next);
    expect((bloom.material as THREE.MeshBasicMaterial).blending).toBe(first.blending);
    // one pass, one program: a transparent DoubleSide material without
    // forceSinglePass is re-derived twice a frame (three's back/front split
    // sets needsUpdate); additive blending keeps the single pass identical.
    for (const m of [first, bloom.material as THREE.MeshBasicMaterial]) {
      expect(m.blending).toBe(THREE.AdditiveBlending);
      expect(m.side === THREE.DoubleSide && m.transparent ? m.forceSinglePass : true).toBe(true);
    }
    expect(disposed).toBe(true);
    manager.dispose();
  });
});

describe("fires that burn by day (planner ruling, walk 2)", () => {
  const box = new THREE.Box3(new THREE.Vector3(-0.2, 0, -0.2), new THREE.Vector3(0.2, 0.6, 0.2));
  const light = (fixtureKind: string): SettlementKitAssetMeta => ({ light: { formId: "1",
    burnSeconds: -1, radiusUnits: 256, colourRgb: [200, 150, 100], flags: [], fixtureKind } });
  /** The intensity column of each flame card with a non-zero strength. */
  const drawn = (manager: SettlementLightFixtures) =>
    Array.from({ length: manager.fire.flameInstances }, (_, i) => manager.fire.flameIntensity(i)).filter((v) => v > 0);
  const intensityOf = (manager: SettlementLightFixtures, id: string) =>
    manager.field.radianceOf(manager.litIds.indexOf(id))[0]
      / new THREE.Color().setRGB(FIXTURE_LIGHT_RGB[0] / 255, 0, 0, THREE.SRGBColorSpace).r;
  /** The light flickers with its flame: within the preset's share of its level. */
  const near = (value: number, level: number, share: number) => {
    expect(value).toBeGreaterThanOrEqual(level * (1 - share) - 1e-9);
    expect(value).toBeLessThanOrEqual(level * (1 + share) + 1e-9);
  };

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
    near(intensityOf(manager, "brazier"), FIRE_LIGHTS.brazier.candela * 0.5, FIRE_PRESETS.brazier.flicker.amount);
    // a candle that is out holds no light at all
    expect(manager.litIds).toEqual(["brazier"]);
    expect(manager.field.count).toBe(1);
    // the brazier's fallback fire is its preset's cards, all at 0.5; the candle's at 0
    const brazierCards = FIRE_PRESETS.brazier.layers.core + FIRE_PRESETS.brazier.layers.outer;
    expect(drawn(manager)).toEqual(Array(brazierCards).fill(0.5));
    factor.value = artificialLightFactor(22 * 60);
    manager.update(1, camera);
    near(intensityOf(manager, "brazier"), FIRE_LIGHTS.brazier.candela, FIRE_PRESETS.brazier.flicker.amount);
    near(intensityOf(manager, "candle"), FIRE_LIGHTS.candle.candela, FIRE_PRESETS.candle.flicker.amount);
    expect(drawn(manager)).toEqual(Array(brazierCards + cardsOf("candle")).fill(1));
    manager.dispose();
  });

  it("a lamp-only settlement by day holds no fixture light", () => {
    const manager = new SettlementLightFixtures({ value: 0 });
    manager.setFixtures([fixtureFromPiece("candle", light("candle"), new THREE.Matrix4(), box)]);
    const camera = new THREE.PerspectiveCamera(); camera.updateMatrixWorld();
    manager.update(0, camera);
    expect(manager.field.count).toBe(0);
    manager.dispose();
  });
});

describe("a brazier and its mounted fire (review 5536a1d9)", () => {
  // works-v1: impbrazier01 has a LIGH record (fixtureKind brazier) and no
  // flames; vanilla mounts fxfirewithembers01 (category effect, flame cards)
  // in its bowl, and that child is what burns.
  const box = new THREE.Box3(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 0.47, 0.5));
  const brazier: SettlementKitAssetMeta = { category: "clutter", light: { formId: "00088243",
    burnSeconds: -1, radiusUnits: 256, colourRgb: [197, 156, 112], flags: [], fixtureKind: "brazier" } };
  const fire: SettlementKitAssetMeta = { id: "vanilla:effects/fxfirewithembers01", category: "effect",
    flameCardMaterials: ["Flames02grant01:0.Mat"], additiveMaterials: ["Flames02grant01:0.Mat"],
    glows: [{ offsetM: [0, 0.487, 0], sizeM: 2.288, texture: "fx:glowslightflash" }] };

  it("a brazier with a mounted fire draws no fallback candle flame", () => {
    expect(drawsOwnFire(fire)).toBe(true);
    expect(drawsOwnFire(brazier)).toBe(false);
    const f = fixtureFromPiece("brazier", brazier, new THREE.Matrix4(), box, true, { hasMountedFire: true });
    expect(f.flames).toHaveLength(0);
    expect(f.castsLight).toBe(true);
    // without the mounted fire the fallback still stands in
    expect(fixtureFromPiece("bare", brazier, new THREE.Matrix4(), box).flames).toHaveLength(1);
  });

  it("the mounted fire burns by day because its host is a brazier", () => {
    expect(isAlwaysLitFixture(fire)).toBe(false);
    expect(burnsByDay(fire, brazier)).toBe(true);
    expect(burnsByDay(fire, undefined)).toBe(false);
    expect(burnsByDay(fire, { category: "clutter" })).toBe(false);
    const glow = fixtureFromPiece("flame", fire, new THREE.Matrix4(), box, false, { hostMeta: brazier });
    expect(glow.alwaysLit).toBe(true);
    // its glow disc and one brazier bed at its base centre (the cards are not drawn)
    expect(glow.flames.filter((s) => s.glow)).toHaveLength(1);
    const beds = glow.flames.filter((s) => !s.glow);
    expect(beds.map((s) => s.preset)).toEqual(["brazier"]);
    expect(beds[0].position.toArray()).toEqual([0, 0, 0]);
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
    // each emitter is its mined wick through the piece's final matrix, no offset added
    expect(fixture.flames.map((f) => f.position.toArray().map((v) => +v.toFixed(4)))).toEqual([
      [10.0087, 2.0933, 5.0243], [9.9881, 2.0652, 4.9631]]);
    expect(fixture.flames.map((f) => f.preset)).toEqual(["lanternStanding", "lanternStanding"]);
    expect(fixture.flames[0].seed).not.toBe(fixture.flames[1].seed);
  });

  it("the lantern's two wicks draw two flame cards at the wicks, through a rotated, scaled matrix", () => {
    const manager = new SettlementLightFixtures({ value: 1 });
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(3, 4, 5),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2), new THREE.Vector3(2, 2, 2));
    manager.setFixtures([fixtureFromPiece("l", lantern, matrix, bounds)]);
    manager.update(0, camera(0, 3));
    const n = cardsOf("lanternStanding");
    expect(manager.fire.flameInstances).toBe(2 * n);
    const wick = new THREE.Vector3(...lantern.flames![1].offsetM).applyMatrix4(matrix);
    // the second wick's cards stand on it, within the preset's bed at scale 2
    expect(manager.fire.flamePosition(n).distanceTo(wick)).toBeLessThanOrEqual(FIRE_PRESETS.lanternStanding.layers.spreadM * 2 + 1e-5);
    manager.dispose();
  });

  it("a candle flame never draws smaller than FLAME_MIN_ANGLE_RAD, so it reads at 50 m", () => {
    // the vertex stage grows the card to dist x FLAME_MIN_ANGLE_RAD
    expect(FLAME_MIN_ANGLE_RAD).toBe(0.004);
    const manager = new SettlementLightFixtures({ value: 1 });
    expect(manager.group.getObjectByName("fire-flame-cards")).toBeTruthy();
    expect(manager.fire.uniforms.uMinAngle.value).toBe(FLAME_MIN_ANGLE_RAD);
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

  it("a non-fixture piece with 2 flames draws 2 flame cards and 0 point lights", () => {
    const manager = new SettlementLightFixtures({ value: 1 });
    manager.setFixtures(built(raft));
    const c = new THREE.PerspectiveCamera(); c.position.set(0, 2, 3); c.updateMatrixWorld();
    manager.update(0, c);
    expect(manager.fire.flameInstances).toBe(2 * cardsOf("candle"));
    expect(manager.litIds).toHaveLength(0);
    expect(manager.field.count).toBe(0);
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
  it("gives every sprite batch a position attribute before its first quad (walk 10)", () => {
    const manager = new SettlementLightFixtures({ value: 1 });
    manager.setFlameTexture(new THREE.Texture());
    let meshes = 0, batches = 0;
    manager.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      meshes += 1;
      expect(mesh.geometry.getAttribute("position")).toBeDefined();
      // the sprite batches (vertex-coloured) read uv and color as well; the fire cards read neither
      if (!(mesh.material as THREE.MeshBasicMaterial).vertexColors) return;
      batches += 1;
      expect(mesh.geometry.getAttribute("uv")).toBeDefined();
      expect(mesh.geometry.getAttribute("color")).toBeDefined();
    });
    expect(meshes).toBeGreaterThan(0);
    expect(batches).toBeGreaterThan(0);
  });
});
