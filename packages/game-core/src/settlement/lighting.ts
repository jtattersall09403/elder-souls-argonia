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
 *   one camera-facing additive quad at its emitter, a flipbook over the
 *   texture's atlas (frame = floor(t x fps + seed x frames) mod frames) with
 *   per-quad size and brightness flicker from the same seed, never smaller
 *   than `FLAME_MIN_ANGLE_RAD` so it reads at 50 m. Each `glows` entry (a NIF
 *   billboard glow disc, dropped from the mesh) is a still additive sprite
 *   tinted the fixture colour. A piece with neither and no flame cards of its
 *   own (`flameCardMaterials`: fxfirewithembers01) gets one fallback candle
 *   flame on its bounds' top. Kit materials flagged `additive` are drawn
 *   unlit and additive by materials.ts under `fixtureFactor`, never the lamp
 *   clock alone. All sprite textures are works-v1 `effectTextures`.
 * - A lit window is no fixture (walk 3 ruling R11): its glow is the kit's
 *   emissive glow mask under the lamp clock (materials.ts), never a point light.
 * - Every fixture light is one warm orange, `FIXTURE_LIGHT_RGB` (the fire's
 *   own), whatever its LIGH record's colour; fixtures differ only in radius
 *   (the record's) and candela. It stands at the LIGH record's `offsetM` (the
 *   placed light's median offset in the piece frame), else at its first flame.
 * - Lights band (walk 3 ruling R3, owner 2026-09-28): every burning fixture
 *   within `LIGHTS_ACTIVE_M` (200 m) of the camera emits a point light, up to
 *   the perf cap `LIGHTS_CAP` (16) nearest; beyond the band, or past the cap,
 *   the flame sprite and the emissive stay as they are and no light is cast.
 *   The set is re-chosen once a second (`LIGHT_BUDGET_REFRESH_S`).
 * - Stable light counts (R11): three.js compiles a shader program per lit
 *   material for every visible point-light count, so the visible count steps
 *   through `LIGHT_COUNT_STEPS` (0/4/8/16) only: the lit set is padded with
 *   zero-intensity lights that stay visible, and the count changes only at a
 *   refresh. `SettlementLightFixtures` allocates the pool lazily, only up to
 *   the largest step the band has needed: 3 fixtures in range cost 4 lights
 *   (one at zero), none outside a place or in a lamp-only place by day. A
 *   lamp that goes out between refreshes drops to zero intensity and stays
 *   visible until the next refresh re-steps the count. The cap is also a place
 *   check rule (place_gates reads `LIGHTS_CAP` and `LIGHTS_ACTIVE_M`): no
 *   point within a place may see more than 16 fixtures within 200 m. It is
 *   made by the layer (or injected into it), never a module singleton.
 */
import * as THREE from "three";
import { MINUTES_PER_DAY } from "@elder-souls/world-time";
import { lightSourceFromRecord } from "../fx/carriedLight";
import { PRECIP_LAYER } from "../water/render/waterMaterial";
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
/**
 * The ONE colour (sRGB 0-255) every settlement fixture light emits: lantern,
 * candle, sconce, torch, brazier and fire alike. It is the campfire's own LIGH
 * colour (Skyrim.esm LightCampFire01, 226/140/63), the warm orange the owner
 * approved (walk 4). The LIGH record's colour is NOT read: Skyrim tuned its
 * lantern and candle colours (242/240/223 DefaultCandleLight01NSDesat) for its
 * own tonemap, and under ours they read harsh white with a green cast (walk
 * 4). Fixtures differ only in radius (the LIGH record's) and candela.
 */
export const FIXTURE_LIGHT_RGB: readonly [number, number, number] = [226, 140, 63];
/** Perf cap on point lights at once (R3): the nearest burning fixtures in the band.
 * Also the place check rule's fixture-density cap (place_gates reads it). */
export const LIGHTS_CAP = 16;
/** How often the lit set is re-chosen, seconds. */
export const LIGHT_BUDGET_REFRESH_S = 1;
/** Peak intensity (cd) of a fixture light: the carried torch's (character CarriedLight). */
export const FIXTURE_CANDELA = 6;
/** The visible point-light counts the pool steps through (R11): each is one
 * cached shader program per lit material, so no count in between is ever shown. */
export const LIGHT_COUNT_STEPS: readonly number[] = [0, 4, 8, 16];
/** The lights band (R3): a burning fixture this close to the camera emits a
 * point light (up to `LIGHTS_CAP`); further out only its sprite and emissive
 * show. Also the radius of the place check rule's fixture-density count. */
export const LIGHTS_ACTIVE_M = 200;
/** Fallback flame edge (m), and how far away any flame sprite is still drawn. */
export const FLAME_SIZE_M = 0.25;
export const FLAME_MAX_DISTANCE_M = 250;
export const FLAME_FADE_M = 30;
/** A flame sprite never draws smaller than this angle (radians, ~4 px at
 * 1080p): a 3.6 cm candle flame then still reads as a point of fire at 50 m. */
export const FLAME_MIN_ANGLE_RAD = 0.004;
/** A flame quad's centre stands this share of its edge above its emitter:
 * the particles are born at the wick and rise. */
export const FLAME_RISE = 0.35;
/** Flicker: a flame's edge and brightness swing by up to these shares, phased
 * per quad by the hash of the fixture id and the flame's index. */
export const FLAME_FLICKER_SIZE = 0.12;
export const FLAME_FLICKER_ALPHA = 0.2;
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
}

export interface LightFixture {
  id: string;
  kind: "fixture";
  /** World position of the point light. */
  position: THREE.Vector3;
  radiusM: number;
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
 * candles, fxfirewithembers01's glow): its sprites draw, it casts no light,
 * and it is not counted with the light fixtures (place_gates' density rule).
 */
export function isSpriteHolderPlacement(
  placement: Pick<SettlementPlacement, "kind" | "layer">,
  meta: SettlementKitAssetMeta | undefined,
): boolean {
  if (isLightFixturePlacement(placement, meta)) return false;
  return (meta?.flames?.length ?? 0) + (meta?.glows?.length ?? 0) > 0;
}

/** Radius and linear colour of a fixture: the LIGH record's radius where
 * recorded, else the default; the colour is always `FIXTURE_LIGHT_RGB`. */
export function fixtureLightOf(light: SettlementKitLight | undefined): {
  radiusM: number; colour: THREE.Color;
} {
  const colour = srgbColour(FIXTURE_LIGHT_RGB);
  if (!light) return { radiusM: FIXTURE_DEFAULT_RADIUS_M, colour };
  const spec = lightSourceFromRecord(light.formId, light);
  return { radiusM: spec.radiusMetres > 0 ? spec.radiusMetres : FIXTURE_DEFAULT_RADIUS_M, colour };
}

function srgbColour(rgb: readonly [number, number, number]): THREE.Color {
  return new THREE.Color().setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, THREE.SRGBColorSpace);
}

function fallbackFlame(id: string, position: THREE.Vector3): FixtureSprite {
  return { position, sizeM: FLAME_SIZE_M, texture: FLAME_TEXTURE_ASSET_ID,
    atlas: FALLBACK_FLAME_ATLAS, frames: FALLBACK_FLAME_ATLAS[0] * FALLBACK_FLAME_ATLAS[1],
    fps: FALLBACK_FLAME_FPS, glow: false, seed: hash01(`${id}#fallback`) };
}

/**
 * The fixture of one placed piece. `matrix` is its final draw transform
 * (placement scale included); `localBox` its LOD0 bounds in its own frame.
 * Its flames are the NIF's own (manifest `flames`, mined from the particle
 * systems and AddOnNodes: a lantern's two wicks, a horn candelabrum's four)
 * and its glows the NIF's billboard discs (manifest `glows`). A piece with
 * neither, no flame cards of its own (`flameCardMaterials`) and no mounted
 * fire child (`mount.hasMountedFire`: the brazier's fxfirewithembers01) gets
 * one fallback candle flame on the top of its bounds. It burns by day when
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
  const { radiusM, colour } = fixtureLightOf(meta?.light);
  const scaleOf = new THREE.Vector3().setFromMatrixScale(matrix);
  const scale = Math.max(scaleOf.x, scaleOf.y, scaleOf.z);
  const flames: FixtureSprite[] = (meta?.flames ?? []).map((f, i) => ({
    position: new THREE.Vector3(f.offsetM[0], f.offsetM[1] + f.sizeM * FLAME_RISE, f.offsetM[2])
      .applyMatrix4(matrix),
    sizeM: f.sizeM * scale, texture: f.texture, atlas: f.atlas,
    frames: f.frames ?? (f.atlas ? f.atlas[0] * f.atlas[1] : 1),
    fps: f.fps, glow: false, seed: hash01(`${id}#${i}`),
  }));
  const glows: FixtureSprite[] = (meta?.glows ?? []).map((g, i) => ({
    position: new THREE.Vector3(...g.offsetM).applyMatrix4(matrix),
    sizeM: g.sizeM * scale, texture: g.texture, atlas: null, frames: 1, fps: 0,
    glow: true, towardCameraM: (g.towardCameraM ?? 0) * scale, seed: hash01(`${id}#glow${i}`),
    ...(g.tintRgb ? { tint: new THREE.Color(...g.tintRgb) } : {}),
  }));
  if (castsLight && !drawsOwnFire(meta) && !mount.hasMountedFire) {
    const centre = localBox.getCenter(new THREE.Vector3());
    flames.push(fallbackFlame(id, new THREE.Vector3(centre.x, localBox.max.y + FLAME_SIZE_M * 0.4,
      centre.z).applyMatrix4(matrix)));
  }
  const offset = meta?.light?.offsetM;
  const lightAt = offset ? new THREE.Vector3(...offset).applyMatrix4(matrix)
    : (flames[0]?.position.clone()
      ?? localBox.getCenter(new THREE.Vector3()).setY(localBox.max.y).applyMatrix4(matrix));
  return { id, kind: "fixture", position: lightAt, radiusM, colour,
    alwaysLit: burnsByDay(meta, mount.hostMeta), castsLight, flames: [...flames, ...glows] };
}

/** A fire socket's fixture (always lit): a fallback flame at the socket, light just above it. */
export function fixtureFromFireSocket(id: string, socketAt: THREE.Vector3): LightFixture {
  const { radiusM, colour } = fixtureLightOf(undefined);
  return { id, kind: "fixture", radiusM, colour, alwaysLit: true, castsLight: true,
    position: socketAt.clone().add(new THREE.Vector3(0, 0.3, 0)),
    flames: [fallbackFlame(id, socketAt.clone())] };
}

/** The smallest step of `LIGHT_COUNT_STEPS` that holds `count` lights (the cap past the last). */
export function lightCountStep(count: number): number {
  return LIGHT_COUNT_STEPS.find((step) => step >= count) ?? LIGHTS_CAP;
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
  geometry: THREE.BufferGeometry;
  capacity: number;
  drawn: number;
}

/**
 * The fixtures of the loaded settlements: a point light on each burning
 * fixture in the band (`fixturesInBand`, at most `LIGHTS_CAP`), the visible
 * count padded to a `LIGHT_COUNT_STEPS` step with zero-intensity lights, and
 * every flame and glow sprite within `FLAME_MAX_DISTANCE_M` as additive
 * camera-facing quads on the post-water layer (like rain and smoke: drawn
 * after the water surface, depth-tested, tone-mapped in its own shader), one
 * draw per sprite texture (a handful: candle flame, the fire atlases, the glow
 * disc). `factor` is the settlement night uniform (`artificialLightFactor`),
 * shared by reference.
 */
export class SettlementLightFixtures {
  readonly group = new THREE.Group();
  readonly lights: THREE.PointLight[] = [];
  private fixtures: LightFixture[] = [];
  private assigned: number[] = [];
  /** Lights shown now: a `LIGHT_COUNT_STEPS` step, changed only at a refresh. */
  private shown = 0;
  private refreshAt = -Infinity;
  private readonly batches = new Map<string, SpriteBatch>();
  private alwaysLitSprites = 0;
  private readonly glowTint = srgbColour(FIXTURE_LIGHT_RGB);
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly cameraAt = new THREE.Vector3();
  private readonly toCamera = new THREE.Vector3();
  private readonly centre = new THREE.Vector3();

  constructor(private readonly factor: THREE.IUniform<number>) {
    this.group.name = "settlement-light-fixtures";
  }

  /** Grows the light pool to `count` (never past `LIGHTS_CAP`); lights are never made ahead of need. */
  private ensureLights(count: number): void {
    for (let i = this.lights.length; i < Math.min(count, LIGHTS_CAP); i++) {
      const light = new THREE.PointLight(0xffffff, 0, FIXTURE_DEFAULT_RADIUS_M, 2);
      light.castShadow = false;
      light.visible = false;
      light.name = `settlement-fixture-light-${i}`;
      this.lights.push(light);
      this.group.add(light);
    }
  }

  private batch(textureId: string): SpriteBatch {
    let batch = this.batches.get(textureId);
    if (batch) return batch;
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.MeshBasicMaterial({
      map: null, transparent: true, depthWrite: false, vertexColors: true,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    });
    material.name = `settlement-fixture-sprite:${textureId}`;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.name = `settlement-fixture-flames:${textureId}`;
    mesh.layers.set(PRECIP_LAYER);
    // no quad draws until its texture has loaded (a null map is a white square)
    mesh.visible = false;
    this.group.add(mesh);
    batch = { mesh, geometry, capacity: 0, drawn: 0 };
    this.batches.set(textureId, batch);
    return batch;
  }

  /** A sprite texture (works-v1 `effectTextures`); until it is set, its sprites do not draw. */
  setFlameTexture(texture: THREE.Texture, textureId: string = FLAME_TEXTURE_ASSET_ID): void {
    const batch = this.batch(textureId);
    const material = batch.mesh.material as THREE.MeshBasicMaterial;
    if (material.map && material.map !== texture) material.map.dispose();
    material.map = texture;
    material.needsUpdate = true;
    batch.mesh.visible = true;
  }

  /** The sprite draw of one texture (tests, probes). */
  spriteMesh(textureId: string = FLAME_TEXTURE_ASSET_ID): THREE.Mesh | undefined {
    return this.batches.get(textureId)?.mesh;
  }

  /** Quads drawn this frame for one texture. */
  spriteQuads(textureId: string = FLAME_TEXTURE_ASSET_ID): number {
    return this.batches.get(textureId)?.drawn ?? 0;
  }

  setFixtures(fixtures: LightFixture[]): void {
    this.fixtures = fixtures;
    this.refreshAt = -Infinity;
    const counts = new Map<string, number>();
    this.alwaysLitSprites = 0;
    for (const fixture of fixtures) {
      for (const sprite of fixture.flames) {
        counts.set(sprite.texture, (counts.get(sprite.texture) ?? 0) + 1);
        if (fixture.alwaysLit) this.alwaysLitSprites += 1;
      }
    }
    for (const [textureId, count] of counts) {
      const batch = this.batch(textureId);
      if (count > batch.capacity) allocateQuads(batch, count);
    }
  }

  /** Light fixtures held (sprite holders are not counted). */
  get fixtureCount(): number { return this.fixtures.filter((f) => f.castsLight).length; }
  /** Fixture ids holding a point light now, nearest first. */
  get litIds(): string[] { return this.assigned.map((i) => this.fixtures[i].id); }
  /** Point lights the renderer counts now (a `LIGHT_COUNT_STEPS` step). */
  get visibleLightCount(): number { return this.shown; }

  update(timeS: number, camera: THREE.Camera): void {
    this.cameraAt.setFromMatrixPosition(camera.matrixWorld);
    this.right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    this.up.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    if (timeS - this.refreshAt >= LIGHT_BUDGET_REFRESH_S) {
      this.refreshAt = timeS;
      const clock = this.factor.value;
      this.assigned = fixturesInBand(this.fixtures, this.cameraAt, LIGHTS_ACTIVE_M, LIGHTS_CAP,
        (i) => this.fixtures[i].castsLight && fixtureFactor(clock, this.fixtures[i].alwaysLit) > 0);
      this.shown = lightCountStep(this.assigned.length);
      this.ensureLights(this.shown);
      this.lights.forEach((light, slot) => {
        // the padding up to the step stays visible at zero so the count holds
        light.visible = slot < this.shown;
        const fixture = this.fixtures[this.assigned[slot]];
        if (!fixture) { light.userData.candela = 0; return; }
        light.position.copy(fixture.position);
        light.distance = fixture.radiusM;
        light.color.copy(fixture.colour);
        light.userData.candela = FIXTURE_CANDELA;
        light.userData.alwaysLit = fixture.alwaysLit;
      });
    }
    const factor = this.factor.value;
    // Between refreshes the clock may put lamps out: the light drops to zero
    // and stays visible, so the renderer's light count changes only at a refresh.
    this.lights.forEach((light, slot) => {
      light.intensity = this.assigned[slot] === undefined ? 0
        : (light.userData.candela ?? 0) * fixtureFactor(factor, light.userData.alwaysLit === true);
    });
    this.updateSprites(timeS, factor);
  }

  dispose(): void {
    this.group.removeFromParent();
    this.lights.forEach((light) => light.dispose());
    for (const batch of this.batches.values()) {
      const material = batch.mesh.material as THREE.MeshBasicMaterial;
      material.map?.dispose();
      material.dispose();
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

  /** One camera-facing quad: flipbook cell, flicker and distance fade. */
  private writeQuad(batch: SpriteBatch, sprite: FixtureSprite, strength: number, timeS: number): void {
    this.centre.copy(sprite.position);
    const distance = this.cameraAt.distanceTo(this.centre);
    if (distance > FLAME_MAX_DISTANCE_M || batch.drawn >= batch.capacity) return;
    const fade = Math.min(1, (FLAME_MAX_DISTANCE_M - distance) / FLAME_FADE_M) * strength;
    let size = sprite.sizeM;
    let brightness = fade;
    let r = 1; let g = 1; let b = 1;
    if (sprite.glow) {
      // the disc is set off toward the viewer, as its billboard node does
      if (sprite.towardCameraM) {
        this.toCamera.copy(this.cameraAt).sub(this.centre).normalize();
        this.centre.addScaledVector(this.toCamera, sprite.towardCameraM);
      }
      brightness *= GLOW_ALPHA;
      const tint = sprite.tint ?? this.glowTint;
      r = tint.r; g = tint.g; b = tint.b;
    } else {
      const phase = sprite.seed * Math.PI * 2;
      const swing = 0.5 + 0.25 * Math.sin(timeS * 7.3 + phase) + 0.25 * Math.sin(timeS * 12.9 + phase * 1.7);
      size *= 1 + FLAME_FLICKER_SIZE * (swing - 0.5) * 2;
      brightness *= 1 - FLAME_FLICKER_ALPHA * swing;
      // never smaller than FLAME_MIN_ANGLE_RAD, so a candle still reads at 50 m
      size = Math.max(size, distance * FLAME_MIN_ANGLE_RAD);
    }
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
