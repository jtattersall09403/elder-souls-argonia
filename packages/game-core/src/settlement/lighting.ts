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
 * - A window-glow facing of an architecture piece is a fixture too: one light
 *   0.5 m inside the wall.
 * - The light stands at the LIGH record's `offsetM` (the placed light's
 *   median offset in the piece frame), the flame at its `flameOffsetM` (the
 *   wick measured on the mesh); each absent, on the top of the piece's bounds.
 * - `SettlementLightFixtures` owns a FIXED pool of `LIGHT_BUDGET` point
 *   lights, re-assigned to the nearest fixtures once a second; the pool is
 *   visible only while one of them burns (lamps by night, fires always) and
 *   a fixture is within `LIGHTS_ACTIVE_M`, so it switches between two light
 *   counts (0 and 8) and never costs a lit material anything in a lamp-only
 *   place by day or outside a place. It is made by the layer (or injected
 *   into it), never a module singleton.
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
/** A window-glow facing's light: this far inside the wall, this radius. */
export const WINDOW_LIGHT_INSET_M = 0.5;
export const WINDOW_LIGHT_RADIUS_M = 4;
/** Height of a window light above the piece's base, capped at half its height. */
export const WINDOW_LIGHT_HEIGHT_M = 1.5;
/** Point lights enabled at once (the nearest fixtures), re-chosen this often. */
export const LIGHT_BUDGET = 8;
export const LIGHT_BUDGET_REFRESH_S = 1;
/** Peak intensity (cd) of a fixture light: the carried torch's (character CarriedLight). */
export const FIXTURE_CANDELA = 6;
export const WINDOW_CANDELA = 3;
/** The point-light pool is on only while the nearest fixture is this close
 * and the lamps burn: out of every settlement, and by day, no lit material
 * pays for it (the pool's 0/8 light programs are both cached after first use). */
export const LIGHTS_ACTIVE_M = 120;
/** Billboard flame edge (m), and how far away one is still drawn. */
export const FLAME_SIZE_M = 0.25;
export const FLAME_MAX_DISTANCE_M = 150;
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
  kind: "fixture" | "window";
  /** World position of the point light. */
  position: THREE.Vector3;
  radiusM: number;
  /** Linear RGB. */
  colour: THREE.Color;
  /** The billboard flame, or null (the kit's own flame submesh glows, or a window). */
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

/**
 * One light per window-glow facing of an architecture piece, 0.5 m inside
 * the wall that faces that bearing (bearing north 0 clockwise, x east,
 * z south: outward direction (sin b, 0, -cos b) in the piece frame).
 */
export function windowFixturesFromPiece(
  id: string,
  meta: SettlementKitAssetMeta | undefined,
  matrix: THREE.Matrix4,
  localBox: THREE.Box3,
): LightFixture[] {
  if (meta?.category !== "architecture" || !meta.glowFacingsDeg?.length) return [];
  const centre = localBox.getCenter(new THREE.Vector3());
  const size = localBox.getSize(new THREE.Vector3());
  const y = localBox.min.y + Math.min(WINDOW_LIGHT_HEIGHT_M, size.y / 2);
  return meta.glowFacingsDeg.map((bearingDeg, i) => {
    const b = THREE.MathUtils.degToRad(bearingDeg);
    const dx = Math.sin(b); const dz = -Math.cos(b);
    const reach = Math.abs(dx) * size.x / 2 + Math.abs(dz) * size.z / 2 - WINDOW_LIGHT_INSET_M;
    const at = new THREE.Vector3(centre.x + dx * Math.max(0, reach), y, centre.z + dz * Math.max(0, reach))
      .applyMatrix4(matrix);
    return { id: `${id}#window${i}`, kind: "window" as const, position: at,
      radiusM: WINDOW_LIGHT_RADIUS_M, colour: srgbColour(FIXTURE_DEFAULT_RGB), flame: null,
      alwaysLit: false };
  });
}

/** Indices of the `count` fixtures nearest `from`, nearest first. */
export function nearestFixtures(
  fixtures: readonly Pick<LightFixture, "position">[], from: THREE.Vector3, count = LIGHT_BUDGET,
): number[] {
  return fixtures
    .map((f, i) => [f.position.distanceToSquared(from), i] as const)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .slice(0, count)
    .map(([, i]) => i);
}

const CORNERS: readonly [number, number][] = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];

/**
 * The fixtures of the loaded settlements: a fixed pool of `LIGHT_BUDGET`
 * point lights on the nearest fixtures, and every flame within
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
    for (let i = 0; i < LIGHT_BUDGET; i++) {
      const light = new THREE.PointLight(0xffffff, 0, FIXTURE_DEFAULT_RADIUS_M, 2);
      light.castShadow = false;
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

  update(timeS: number, camera: THREE.Camera): void {
    this.cameraAt.setFromMatrixPosition(camera.matrixWorld);
    this.right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    this.up.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    if (timeS - this.refreshAt >= LIGHT_BUDGET_REFRESH_S) {
      this.refreshAt = timeS;
      this.assigned = nearestFixtures(this.fixtures, this.cameraAt);
      this.lights.forEach((light, slot) => {
        const fixture = this.fixtures[this.assigned[slot]];
        if (!fixture) { light.intensity = 0; return; }
        light.position.copy(fixture.position);
        light.distance = fixture.radiusM;
        light.color.copy(fixture.colour);
        light.userData.candela = fixture.kind === "window" ? WINDOW_CANDELA : FIXTURE_CANDELA;
        light.userData.alwaysLit = fixture.alwaysLit;
      });
    }
    const factor = this.factor.value;
    const nearest = this.fixtures[this.assigned[0]];
    const burning = factor > 0 || this.assigned.some((i) => this.fixtures[i]?.alwaysLit);
    const poolOn = burning && nearest !== undefined
      && nearest.position.distanceTo(this.cameraAt) <= LIGHTS_ACTIVE_M;
    this.lights.forEach((light, slot) => {
      light.visible = poolOn;
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
