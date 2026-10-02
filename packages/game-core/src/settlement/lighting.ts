/**
 * Settlement lighting (walk 2 D7, planner-specified model): one clock for
 * every artificial light, light fixtures derived from the placed pieces, and
 * a budget of real point lights nearest the camera.
 *
 * - `artificialLightFactor` is the ONE clock: lamps, candles, sconces,
 *   torches and window glow are lit from 17:30 to 06:30 world time, out from
 *   06:50 to 17:10, with linear 20-minute ramps between. It feeds the
 *   settlement night uniform (materials.ts `updateSettlementEnvironment`).
 * - Fires burn by day too (planner ruling, walk 2): a brazier, cook-fire,
 *   forge or campfire fixture (`fixtureKind` of its LIGH block, else its kit
 *   category) and every fire socket keep flame and light on all day, at
 *   `ALWAYS_LIT_DAY_FACTOR` by day rising with the clock to 1 at night.
 * - A fixture is a "light" layer placement (the compile's assembly layer,
 *   carried by the export), a piece whose kit manifest carries a mined LIGH
 *   record, or a fire socket (`effect-socket/fire`) that does not sit on a
 *   fixture already.
 * - Its fire is the NIF's own fire layer (16k walk 4), mined by the kit build
 *   (build_kit mine_fire_layer): Skyrim draws flames as particle systems (the
 *   piece's own, or an `AddOnNodeN` resolved through Skyrim.esm ADDN to an
 *   MPS NIF), which never convert to meshes. Each manifest `flames` entry is
 *   an emitter drawn by the fire module (fx/fire, 16k walk 5): procedural
 *   flame cards whose preset (candle, lantern, torch, brazier, hearth,
 *   campfire: fireTypes.ts) is read from the piece's records, placed at the
 *   emitter through the piece's final draw matrix, readable by day and by
 *   night (flameMaterial.ts). Each `glows` entry (a NIF
 *   billboard glow disc, dropped from the mesh) is a still additive sprite
 *   tinted the fixture colour. A piece with neither and no flame cards of its
 *   own (`flameCardMaterials`: fxfirewithembers01) gets one fallback flame
 *   (fx/fire/flameAnchors.ts: a hanging lantern's at its body, any other on
 *   its bounds' top). Kit materials flagged `additive` are drawn
 *   unlit and additive by materials.ts under `fixtureFactor`, never the lamp
 *   clock alone. All sprite textures are works-v1 `effectTextures`.
 * - A lit window is no fixture (walk 3 ruling R11): its glow is the kit's
 *   emissive glow mask under the lamp clock (materials.ts), never a point light.
 * - Every fixture light is one warm orange, `FIXTURE_LIGHT_RGB` (the fire's
 *   own), whatever its LIGH record's colour; fixtures differ only in radius
 *   (the record's) and candela. It stands at the LIGH record's `offsetM` (the
 *   placed light's median offset in the piece frame), else at its first flame.
 * - Lights band (walk 3 ruling R3, owner 2026-09-28): every burning fixture
 *   within `LIGHTS_ACTIVE_M` (200 m) of the camera lights the world, up to
 *   `LIGHTS_CAP` (100) nearest, fading out over the band's last
 *   `LIGHTS_FADE_M`; beyond the band, or past the cap, the flame and the
 *   emissive stay as they are and no light is cast. The set is re-chosen once
 *   a second (`LIGHT_BUDGET_REFRESH_S`).
 * - Fixture lights are NOT three lights (16k walk 5 perf): they live in the
 *   scene's `FixtureLightField` (render/fixtureLights), a float texture with a
 *   runtime count; each drawn object is lit by its 8 nearest lamps only, and
 *   the program never changes with the count. A new light source for the
 *   world goes through that field, never a new `PointLight` (the carried
 *   torch, character CarriedLight, stays the one real point light). The cap
 *   is also a place check rule (place_gates reads `LIGHTS_CAP` and
 *   `LIGHTS_ACTIVE_M`): no point within a place may see more than 100
 *   fixtures within 200 m. It is made by the layer (or injected into it),
 *   never a module singleton.
 */
import * as THREE from "three";
import { MINUTES_PER_DAY } from "@elder-souls/world-time";
import { lightSourceFromRecord } from "../fx/carriedLight";
import { FlameSystem } from "../fx/fire/FlameSystem";
import { FixtureLightField } from "../render/fixtureLights";
import { BLOOM_SOURCE_LAYER } from "../render/post/BloomPass";
import { flameCardBedAnchorLocal, pieceFlameAnchorsLocal } from "../fx/fire/flameAnchors";
import { FIRE_LIGHTS, FIRE_PRESETS, fireFlicker, firePresetFor, type FirePresetId } from "../fx/fire/fireTypes";
import { FLAME_MAX_DISTANCE_M as FIRE_MAX_DISTANCE_M, FLAME_MIN_ANGLE_RAD as FIRE_MIN_ANGLE_RAD } from "../fx/fire/flameMaterial";
import { PRECIP_LAYER } from "../water/render/waterMaterial";
import { FIXTURE_LIGHT_RGB } from "./fixtureGlow";
import type { SettlementKitAssetMeta, SettlementKitLight, SettlementPlacement } from "./types";

/** Minutes of the day: full on at and after 17:30 and up to 06:30. */
export const LIGHTS_FULL_FROM_MIN = 17 * 60 + 30;
export const LIGHTS_FULL_UNTIL_MIN = 6 * 60 + 30;
/** Minutes of the day: fully out from 06:50 to 17:10. */
export const LIGHTS_OUT_FROM_MIN = 6 * 60 + 50;
export const LIGHTS_OUT_UNTIL_MIN = 17 * 60 + 10;

/** 1 when artificial lights burn, 0 when they are out, linear ramps between. */
export function artificialLightFactor(epochMinutes: number): number {
  const m = ((epochMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  if (m <= LIGHTS_FULL_UNTIL_MIN || m >= LIGHTS_FULL_FROM_MIN) return 1;
  if (m >= LIGHTS_OUT_FROM_MIN && m <= LIGHTS_OUT_UNTIL_MIN) return 0;
  if (m < LIGHTS_OUT_FROM_MIN) {
    return (LIGHTS_OUT_FROM_MIN - m) / (LIGHTS_OUT_FROM_MIN - LIGHTS_FULL_UNTIL_MIN);
  }
  return (m - LIGHTS_OUT_UNTIL_MIN) / (LIGHTS_FULL_FROM_MIN - LIGHTS_OUT_UNTIL_MIN);
}

/** Radius of a fixture with no recorded LIGH radius. */
export const FIXTURE_DEFAULT_RADIUS_M = 6;
/** The ONE fixture light colour: fixtureGlow.ts says why. */
export { FIXTURE_LIGHT_RGB };
/** Cap on fixture lights at once (R3): the nearest burning fixtures in the band,
 * the slots of the scene's `FixtureLightField` (render/fixtureLights
 * `FIXTURE_LIGHTS_MAX`). Also the place check rule's fixture-density cap
 * (place_gates reads it). */
export const LIGHTS_CAP = 100;
/** How often the lit set is re-chosen, seconds. */
export const LIGHT_BUDGET_REFRESH_S = 1;
/** The lights band (R3): a burning fixture this close to the camera emits a
 * point light (up to `LIGHTS_CAP`); further out only its sprite and emissive
 * show. Also the radius of the place check rule's fixture-density count. */
export const LIGHTS_ACTIVE_M = 200;
/** A fixture light fades out over the band's last metres, so no light pops at the edge. */
export const LIGHTS_FADE_M = 20;
/** Fallback flame edge (m), and how far away any flame or glow sprite is
 * still drawn (the fire module's own reach, fx/fire/flameMaterial.ts). */
export const FLAME_SIZE_M = 0.25;
export const FLAME_MAX_DISTANCE_M = FIRE_MAX_DISTANCE_M;
export const FLAME_FADE_M = 30;
/** A flame never draws smaller than this angle (radians, ~4 px at 1080p): a
 * 3.6 cm candle flame then still reads as a point of fire at 50 m. */
export const FLAME_MIN_ANGLE_RAD = FIRE_MIN_ANGLE_RAD;
/** A glow sprite's brightness at full strength (the NIF discs are soft,
 * vertex-alpha-faded halos, not solid light), tinted `FIXTURE_LIGHT_RGB`. */
export const GLOW_ALPHA = 0.35;
/** The compile rule of a fire socket (compile_settlement effect sockets). */
export const FIRE_SOCKET_RULE = "effect-socket/fire";
/** Where every flame and glow texture is published (build_kit effectTextures,
 * `role` flame or glow) and the fallback flame's texture: vanilla's candle
 * flame, a 2x2 atlas stepping one cell per particle life (MPSCandleFlame01,
 * 0.333 s, so 3 fps). */
export const FLAME_TEXTURE_KIT = "works-v1";
export const FLAME_TEXTURE_ASSET_ID = "fx:candleflame01";
export const FALLBACK_FLAME_ATLAS: [number, number] = [2, 2];
export const FALLBACK_FLAME_FPS = 3;
/** Fixture kinds that burn by day as well as by night (planner ruling, walk 2). */
export const ALWAYS_LIT_KINDS: ReadonlySet<string> = new Set(["brazier", "cook-fire", "forge", "campfire"]);
/** An always-lit fixture's strength at the clock's 0 (day); it rises with the clock to 1. */
export const ALWAYS_LIT_DAY_FACTOR = 0.5;

/** One sprite of a fixture: a flipbook flame or a still glow disc. */
export interface FixtureSprite {
  /** World position of the quad's centre. */
  position: THREE.Vector3;
  sizeM: number;
  /** works-v1 `effectTextures` id. */
  texture: string;
  atlas: [number, number] | null;
  frames: number;
  fps: number;
  /** A glow disc: tinted, never scaled up with distance, no flicker. */
  glow: boolean;
  /** A glow's own linear tint (manifest `tintRgb`); absent: the fire colour. */
  tint?: THREE.Color;
  /** A glow disc's offset toward the viewer (its billboard node's), metres. */
  towardCameraM?: number;
  /** 0..1 from the fixture id and the sprite's index: frame phase and flicker. */
  seed: number;
  /** A flame's fire preset (fx/fire/fireTypes.ts); `position` is then its
   * emitter (the wick, the bed's centre) in world space. Absent on a glow. */
  preset?: FirePresetId;
  /** The piece's scale (the fire's cards scale with it); absent: 1. */
  pieceScale?: number;
}

export interface LightFixture {
  id: string;
  kind: "fixture";
  /** World position of the point light. */
  position: THREE.Vector3;
  radiusM: number;
  /** Peak intensity (cd): its fire class's (fx/fire `FIRE_LIGHTS`). */
  candela: number;
  /** Linear RGB. */
  colour: THREE.Color;
  /** The NIF's flames and glows (manifest `flames`, `glows`), else one
   * fallback flame; empty when the piece's own flame cards burn. */
  flames: FixtureSprite[];
  /** A fire that burns by day too (`ALWAYS_LIT_KINDS`, fire sockets). */
  alwaysLit: boolean;
  /** A light fixture (`isLightFixturePlacement`, fire sockets): holds a point
   * light in the band. False for a sprite holder (`isSpriteHolderPlacement`:
   * the forge's glow, the ferry raft's candles), whose sprites draw with no light. */
  castsLight: boolean;
}

/** A stable 0..1 hash of a string (FNV-1a). */
export function hash01(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0x100000000;
}

/** A fixture's kind: its LIGH block's `fixtureKind`, else its kit category. */
export function isAlwaysLitFixture(meta: SettlementKitAssetMeta | undefined): boolean {
  const kind = meta?.light?.fixtureKind ?? meta?.category;
  return kind !== undefined && ALWAYS_LIT_KINDS.has(kind);
}

/**
 * A piece that draws a fire of its own: mined flames (manifest `flames`) or
 * additive flame cards (`flameCardMaterials`: fxfirewithembers01's).
 */
export function drawsOwnFire(meta: SettlementKitAssetMeta | undefined): boolean {
  return (meta?.flames?.length ?? 0) > 0 || (meta?.flameCardMaterials?.length ?? 0) > 0;
}

/**
 * Whether a piece's fire burns by day: its own fire kind, else its host's.
 * The flame a brazier holds is a separate mounted effect (vanilla stands
 * FXFireWithEmbers01 in the bowl, category `effect`, no LIGH record), so its
 * kind is read from the brazier it is mounted on.
 */
export function burnsByDay(
  meta: SettlementKitAssetMeta | undefined,
  hostMeta: SettlementKitAssetMeta | undefined,
): boolean {
  return isAlwaysLitFixture(meta) || isAlwaysLitFixture(hostMeta);
}

/** What a piece's mount relation tells its fixture (`fixtureFromPiece`). */
export interface FixtureMount {
  /** The manifest row of the piece this one is mounted on. */
  hostMeta?: SettlementKitAssetMeta;
  /** A child that draws its own fire (`drawsOwnFire`) is mounted on this piece. */
  hasMountedFire?: boolean;
}

/** Strength of a fixture at clock factor `clock`: the clock, or for a fire lerp(0.5, 1, clock). */
export function fixtureFactor(clock: number, alwaysLit: boolean): number {
  return alwaysLit ? ALWAYS_LIT_DAY_FACTOR + (1 - ALWAYS_LIT_DAY_FACTOR) * clock : clock;
}

export function isFireSocket(placement: Pick<SettlementPlacement, "provenance">): boolean {
  return placement.provenance?.ruleId === FIRE_SOCKET_RULE;
}

/** A light fixture piece: the compile's "light" layer, or a mined LIGH record in its manifest. */
export function isLightFixturePlacement(
  placement: Pick<SettlementPlacement, "kind" | "layer">,
  meta: SettlementKitAssetMeta | undefined,
): boolean {
  if (placement.kind === "effect") return false;
  return placement.layer === "light" || Boolean(meta?.light);
}

/**
 * A piece that is no light fixture but carries mined flames or glows
 * (manifest `flames`, `glows`: the forge's glow disc, the ferry raft's two
 * candles, fxfirewithembers01's glow) or flame cards (its brazier bed,
 * `flameCardBedAnchorLocal`): its sprites draw, it casts no light,
 * and it is not counted with the light fixtures (place_gates' density rule).
 */
export function isSpriteHolderPlacement(
  placement: Pick<SettlementPlacement, "kind" | "layer">,
  meta: SettlementKitAssetMeta | undefined,
): boolean {
  if (isLightFixturePlacement(placement, meta)) return false;
  return (meta?.flames?.length ?? 0) + (meta?.glows?.length ?? 0) + (meta?.flameCardMaterials?.length ?? 0) > 0;
}

/** Radius, intensity and linear colour of a fixture of fire class `preset`:
 * the LIGH record's radius where recorded (else the default), capped by the
 * class's `maxRadiusM`; the class's candela (fx/fire `FIRE_LIGHTS`); the
 * colour is always `FIXTURE_LIGHT_RGB`. */
export function fixtureLightOf(light: SettlementKitLight | undefined, preset: FirePresetId = "candle"): {
  radiusM: number; candela: number; colour: THREE.Color;
} {
  const colour = srgbColour(FIXTURE_LIGHT_RGB);
  const cls = FIRE_LIGHTS[preset];
  const recorded = light ? lightSourceFromRecord(light.formId, light).radiusMetres : 0;
  const radiusM = recorded > 0 ? recorded : FIXTURE_DEFAULT_RADIUS_M;
  return { radiusM: cls.maxRadiusM === null ? radiusM : Math.min(radiusM, cls.maxRadiusM),
    candela: cls.candela, colour };
}

function srgbColour(rgb: readonly [number, number, number]): THREE.Color {
  return new THREE.Color().setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, THREE.SRGBColorSpace);
}

function fallbackFlame(id: string, position: THREE.Vector3, preset: FirePresetId): FixtureSprite {
  return { position, sizeM: FLAME_SIZE_M, texture: FLAME_TEXTURE_ASSET_ID,
    atlas: FALLBACK_FLAME_ATLAS, frames: FALLBACK_FLAME_ATLAS[0] * FALLBACK_FLAME_ATLAS[1],
    fps: FALLBACK_FLAME_FPS, glow: false, seed: hash01(`${id}#fallback`), preset };
}

/**
 * The fixture of one placed piece. `matrix` is its final draw transform
 * (placement, mount, hang and scale: the matrix its mesh draws with);
 * `localBox` its LOD0 bounds in its own frame. Every flame is its local
 * anchor (fx/fire/flameAnchors.ts `pieceFlameAnchorsLocal`) times `matrix`.
 * Its flames are the NIF's own (manifest `flames`, mined from the particle
 * systems and AddOnNodes: a lantern's two wicks, a horn candelabrum's four)
 * and its glows the NIF's billboard discs (manifest `glows`). A piece with
 * neither, no flame cards of its own (`flameCardMaterials`) and no mounted
 * fire child (`mount.hasMountedFire`: the brazier's fxfirewithembers01) gets
 * one fallback flame (`fallbackFlameAnchorLocal`: a hanging lantern's at its
 * body, never its cord's top; else the top of its bounds). It burns by day when
 * its own kind or its host's is a fire (`burnsByDay`). The point light stands at
 * the LIGH record's `offsetM` where recorded (vanilla places that light
 * BESIDE and above the piece: lantern median 0.61 m off, brazier 1.3 m up),
 * else at the first flame. With `castsLight` false (a sprite holder) the
 * piece draws only its mined sprites: no fallback flame, no light.
 */
export function fixtureFromPiece(
  id: string,
  meta: SettlementKitAssetMeta | undefined,
  matrix: THREE.Matrix4,
  localBox: THREE.Box3,
  castsLight = true,
  mount: FixtureMount = {},
): LightFixture {
  const scaleOf = new THREE.Vector3().setFromMatrixScale(matrix);
  const scale = Math.max(scaleOf.x, scaleOf.y, scaleOf.z);
  const hostKind = mount.hostMeta?.light?.fixtureKind ?? mount.hostMeta?.category;
  // a flame-card piece (fxfirewithembers01) burns one bed of its preset; its
  // cards are not drawn (SettlementLayer, `isFlameCardMaterial`)
  const bed = flameCardBedAnchorLocal(meta, localBox);
  const anchors = bed ? [bed] : pieceFlameAnchorsLocal(meta, localBox,
    castsLight && !drawsOwnFire(meta) && !mount.hasMountedFire, hostKind);
  // the light's class is its first fire's (a lantern's candle, a hanging
  // lantern's body flame), else the piece's own record's
  const preset = anchors[0]?.preset ?? firePresetFor({ id: meta?.id, category: meta?.category,
    anchorClass: meta?.anchorClass, fixtureKind: meta?.light?.fixtureKind, hostKind });
  const { radiusM, candela, colour } = fixtureLightOf(meta?.light, preset);
  const flames: FixtureSprite[] = anchors.map((a) => {
    const position = a.local.clone().applyMatrix4(matrix);
    const f = a.record >= 0 ? meta!.flames![a.record] : undefined;
    if (!f) return { ...fallbackFlame(id, position, a.preset), pieceScale: scale };
    return { position, sizeM: f.sizeM * scale, pieceScale: scale, texture: f.texture, atlas: f.atlas,
      frames: f.frames ?? (f.atlas ? f.atlas[0] * f.atlas[1] : 1),
      fps: f.fps, glow: false, seed: hash01(`${id}#${a.record}`), preset: a.preset };
  });
  const glows: FixtureSprite[] = (meta?.glows ?? []).map((g, i) => ({
    position: new THREE.Vector3(...g.offsetM).applyMatrix4(matrix),
    sizeM: g.sizeM * scale, texture: g.texture, atlas: null, frames: 1, fps: 0,
    glow: true, towardCameraM: (g.towardCameraM ?? 0) * scale, seed: hash01(`${id}#glow${i}`),
    ...(g.tintRgb ? { tint: new THREE.Color(...g.tintRgb) } : {}),
  }));
  const offset = meta?.light?.offsetM;
  const lightAt = offset ? new THREE.Vector3(...offset).applyMatrix4(matrix)
    : (flames[0]?.position.clone()
      ?? localBox.getCenter(new THREE.Vector3()).setY(localBox.max.y).applyMatrix4(matrix));
  return { id, kind: "fixture", position: lightAt, radiusM, candela, colour,
    alwaysLit: burnsByDay(meta, mount.hostMeta), castsLight, flames: [...flames, ...glows] };
}

/** A fire socket's fixture (always lit): a hearth fire at the socket, light just above it. */
export function fixtureFromFireSocket(id: string, socketAt: THREE.Vector3): LightFixture {
  const { radiusM, candela, colour } = fixtureLightOf(undefined, "hearth");
  return { id, kind: "fixture", radiusM, candela, colour, alwaysLit: true, castsLight: true,
    position: socketAt.clone().add(new THREE.Vector3(0, 0.3, 0)),
    flames: [fallbackFlame(id, socketAt.clone(), "hearth")] };
}

/** A fixture light's share at `distanceM` from the camera: 1 inside the band, 0 at its edge. */
export function bandFade(distanceM: number): number {
  return Math.min(1, Math.max(0, (LIGHTS_ACTIVE_M - distanceM) / LIGHTS_FADE_M));
}

/**
 * Indices of the fixtures within `bandM` of `from` that `burns` admits,
 * nearest first (ties by index), at most `cap` of them: the lit set (R3).
 */
export function fixturesInBand(
  fixtures: readonly Pick<LightFixture, "position">[], from: THREE.Vector3,
  bandM = LIGHTS_ACTIVE_M, cap = LIGHTS_CAP, burns: (index: number) => boolean = () => true,
): number[] {
  const bandSq = bandM * bandM;
  const inBand: [number, number][] = [];
  fixtures.forEach((f, i) => {
    const d = f.position.distanceToSquared(from);
    if (d <= bandSq && burns(i)) inBand.push([d, i]);
  });
  return inBand
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .slice(0, cap)
    .map(([, i]) => i);
}

const CORNERS: readonly [number, number][] = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];

/** One additive sprite draw: every quad showing one texture. */
interface SpriteBatch {
  mesh: THREE.Mesh;
  /** The bloom-source draw of the same quads (BLOOM_SOURCE_LAYER only), with
   * a material of its own: the canvas draw is tone-mapped and the bloom RT
   * draw is linear, so one material drawn both ways re-derives its program
   * twice a frame (decision 0108 checklist). `setFlameTexture` keeps map and
   * visibility in sync; colour and opacity never change (vertex colours). */
  bloom: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  capacity: number;
  drawn: number;
}

/**
 * The fixtures of the loaded settlements: a fixture light in the scene's
 * `FixtureLightField` for each burning fixture in the band (`fixturesInBand`,
 * at most `LIGHTS_CAP`, faded over the band's edge by `bandFade`), and
 * every flame drawn by the fire module (`fire`, fx/fire/FlameSystem.ts: two
 * instanced draws for all fires) and every glow disc within
 * `FLAME_MAX_DISTANCE_M` as an additive camera-facing quad, all on the
 * post-water layer (like rain and smoke: drawn after the water surface,
 * depth-tested), one glow draw per sprite texture. A lit fixture's light
 * flickers with its first flame (`fireFlicker`, the same seed and preset rate
 * the shader uses), so light and flame breathe together. `factor` is the
 * settlement night uniform (`artificialLightFactor`), shared by reference.
 */
export class SettlementLightFixtures {
  readonly group = new THREE.Group();
  /** Every fixture's flames (fx/fire): cards and embers, on the post-water layer. */
  readonly fire = new FlameSystem(undefined, PRECIP_LAYER);
  private fixtures: LightFixture[] = [];
  private assigned: number[] = [];
  private flickers: (FixtureFlicker | undefined)[] = [];
  private refreshAt = -Infinity;
  private readonly batches = new Map<string, SpriteBatch>();
  private alwaysLitSprites = 0;
  private readonly glowTint = srgbColour(FIXTURE_LIGHT_RGB);
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly cameraAt = new THREE.Vector3();
  private readonly toCamera = new THREE.Vector3();
  private readonly centre = new THREE.Vector3();

  /** `field`: the scene's fixture light field (`fixtureLightFieldOf(scene)`); a
   * field of its own when none is given (tests, previews). */
  constructor(
    private readonly factor: THREE.IUniform<number>,
    readonly field: FixtureLightField = new FixtureLightField(),
  ) {
    this.group.name = "settlement-light-fixtures";
    this.group.add(this.fire.group);
  }

  private batch(textureId: string): SpriteBatch {
    let batch = this.batches.get(textureId);
    if (batch) return batch;
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.MeshBasicMaterial({
      map: null, transparent: true, depthWrite: false, vertexColors: true,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      // three draws a transparent DoubleSide material as a back pass then a
      // front pass, flipping `side` and setting needsUpdate each time: two
      // program re-derivations per material per frame (perf10 f4b). Additive
      // blending is order-free, so one pass draws the same colours.
      forceSinglePass: true,
    });
    material.name = `settlement-fixture-sprite:${textureId}`;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.name = `settlement-fixture-flames:${textureId}`;
    mesh.layers.set(PRECIP_LAYER);
    const bloomMaterial = material.clone();
    bloomMaterial.name = `${material.name}:bloom`;
    const bloom = new THREE.Mesh(geometry, bloomMaterial);
    bloom.frustumCulled = false;
    bloom.name = `${mesh.name}:bloom`;
    bloom.layers.set(BLOOM_SOURCE_LAYER); // a glow source (render/post/BloomPass.ts)
    // world-space quads at identity: no per-frame matrix recompose (perf10 O4)
    mesh.matrixAutoUpdate = false;
    bloom.matrixAutoUpdate = false;
    // no quad draws until its texture has loaded (a null map is a white square)
    mesh.visible = false;
    bloom.visible = false;
    this.group.add(mesh, bloom);
    batch = { mesh, bloom, geometry, capacity: 0, drawn: 0 };
    this.batches.set(textureId, batch);
    return batch;
  }

  /** A sprite texture (works-v1 `effectTextures`); until it is set, its sprites do not draw.
   * `warm` links the flame and bloom draws with the texture bound (the app's
   * DrawTargetLinker): the batch stays hidden until it settles, so the first
   * draw finds its programs linked (perf10 M5: the batch was hidden during the
   * settlement warm and linked on its first draw). Without `warm` it shows at once. */
  setFlameTexture(texture: THREE.Texture, textureId: string = FLAME_TEXTURE_ASSET_ID,
    warm?: (flame: THREE.Mesh, bloom: THREE.Mesh) => Promise<unknown>): Promise<void> {
    const batch = this.batch(textureId);
    const material = batch.mesh.material as THREE.MeshBasicMaterial;
    if (material.map && material.map !== texture) material.map.dispose();
    material.map = texture;
    material.needsUpdate = true;
    const bloom = batch.bloom.material as THREE.MeshBasicMaterial;
    bloom.map = texture;
    bloom.needsUpdate = true;
    const show = () => {
      // a later texture for this batch owns the reveal
      if (material.map !== texture) return;
      batch.mesh.visible = true;
      batch.bloom.visible = true;
    };
    if (!warm) { show(); return Promise.resolve(); }
    return warm(batch.mesh, batch.bloom).then(show, show);
  }

  /** The sprite draw of one texture (tests, probes). */
  spriteMesh(textureId: string = FLAME_TEXTURE_ASSET_ID): THREE.Mesh | undefined {
    return this.batches.get(textureId)?.mesh;
  }

  /** Glow quads drawn this frame for one texture (flames: `fire`). */
  spriteQuads(textureId: string = FLAME_TEXTURE_ASSET_ID): number {
    return this.batches.get(textureId)?.drawn ?? 0;
  }

  setFixtures(fixtures: LightFixture[]): void {
    this.fixtures = fixtures;
    this.refreshAt = -Infinity;
    const counts = new Map<string, number>();
    this.alwaysLitSprites = 0;
    const emitters: FireEmitterInput[] = [];
    fixtures.forEach((fixture, owner) => {
      for (const sprite of fixture.flames) {
        if (!sprite.glow) {
          emitters.push({ position: sprite.position, preset: sprite.preset ?? "candle",
            scale: pieceScaleOf(sprite), seed: sprite.seed, owner });
          continue;
        }
        counts.set(sprite.texture, (counts.get(sprite.texture) ?? 0) + 1);
        if (fixture.alwaysLit) this.alwaysLitSprites += 1;
      }
    });
    this.fire.setEmitters(emitters);
    for (const [textureId, count] of counts) {
      const batch = this.batch(textureId);
      if (count > batch.capacity) allocateQuads(batch, count);
    }
  }

  /** Light fixtures held (sprite holders are not counted). */
  get fixtureCount(): number { return this.fixtures.filter((f) => f.castsLight).length; }
  /** Fixture ids holding a fixture light now, nearest first (slot order). */
  get litIds(): string[] { return this.assigned.map((i) => this.fixtures[i].id); }

  update(timeS: number, camera: THREE.Camera): void {
    this.cameraAt.setFromMatrixPosition(camera.matrixWorld);
    this.right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    this.up.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    if (timeS - this.refreshAt >= LIGHT_BUDGET_REFRESH_S) {
      this.refreshAt = timeS;
      const clock = this.factor.value;
      this.assigned = fixturesInBand(this.fixtures, this.cameraAt, LIGHTS_ACTIVE_M, LIGHTS_CAP,
        (i) => this.fixtures[i].castsLight && fixtureFactor(clock, this.fixtures[i].alwaysLit) > 0);
      this.field.setLights(this.assigned.map((i) => this.fixtures[i]));
      this.flickers = this.assigned.map((i) => flickerOf(this.fixtures[i]));
    }
    const factor = this.factor.value;
    // Every frame: the clock, the flicker and the band-edge fade (no count
    // change ever reaches a shader: the field's program is one for 0..100).
    this.assigned.forEach((index, slot) => {
      const fixture = this.fixtures[index];
      const flicker = this.flickers[slot];
      this.field.setIntensity(slot, fixture.colour, fixture.candela
        * fixtureFactor(factor, fixture.alwaysLit)
        * bandFade(fixture.position.distanceTo(this.cameraAt))
        * (flicker ? fireFlicker(timeS, flicker.seed, flicker.rateHz, flicker.amount) : 1));
    });
    this.field.commit();
    this.fire.update(timeS, (owner) => fixtureFactor(factor, this.fixtures[owner]?.alwaysLit === true));
    this.updateSprites(timeS, factor);
  }

  dispose(): void {
    this.group.removeFromParent();
    this.field.setLights([]);
    this.field.commit();
    this.fire.dispose();
    for (const batch of this.batches.values()) {
      const material = batch.mesh.material as THREE.MeshBasicMaterial;
      material.map?.dispose();
      material.dispose();
      (batch.bloom.material as THREE.Material).dispose();
      batch.geometry.dispose();
    }
  }

  private updateSprites(timeS: number, factor: number): void {
    for (const batch of this.batches.values()) batch.drawn = 0;
    if (factor > 0 || this.alwaysLitSprites > 0) {
      for (const fixture of this.fixtures) {
        const strength = fixtureFactor(factor, fixture.alwaysLit);
        if (strength <= 0) continue;
        for (const sprite of fixture.flames) {
          if (!sprite.glow) continue;
          const batch = this.batches.get(sprite.texture);
          if (!batch?.mesh.visible) continue;
          this.writeQuad(batch, sprite, strength, timeS);
        }
      }
    }
    for (const batch of this.batches.values()) {
      batch.geometry.setDrawRange(0, batch.drawn * 6);
      if (batch.drawn > 0 || batch.mesh.userData.drawnLast > 0) {
        for (const name of ["position", "uv", "color"]) {
          const attribute = batch.geometry.getAttribute(name) as THREE.BufferAttribute | undefined;
          if (attribute) attribute.needsUpdate = true;
        }
      }
      batch.mesh.userData.drawnLast = batch.drawn;
    }
  }

  /** One camera-facing glow quad: flipbook cell and distance fade. */
  private writeQuad(batch: SpriteBatch, sprite: FixtureSprite, strength: number, timeS: number): void {
    this.centre.copy(sprite.position);
    const distance = this.cameraAt.distanceTo(this.centre);
    if (distance > FLAME_MAX_DISTANCE_M || batch.drawn >= batch.capacity) return;
    const fade = Math.min(1, (FLAME_MAX_DISTANCE_M - distance) / FLAME_FADE_M) * strength;
    const size = sprite.sizeM;
    // the disc is set off toward the viewer, as its billboard node does
    if (sprite.towardCameraM) {
      this.toCamera.copy(this.cameraAt).sub(this.centre).normalize();
      this.centre.addScaledVector(this.toCamera, sprite.towardCameraM);
    }
    const brightness = fade * GLOW_ALPHA;
    const tint = sprite.tint ?? this.glowTint;
    const r = tint.r; const g = tint.g; const b = tint.b;
    const [cols, rows] = sprite.atlas ?? [1, 1];
    const frame = sprite.fps > 0 && sprite.frames > 1
      ? Math.floor(timeS * sprite.fps + sprite.seed * sprite.frames) % sprite.frames : 0;
    const col = frame % cols;
    const row = Math.floor(frame / cols);
    const position = batch.geometry.getAttribute("position") as THREE.BufferAttribute;
    const uv = batch.geometry.getAttribute("uv") as THREE.BufferAttribute;
    const color = batch.geometry.getAttribute("color") as THREE.BufferAttribute;
    const quad = batch.drawn;
    for (let c = 0; c < 4; c++) {
      const [sx, sy] = CORNERS[c];
      const v = quad * 4 + c;
      position.setXYZ(v,
        this.centre.x + (this.right.x * sx + this.up.x * sy) * size,
        this.centre.y + (this.right.y * sx + this.up.y * sy) * size,
        this.centre.z + (this.right.z * sx + this.up.z * sy) * size);
      // atlas cell (col, row) counted from the image's top-left; textures load flipY
      uv.setXY(v, (col + sx + 0.5) / cols, 1 - (row + 0.5 - sy) / rows);
      color.setXYZW(v, r * brightness, g * brightness, b * brightness, 1);
    }
    batch.drawn += 1;
  }
}

/** The fire module's emitter, as the fixtures hand it over. */
type FireEmitterInput = Parameters<FlameSystem["setEmitters"]>[0][number];

/** A lit fixture's light flicker: its first flame's seed and preset rate. */
interface FixtureFlicker { seed: number; rateHz: number; amount: number }

function flickerOf(fixture: LightFixture): FixtureFlicker | undefined {
  const flame = fixture.flames.find((f) => !f.glow && f.preset);
  if (!flame?.preset) return undefined;
  const { rateHz, amount } = FIRE_PRESETS[flame.preset].flicker;
  return { seed: flame.seed, rateHz, amount };
}

/** A flame's piece scale: its mined edge over the record's (1 for a fallback). */
function pieceScaleOf(sprite: FixtureSprite): number {
  return sprite.pieceScale ?? 1;
}

function allocateQuads(batch: SpriteBatch, quads: number): void {
  batch.capacity = quads;
  const index = new Uint32Array(quads * 6);
  for (let q = 0; q < quads; q++) {
    index.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3], q * 6);
  }
  batch.geometry.setIndex(new THREE.BufferAttribute(index, 1));
  batch.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(quads * 12), 3));
  batch.geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(quads * 8), 2));
  batch.geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(quads * 16), 4));
  batch.geometry.setDrawRange(0, 0);
}
