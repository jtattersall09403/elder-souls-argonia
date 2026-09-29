/**
 * The interior bundle (0103 decision 4): one file per tier A cell,
 * `public/province/interiors/<cellId>.json`, written by the interior bundle
 * exporter (0103 decision 3). Positions are metres in the cell's own frame,
 * y up, the arrival marker's frame; the runtime lifts the whole cell into
 * its interior space (interiorSpace.ts).
 */

import { swingPoseProblem, type InteriorSwingDoor } from "./swingDoors";

/**
 * 2 (16k walk 4, owner 2026-09-28): every `doors[]` entry carries `doorType`;
 * a DOOR reference with no teleport is a `swing` entry (swingDoors.ts), no
 * longer a placement. A schema-1 bundle is refused with its version named.
 * 3 (2026-09-29, decision 0104): the cell file is shared by every place that
 * claims the cell, so it carries no per-place field: a load door is
 * `{doorType, interiorLoadDoorRef, loadDoor}` and the pairing (which exterior
 * door, its arrival marker) is the place's door record (`interiorClaim`).
 * Schema 2 still parses: its per-place door fields are ignored.
 */
export const INTERIOR_BUNDLE_SCHEMA_VERSION = 3;
const READABLE_SCHEMA_VERSIONS: readonly number[] = [2, INTERIOR_BUNDLE_SCHEMA_VERSION];

export type Vec3 = [number, number, number];

/** sRGB colour as the plugin stores it: three bytes, 0–255. */
export type ColorRGB = [number, number, number];

export interface InteriorKitRef { id: string; glb: string; manifest: string }

export interface InteriorPlacement {
  id: string;
  assetId: string;
  /** The published kit holding `assetId` (a key of the bundle's `kits`). */
  kit: string;
  positionM: Vec3;
  /**
   * Degrees `[pitch, yaw, roll]` in the game frame. Yaw is a compass turn
   * (clockwise seen from above), the settlement rotation authority
   * (`placementQuaternion`) extended by roll: Euler(pitch, -yaw, roll, "YXZ").
   */
  rotationDeg: Vec3;
  scale: number;
  category: string;
}

/**
 * A reference whose piece the vault does not hold, drawn by a same-class
 * stand-in from a published kit (walk 2 lane I,
 * worldgen/export_interior_bundle.py): the runtime places `standInAsset`
 * from `kit` with the reference's own transform, exactly as a placement.
 */
export interface InteriorSubstitution {
  id: string;
  /** The plugin reference (REFR form id). */
  refId: string;
  /** The missing base form, `Plugin.esm:formid`. */
  baseForm: string | null;
  originalPath: string | null;
  /** The missing piece's class (only clutter and furniture may be stood in). */
  class: string;
  classSource: string;
  standInAsset: string;
  /** The published kit holding `standInAsset` (a key of the bundle's `kits`). */
  kit: string;
  standInCategory: string;
  why: string;
  positionM: Vec3;
  /** As `InteriorPlacement.rotationDeg`. */
  rotationDeg: Vec3;
  scale: number;
}

export interface InteriorLight {
  /** The plugin reference (REFR form id) this light came from. */
  refId: string;
  positionM: Vec3;
  radiusM: number;
  colorRGB: ColorRGB;
  /**
   * The LIGH base record's FNAM fade, unitless (null when the record has
   * none): the runtime multiplies it into the light's intensity.
   */
  fade: number | null;
  /** The LIGH base record's editor id. */
  base: string;
  /** The LIGH record's falloff exponent, when the exporter read one (walk 2 D2). */
  falloffExponent?: number;
  /** Plugin units as read, for audit: the reference's XRDS override and the base radius. */
  raw: { xrdsUnits: number | null; baseRadiusUnits: number };
}

export interface InteriorMarker { positionM: Vec3; yawDeg: number }

/**
 * One load door of the cell (a cell transition). Which exterior door pairs
 * with it is the place's door record (`interiorClaim.interiorLoadDoorRef`),
 * never this file: places share cells (decision 0104). Open or closed is
 * read from the place entered from (`openLoadDoorRefs`, doorTransition.ts).
 */
export interface InteriorLoadDoor {
  doorType: "load";
  interiorLoadDoorRef: string;
  /** Where that load door stands in the cell (cell frame, y up): leaving by it is walking to it. */
  loadDoor: InteriorMarker;
}

export type InteriorDoorEntry = InteriorLoadDoor | InteriorSwingDoor;

export const isLoadDoor = (d: InteriorDoorEntry): d is InteriorLoadDoor => d.doorType === "load";
export const isInteriorSwingDoor = (d: InteriorDoorEntry): d is InteriorSwingDoor => d.doorType === "swing";

export interface InteriorExitDoor {
  id: string;
  /** The plugin reference of the cell's load door. */
  refId: string;
  positionM: Vec3;
  yawDeg: number;
}

export interface InteriorBundle {
  schemaVersion: number;
  cellId: string;
  /** The plugin file the cell was copied from (0103 decision 3). */
  plugin: string;
  /** Human-readable statement of the coordinate frame; documentation only. */
  frame: string;
  /** Null from schema 3 (the shell is the claiming parcel's `assetRef`); schema 2 files name one. */
  shellAssetId: string | null;
  /** References in the plugin cell: placements plus the listed drops (0103 decision 3 acceptance). */
  refCount: number;
  kits: Record<string, InteriorKitRef>;
  arrivalMarker: InteriorMarker;
  exitDoor: InteriorExitDoor;
  /**
   * One entry per exterior door the cell pairs with, then one closed entry
   * per load door no exterior door pairs with, then one swing entry per door
   * that opens in place; may be empty.
   */
  doors: InteriorDoorEntry[];
  placements: InteriorPlacement[];
  lights: InteriorLight[];
  ambient: { colorRGB: ColorRGB; intensity: number };
  fog: { colorRGB: ColorRGB; nearM: number; farM: number };
  /**
   * The cell's XCLL/LGTM lighting as the plugin records it; the runtime reads
   * `directionalRGB` (the cell's directional light). Absent on older bundles.
   */
  lighting?: { directionalRGB?: ColorRGB; directionalFade?: number; [field: string]: unknown };
  /** Socket records (0103 decision 5); the interior runtime does not read them. */
  sockets: unknown[];
  /** References the exporter dropped, each with its reason. */
  drops: unknown[];
  /** Stand-ins for pieces the vault does not hold; absent on older bundles (read as none). */
  substitutions?: InteriorSubstitution[];
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isVec3 = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every(isNum);
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isMarker = (v: unknown): v is InteriorMarker =>
  isVec3((v as InteriorMarker | null)?.positionM) && isNum((v as InteriorMarker).yawDeg);
const isRgb = (v: unknown): v is ColorRGB =>
  isVec3(v) && v.every((c) => c >= 0 && c <= 255);

/**
 * Validate a fetched bundle. A wrong schema, a placement whose kit the
 * bundle does not list, or a malformed transform is a named error: an
 * interior is never drawn from a record the runtime had to guess at.
 */
export function parseInteriorBundle(raw: unknown, source: string): InteriorBundle {
  const fail = (why: string): never => { throw new Error(`interior bundle ${source}: ${why}`); };
  const b = raw as Partial<InteriorBundle> | null;
  if (!b || typeof b !== "object") fail("not an object");
  if (!READABLE_SCHEMA_VERSIONS.includes(b!.schemaVersion as number)) {
    fail(`unsupported schemaVersion ${String(b!.schemaVersion)}`);
  }
  if (typeof b!.cellId !== "string" || !b!.cellId) fail("no cellId");
  if (typeof b!.plugin !== "string" || typeof b!.frame !== "string") fail("no plugin/frame");
  if (b!.shellAssetId !== null && typeof b!.shellAssetId !== "string") fail("shellAssetId is neither a string nor null");
  if (!Number.isInteger(b!.refCount) || b!.refCount! < 0) fail("bad refCount");
  if (!b!.kits || typeof b!.kits !== "object") fail("no kits map");
  if (!isMarker(b!.arrivalMarker)) fail("bad arrivalMarker");
  const exit = b!.exitDoor;
  if (!isStr(exit?.id) || !isStr(exit.refId) || !isVec3(exit.positionM) || !isNum(exit.yawDeg)) fail("bad exitDoor");
  if (!Array.isArray(b!.doors)) fail("no doors list");
  for (const [i, entry] of b!.doors!.entries()) {
    const kind = (entry as { doorType?: unknown } | null)?.doorType;
    if (kind === "swing") {
      const sw = entry as InteriorSwingDoor;
      const why = !isStr(sw.id) ? "no id" : swingPoseProblem(sw);
      if (why) fail(`swing door ${i} malformed: ${why}`);
      if (!b!.kits![sw.kit]) fail(`swing door ${sw.id}: kit ${String(sw.kit)} is not in the bundle's kits`);
      continue;
    }
    if (kind !== "load") fail(`door ${i}: doorType ${String(kind)} is neither load nor swing`);
    const d = entry as Partial<InteriorLoadDoor> | null;
    if (!isStr(d?.interiorLoadDoorRef) || !isMarker(d.loadDoor)) fail(`load door ${i} malformed`);
    // schema 2 wrote the pairing here (exteriorDoorId, arrivalMarker, closed): one place's, overwritten by the next
    b!.doors![i] = { doorType: "load", interiorLoadDoorRef: d!.interiorLoadDoorRef!, loadDoor: d!.loadDoor! };
  }
  if (!Array.isArray(b!.placements)) fail("no placements list");
  for (const p of b!.placements!) {
    if (typeof p?.id !== "string" || typeof p.assetId !== "string") fail("placement without id/assetId");
    if (!b!.kits![p.kit]) fail(`${p.id}: kit ${String(p.kit)} is not in the bundle's kits`);
    if (!isVec3(p.positionM) || !isVec3(p.rotationDeg) || !isNum(p.scale)) fail(`${p.id}: bad transform`);
  }
  if (!Array.isArray(b!.lights)) fail("no lights list");
  for (const [i, l] of b!.lights!.entries()) {
    if (!isStr(l?.refId) || !isVec3(l.positionM) || !isNum(l.radiusM) || l.radiusM <= 0 || !isRgb(l.colorRGB)
      || !(l.fade === null || (isNum(l.fade) && l.fade >= 0)) || typeof l.base !== "string"
      || !(l.raw?.xrdsUnits === null || isNum(l.raw?.xrdsUnits)) || !isNum(l.raw?.baseRadiusUnits)) {
      fail(`light ${i} malformed`);
    }
    if (l.falloffExponent !== undefined && !(isNum(l.falloffExponent) && l.falloffExponent > 0)) {
      fail(`light ${i} falloffExponent malformed`);
    }
  }
  if (b!.lighting !== undefined && (typeof b!.lighting !== "object" || b!.lighting === null
    || (b!.lighting.directionalRGB !== undefined && !isRgb(b!.lighting.directionalRGB)))) {
    fail("bad lighting");
  }
  if (!isRgb(b!.ambient?.colorRGB) || !isNum(b!.ambient?.intensity)) fail("bad ambient");
  if (!isRgb(b!.fog?.colorRGB) || !isNum(b!.fog?.nearM) || !isNum(b!.fog?.farM)) fail("bad fog");
  if (!Array.isArray(b!.sockets)) fail("no sockets list");
  if (!Array.isArray(b!.drops)) fail("no drops list");
  if (b!.substitutions !== undefined) {
    if (!Array.isArray(b!.substitutions)) fail("substitutions is not a list");
    for (const s of b!.substitutions!) {
      if (!isStr(s?.id) || !isStr(s.standInAsset)) fail("substitution without id/standInAsset");
      if (!b!.kits![s.kit]) fail(`substitution ${s.id}: kit ${String(s.kit)} is not in the bundle's kits`);
      if (!isVec3(s.positionM) || !isVec3(s.rotationDeg) || !isNum(s.scale)) fail(`substitution ${s.id}: bad transform`);
    }
  }
  return b as InteriorBundle;
}

/** The URL of a cell's bundle under the published site root. */
export function interiorBundleUrl(baseUrl: string, cellId: string): string {
  return `${baseUrl}province/interiors/${encodeURIComponent(cellId)}.json`;
}
