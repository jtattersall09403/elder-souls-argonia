/**
 * The interior bundle (0103 decision 4): one file per tier A cell,
 * `public/province/interiors/<cellId>.json`, written by the interior bundle
 * exporter (0103 decision 3). Positions are metres in the cell's own frame,
 * y up, the arrival marker's frame; the runtime lifts the whole cell into
 * its interior space (interiorSpace.ts).
 */

export const INTERIOR_BUNDLE_SCHEMA_VERSION = 1;

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
 * One exterior door's pairing (owner ruling B, 0103 decision 2): entering
 * by `exteriorDoorId` arrives at `arrivalMarker`; leaving through the
 * cell's load door `interiorLoadDoorRef` returns to that exterior door.
 */
export interface InteriorOpenDoor {
  exteriorDoorId: string;
  interiorLoadDoorRef: string;
  arrivalMarker: InteriorMarker;
  /** Where that load door stands in the cell (cell frame, y up): leaving by it is walking to it. */
  loadDoor: InteriorMarker;
  closed?: false;
}

/**
 * A load door of the cell no exterior door pairs with (planner ruling 3,
 * interiors round 3: the farmhouse's upper door, a cellar): it stands where
 * the plugin put it, shows the closed line and does nothing.
 */
export interface InteriorClosedDoor {
  interiorLoadDoorRef: string;
  loadDoor: InteriorMarker;
  closed: true;
}

export type InteriorDoorPairing = InteriorOpenDoor | InteriorClosedDoor;

export const isOpenDoor = (d: InteriorDoorPairing): d is InteriorOpenDoor => d.closed !== true;

export interface InteriorExitDoor {
  id: string;
  /** The plugin reference of the cell's load door. */
  refId: string;
  positionM: Vec3;
  yawDeg: number;
}

export interface InteriorBundle {
  schemaVersion: typeof INTERIOR_BUNDLE_SCHEMA_VERSION;
  cellId: string;
  /** The plugin file the cell was copied from (0103 decision 3). */
  plugin: string;
  /** Human-readable statement of the coordinate frame; documentation only. */
  frame: string;
  /** The exterior shell the cell was picked for; null for a directly opened cell. */
  shellAssetId: string | null;
  /** References in the plugin cell: placements plus the listed drops (0103 decision 3 acceptance). */
  refCount: number;
  kits: Record<string, InteriorKitRef>;
  arrivalMarker: InteriorMarker;
  exitDoor: InteriorExitDoor;
  /**
   * One entry per exterior door the cell pairs with, then one closed entry
   * per load door no exterior door pairs with; may be empty.
   */
  doors: InteriorDoorPairing[];
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
  if (b!.schemaVersion !== INTERIOR_BUNDLE_SCHEMA_VERSION) {
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
    const d = entry as (Omit<Partial<InteriorOpenDoor>, "closed"> & { closed?: boolean }) | null;
    const closed = d?.closed === true;
    if (!isStr(d?.interiorLoadDoorRef) || !isMarker(d.loadDoor)
      || (!closed && (!isStr(d.exteriorDoorId) || !isMarker(d.arrivalMarker)))) {
      fail(`door pairing ${i} malformed`);
    }
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
  return b as InteriorBundle;
}

/** The URL of a cell's bundle under the published site root. */
export function interiorBundleUrl(baseUrl: string, cellId: string): string {
  return `${baseUrl}province/interiors/${encodeURIComponent(cellId)}.json`;
}
