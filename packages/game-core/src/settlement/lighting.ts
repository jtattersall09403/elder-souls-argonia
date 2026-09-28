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
 *   fixture already. Its flame is the kit's own additive flame submesh where
 *   the kit has one (materials.ts "flame" glow), else a billboard of
 *   vanilla's candle flame (works-v1 `effectTextures`, fx:flame-billboard).
 * - A lit window is no fixture (walk 3 ruling R11): its glow is the kit's
 *   emissive glow mask under the lamp clock (materials.ts), never a point light.
 * - The light stands at the LIGH record's `offsetM` (the placed light's
 *   median offset in the piece frame), the flame at its `flameOffsetM` (the
 *   wick measured on the mesh); each absent, on the top of the piece's bounds.
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
/** Colour (sRGB 0-255) of a fixture with no recorded LIGH colour: warm flame. */
export const FIXTURE_DEFAULT_RGB: readonly [number, number, number] = [255, 190, 120];
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
/** Billboard flame edge (m), and how far away one is still drawn. */
export const FLAME_SIZE_M = 0.25;
export const FLAME_MAX_DISTANCE_M = 250;
export const FLAME_FADE_M = 30;
/** The compile rule of a fire socket (compile_settlement effect sockets). */
export const FIRE_SOCKET_RULE = "effect-socket/fire";
/** Where the billboard flame's texture is published (build_kit effectTextures). */
export const FLAME_TEXTURE_KIT = "works-v1";
export const FLAME_TEXTURE_ASSET_ID = "fx:flame-billboard";
/** Fixture kinds that burn by day as well as by night (planner ruling, walk 2). */
export const ALWAYS_LIT_KINDS: ReadonlySet<string> = new Set(["brazier", "cook-fire", "forge", "campfire"]);
/** An always-lit fixture's strength at the clock's 0 (day); it rises with the clock to 1. */
export const ALWAYS_LIT_DAY_FACTOR = 0.5;

export interface LightFixture {
  id: string;
  kind: "fixture";
  /** World position of the point light. */
  position: THREE.Vector3;
  radiusM: number;
  /** Linear RGB. */
  colour: THREE.Color;
  /** The billboard flame, or null (the kit's own flame submesh glows). */
  flame: { position: THREE.Vector3; sizeM: number } | null;
  /** A fire that burns by day too (`ALWAYS_LIT_KINDS`, fire sockets). */
  alwaysLit: boolean;
}

/** A fixture's kind: its LIGH block's `fixtureKind`, else its kit category. */
export function isAlwaysLitFixture(meta: SettlementKitAssetMeta | undefined): boolean {
  const kind = meta?.light?.fixtureKind ?? meta?.category;
  return kind !== undefined && ALWAYS_LIT_KINDS.has(kind);
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

/** Radius and linear colour of a fixture: the LIGH record's where recorded, else the defaults. */
export function fixtureLightOf(light: SettlementKitLight | undefined): {
  radiusM: number; colour: THREE.Color;
} {
  if (!light) {
    return { radiusM: FIXTURE_DEFAULT_RADIUS_M, colour: srgbColour(FIXTURE_DEFAULT_RGB) };
  }
  const spec = lightSourceFromRecord(light.formId, light);
  return {
    radiusM: spec.radiusMetres > 0 ? spec.radiusMetres : FIXTURE_DEFAULT_RADIUS_M,
    colour: new THREE.Color().setRGB(spec.colour[0], spec.colour[1], spec.colour[2],
      THREE.SRGBColorSpace),
  };
}

function srgbColour(rgb: readonly [number, number, number]): THREE.Color {
  return new THREE.Color().setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, THREE.SRGBColorSpace);
}

/**
 * The fixture of one placed piece. `matrix` is its final draw transform
 * (placement scale included); `localBox` its LOD0 bounds in its own frame.
 * The point light stands at the LIGH record's `offsetM` (glTF Y-up metres from
 * the pivot) where recorded: vanilla places that light BESIDE and above the
 * piece (lantern median 0.61 m off, brazier 1.3 m up), so it is never the
 * flame's position. The flame billboard seats on the record's `flameOffsetM`
 * (the wick measured on the mesh: the lantern's candle top, 0.103 m) where
 * recorded, else on the top of the piece's own bounds; with no `offsetM` the
 * light shares the flame's point.
 */
export function fixtureFromPiece(
  id: string,
  meta: SettlementKitAssetMeta | undefined,
  matrix: THREE.Matrix4,
  localBox: THREE.Box3,
): LightFixture {
  const { radiusM, colour } = fixtureLightOf(meta?.light);
  const offset = meta?.light?.offsetM;
  const centre = localBox.getCenter(new THREE.Vector3());
  const seat = meta?.light?.flameOffsetM;
  const flameAt = (seat
    ? new THREE.Vector3(seat[0], seat[1] + FLAME_SIZE_M * 0.4, seat[2])
    : new THREE.Vector3(centre.x, localBox.max.y + FLAME_SIZE_M * 0.4, centre.z))
    .applyMatrix4(matrix);
  const lightAt = offset ? new THREE.Vector3(...offset).applyMatrix4(matrix) : flameAt.clone();
  const ownFlame = (meta?.additiveMaterials?.length ?? 0) > 0;
  return { id, kind: "fixture", position: lightAt, radiusM, colour,
    alwaysLit: isAlwaysLitFixture(meta),
    flame: ownFlame ? null : { position: flameAt, sizeM: FLAME_SIZE_M } };
}

/** A fire socket's fixture (always lit): flame at the socket, light just above it. */
export function fixtureFromFireSocket(id: string, socketAt: THREE.Vector3): LightFixture {
  const { radiusM, colour } = fixtureLightOf(undefined);
  return { id, kind: "fixture", radiusM, colour, alwaysLit: true,
    position: socketAt.clone().add(new THREE.Vector3(0, 0.3, 0)),
    flame: { position: socketAt.clone(), sizeM: FLAME_SIZE_M } };
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

/**
 * The fixtures of the loaded settlements: a point light on each burning
 * fixture in the band (`fixturesInBand`, at most `LIGHTS_CAP`),
 * the visible count padded to a `LIGHT_COUNT_STEPS` step with zero-intensity
 * lights, and every flame within
 * `FLAME_MAX_DISTANCE_M` as one additive billboard draw on the post-water
 * layer (like rain and smoke: drawn after the water surface, depth-tested,
 * tone-mapped in its own shader). `factor` is the settlement night uniform
 * (`artificialLightFactor`), shared by reference.
 */
export class SettlementLightFixtures {
  readonly group = new THREE.Group();
  readonly lights: THREE.PointLight[] = [];
  private fixtures: LightFixture[] = [];
  private assigned: number[] = [];
  /** Lights shown now: a `LIGHT_COUNT_STEPS` step, changed only at a refresh. */
  private shown = 0;
  private refreshAt = -Infinity;
  private flameMesh: THREE.Mesh | null = null;
  private readonly flameGeometry = new THREE.BufferGeometry();
  private flameCapacity = 0;
  private drawnQuads = 0;
  private alwaysLitFlames = 0;
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly cameraAt = new THREE.Vector3();

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

  /** The flame texture (vanilla candle flame); until it is set, fixtures glow without billboards. */
  setFlameTexture(texture: THREE.Texture): void {
    if (this.flameMesh) {
      const material = this.flameMesh.material as THREE.MeshBasicMaterial;
      if (material.map !== texture) material.map?.dispose();
      material.map = texture;
      return;
    }
    const material = new THREE.MeshBasicMaterial({
      map: texture, transparent: true, depthWrite: false, vertexColors: true,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    });
    material.name = "settlement-fixture-flame";
    this.flameMesh = new THREE.Mesh(this.flameGeometry, material);
    this.flameMesh.frustumCulled = false;
    this.flameMesh.name = "settlement-fixture-flames";
    this.flameMesh.layers.set(PRECIP_LAYER);
    this.group.add(this.flameMesh);
  }

  setFixtures(fixtures: LightFixture[]): void {
    this.fixtures = fixtures;
    this.refreshAt = -Infinity;
    const flames = fixtures.filter((f) => f.flame).length;
    this.alwaysLitFlames = fixtures.filter((f) => f.flame && f.alwaysLit).length;
    if (flames > this.flameCapacity) this.allocate(flames);
  }

  get fixtureCount(): number { return this.fixtures.length; }
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
        (i) => fixtureFactor(clock, this.fixtures[i].alwaysLit) > 0);
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
    this.updateFlames(factor);
  }

  dispose(): void {
    this.group.removeFromParent();
    this.lights.forEach((light) => light.dispose());
    const material = this.flameMesh?.material as THREE.MeshBasicMaterial | undefined;
    material?.map?.dispose();
    material?.dispose();
    this.flameGeometry.dispose();
  }

  private updateFlames(factor: number): void {
    const position = this.flameGeometry.getAttribute("position") as THREE.BufferAttribute | undefined;
    if (!this.flameMesh || !position) return;
    const color = this.flameGeometry.getAttribute("color") as THREE.BufferAttribute;
    const uv = this.flameGeometry.getAttribute("uv") as THREE.BufferAttribute;
    let quad = 0;
    if (factor > 0 || this.alwaysLitFlames > 0) {
      for (const fixture of this.fixtures) {
        const flame = fixture.flame;
        const strength = fixtureFactor(factor, fixture.alwaysLit);
        if (!flame || strength <= 0) continue;
        const distance = this.cameraAt.distanceTo(flame.position);
        if (distance > FLAME_MAX_DISTANCE_M) continue;
        const fade = Math.min(1, (FLAME_MAX_DISTANCE_M - distance) / FLAME_FADE_M) * strength;
        for (let c = 0; c < 4; c++) {
          const [sx, sy] = CORNERS[c];
          const v = quad * 4 + c;
          position.setXYZ(v,
            flame.position.x + (this.right.x * sx + this.up.x * sy) * flame.sizeM,
            flame.position.y + (this.right.y * sx + this.up.y * sy) * flame.sizeM,
            flame.position.z + (this.right.z * sx + this.up.z * sy) * flame.sizeM);
          uv.setXY(v, sx + 0.5, sy + 0.5);
          color.setXYZW(v, fade, fade, fade, fade);
        }
        quad += 1;
      }
    }
    this.flameGeometry.setDrawRange(0, quad * 6);
    // Nothing drawn now or last frame (lamps out, or no flame in range): no upload.
    if (quad > 0 || this.drawnQuads > 0) {
      position.needsUpdate = true; uv.needsUpdate = true; color.needsUpdate = true;
    }
    this.drawnQuads = quad;
  }

  private allocate(quads: number): void {
    this.flameCapacity = quads;
    const index = new Uint32Array(quads * 6);
    for (let q = 0; q < quads; q++) {
      index.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3], q * 6);
    }
    this.flameGeometry.setIndex(new THREE.BufferAttribute(index, 1));
    this.flameGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(quads * 12), 3));
    this.flameGeometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(quads * 8), 2));
    this.flameGeometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(quads * 16), 4));
    this.flameGeometry.setDrawRange(0, 0);
  }
}
