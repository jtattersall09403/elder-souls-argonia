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
import {
  burnsInInterior, interiorFireEmitters, isInteriorFlameCard, type InteriorFireRow,
} from "../fx/fire/interiorFires";

/** Per kit id, per asset id: the kit manifest rows a cell's fires read (fx/fire/interiorFires.ts). */
export type InteriorFireRows = ReadonlyMap<string, ReadonlyMap<string, InteriorFireRow>>;

/**
 * The fire rows of a published kit manifest (`kits/<kit>.kit.json`): only
 * the assets that burn (`burnsInInterior`: mined `flames`, `flameCardMaterials`
 * or a light fixture record, which burns a fallback flame), reduced to
 * the fields the anchors read. A manifest with no assets list is a named error.
 */
export function interiorFireRowsFromManifest(manifest: unknown, source: string): Map<string, InteriorFireRow> {
  const assets = (manifest as { assets?: unknown } | null)?.assets;
  if (!Array.isArray(assets)) throw new Error(`kit manifest ${source} has no assets list`);
  const out = new Map<string, InteriorFireRow>();
  for (const a of assets as (InteriorFireRow & { id?: string })[]) {
    if (typeof a?.id !== "string" || !burnsInInterior(a)) continue;
    out.set(a.id, { id: a.id, category: a.category, anchorClass: a.anchorClass, light: a.light,
      flames: a.flames, sizeM: a.sizeM, originOffsetM: a.originOffsetM, flameCardMaterials: a.flameCardMaterials });
  }
  return out;
}

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

/** A record light's three.js decay: `INTERIOR_LIGHT_DECAY` times its falloff exponent (absent reads 1). */
export function interiorLightDecay(light: Pick<InteriorLight, "falloffExponent">): number {
  return INTERIOR_LIGHT_DECAY * (light.falloffExponent ?? 1);
}

/** A record light's runtime intensity (see `INTERIOR_LIGHT_INTENSITY_PER_FADE`). */
export function interiorLightIntensity(light: Pick<InteriorLight, "fade">): number {
  return (light.fade ?? 1) * INTERIOR_LIGHT_INTENSITY_PER_FADE;
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

export function interiorPlacementMatrix(p: InteriorPlacement): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...p.positionM), interiorQuaternion(p.rotationDeg),
    new THREE.Vector3(p.scale, p.scale, p.scale));
}

/**
 * The cell's ambient: from schema 4 a LightProbe carrying the cell's
 * directional ambient cube (ambientCube.ts), else the flat AmbientLight.
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
 * ambient and directional light, its fog. Nothing casts or receives shadows
 * (no shadow-casting light exists inside). No terrain, sky or water: none exists inside.
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
  for (const p of drawnPlacements(bundle)) {
    const asset = kits.get(p.kit)?.get(p.assetId);
    if (!asset) throw new Error(`interior ${bundle.cellId}: ${p.id} names ${p.kit}/${p.assetId}, not in the loaded kit`);
    const key = `${p.kit}|${p.assetId}`;
    const row = byAsset.get(key) ?? { asset, placements: [] };
    row.placements.push(p);
    byAsset.set(key, row);
  }
  let meshes = 0;
  const solids: SettlementSolid[] = [];
  const m = new THREE.Matrix4();
  for (const { asset, placements } of byAsset.values()) {
    const parts = asset.levels[0] ?? [];
    const fireRow = fireRows.get(placements[0].kit)?.get(placements[0].assetId);
    for (const part of parts) {
      // a flame card is drawn by the cell's FlameSystem instead (interiorFires.ts)
      if (isInteriorFlameCard(fireRow, part.material.name)) continue;
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, placements.length);
      placements.forEach((p, i) => mesh.setMatrixAt(i, m.multiplyMatrices(interiorPlacementMatrix(p), part.localMatrix)));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = false;
      mesh.receiveShadow = false;
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
  for (const light of bundle.lights) {
    const point = new THREE.PointLight(colorFromRGB(light.colorRGB), interiorLightIntensity(light),
      light.radiusM, interiorLightDecay(light));
    point.castShadow = false;
    point.position.set(...light.positionM);
    group.add(point);
  }
  group.add(interiorAmbient(bundle));
  const directionalRGB = bundle.lighting?.directionalRGB;
  if (directionalRGB) {
    // From straight above: the bundle's directionalRotXYDeg/ZDeg (0/0 in both
    // shipped cells, inherited from the lighting template) are not mapped to a
    // direction yet (walk 2 RB report). The target is in the group so the
    // direction holds wherever the cell stands.
    const directional = new THREE.DirectionalLight(colorFromRGB(directionalRGB), INTERIOR_AMBIENT_SCALE);
    directional.castShadow = false;
    directional.position.set(0, 1, 0);
    directional.target.position.set(0, 0, 0);
    group.add(directional, directional.target);
  }
  const emitters = interiorFireEmitters(drawnPlacements(bundle),
    (p) => fireRows.get(p.kit)?.get(p.assetId), interiorPlacementMatrix);
  let fire: FlameSystem | null = null;
  if (emitters.length) {
    fire = new FlameSystem();
    fire.setEmitters(emitters);
    group.add(fire.group);
  }
  const background = colorFromRGB(bundle.fog.colorRGB);
  return {
    bundle, group, solids, background, loadS: null, swingDoors, fire,
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
  private readonly fireRows = new Map<string, Promise<Map<string, InteriorFireRow>>>();

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
        fireRows.set(kit, await this.fires(bundle.kits[kit]));
      }),
    ]);
    const interior = instantiateInterior(bundle, kits, fireRows);
    interior.loadS = (performance.now() - startedMs) / 1000;
    return interior;
  }

  /** A kit's fire rows, from its manifest, fetched once per kit for the loader's life. */
  private fires(ref: InteriorKitRef): Promise<Map<string, InteriorFireRow>> {
    let promise = this.fireRows.get(ref.id);
    if (!promise) {
      const url = `${this.baseUrl}${ref.manifest}`;
      promise = this.hosts.fetchJson(url).then((raw) => interiorFireRowsFromManifest(raw, url));
      promise.catch(() => this.fireRows.delete(ref.id));
      this.fireRows.set(ref.id, promise);
    }
    return promise;
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
