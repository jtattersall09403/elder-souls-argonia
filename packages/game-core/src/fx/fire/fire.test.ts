/**
 * The fire module (16k walk 5): presets, preset choice, instance expansion,
 * and the flame anchor check over every published place and interior.
 */
import { readdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  FIRE_CONFIG_SCHEMA_VERSION, FIRE_PRESETS, FIRE_PRESET_ORDER, fireFlicker, firePresetFor,
  nightShareOfExposure, type FirePresetId,
} from "./fireTypes";
import { FlameSystem } from "./FlameSystem";
import {
  FIRE_VOLUME_REACH_M, makeEmberMaterial, makeFireUniforms, makeFlameMaterial, volumeShareAt,
} from "./flameMaterial";
import { acesRoundTripGrey } from "./fireNodes";
import { makeFireCurl } from "./volumeFire";
import { FIRE_VOLUME_PRESETS, FIRE_VOLUME_TIER_CONFIG, fireCurlMiB, fireVolumeCost } from "./fireTypes";
import { interiorFireEmitters, interiorFlameAnchorsLocal, burnsInInterior, CellLightFlicker } from "./interiorFires";
import { FIRE_VOLUME_LAYER } from "../../render/post/FireVolumePass";
import { FIRE_PRESETS as PRESETS_F8, fireFlicker as flickerF8 } from "./fireTypes";
import { volumeBoxSize } from "./FlameSystem";
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
    expect(source).not.toMatch(/from\s+["']three(\/\w+)?["']|Material\b|NodeMaterial|WebGL|WebGPU|tsl/i);
  });

  it("the card materials are node graphs that write their own premultiplied colour", () => {
    const u = makeFireUniforms();
    for (const m of [makeFlameMaterial(u), makeEmberMaterial(u)]) {
      expect(m.vertexNode).toBeTruthy();
      expect(m.fragmentNode).toBeTruthy();
      expect(m.premultipliedAlpha).toBe(false);
      expect(m.depthWrite).toBe(false);
    }
  });

  it("the display-to-scene encode inverts the output tone map at the day and night exposures", () => {
    for (const exposure of [3.9e-5, 1, 22]) {
      for (const d of [0.05, 0.3, 0.6]) expect(acesRoundTripGrey(d, exposure)).toBeCloseTo(d, 2);
    }
  });

  it("volumes are the large presets only; small flames stay cards on every backend", () => {
    expect([...FIRE_VOLUME_PRESETS].sort()).toEqual(["brazier", "campfire", "hearth", "torchGround", "torchHandheld"]);
    for (const id of ["candle", "lanternHanging", "lanternStanding"] as const) expect(FIRE_PRESETS[id].volume).toBeUndefined();
  });

  it("the volume cost stays inside the budget vol-fix-design.md B3/B6 states, per tier", () => {
    const cap: Record<string, { cells: number; mib: number; steps: [number, number, number] }> = {
      torchGround: { cells: 16 * 32 * 16, mib: 0.45, steps: [24, 16, 0] },
      torchHandheld: { cells: 16 * 32 * 16, mib: 0.45, steps: [24, 16, 0] },
      brazier: { cells: 20 * 40 * 20, mib: 0.86, steps: [24, 16, 12] },
      hearth: { cells: 24 * 48 * 24, mib: 1.48, steps: [28, 20, 12] },
      campfire: { cells: 24 * 48 * 24, mib: 1.48, steps: [28, 20, 12] },
    };
    for (const id of FIRE_VOLUME_PRESETS) {
      const v = FIRE_PRESETS[id].volume!;
      const cost = fireVolumeCost(v);
      expect(cost.cells).toBeLessThanOrEqual(cap[id].cells);
      expect(cost.fieldMB).toBeLessThanOrEqual(cap[id].mib);
      expect([v.steps.high, v.steps.medium, v.steps.mobile]).toEqual(cap[id].steps);
      expect(cost.computePassesPerStep).toBe(8);
      expect(fireVolumeCost(v, "mobile").computePassesPerStep).toBe(6);
    }
    expect(FIRE_VOLUME_TIER_CONFIG.high.privateFields).toBe(2);
    expect(FIRE_VOLUME_TIER_CONFIG.medium.privateFields).toBe(1);
    expect(FIRE_VOLUME_TIER_CONFIG.mobile.privateFields).toBe(0);
    expect(FIRE_VOLUME_TIER_CONFIG.low.reachM).toBe(6);
    expect(fireCurlMiB(64)).toBe(2);
    expect(volumeShareAt(0)).toBe(1);
    expect(volumeShareAt(FIRE_VOLUME_REACH_M + 1)).toBe(0);
  });

  it("a mobile tier draws torches as cards and the bigger fires as volumes", () => {
    const fire = new FlameSystem();
    fire.setVolumeTier("mobile");
    fire.setEmitters([
      { position: new THREE.Vector3(0, 0, 0), preset: "torchGround", scale: 1, seed: 0.2, owner: 0 },
      { position: new THREE.Vector3(2, 0, 0), preset: "brazier", scale: 1, seed: 0.4, owner: 1 },
    ]);
    // card column 15: 1 = yields to a volume inside the reach
    const yieldOf = (i: number) => (fire.group.children[0] as THREE.Mesh<THREE.InstancedBufferGeometry>).geometry
      .getAttribute("iAnim").getW(i);
    expect(yieldOf(0)).toBe(0); // torch card
    const brazierCard = FIRE_PRESETS.torchGround.layers.core + FIRE_PRESETS.torchGround.layers.outer;
    expect(yieldOf(brazierCard)).toBe(1);
  });

  it("every fire vertex stage places the emitter through the group's world matrix (walk 7: interior flames 4 km below the cell)", () => {
    // An interior cell's emitters are cell-local and its group stands at
    // 4000 m; a shader reading iPosSeed as world drew every interior flame
    // past uMaxDistance. Distance, billboard and fade all start from it.
    for (const file of ["flameMaterial.ts", "volumeFire.ts"]) {
      const src = readFileSync(fileURLToPath(new URL(`./${file}`, import.meta.url)), "utf8")
        .split("\n").filter((l) => !/^\s*(\*|\/\/)/.test(l)).join("\n");
      const placed = src.match(/T\.modelWorldMatrix\.mul\(vec4\(iPosSeed\.xyz, 1\)\)\.xyz/g) ?? [];
      expect(placed.length).toBe(file === "flameMaterial.ts" ? 2 : 1);
      expect(src.replace(/T\.modelWorldMatrix\.mul\(vec4\(iPosSeed\.xyz, 1\)\)/g, "")).not.toMatch(/iPosSeed\.xyz/);
    }
  });

  it("flicker is the same function for light and flame: about 1 +- amount, seeded", () => {
    const samples = Array.from({ length: 2000 }, (_, i) => fireFlicker(i * 0.037, 0.3, 5, 0.1));
    expect(Math.max(...samples)).toBeLessThanOrEqual(1.1 + 1e-9);
    // the breath's floor, times the deepest gust (25 %)
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(0.9 * 0.75 - 1e-9);
    expect(fireFlicker(1, 0.2, 5, 0.1)).not.toBeCloseTo(fireFlicker(1, 0.7, 5, 0.1), 6);
  });

  it("flicker is deterministic per seed (a pure function of time and seed)", () => {
    const a = Array.from({ length: 500 }, (_, i) => fireFlicker(i * 0.11, 0.42, 5, 0.15));
    const b = Array.from({ length: 500 }, (_, i) => fireFlicker(i * 0.11, 0.42, 5, 0.15));
    expect(a).toEqual(b);
  });

  it("flicker never repeats: no autocorrelation peak at lags 1-20 s, and gusts occur", () => {
    for (const id of ["candle", "torchGround", "campfire"] as FirePresetId[]) {
      const { rateHz, amount } = FIRE_PRESETS[id].flicker;
      const dt = 0.05;
      const n = Math.round(600 / dt);
      const x = Array.from({ length: n }, (_, i) => fireFlicker(i * dt, 0.618, rateHz, amount));
      const mean = x.reduce((a, v) => a + v, 0) / n;
      const d = x.map((v) => v - mean);
      const var0 = d.reduce((a, v) => a + v * v, 0);
      let peak = 0;
      for (let lag = Math.round(1 / dt); lag <= Math.round(20 / dt); lag++) {
        let c = 0;
        for (let i = 0; i + lag < n; i++) c += d[i] * d[i + lag];
        peak = Math.max(peak, Math.abs(c / var0));
      }
      expect(peak).toBeLessThan(0.15);
      // a gust: some sample sits below the breath's floor (1 - amount)
      expect(Math.min(...x)).toBeLessThan(1 - amount);
    }
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
  it("publishes its uniforms and the last draw's tone mapping on group.userData for the flames probe", () => {
    const fire = new FlameSystem();
    expect(fire.group.userData.fireUniforms).toBe(fire.uniforms);
    const cards = fire.group.getObjectByName("fire-flame-cards")!;
    const renderer = { toneMappingExposure: 16, toneMapping: THREE.ACESFilmicToneMapping, currentToneMapping: THREE.ACESFilmicToneMapping,
      getRenderTarget: () => null, backend: { isWebGPUBackend: false } };
    fire.setBackend("webgl");
    cards.onBeforeRender(renderer as never, null as never, null as never, null as never, null as never, null as never);
    expect(fire.group.userData.lastDraw).toEqual({ toneMapping: THREE.ACESFilmicToneMapping, currentToneMapping: THREE.ACESFilmicToneMapping, target: null });
    expect(fire.uniforms.uExposure.value).toBe(16);
  });

  it("rebinds instance rows on a fresh geometry and frees the old one (review 2026-09-30, walk 9)", () => {
    // three caches a geometry's attribute list and cannot see a swapped InterleavedBufferAttribute
    // (no id): rows rebound on the same geometry drew the old buffer with the new count
    const fire = new FlameSystem();
    const meshes: THREE.Mesh[] = [];
    fire.group.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
    expect(meshes).toHaveLength(2);
    const at = (n: number) => Array.from({ length: n }, (_, i) =>
      ({ position: new THREE.Vector3(i, 1, 0), preset: "candle" as const, scale: 1, seed: 0.1, owner: i }));
    let disposed = 0;
    const watch = () => { for (const m of meshes) m.geometry.addEventListener("dispose", () => { disposed += 1; }); };
    watch();
    const before = meshes.map((m) => m.geometry);
    fire.setEmitters(at(1));
    expect(disposed).toBe(2); // flame + ember geometries, once each
    meshes.forEach((m, i) => expect(m.geometry).not.toBe(before[i]));
    watch();
    fire.setEmitters(at(3));
    expect(disposed).toBe(4);
    const flames = meshes[0].geometry as THREE.InstancedBufferGeometry;
    const rows = flames.getAttribute("iPosSeed") as THREE.InterleavedBufferAttribute;
    expect(rows.data.count).toBe(flames.instanceCount);
    // the old geometry's dispose frees every attribute it holds: none may live on in the new one
    const live = new Set<unknown>([flames.index, ...Object.values(flames.attributes)]);
    const oldOwned = [before[0].index, ...Object.values(before[0].attributes)];
    for (const a of oldOwned) expect(live.has(a)).toBe(false);
    expect(flames.index!.count).toBe(before[0].index!.count);
  });

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
 * The bundle stems (a place id, an interior cell id) the place gate asks for
 * (place_gates.py `flame_anchor_gate`, env ES_FLAME_ANCHOR_ONLY): one place's
 * defect never fails another place's gate. Unset: every published bundle.
 */
function anchorScope(): Set<string> | null {
  const only = process.env.ES_FLAME_ANCHOR_ONLY;
  if (!only) return null;
  return new Set(only.split(",").filter(Boolean));
}

const stemOf = (file: string) => file.split("/").pop()!.replace(/\.json$/, "");

/**
 * The anchor check over the published data: every exterior piece the layer
 * draws a fire for (SettlementLayer's rule: a light fixture, else a sprite
 * holder; the fallback only for a lit fixture with no fire of its own or on
 * it) and every interior piece with mined flames. Fails naming the piece.
 */
/**
 * With a scope, a named stem with no published bundle is a failure: a gate
 * that read nothing never passes (review 2026-09-30).
 */
function publishedAnchorFailures(scope = anchorScope()): { checked: number; failures: string[] } {
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
  const read = new Set<string>();
  const inScope = (file: string) => {
    if (scope && !scope.has(stemOf(file))) return false;
    read.add(stemOf(file));
    return true;
  };
  for (const file of jsonFiles(join(PUBLIC, "province", "settlements")).filter(inScope)) {
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
  for (const file of jsonFiles(join(PUBLIC, "province", "interiors")).filter(inScope)) {
    const bundle = JSON.parse(readFileSync(file, "utf8")) as { placements?: Placement[] };
    for (const p of bundle.placements ?? []) {
      const row = rows.get(`${p.kit}|${p.assetId}`);
      if (row?.flames?.length) check(p.id, row, false);
    }
  }
  for (const stem of scope ?? []) {
    if (!read.has(stem)) failures.push(`${stem}: has no published bundle to check`);
  }
  return { checked, failures };
}

describe("fire curl texture (vol-fix-design.md B2)", () => {
  it("is deterministic, unit rms, divergence-free on its lattice, and tiles across the wrap", () => {
    const a = makeFireCurl(16), b = makeFireCurl(16);
    const d = a.image.data as Uint16Array;
    expect(Array.from(d)).toEqual(Array.from(b.image.data as Uint16Array));
    const n = 16;
    const f = (x: number, y: number, z: number, c: number) =>
      THREE.DataUtils.fromHalfFloat(d[((((z + n) % n) * n + ((y + n) % n)) * n + ((x + n) % n)) * 4 + c]);
    let sq = 0, div = 0, mag = 0;
    for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      for (let c = 0; c < 3; c++) sq += f(x, y, z, c) ** 2;
      // the curl of a central-difference field has zero central-difference divergence
      div += Math.abs(f(x + 1, y, z, 0) - f(x - 1, y, z, 0) + f(x, y + 1, z, 1) - f(x, y - 1, z, 1)
        + f(x, y, z + 1, 2) - f(x, y, z - 1, 2));
      mag += Math.abs(f(x + 1, y, z, 0) - f(x - 1, y, z, 0));
    }
    expect(Math.sqrt(sq / (n * n * n * 3))).toBeCloseTo(1, 1);
    expect(div).toBeLessThan(mag * 0.05);
    a.dispose(); b.dispose();
  });
});

describe("private volume fields (vol-fix-design.md B4)", () => {
  it("the nearest fires within 8 m own a private field on high, one on medium; their shared row hides", () => {
    const renderer = { compute: () => {}, toneMappingExposure: 1, toneMapping: THREE.NoToneMapping };
    const camera = new THREE.PerspectiveCamera();
    camera.updateMatrixWorld();
    for (const [tier, expected] of [["high", 2], ["medium", 1]] as const) {
      const fire = new FlameSystem();
      fire.setVolumeTier(tier);
      fire.setBackend("webgpu");
      fire.setEmitters([1, 3, 5, 20].map((x, i) =>
        ({ position: new THREE.Vector3(x, 0, 0), preset: "brazier" as const, scale: 1, seed: 0.1 * i, owner: i })));
      fire.update(1, () => 1);
      const shared = fire.group.getObjectByName("fire-volume-brazier") as THREE.Mesh<THREE.InstancedBufferGeometry>;
      shared.onBeforeRender(renderer as never, new THREE.Scene(), camera, shared.geometry, shared.material as never, null as never);
      const privates = fire.group.children.filter((o) => o.name.startsWith("fire-volume-brazier-private") && o.visible);
      expect(privates).toHaveLength(expected);
      const box = shared.geometry.getAttribute("iBox");
      const hidden = [0, 1, 2, 3].filter((i) => box.getW(i) === 0);
      expect(hidden).toEqual([0, 1].slice(0, expected));
      fire.dispose();
    }
  });
});

describe("interior fires", () => {
  it("every mined flame of a published interior cell becomes an emitter at its placement", () => {
    const rows = kitRows();
    const file = join(PUBLIC, "province", "interiors", "DawnstarBrinasHouse.json");
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

  it("a place gate's scope checks only the bundles it names (review 2026-09-30)", () => {
    expect(publishedAnchorFailures(null).checked).toBeGreaterThan(0);
    const nowhere = publishedAnchorFailures(new Set(["place.nowhere"]));
    expect(nowhere.checked).toBe(0);
    // a scope naming a bundle that is not published fails: nothing read is never green
    expect(nowhere.failures).toEqual(["place.nowhere: has no published bundle to check"]);
  });

  it("every flame of every published place and interior lies in its piece", () => {
    const scoped = anchorScope() !== null;
    const { checked, failures } = publishedAnchorFailures();
    expect(failures).toEqual([]);
    // a place gate's scope may hold one unlit place; the whole set never can
    if (!scoped) expect(checked).toBeGreaterThan(20);
  });
});

// ---- coverage: every lit piece burns (16k walk 5 follow-up) -----------------

/**
 * Per published place and interior: the pieces that should burn (exterior: a
 * light fixture or sprite holder, SettlementLayer's rule; interior:
 * `burnsInInterior`) and how many resolve at least one flame. A lit piece
 * holding a mounted fire (exterior `hostsOfFire`, interior a burning piece in
 * its bounds) counts as covered by that fire. Greenspring's hist-lantern1-3
 * (argonianlanterns03: a `light` record, no mined emitter) are the case that
 * made this test: lit, drawn, no flame.
 */
function flameCoverage(): { where: string; burning: number; covered: number; uncovered: string[] }[] {
  const rows = kitRows();
  const out: { where: string; burning: number; covered: number; uncovered: string[] }[] = [];
  for (const file of jsonFiles(join(PUBLIC, "province", "settlements"))) {
    const bundle = JSON.parse(readFileSync(file, "utf8")) as { placements?: Placement[] };
    const placements = bundle.placements ?? [];
    const hostsOfFire = new Set(placements.filter((p) => p.parentPlacementId
      && drawsOwnFire(rows.get(`${p.kit}|${p.assetId}`) as never)).map((p) => p.parentPlacementId!));
    const entry = { where: file.split("/").pop()!, burning: 0, covered: 0, uncovered: [] as string[] };
    for (const p of placements) {
      const row = rows.get(`${p.kit}|${p.assetId}`);
      if (!row) continue;
      const meta = row as never;
      const fixture = isLightFixturePlacement({ kind: p.kind as never, layer: p.layer }, meta);
      const holder = !fixture && isSpriteHolderPlacement({ kind: p.kind as never, layer: p.layer }, meta);
      if (!fixture && !holder) continue;
      const lit = Boolean(row.light?.fixtureKind) || drawsOwnFire(meta);
      if (!lit) continue;
      entry.burning += 1;
      const box = manifestBoxYUp(row);
      const anchors = box ? pieceFlameAnchorsLocal(row, box,
        fixture && !drawsOwnFire(meta) && !hostsOfFire.has(p.id)) : [];
      const bed = row.flameCardMaterials?.length && !row.flames?.length;
      if (anchors.length || bed || hostsOfFire.has(p.id)) entry.covered += 1;
      else entry.uncovered.push(`${p.id} (${row.id})`);
    }
    if (entry.burning) out.push(entry);
  }
  for (const file of jsonFiles(join(PUBLIC, "province", "interiors"))) {
    const bundle = JSON.parse(readFileSync(file, "utf8")) as { placements?: (Placement & { positionM?: number[] })[] };
    if (!bundle.placements?.length) continue;
    const placements = bundle.placements.filter((p) => p.positionM);
    const rowOf = (p: Placement) => rows.get(`${p.kit}|${p.assetId}`);
    const at = (p: Placement & { positionM?: number[] }) =>
      new THREE.Matrix4().makeTranslation(p.positionM![0], p.positionM![1], p.positionM![2]);
    const entry = { where: file.split("/").pop()!, burning: 0, covered: 0, uncovered: [] as string[] };
    for (const p of placements) {
      if (!burnsInInterior(rowOf(p))) continue;
      entry.burning += 1;
      const emitters = interiorFireEmitters([p], rowOf, at);
      if (emitters.length) entry.covered += 1;
      else entry.uncovered.push(`${p.id} (${p.assetId})`);
    }
    if (entry.burning) out.push(entry);
  }
  return out;
}

describe("every lit piece burns a flame", () => {
  it("an interior light-only fixture burns a fallback flame; a brazier holding a bowl fire does not double it", () => {
    const lantern = { id: "mudmother:gv_meshes/argoniannest/argonianlanterns03", anchorClass: "hanging",
      light: { fixtureKind: "lantern" }, sizeM: [0.655, 0.639, 2.236], originOffsetM: [0.317, 0.317, 2.149] };
    expect(burnsInInterior(lantern)).toBe(true);
    const box = manifestBoxYUp(lantern)!;
    const anchors = interiorFlameAnchorsLocal(lantern, box);
    expect(anchors.map((a) => a.preset)).toEqual(["lanternHanging"]);
    expect(flameAnchorFailures("lamp", lantern, box, anchors)).toEqual([]);
    const brazier = { id: "vanilla:dungeons/braziers/brazier01", category: "brazier", light: { fixtureKind: "brazier" },
      sizeM: [1, 1, 1], originOffsetM: [0.5, 0.5, 0] };
    const bowl = { id: "vanilla:effects/fxfirewithembers01", flameCardMaterials: ["fire"],
      sizeM: [0.5, 0.5, 0.5], originOffsetM: [0.25, 0.25, 0] };
    const rowsById: Record<string, typeof brazier | typeof bowl> = { b: brazier, f: bowl };
    const pl = [{ id: "b", kit: "k", assetId: "b", y: 0 }, { id: "f", kit: "k", assetId: "f", y: 0.8 }];
    const emitters = interiorFireEmitters(pl, (p) => rowsById[p.assetId],
      (p) => new THREE.Matrix4().makeTranslation(0, p.y, 0));
    expect(emitters.map((e) => e.preset)).toEqual(["brazier"]);
    expect(emitters).toHaveLength(1);
    // alone, the brazier burns its own fallback
    expect(interiorFireEmitters([pl[0]], (p) => rowsById[p.assetId], () => new THREE.Matrix4())).toHaveLength(1);
  });

  it("Greenspring's hist-lantern1-3 (lit, no mined emitter) each burn one lanternHanging flame in the lantern's body", () => {
    const rows = kitRows();
    const file = join(PUBLIC, "province", "settlements", "place.hist-heartland.greenspring.json");
    const bundle = JSON.parse(readFileSync(file, "utf8")) as { placements: Placement[] };
    const lanterns = bundle.placements.filter((p) => /hist-lantern[123]$/.test(p.id));
    expect(lanterns).toHaveLength(3);
    for (const p of lanterns) {
      const row = rows.get(`${p.kit}|${p.assetId}`)!;
      expect(row.light?.fixtureKind).toBe("lantern");
      expect(row.flames ?? []).toEqual([]);
      expect(isLightFixturePlacement({ kind: p.kind as never, layer: p.layer }, row as never)).toBe(true);
      const box = manifestBoxYUp(row)!;
      const anchors = pieceFlameAnchorsLocal(row, box, !drawsOwnFire(row as never));
      expect(anchors.map((a) => a.preset)).toEqual(["lanternHanging"]);
      expect(flameAnchorFailures(p.id, row, box, anchors)).toEqual([]);
    }
  });

  it("every lit piece of every published place and interior resolves a flame", () => {
    const coverage = flameCoverage();
    const greenspring = coverage.find((c) => c.where.includes("greenspring"));
    expect(greenspring).toBeDefined();
    if (process.env.FIRE_COVERAGE_OUT) {
      writeFileSync(process.env.FIRE_COVERAGE_OUT, JSON.stringify(coverage, null, 1));
    }
    expect(coverage.flatMap((c) => c.uncovered)).toEqual([]);
  });
});

describe("vol10 F8 fire look and draw", () => {
  it("volume boxes draw only on the fire-volume layer, never in a scene pass", () => {
    const fire = new FlameSystem(undefined, 5);
    fire.setBackend("webgpu");
    fire.setEmitters([{ position: new THREE.Vector3(), preset: "hearth", scale: 1, seed: 0.3, owner: 0 }]);
    const vols = fire.group.children.filter((o) => o.name.startsWith("fire-volume-"));
    expect(vols.length).toBeGreaterThan(0);
    for (const v of vols) expect(v.layers.mask).toBe(1 << FIRE_VOLUME_LAYER);
    fire.dispose();
  });
  it("the hearth flame stands ~3:1 against its bed, with a smoke plume above it", () => {
    const v = PRESETS_F8.hearth.volume!;
    const [, h] = volumeBoxSize("hearth", 1);
    const flameM = h * (v.flameShare ?? 1);
    expect(flameM / PRESETS_F8.hearth.shape.widthM).toBeGreaterThan(2.6);
    expect(flameM / PRESETS_F8.hearth.shape.widthM).toBeLessThan(3.2);
    expect(v.flameShare).toBeLessThan(1);
  });
  it("a record light at a fire flickers with that fire's own signal; a far light stays steady", () => {
    const e = { position: new THREE.Vector3(1, 0, 0), preset: "hearth" as const, scale: 1, seed: 0.42, owner: 0 };
    const f = new CellLightFlicker([{ position: new THREE.Vector3(1, 0.8, 0) }, { position: new THREE.Vector3(9, 1, 0) }], [e]);
    const { rateHz, amount } = PRESETS_F8.hearth.flicker;
    const seen = new Set<number>();
    for (let t = 0; t < 2; t += 0.1) {
      expect(f.factor(0, t)).toBe(flickerF8(t, 0.42, rateHz, amount));
      expect(f.factor(1, t)).toBe(1);
      seen.add(Math.round(f.factor(0, t) * 1000));
    }
    expect(seen.size).toBeGreaterThan(3);
  });
});
