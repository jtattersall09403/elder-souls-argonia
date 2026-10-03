import * as THREE from "three";
import type { ArchitectureAsset } from "../settlement/kit";
import { SETTLEMENT_COLLISION_FRAME, type SettlementSolid } from "../settlement/types";
import { trimeshFromGeometry } from "../physics/floraSolids";
import { buildSwingDoor, type SwingDoor } from "./swingDoors";
import {
  interiorBundleUrl, isInteriorSwingDoor, parseInteriorBundle,
  type ColorRGB, type InteriorBundle, type InteriorKitRef, type InteriorLight, type InteriorPlacement,
  type InteriorSubstitution, type Vec3,
} from "./bundle";
import { ambientCubeToSH } from "./ambientCube";
import { kitPartsDir, parseKitPartsIndex, type KitPartsIndex } from "./kitParts";
import { FlameSystem } from "../fx/fire/FlameSystem";
import { FIXTURE_LIGHTS_PER_OBJECT_MAX, setFixtureLightsPerObject, type FixtureLightField } from "../render/fixtureLights/fixtureLightField";
import {
  CellLightFlicker, interiorFireEmitters, isInteriorFlameCard, type InteriorFireRow,
} from "../fx/fire/interiorFires";

import { interiorLightOf } from "../air/volumetrics/windowApertures";
import { CellSunOccluder, CellSunShadowNode } from "./cellSunOccluder";
import { applyLanternShell, isLanternShellMaterial } from "../settlement/fixtureGlow";
import { applySettlementDecal, settlementMeshDrawFlags } from "../settlement/materials";

/** Per kit id, per asset id: the kit manifest rows a cell's fires read (fx/fire/interiorFires.ts). */
export type InteriorFireRows = ReadonlyMap<string, ReadonlyMap<string, InteriorFireRow>>;

/**
 * THE NUMBER THE OWNER TUNES IN THE STUDIO: a point light's intensity is
 * `(light.fade ?? 1) × INTERIOR_LIGHT_INTENSITY_PER_FADE`. How bright a cell
 * reads is a GPU-only judgement (decision 0102 decision 3b), so it is this
 * one constant, set on a walk, and nothing else.
 *
 * Why π to start: a Lambert surface under a light of intensity π reflects
 * its albedo times the light's colour at a metre, which is the plugin's
 * "lit colour at the source"; the LIGH record's FNAM fade (unitless) scales
 * that. The record's colours, radii and fades are never touched.
 */
export const INTERIOR_LIGHT_INTENSITY_PER_FADE = Math.PI;
/**
 * Inverse-square fall-off inside the record's radius (three.js still applies
 * its smooth window to zero at `distance`). Walk 2 D2: `decay = 0` lit every
 * surface within the radius at one level, so the rooms read flat. The LIGH
 * falloff exponent, when the bundle carries it, scales this (1 = vanilla).
 */
export const INTERIOR_LIGHT_DECAY = 2;
/** The cell ambient's scale, on the same reasoning as the lights. */
export const INTERIOR_AMBIENT_SCALE = Math.PI;

/**
 * Gain on the cell sun through an opening that faces it (vol10 diag6 P1). The bars want the sun
 * patch on the floor near-white, many times the ambient-lit floor beside it. Measured in r5 at sun
 * altitude 28-36 deg: the cell sun (outdoor sun x exposure, 3.0-3.18) added ~0.9x the floor's
 * ambient-cube light (0.96 x PI SH), so the patch read ~1.9x its surroundings. Patch/surround =
 * 1 + 0.9 g; for >= 5x, g >= 4.4; 6 gives ~6.4x, with headroom for the clamp's lower incidence.
 */
export const CELL_SUN_GAIN = 6;

/** Highest elevation the cell sun takes, radians (vol10 diag6 P2): a noon sun through side windows lands on the floor. */
export const CELL_SUN_MAX_ELEVATION_RAD = Math.PI / 4;

/**
 * Clamp a to-sun direction (y up) to at most CELL_SUN_MAX_ELEVATION_RAD, in place, keeping its
 * compass bearing; returns it normalised. A straight-up vector has no bearing to keep and is left
 * as is. Allocation-free.
 */
export function clampCellSunElevation(toSun: THREE.Vector3): THREE.Vector3 {
  toSun.normalize();
  const h = Math.hypot(toSun.x, toSun.z);
  const maxY = Math.sin(CELL_SUN_MAX_ELEVATION_RAD);
  if (toSun.y <= maxY || h < 1e-6) return toSun;
  const k = Math.cos(CELL_SUN_MAX_ELEVATION_RAD) / h;
  return toSun.set(toSun.x * k, maxY, toSun.z * k);
}

/** A record light's three.js decay: `INTERIOR_LIGHT_DECAY` times its falloff exponent (absent reads 1). */
export function interiorLightDecay(light: Pick<InteriorLight, "falloffExponent">): number {
  return INTERIOR_LIGHT_DECAY * (light.falloffExponent ?? 1);
}

/** A record light's runtime intensity (see `INTERIOR_LIGHT_INTENSITY_PER_FADE`). */
export function interiorLightIntensity(light: Pick<InteriorLight, "fade">): number {
  return (light.fade ?? 1) * INTERIOR_LIGHT_INTENSITY_PER_FADE;
}

/** A record light as the fixture light field holds it: three's PointLight terms, cell-local. */
export interface InteriorCellLight {
  position: THREE.Vector3;
  radiusM: number;
  decay: number;
  colour: THREE.Color;
  intensity: number;
}

/** The cell's record lights with the colour, intensity, radius and decay its PointLights had. */
export function interiorCellLights(bundle: Pick<InteriorBundle, "lights">): InteriorCellLight[] {
  return bundle.lights.map((light) => ({
    position: new THREE.Vector3(...light.positionM), radiusM: light.radiusM,
    decay: interiorLightDecay(light), colour: colorFromRGB(light.colorRGB), intensity: interiorLightIntensity(light),
  }));
}

/**
 * The injected hosts: how JSON arrives and how one published part GLB
 * (`kits/<kit>/parts/<file>.glb`, kitParts.ts) becomes its asset index. The
 * studio passes `createKitLoader(decoders).loadAsync` then
 * `buildArchitectureKit`, through the scene's shared `KitCache`
 * (settlement/kitCache.ts) keyed per part.
 */
export interface InteriorLoaderHosts {
  fetchJson(url: string): Promise<unknown>;
  loadPart(kit: InteriorKitRef, assetId: string, glbUrl: string): Promise<Map<string, ArchitectureAsset>>;
}

/** An instantiated cell, in its own frame; the caller positions `group`. */
export interface LoadedInterior {
  bundle: InteriorBundle;
  group: THREE.Group;
  /** Colliders in the cell's own frame; `solidsAt` moves them to the lift. */
  solids: SettlementSolid[];
  fog: THREE.Fog;
  background: THREE.Color;
  counts: { placements: number; substitutions: number; meshes: number; lights: number; solids: number; fires: number };
  /** Seconds from the loader's request to the built cell (bundle, parts, instancing); null when built directly. */
  loadS: number | null;
  /** The cell's swing doors, drawn under `group` at rest; `SwingDoorController` turns them (16k walk 4). */
  swingDoors: SwingDoor[];
  /**
   * The cell's fires (16k walk 5): every mined flame and every flame-card
   * bed, drawn under `group`; null when nothing burns. The host calls
   * `fire.update(t, () => 1)` each frame (an interior burns at any hour).
   */
  fire: FlameSystem | null;
  /** The cell's daylight (walk 9): the host calls `daylight.set` each frame. */
  daylight: InteriorDaylight;
}

/** Share of the cell's ambient (and its template's directional) left at
 * night: "basically just the natural light sources" (owner, walk 9), not black. */
export const INTERIOR_NIGHT_AMBIENT = 0.15;
/** A window light's peak intensity (cd, at the sun's `WINDOW_FULL_SUN_SIN`) and radius. */
export const WINDOW_LIGHT_CANDELA = 4;
export const WINDOW_LIGHT_RADIUS_M = 4;
/** sin(sun altitude) at and above which windows give their full daylight (30 deg). */
export const WINDOW_FULL_SUN_SIN = 0.5;
/** Emissive gain of a lit pane over the daylight colour, modulated by its own diffuse. */
export const WINDOW_PANE_GAIN = 1.2;
/** A pane's window light sits this far inside the wall plane, along the pane's inward normal (vol10 D4). */
export const PANE_LIGHT_INSET_M = 0.3;
/** The one shadow map of a windowed cell's directional (sun through its openings), fitted to the cell. */
export const INTERIOR_SUN_SHADOW_MAP = 1024;
/** That map's biases: one 1024 texel spans ~3.5 cm over a 36 m cell, so bias 0 shows acne once the patch is bright (vol10 diag3 Q2). */
export const INTERIOR_SUN_NORMAL_BIAS = 0.02;
export const INTERIOR_SUN_BIAS = -0.0005;
/**
 * A cell mesh casts the cell sun's shadow only when each placement's world bounding box is smaller
 * than this on every axis (vol10 diag5 E1): props (chairs, barrels, tables) cast; shell pieces, floors
 * and pod skins (walls 3-6 m, solid at their windows whatever their category says) never do, and the
 * cell's `CellSunOccluder` gives the walls with their openings. Decided on the measured geometry.
 */
export const CELL_SUN_CASTER_MAX_M = 2.5;

const _casterBox = new THREE.Box3();
const _casterMatrix = new THREE.Matrix4();
const _casterSize = new THREE.Vector3();
/** True when every instance of `mesh` measures under `CELL_SUN_CASTER_MAX_M` on its largest world axis. */
export function castsCellSun(mesh: THREE.InstancedMesh): boolean {
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, _casterMatrix);
    _casterBox.copy(mesh.geometry.boundingBox!).applyMatrix4(_casterMatrix).getSize(_casterSize);
    if (Math.max(_casterSize.x, _casterSize.y, _casterSize.z) >= CELL_SUN_CASTER_MAX_M) return false;
  }
  return mesh.count > 0;
}

/** Share of a clear day's window light an overcast sky (no direct sun) still gives: the sky's diffuse light. */
export const WINDOW_OVERCAST_SHARE = 0.5;

/**
 * 0 (sun at or below the horizon) .. 1 (sun at 30 deg or higher in a clear
 * sky), linear in sin(altitude), times the weather: `directFactor` is the
 * drawn sky rig's share of direct sun left by cloud and rain (lightRig
 * `directFactor`, 1 clear, 0 full overcast), which takes the window light
 * down to `WINDOW_OVERCAST_SHARE`.
 */
export function daylightShare(sunAltitudeRad: number, directFactor = 1): number {
  const sun = Math.min(1, Math.max(0, Math.sin(sunAltitudeRad) / WINDOW_FULL_SUN_SIN));
  const weather = WINDOW_OVERCAST_SHARE + (1 - WINDOW_OVERCAST_SHARE) * Math.min(1, Math.max(0, directFactor));
  return sun * weather;
}

/**
 * The share of a cell's record ambient and directional drawn now. A cell with
 * windows follows the day down to `INTERIOR_NIGHT_AMBIENT`; a cell with no
 * opening is lit as its plugin lit it at every hour (Skyrim's interior
 * ambient never follows the sun), so it keeps the full record (vol10 chunk 3:
 * MugsumpHollowInt01 and the CIPHTBM huts were held at the night share).
 */
export function interiorAmbientShare(share: number, hasWindows: boolean): number {
  return hasWindows ? INTERIOR_NIGHT_AMBIENT + (1 - INTERIOR_NIGHT_AMBIENT) * share : 1;
}

/**
 * A window pane: a material the manifest lists in `windowMaterials`, read
 * from the NIF's own shader (nif_blocks.window_glass_shapes: an opaque
 * emitting shape with External_Emittance or a backlight map; the station
 * house's amber panes, the farmhouse FarmWindowInterior01 glass). The pane's
 * geometry seats its light.
 */
export function isWindowPane(row: { windowMaterials?: readonly string[] | null } | undefined,
  material: THREE.Material): boolean {
  return (row?.windowMaterials ?? []).includes(material.name.replace(/(\.Mat)\.\d{3,}$/, "$1"));
}

/**
 * Daylight inside (owner, walk 9; supersedes decision 0103 R11): by night a
 * cell keeps only its fires and record lights plus `INTERIOR_NIGHT_AMBIENT`
 * of its ambient; by day its ambient and directional rise with the sun, its
 * panes glow the sky's daylight colour and each pane is a light of that
 * colour (`WINDOW_LIGHT_CANDELA` x `daylightShare`) in the scene's fixture
 * light field (decision 0108: no PointLight per object), held as the field's
 * reserved lights while the cell is bound (`bind`) and served first from its
 * cap.
 */
export class InteriorDaylight {
  private readonly ambientBase: number;
  private readonly directionalBase: number;
  private field: FixtureLightField | null = null;
  private readonly colour = new THREE.Color(1, 1, 1);
  private share = 0;
  /** Cell-frame unit direction toward the sun and its share through the cell's openings (`setSun`). */
  private readonly toSun = new THREE.Vector3(0, 1, 0);
  private sunShare = 0;
  /** The sun's linear colour and intensity (exposure-1 frame) while an opening faces it (`setSun`). */
  private readonly sunColour = new THREE.Color();
  private sunIntensity = 0;
  /** The record directional's own colour: it stands when no opening faces the sun. */
  private readonly directionalColour = new THREE.Color();
  constructor(
    /** The cell's group: window positions are in its frame. */
    readonly group: THREE.Object3D,
    readonly ambient: THREE.Light,
    readonly directional: THREE.DirectionalLight | null,
    readonly paneMaterials: readonly THREE.MeshStandardMaterial[],
    /** Each pane placement's centre, cell-local: one window light each. */
    readonly windows: readonly THREE.Vector3[],
    /** The cell's record lights (`interiorCellLights`), cell-local: reserved before the windows, steady. */
    readonly cellLights: readonly InteriorCellLight[] = [],
    /** The cell's bounds, cell-local: the directional stands on it and its shadow camera covers it. */
    readonly bounds: THREE.Sphere = new THREE.Sphere(new THREE.Vector3(), 1),
    /** Each record light paired with its fire, built once per cell (`CellLightFlicker`); null: all steady. */
    private readonly flicker: CellLightFlicker | null = null,
    /** The windowed cell's occluder: its holes follow the sun (`setSun`); null when windowless. */
    private readonly occluder: CellSunOccluder | null = null,
  ) {
    this.ambientBase = ambient.intensity;
    this.directionalBase = directional?.intensity ?? 0;
    if (directional) this.directionalColour.copy(directional.color);
    for (const m of paneMaterials) {
      if (m.emissiveMap !== m.map) { m.emissiveMap = m.map; m.needsUpdate = true; }
    }
    this.set(0, new THREE.Color(1, 1, 1));
  }

  /** `share`: `daylightShare` of the sun now; `colour`: the sun's linear colour (the sky rig's). */
  set(share: number, colour: THREE.Color): void {
    this.share = share;
    this.colour.copy(colour);
    const floor = interiorAmbientShare(share, this.windows.length + this.paneMaterials.length > 0);
    this.ambient.intensity = this.ambientBase * floor;
    if (this.directional) {
      // the sun through an opening that faces it: the sky's sun, its colour and outdoor
      // intensity times its share and CELL_SUN_GAIN, aimed along it (elevation clamped to 45 deg); else the record light from straight
      // above (vol10 D1, diag3 Q2)
      const sun = this.sunShare > 0;
      const d = this.directional;
      d.color.copy(sun ? this.sunColour : this.directionalColour);
      d.intensity = sun ? this.sunIntensity * this.sunShare * CELL_SUN_GAIN : this.directionalBase * floor;
      d.target.position.copy(this.bounds.center);
      d.position.copy(sun ? this.toSun : _UP).multiplyScalar(this.bounds.radius).add(this.bounds.center);
      d.target.updateMatrixWorld();
    }
    for (const m of this.paneMaterials) {
      m.emissive.copy(colour).multiplyScalar(WINDOW_PANE_GAIN * share);
      m.emissiveIntensity = 1;
    }
    if (this.field) {
      const first = this.cellLights.length;
      for (let j = 0; j < this.windows.length; j++) {
        this.field.setReservedIntensity(first + j, colour, WINDOW_LIGHT_CANDELA * share);
      }
      this.field.commit();
    }
  }

  /**
   * Flicker the record lights that stand at a fire with that fire's own signal (vol10 F8c): the
   * host calls this each frame with the flames' clock (`fire.update`'s `t`). Allocation-free.
   */
  updateFlicker(timeS: number): void {
    if (!this.field || !this.flicker) return;
    for (let j = 0; j < this.cellLights.length; j++) {
      const l = this.cellLights[j];
      this.field.setReservedIntensity(j, l.colour, l.intensity * this.flicker.factor(j, timeS));
    }
    this.field.commit();
  }

  /**
   * The sun as the cell's openings see it: `toSunCell` the cell-frame unit
   * direction toward the sun, `sunShare` the share the openings facing it pass
   * (windowApertures; 0 or a null direction when none faces it: the record
   * light stands). `colour` is the sky rig's linear sun colour and `intensity`
   * the exterior sun's intensity in the cell's exposure-1 frame (lightRig
   * `sunIntensity x exposureTarget`). Allocation-free but for the occluder's rebuild when the sun
   * has turned over 1 deg (`CellSunOccluder.aim`); the light count and
   * `castShadow` never change.
   */
  setSun(toSunCell: THREE.Vector3 | null, sunShare: number, colour: THREE.Color, intensity: number): void {
    this.sunShare = toSunCell && sunShare > 0 ? sunShare : 0;
    if (toSunCell) {
      clampCellSunElevation(this.toSun.copy(toSunCell));
      this.occluder?.aim(this.toSun);
    }
    this.sunColour.copy(colour);
    this.sunIntensity = intensity;
    this.set(this.share, this.colour);
  }

  /**
   * Hold the window lights in `field` (the scene's, `fixtureLightFieldOf`) at
   * the group's world placement now; call again after the group moves.
   */
  bind(field: FixtureLightField): void {
    this.group.updateWorldMatrix(true, false);
    const world = this.group.matrixWorld;
    field.setReserved([
      ...this.cellLights.map((l, j) => ({ position: l.position.clone().applyMatrix4(world), radiusM: l.radiusM, decay: l.decay, fire: this.flicker?.paired(j) ?? false })),
      ...this.windows.map((w) => ({ position: w.clone().applyMatrix4(world), radiusM: WINDOW_LIGHT_RADIUS_M })),
    ]);
    this.cellLights.forEach((l, j) => field.setReservedIntensity(j, l.colour, l.intensity));
    this.field = field;
    this.set(this.share, this.colour);
  }

  /** Give the field's slots back (the cell is hidden or disposed). */
  unbind(): void {
    if (!this.field) return;
    this.field.setReserved([]);
    this.field.commit();
    this.field = null;
  }
}

/** The assets a cell's swing doors draw, as placements (so the loader fetches them). */
export function swingDoorAssets(bundle: InteriorBundle): InteriorPlacement[] {
  return bundle.doors.filter(isInteriorSwingDoor).map((d) => ({
    id: d.id, assetId: d.assetId, kit: d.kit, positionM: d.positionM, rotationDeg: d.rotationDeg,
    scale: d.scale, category: "door",
  }));
}

/** A stand-in drawn as a placement of its stand-in asset, with the reference's transform. */
export function substitutionPlacement(s: InteriorSubstitution): InteriorPlacement {
  return {
    id: s.id, assetId: s.standInAsset, kit: s.kit,
    positionM: s.positionM, rotationDeg: s.rotationDeg, scale: s.scale, category: s.standInCategory,
  };
}

/** Everything the cell draws: its placements, then its stand-ins. */
export function drawnPlacements(bundle: InteriorBundle): InteriorPlacement[] {
  return [...bundle.placements, ...(bundle.substitutions ?? []).map(substitutionPlacement)];
}

/** sRGB bytes to a linear three.js colour. */
export function colorFromRGB(rgb: ColorRGB): THREE.Color {
  return new THREE.Color().setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, THREE.SRGBColorSpace);
}

/** The one rotation for an interior placement (see `InteriorPlacement.rotationDeg`). */
export function interiorQuaternion(rotationDeg: Vec3): THREE.Quaternion {
  const d = THREE.MathUtils.degToRad;
  return new THREE.Quaternion().setFromEuler(
    new THREE.Euler(d(rotationDeg[0]), -d(rotationDeg[1]), d(rotationDeg[2]), "YXZ"));
}

const _UP = new THREE.Vector3(0, 1, 0);

/**
 * Each pane's window-light seat: its centre moved `PANE_LIGHT_INSET_M` along
 * the pane's thin axis, signed toward `inside` (the centroid of the cell's
 * placements), so the light sits in the room, not in the wall (vol10 D4).
 * `localBox` is the pane geometry's box, `world` its placed instance matrix.
 */
export function paneLightSeat(localBox: THREE.Box3, world: THREE.Matrix4, inside: THREE.Vector3): THREE.Vector3 {
  const size = localBox.getSize(new THREE.Vector3());
  const k = size.x <= size.y && size.x <= size.z ? 0 : size.y <= size.z ? 1 : 2;
  const centre = localBox.getCenter(new THREE.Vector3()).applyMatrix4(world);
  const axis = new THREE.Vector3().setFromMatrixColumn(world, k).normalize();
  if (axis.dot(new THREE.Vector3().subVectors(inside, centre)) < 0) axis.negate();
  return centre.addScaledVector(axis, PANE_LIGHT_INSET_M);
}

export function interiorPlacementMatrix(p: InteriorPlacement): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...p.positionM), interiorQuaternion(p.rotationDeg),
    new THREE.Vector3(p.scale, p.scale, p.scale));
}

/**
 * The cell's ambient: a LightProbe carrying the cell's
 * directional ambient cube (ambientCube.ts) when the cell records one, else
 * the flat AmbientLight.
 * Both at `ambient.intensity × INTERIOR_AMBIENT_SCALE`, so a cube of the old
 * ambient colour on every axis lights exactly as the AmbientLight did.
 */
export function interiorAmbient(bundle: InteriorBundle): THREE.Light {
  const scale = bundle.ambient.intensity * INTERIOR_AMBIENT_SCALE;
  const cube = bundle.lighting?.ambientCube;
  if (!cube) return new THREE.AmbientLight(colorFromRGB(bundle.ambient.colorRGB), scale);
  const sh = new THREE.SphericalHarmonics3();
  ambientCubeToSH(cube, scale).forEach((c, i) => sh.coefficients[i].set(c[0], c[1], c[2]));
  const probe = new THREE.LightProbe(sh, 1);
  probe.name = "interior-ambient-cube";
  return probe;
}

/**
 * Build the cell: one InstancedMesh per (asset, LOD0 part) holding every
 * placement of that asset (stand-ins from `substitutions[]` count as
 * placements of their stand-in asset), a point light per record light, the cell's
 * ambient and directional light, its fog. A cell with windows gives its
 * directional one `INTERIOR_SUN_SHADOW_MAP` shadow map over the cell's
 * bounds: small props cast (`castsCellSun`), the shell does not,
 * the record's apertures open holes in a shadow-only box over the bounds
 * (`CellSunOccluder`, re-aimed by `setSun`), every mesh receives (0108 §1); a windowless cell has
 * no shadow. No terrain, sky or water: none exists inside.
 * A placement whose asset is not in its kit is a named error, never a gap
 * drawn as nothing (the exporter lists gaps; the bundle carries none).
 */
export function instantiateInterior(
  bundle: InteriorBundle, kits: ReadonlyMap<string, ReadonlyMap<string, ArchitectureAsset>>,
  fireRows: InteriorFireRows = new Map(),
): LoadedInterior {
  const group = new THREE.Group();
  group.name = `interior:${bundle.cellId}`;
  const byAsset = new Map<string, { asset: ArchitectureAsset; placements: InteriorPlacement[] }>();
  const drawn = drawnPlacements(bundle);
  for (const p of drawn) {
    const asset = kits.get(p.kit)?.get(p.assetId);
    if (!asset) throw new Error(`interior ${bundle.cellId}: ${p.id} names ${p.kit}/${p.assetId}, not in the loaded kit`);
    const key = `${p.kit}|${p.assetId}`;
    const row = byAsset.get(key) ?? { asset, placements: [] };
    row.placements.push(p);
    byAsset.set(key, row);
  }
  let meshes = 0;
  const panes = { materials: new Set<THREE.MeshStandardMaterial>(), windows: [] as THREE.Vector3[] };
  const solids: SettlementSolid[] = [];
  const m = new THREE.Matrix4();
  const inside = new THREE.Vector3();
  for (const p of drawn) inside.add(new THREE.Vector3(...p.positionM));
  if (drawn.length) inside.divideScalar(drawn.length);
  const built: { mesh: THREE.InstancedMesh; pane: boolean }[] = [];
  for (const { asset, placements } of byAsset.values()) {
    const parts = asset.levels[0] ?? [];
    const fireRow = fireRows.get(placements[0].kit)?.get(placements[0].assetId);
    for (const part of parts) {
      // a flame card is drawn by the cell's FlameSystem instead (interiorFires.ts)
      if (isInteriorFlameCard(fireRow, part.material.name)) continue;
      // a lantern's shell burns steady inside, as the cell's lights do (fixtureGlow.ts)
      if (isLanternShellMaterial(part.material, fireRow)) applyLanternShell(part.material);
      // a decal (hay scatter, blood) gets the settlement depth bias so it never
      // z-fights the floor under it (16k walk 6, DawnstarBrinasHouse)
      applySettlementDecal(part.material);
      // every record light of the cell reaches the part, as three's light list did
      setFixtureLightsPerObject(part.material, FIXTURE_LIGHTS_PER_OBJECT_MAX);
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, placements.length);
      mesh.renderOrder = settlementMeshDrawFlags(part.material).renderOrder;
      placements.forEach((p, i) => mesh.setMatrixAt(i, m.multiplyMatrices(interiorPlacementMatrix(p), part.localMatrix)));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      const pane = isWindowPane(fireRow, part.material);
      if (pane) {
        // the pane's own geometry gives the window light's seat (walk 9)
        part.geometry.computeBoundingBox();
        panes.materials.add(part.material as THREE.MeshStandardMaterial);
        placements.forEach((_, i) => {
          mesh.getMatrixAt(i, m);
          panes.windows.push(paneLightSeat(part.geometry.boundingBox!, m, inside));
        });
      }
      built.push({ mesh, pane });
      group.add(mesh);
      meshes += 1;
    }
    for (const p of placements) {
      const solid = interiorSolid(p, parts);
      if (solid) solids.push(solid);
    }
  }
  const swingDoors = bundle.doors.filter(isInteriorSwingDoor).map((d) => {
    const asset = kits.get(d.kit)?.get(d.assetId);
    if (!asset) throw new Error(`interior ${bundle.cellId}: swing door ${d.id} names ${d.kit}/${d.assetId}, not in the loaded kit`);
    const door = buildSwingDoor(d.id, d, asset.levels[0] ?? []);
    group.add(door.object);
    return door;
  });
  // Every cell adds the same lights to three's list (one ambient, one
  // directional) whatever it records, so a door transition never changes the
  // lit programs' cache key (decision 0108 §1); its record lights go to the
  // scene's fixture light field with the windows (`InteriorDaylight.bind`).
  const ambient = interiorAmbient(bundle);
  group.add(ambient);
  // From straight above, or along the sun through a window facing it
  // (InteriorDaylight.setSun): the bundle's directionalRotXYDeg/ZDeg (0/0 in the
  // shipped cells, inherited from the lighting template) are not mapped to a
  // direction (walk 2 RB report). The target is in the group so the
  // direction holds wherever the cell stands. A cell with no directional
  // keeps it at intensity 0.
  const directionalRGB = bundle.lighting?.directionalRGB;
  const directional = new THREE.DirectionalLight(
    directionalRGB ? colorFromRGB(directionalRGB) : 0xffffff, directionalRGB ? INTERIOR_AMBIENT_SCALE : 0);
  const box = new THREE.Box3().setFromObject(group);
  const bounds = box.getBoundingSphere(new THREE.Sphere());
  if (bounds.isEmpty()) bounds.set(inside, 1);
  const windowed = panes.windows.length + panes.materials.size > 0;
  directional.castShadow = windowed;
  let occluder: CellSunOccluder | null = null;
  if (windowed) {
    directional.shadow.mapSize.set(INTERIOR_SUN_SHADOW_MAP, INTERIOR_SUN_SHADOW_MAP);
    directional.shadow.normalBias = INTERIOR_SUN_NORMAL_BIAS;
    directional.shadow.bias = INTERIOR_SUN_BIAS;
    const cam = directional.shadow.camera;
    cam.left = cam.bottom = -bounds.radius;
    cam.right = cam.top = bounds.radius;
    cam.near = 0.05;
    cam.far = 2 * bounds.radius;
    cam.updateProjectionMatrix();
    (directional.shadow as unknown as { shadowNode: CellSunShadowNode }).shadowNode = new CellSunShadowNode(directional, directional.shadow);
    const apertures = (interiorLightOf(bundle.cellId)?.apertures ?? []).map((a) => ({
      centre: new THREE.Vector3(a.centreM[0], a.centreM[1], a.centreM[2]),
      outward: new THREE.Vector3(a.outward[0], 0, a.outward[2]).normalize(),
      halfSideM: a.radiusM,
    }));
    if (!box.isEmpty()) {
      occluder = new CellSunOccluder(box, apertures);
      group.add(occluder.mesh);
    }
  }
  // a pane never casts: the sun it lets in would stop at its own glass (vol10 diag3 Q2)
  for (const { mesh, pane } of built) {
    mesh.castShadow = windowed && !pane && castsCellSun(mesh);
    mesh.receiveShadow = windowed;
  }
  directional.position.copy(bounds.center).addScaledVector(_UP, bounds.radius);
  directional.target.position.copy(bounds.center);
  group.add(directional, directional.target);
  const emitters = interiorFireEmitters(drawn,
    (p) => fireRows.get(p.kit)?.get(p.assetId), interiorPlacementMatrix);
  let fire: FlameSystem | null = null;
  if (emitters.length) {
    fire = new FlameSystem();
    fire.setEmitters(emitters);
    group.add(fire.group);
  }
  const background = colorFromRGB(bundle.fog.colorRGB);
  const cellLights = interiorCellLights(bundle);
  return {
    bundle, group, solids, background, loadS: null, swingDoors, fire,
    daylight: new InteriorDaylight(group, ambient, directional, [...panes.materials], panes.windows,
      cellLights, bounds, new CellLightFlicker(cellLights, emitters), occluder),
    fog: new THREE.Fog(background.clone(), bundle.fog.nearM, bundle.fog.farM),
    counts: {
      placements: bundle.placements.length, substitutions: bundle.substitutions?.length ?? 0,
      meshes, lights: bundle.lights.length, solids: solids.length, fires: emitters.length,
    },
  };
}

/**
 * A placement's colliders: its LOD0 triangles, baked through each part's
 * local matrix and the scale, the body carrying position and rotation, as
 * settlement mesh pieces collide (0071 §5). A part with no index buffer
 * does not collide; the camera pull-in (16h item 24) casts against the rest.
 */
function interiorSolid(p: InteriorPlacement, parts: ArchitectureAsset["levels"][number]): SettlementSolid | null {
  const scale = new THREE.Matrix4().makeScale(p.scale, p.scale, p.scale);
  const shapes = parts.flatMap((part) => {
    const position = part.geometry.getAttribute("position");
    const index = part.geometry.index;
    if (!position || !index) return [];
    const matrix = part.localMatrix.clone().premultiply(scale);
    const vertices = new Float32Array(position.count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i).applyMatrix4(matrix);
      vertices[i * 3] = v.x; vertices[i * 3 + 1] = v.y; vertices[i * 3 + 2] = v.z;
    }
    const mesh = trimeshFromGeometry(vertices, index.array);
    return [{ kind: "trimesh" as const, vertices: mesh.vertices, indices: mesh.indices }];
  });
  if (!shapes.length) return null;
  const q = interiorQuaternion(p.rotationDeg);
  return {
    id: p.id, frame: SETTLEMENT_COLLISION_FRAME,
    position: [...p.positionM], rotation: [q.x, q.y, q.z, q.w], scale: p.scale, parts: shapes,
  };
}

/** The cell's colliders moved to where its group stands. */
export function solidsAt(solids: readonly SettlementSolid[], originM: Vec3): SettlementSolid[] {
  return solids.map((s) => ({
    ...s,
    id: `interior:${s.id}`,
    position: [s.position[0] + originM[0], s.position[1] + originM[1], s.position[2] + originM[2]],
  }));
}

type Entry =
  | { state: "loading"; promise: Promise<LoadedInterior> }
  | { state: "ready"; interior: LoadedInterior }
  | { state: "failed"; error: Error };

/**
 * Fetches, validates and instantiates cells; one entry per cellId, kept for
 * the loader's life (a cell visited is re-entered instantly). A cell fetches
 * only the assets it draws: each kit's parts index once, then one part GLB
 * per (kit, assetId), all in parallel, each cached and shared by every cell
 * that draws it (walk 4: KeebaHouseFisher drew 53 assets out of 7 whole kits,
 * 108.9 MB). A drawn asset with no published part is a named error, which
 * the door overlay shows as its red line. Owned by whoever constructs it: no
 * module state.
 */
export class InteriorLoader {
  private readonly entries = new Map<string, Entry>();
  private readonly indexes = new Map<string, Promise<KitPartsIndex>>();
  private readonly parts = new Map<string, Promise<ArchitectureAsset>>();

  constructor(private readonly baseUrl: string, private readonly hosts: InteriorLoaderHosts) {}

  /** Start loading a cell if nothing has; the streaming and the doors call this. */
  request(cellId: string): Promise<LoadedInterior> {
    const entry = this.entries.get(cellId);
    if (entry?.state === "ready") return Promise.resolve(entry.interior);
    if (entry?.state === "loading") return entry.promise;
    if (entry?.state === "failed") return Promise.reject(entry.error);
    const promise = this.load(cellId).then((interior) => {
      this.entries.set(cellId, { state: "ready", interior });
      return interior;
    }, (error: unknown) => {
      const err = error instanceof Error ? error : new Error(String(error));
      this.entries.set(cellId, { state: "failed", error: err });
      throw err;
    });
    promise.catch(() => undefined);
    this.entries.set(cellId, { state: "loading", promise });
    return promise;
  }

  ready(cellId: string): LoadedInterior | undefined {
    const entry = this.entries.get(cellId);
    return entry?.state === "ready" ? entry.interior : undefined;
  }

  failure(cellId: string): Error | undefined {
    const entry = this.entries.get(cellId);
    return entry?.state === "failed" ? entry.error : undefined;
  }

  /** Cells requested so far (loading, ready or failed). */
  get cellIds(): string[] { return [...this.entries.keys()]; }

  private async load(cellId: string): Promise<LoadedInterior> {
    const startedMs = performance.now();
    const url = interiorBundleUrl(this.baseUrl, cellId);
    const bundle = parseInteriorBundle(await this.hosts.fetchJson(url), url);
    if (bundle.cellId !== cellId) throw new Error(`interior bundle ${url} carries cellId ${bundle.cellId}`);
    const wanted = new Map<string, InteriorPlacement>();
    for (const p of [...drawnPlacements(bundle), ...swingDoorAssets(bundle)]) wanted.set(`${p.kit}|${p.assetId}`, p);
    const kits = new Map<string, Map<string, ArchitectureAsset>>();
    const fireRows = new Map<string, Map<string, InteriorFireRow>>();
    await Promise.all([
      ...[...wanted.values()].map(async (p) => {
        const asset = await this.part(cellId, bundle.kits[p.kit], p.assetId);
        let kit = kits.get(p.kit);
        if (!kit) { kit = new Map(); kits.set(p.kit, kit); }
        kit.set(p.assetId, asset);
      }),
      ...[...new Set(drawnPlacements(bundle).map((p) => p.kit))].map(async (kit) => {
        fireRows.set(kit, new Map(Object.entries((await this.index(bundle.kits[kit])).fires)));
      }),
    ]);
    const interior = instantiateInterior(bundle, kits, fireRows);
    interior.loadS = (performance.now() - startedMs) / 1000;
    return interior;
  }

  private index(ref: InteriorKitRef): Promise<KitPartsIndex> {
    let promise = this.indexes.get(ref.id);
    if (!promise) {
      const url = `${this.baseUrl}${kitPartsDir(ref)}index.json`;
      promise = this.hosts.fetchJson(url).then((raw) => parseKitPartsIndex(raw, ref.id, url));
      promise.catch(() => this.indexes.delete(ref.id));
      this.indexes.set(ref.id, promise);
    }
    return promise;
  }

  private part(cellId: string, ref: InteriorKitRef, assetId: string): Promise<ArchitectureAsset> {
    const key = `${ref.id}|${assetId}`;
    let promise = this.parts.get(key);
    if (!promise) {
      promise = this.index(ref).then(async (index) => {
        const row = index.assets[assetId];
        if (!row) {
          throw new Error(`interior ${cellId}: ${ref.id}/${assetId} has no published part `
            + `(${kitPartsDir(ref)}index.json; run kit_parts.mjs --kit ${ref.id})`);
        }
        const glbUrl = `${this.baseUrl}${kitPartsDir(ref)}${row.file}`;
        const asset = (await this.hosts.loadPart(ref, assetId, glbUrl)).get(assetId);
        if (!asset) throw new Error(`interior ${cellId}: part ${glbUrl} does not hold ${assetId}`);
        return asset;
      });
      promise.catch(() => this.parts.delete(key));
      this.parts.set(key, promise);
    }
    return promise;
  }
}
