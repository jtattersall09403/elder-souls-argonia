/**
 * The fire module (16k walk 5): presets, preset choice, instance expansion,
 * and the flame anchor check over every published place and interior.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  FIRE_CONFIG_SCHEMA_VERSION, FIRE_PRESETS, FIRE_PRESET_ORDER, fireFlicker, firePresetFor,
  nightShareOfExposure, type FirePresetId,
} from "./fireTypes";
import { FlameSystem } from "./FlameSystem";
import { FIRE_SHADER_SOURCES } from "./flameMaterial";
import { interiorFireEmitters } from "./interiorFires";
import {
  fallbackFlameAnchorLocal, flameAnchorFailures, manifestBoxYUp, pieceFlameAnchorsLocal, type FlameAnchorMeta,
} from "./flameAnchors";
import {
  drawsOwnFire, isLightFixturePlacement, isSpriteHolderPlacement,
} from "../../settlement/lighting";

const REPO = join(__dirname, "..", "..", "..", "..", "..");
const PUBLIC = join(REPO, "apps", "world-studio", "public");

describe("fire presets", () => {
  it("every preset is versioned, keyed by its own id and in the palette order", () => {
    for (const [id, c] of Object.entries(FIRE_PRESETS)) {
      expect(c.schemaVersion).toBe(FIRE_CONFIG_SCHEMA_VERSION);
      expect(c.id).toBe(id);
    }
    expect([...FIRE_PRESET_ORDER].sort()).toEqual(Object.keys(FIRE_PRESETS).sort());
  });

  it("sizes follow real fires: candle smallest and calmest, campfire largest and wildest", () => {
    const area = (id: FirePresetId) => FIRE_PRESETS[id].shape.widthM * FIRE_PRESETS[id].shape.heightM;
    const ids = Object.keys(FIRE_PRESETS) as FirePresetId[];
    expect(ids.every((id) => area(id) >= area("candle"))).toBe(true);
    expect(ids.every((id) => area(id) <= area("campfire"))).toBe(true);
    expect(ids.every((id) => FIRE_PRESETS[id].turbulence <= FIRE_PRESETS.campfire.turbulence)).toBe(true);
    expect(area("candle") < area("torchGround") && area("torchGround") < area("brazier")).toBe(true);
  });

  it("the config schema is renderer-agnostic (no three.js, no shader in fireTypes.ts)", () => {
    const source = readFileSync(join(__dirname, "fireTypes.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    expect(source).not.toMatch(/from\s+["']three["']|ShaderMaterial|WebGL|glsl/i);
  });

  it("the shader carries the TSL-mirror functions the WebGPU port writes 1:1", () => {
    for (const fn of ["fireNoise", "fireFbm", "fireMask", "fireRamp", "fireFlicker"]) {
      expect(FIRE_SHADER_SOURCES.common).toContain(fn);
    }
  });

  it("flicker is the same function for light and flame: 1 +- amount, phased by seed", () => {
    const samples = Array.from({ length: 200 }, (_, i) => fireFlicker(i * 0.037, 0.3, 5, 0.1));
    expect(Math.max(...samples)).toBeLessThanOrEqual(1.1 + 1e-9);
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(0.9 - 1e-9);
    expect(fireFlicker(1, 0.2, 5, 0.1)).not.toBeCloseTo(fireFlicker(1, 0.7, 5, 0.1), 6);
  });

  it("day and night: the exposure picks the blend (noon 3.9e-5 -> 0, night 22 -> 1)", () => {
    expect(nightShareOfExposure(3.9e-5)).toBe(0);
    expect(nightShareOfExposure(22)).toBe(1);
    const dusk = nightShareOfExposure(2.5e-2);
    expect(dusk).toBeGreaterThan(0);
    expect(dusk).toBeLessThan(1);
  });
});

describe("preset choice reads the piece's records", () => {
  const cases: [Parameters<typeof firePresetFor>[0], FirePresetId][] = [
    [{ id: "vanilla:clutter/woodfires/campfire01burning", fixtureKind: "campfire", flameSource: "FlamesSmall03" }, "campfire"],
    [{ id: "vanilla:clutter/woodfires/fireplacewood01burning", category: "clutter", flameSource: "FlamesSmall01" }, "hearth"],
    [{ id: "vanilla:clutter/common/torchpermanent01", category: "clutter", flameSource: "AddOnNode46 -> MPSTorchFire01/pFireballCore05" }, "torchGround"],
    [{ id: "vanilla:clutter/common/candlelanternwithcandle01", fixtureKind: "lantern", flameSource: "AddOnNode49 -> MPSCandleFlame01/CandleFlame01" }, "lanternStanding"],
    [{ id: "mudmother:gv_meshes/argoniannest/argonianlanterns03", fixtureKind: "lantern", anchorClass: "hanging" }, "lanternHanging"],
    [{ id: "vanilla:clutter/candles/candlehorntable01", flameSource: "AddOnNode49 -> MPSCandleFlame01/CandleFlame01" }, "candle"],
    [{ id: "vanilla:clutter/imperial/impbrazier01", fixtureKind: "brazier" }, "brazier"],
  ];
  it.each(cases)("%o -> %s", (input, expected) => {
    expect(firePresetFor(input)).toBe(expected);
  });
});

describe("FlameSystem", () => {
  it("expands a candle to its 3 cards, a campfire to its core + outer cards over its bed, with embers", () => {
    const fire = new FlameSystem();
    fire.setEmitters([
      { position: new THREE.Vector3(0, 1, 0), preset: "candle", scale: 1, seed: 0.1, owner: 0 },
      { position: new THREE.Vector3(10, 0, 0), preset: "campfire", scale: 1, seed: 0.4, owner: 1 },
    ]);
    const c = FIRE_PRESETS.campfire;
    const k = FIRE_PRESETS.candle.layers.core + FIRE_PRESETS.candle.layers.outer;
    expect(k).toBeGreaterThanOrEqual(3);
    expect(fire.flameInstances).toBe(k + c.layers.core + c.layers.outer);
    expect(fire.emberInstances).toBe(c.embers.count);
    for (let i = k; i < fire.flameInstances; i++) {
      const p = fire.flamePosition(i);
      expect(Math.hypot(p.x - 10, p.z)).toBeLessThanOrEqual(c.layers.spreadM + 1e-6);
      expect(fire.flameOwnerOf(i)).toBe(1);
    }
    for (let i = 0; i < k; i++) {
      const p = fire.flamePosition(i);
      expect(p.y).toBe(1);
      expect(Math.hypot(p.x, p.z)).toBeLessThanOrEqual(FIRE_PRESETS.candle.layers.spreadM + 1e-6);
    }
    fire.update(0, (o) => (o === 0 ? 0.25 : 1));
    expect(fire.flameIntensity(0)).toBeCloseTo(0.25, 6);
    expect(fire.flameIntensity(k)).toBe(1);
    fire.dispose();
  });
});

// ---- the anchor check ------------------------------------------------------

type Row = FlameAnchorMeta & { sizeM?: number[]; originOffsetM?: number[]; flameCardMaterials?: string[];
  glows?: unknown[]; additiveMaterials?: string[] };
type Placement = { id: string; kit: string; assetId: string; kind?: string; layer?: string;
  parentPlacementId?: string; category?: string };

function kitRows(): Map<string, Row> {
  const rows = new Map<string, Row>();
  const dir = join(PUBLIC, "kits");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".kit.json"))) {
    const kit = file.slice(0, -".kit.json".length);
    const manifest = JSON.parse(readFileSync(join(dir, file), "utf8")) as { assets?: Row[] };
    for (const row of manifest.assets ?? []) rows.set(`${kit}|${(row as { id: string }).id}`, row);
  }
  return rows;
}

function jsonFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? jsonFiles(join(dir, e.name)) : e.name.endsWith(".json") ? [join(dir, e.name)] : []);
}

/**
 * The anchor check over the published data: every exterior piece the layer
 * draws a fire for (SettlementLayer's rule: a light fixture, else a sprite
 * holder; the fallback only for a lit fixture with no fire of its own or on
 * it) and every interior piece with mined flames. Fails naming the piece.
 */
function publishedAnchorFailures(): { checked: number; failures: string[] } {
  const rows = kitRows();
  const failures: string[] = [];
  let checked = 0;
  const check = (pieceId: string, row: Row, fallback: boolean, hostKind?: string) => {
    const box = manifestBoxYUp(row);
    if (!box) { failures.push(`${pieceId} (${row.id}): no measured bounds to check its flames against`); return; }
    const anchors = pieceFlameAnchorsLocal(row, box, fallback, hostKind);
    checked += anchors.length;
    failures.push(...flameAnchorFailures(pieceId, row, box, anchors));
  };
  for (const file of jsonFiles(join(PUBLIC, "province", "settlements"))) {
    const bundle = JSON.parse(readFileSync(file, "utf8")) as { placements?: Placement[] };
    const placements = bundle.placements ?? [];
    const byId = new Map(placements.map((p) => [p.id, p]));
    const hostsOfFire = new Set(placements.filter((p) => p.parentPlacementId
      && drawsOwnFire(rows.get(`${p.kit}|${p.assetId}`) as never)).map((p) => p.parentPlacementId!));
    for (const p of placements) {
      const row = rows.get(`${p.kit}|${p.assetId}`);
      if (!row) continue;
      const meta = row as never;
      const fixture = isLightFixturePlacement({ kind: p.kind as never, layer: p.layer }, meta);
      const holder = !fixture && isSpriteHolderPlacement({ kind: p.kind as never, layer: p.layer }, meta);
      if (!fixture && !holder) continue;
      const host = p.parentPlacementId ? byId.get(p.parentPlacementId) : undefined;
      const hostRow = host ? rows.get(`${host.kit}|${host.assetId}`) : undefined;
      check(p.id, row, fixture && !drawsOwnFire(meta) && !hostsOfFire.has(p.id),
        hostRow?.light?.fixtureKind ?? hostRow?.category);
    }
  }
  for (const file of jsonFiles(join(PUBLIC, "province", "interiors"))) {
    const bundle = JSON.parse(readFileSync(file, "utf8")) as { placements?: Placement[] };
    for (const p of bundle.placements ?? []) {
      const row = rows.get(`${p.kit}|${p.assetId}`);
      if (row?.flames?.length) check(p.id, row, false);
    }
  }
  return { checked, failures };
}

describe("interior fires", () => {
  it("every mined flame of a published interior cell becomes an emitter at its placement", () => {
    const rows = kitRows();
    const file = join(PUBLIC, "province", "interiors", "LilmothGlassworksOverseerHouse.json");
    const bundle = JSON.parse(readFileSync(file, "utf8")) as { placements: (Placement & { positionM: number[] })[] };
    const rowOf = (p: Placement) => rows.get(`${p.kit}|${p.assetId}`);
    const expected = bundle.placements.reduce((n, p) => n + (rowOf(p)?.flames?.length ?? 0), 0);
    const emitters = interiorFireEmitters(bundle.placements, rowOf,
      (p) => new THREE.Matrix4().makeTranslation(p.positionM[0], p.positionM[1], p.positionM[2]));
    expect(expected).toBeGreaterThan(0);
    expect(emitters).toHaveLength(expected);
    expect(emitters.every((e) => e.owner === 0)).toBe(true);
  });
});

describe("flame anchor check (16k walk 5)", () => {
  it("fails on purpose: the walk-4 rule put a hanging lantern's flame on its cord's top", () => {
    const row: Row = { id: "mudmother:gv_meshes/argoniannest/argonianlanterns03", anchorClass: "hanging",
      sizeM: [0.655, 0.639, 2.236], originOffsetM: [0.317, 0.317, 2.149] };
    const box = manifestBoxYUp(row)!;
    // Y-up: base 2.149 m below the pivot, cord top 0.087 m above it
    expect(box.min.y).toBeCloseTo(-2.149, 6);
    expect(box.max.y).toBeCloseTo(0.087, 6);
    const walk4 = new THREE.Vector3(0, box.max.y + 0.1, 0);
    expect(flameAnchorFailures("lamp", row, box, [{ local: walk4, preset: "lanternHanging", record: -1 }]))
      .toHaveLength(1);
    const cordTop = new THREE.Vector3(0, box.max.y, 0);
    expect(flameAnchorFailures("lamp", row, box, [{ local: cordTop, preset: "lanternHanging", record: -1 }])[0])
      .toMatch(/upper half of a hanging piece/);
    expect(flameAnchorFailures("lamp", row, box, [{ local: fallbackFlameAnchorLocal(row, box),
      preset: "lanternHanging", record: -1 }])).toEqual([]);
  });

  it("the lantern's two AddOnNode49 wicks are both inside the lantern", () => {
    const row: Row = { id: "vanilla:clutter/common/candlelanternwithcandle01", sizeM: [0.26, 0.247, 0.615],
      originOffsetM: [0.129, 0.127, 0.024], light: { fixtureKind: "lantern" },
      flames: [{ offsetM: [0.0087, 0.0933, 0.0243], source: "AddOnNode49 -> MPSCandleFlame01/CandleFlame01" },
        { offsetM: [-0.0119, 0.0652, -0.0369], source: "AddOnNode49 -> MPSCandleFlame01/CandleFlame01" }] };
    const box = manifestBoxYUp(row)!;
    const anchors = pieceFlameAnchorsLocal(row, box, true);
    expect(anchors.map((a) => a.record)).toEqual([0, 1]);
    expect(flameAnchorFailures("lamp", row, box, anchors)).toEqual([]);
  });

  it("every flame of every published place and interior lies in its piece", () => {
    const { checked, failures } = publishedAnchorFailures();
    expect(failures).toEqual([]);
    expect(checked).toBeGreaterThan(20);
  });
});
