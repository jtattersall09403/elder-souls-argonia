import type { DayPhase, SeasonName } from "@elder-souls/world-time";
import { WEATHER_KINDS, type WeatherKind } from "@elder-souls/world-weather";
import type { AudioManifest, SoundSetId } from "./manifest";

/**
 * The ambient-bed contract (module 57 §106): Morrowind's region sound table
 * with Skyrim's time and weather gating. Same instant, same place, same
 * soundscape: `selectAmbience` is a pure function of the inputs, and the
 * inputs are the fields that already drive the light and the weather.
 *
 * The TABLE is world data (authored in `world/sources/audio/` in Phase 12b
 * per module 57; this package holds only its shape and the selector).
 */

/** Acoustic state stack (§106): exterior, under canopy, interior, underwater. */
export type AcousticState = "exterior" | "canopy" | "interior" | "underwater";

/** Coarse bands over world-time's day phases, for authoring. */
export type TimeBand = "night" | "dawn" | "day" | "dusk";
export const TIME_BAND: Readonly<Record<DayPhase, TimeBand>> = {
  night: "night",
  astronomical: "night",
  nautical: "night",
  civil: "dawn",
  sunrise: "dawn",
  morning: "day",
  noon: "day",
  afternoon: "day",
  sunset: "dusk",
  dusk: "dusk",
};

export interface AmbienceInputs {
  /** Ecological region class id (worldgen `regions.py` REGION_CLASSES: 0 ocean … 14 mangrove). */
  regionClass: number;
  /** `dayPhaseAt(epochMinutes)` (world-time). */
  dayPhase: DayPhase;
  /** `seasonState(...).name` (world-time). */
  season: SeasonName;
  /** `WeatherSample.state` (world-weather). */
  weather: WeatherKind;
  /** `WeatherSample.rainIntensity`, 0..1, local. */
  rainIntensity: number;
  /** `WeatherSample.windSpeedMS`. */
  windSpeedMS: number;
  /** `LocalClimate.canopy`, 0..1: closed canopy quietens rain and wind. */
  canopy: number;
  acoustic: AcousticState;
}

export interface AmbienceCondition {
  bands?: TimeBand[];
  dayPhases?: DayPhase[];
  seasons?: SeasonName[];
  weathers?: WeatherKind[];
  acoustic?: AcousticState[];
  minRain?: number;
  maxRain?: number;
  minWindMS?: number;
}

/** A looping bed: plays while its condition holds, at `gainDb`, optionally scaled by a field. */
export interface BedRow {
  set: SoundSetId;
  gainDb?: number;
  when?: AmbienceCondition;
  /** Multiply the gain by rain intensity, wind (÷ 15 m/s, capped 1) or canopy openness. */
  scaleBy?: "rain" | "wind" | "open-sky";
}

/** A detail one-shot: a Poisson roll at `perMinute` while its condition holds (Morrowind's chance roll). */
export interface DetailRow {
  set: SoundSetId;
  perMinute: number;
  gainDb?: number;
  when?: AmbienceCondition;
  /** Distance band (m) for the random position around the listener; absent: 2D. */
  radiusM?: [number, number];
}

export interface AmbienceLayer {
  beds: BedRow[];
  details: DetailRow[];
}

export const AMBIENCE_TABLE_SCHEMA_VERSION = 1;

export interface AmbienceTable {
  schemaVersion: number;
  /** Per region class id (as a string key). */
  regions: Record<string, AmbienceLayer>;
  /** Weather owns its own layer (rain beds, thunder), everywhere (§106). */
  weather: AmbienceLayer;
  /** Replaces everything else while `acoustic` is underwater. */
  underwater: AmbienceLayer;
}

export interface ActiveBed {
  set: SoundSetId;
  gain: number;
}
export interface ActiveDetail {
  set: SoundSetId;
  perMinute: number;
  gain: number;
  radiusM?: [number, number];
}
export interface AmbienceSelection {
  beds: ActiveBed[];
  details: ActiveDetail[];
}

/**
 * Worldgen's ecological region class ids (`tooling/world-generation/worldgen/regions.py`
 * REGION_CLASSES; 10 is retired, decision 0050). A test holds this list to that file.
 */
export const REGION_CLASS_IDS: readonly number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14];

/** Exhaustive by construction: adding a season or state to world-time fails the typecheck here. */
const SEASONS: Record<SeasonName, true> = { dry: true, "rain-onset": true, monsoon: true, "flood-peak": true, recession: true };
const ACOUSTIC: Record<AcousticState, true> = { exterior: true, canopy: true, interior: true, underwater: true };
const BANDS: Record<TimeBand, true> = { night: true, dawn: true, day: true, dusk: true };
/** Allowed values per list condition; the numeric conditions are checked as numbers. */
const CONDITION_VALUES: Record<string, ReadonlySet<string>> = {
  bands: new Set(Object.keys(BANDS)),
  dayPhases: new Set(Object.keys(TIME_BAND)),
  seasons: new Set(Object.keys(SEASONS)),
  weathers: new Set(WEATHER_KINDS),
  acoustic: new Set(Object.keys(ACOUSTIC)),
};
const NUMERIC_CONDITIONS = new Set(["minRain", "maxRain", "minWindMS"]);
const SCALE_BY = new Set(["rain", "wind", "open-sky"]);

/**
 * Validate a table before use (standard: `schemaVersion` on runtime data):
 * its version, its layers, and every row — a known condition key (a typo
 * like `band` would otherwise be ignored and the row play at every hour),
 * numeric rates and gains, and, given the manifest, that each bed names a
 * looping set and each detail a one-shot set. Throws with every problem.
 */
export function parseAmbienceTable(
  json: unknown,
  manifest?: AudioManifest,
  /** The manager's `maxDistanceM` (default 60): a detail placed beyond it is culled and never sounds. */
  maxDistanceM = 60,
): AmbienceTable {
  const t = json as AmbienceTable;
  const errs: string[] = [];
  if (!t || typeof t !== "object") throw new Error("ambience table: not an object");
  if (t.schemaVersion !== AMBIENCE_TABLE_SCHEMA_VERSION) {
    errs.push(`schemaVersion ${String(t.schemaVersion)} != ${AMBIENCE_TABLE_SCHEMA_VERSION}`);
  }
  if (!t.regions || typeof t.regions !== "object") errs.push("regions: needs an object keyed by region class id");
  for (const k of Object.keys(t.regions ?? {})) {
    if (!/^(0|[1-9]\d*)$/.test(k) || !REGION_CLASS_IDS.includes(Number(k))) {
      errs.push(`regions."${k}": not a region class id (${REGION_CLASS_IDS.join(", ")})`);
    }
  }
  const layers: [string, AmbienceLayer | undefined][] = [
    ["weather", t.weather],
    ["underwater", t.underwater],
    ...Object.entries(t.regions ?? {}).map(([k, v]) => [`regions.${k}`, v] as [string, AmbienceLayer]),
  ];
  const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  const checkRow = (where: string, row: BedRow | DetailRow, loop: boolean) => {
    if (typeof row?.set !== "string") return errs.push(`${where}: set must be a string`);
    const set = manifest?.sets[row.set];
    if (manifest && !set) errs.push(`${where}: no set ${row.set} in the manifest`);
    else if (set && set.loop !== loop) errs.push(`${where}: ${row.set} is ${set.loop ? "a loop" : "a one-shot"}`);
    if (row.gainDb !== undefined && !num(row.gainDb)) errs.push(`${where}: gainDb must be a number`);
    for (const [k, v] of Object.entries(row.when ?? {})) {
      const allowed = CONDITION_VALUES[k];
      if (allowed) {
        if (!Array.isArray(v)) errs.push(`${where}: condition "${k}" must be a list`);
        else for (const x of v) if (!allowed.has(x)) errs.push(`${where}: "${String(x)}" is not a valid ${k} value`);
      } else if (NUMERIC_CONDITIONS.has(k)) {
        if (!num(v)) errs.push(`${where}: condition "${k}" must be a number`);
      } else errs.push(`${where}: unknown condition "${k}"`);
    }
  };
  for (const [name, layer] of layers) {
    if (!Array.isArray(layer?.beds) || !Array.isArray(layer?.details)) {
      errs.push(`${name}: needs beds[] and details[]`);
      continue;
    }
    layer.beds.forEach((b, i) => {
      if (!b || typeof b !== "object") return errs.push(`${name}.beds[${i}]: not an object`);
      checkRow(`${name}.beds[${i}]`, b, true);
      if (b.scaleBy !== undefined && !SCALE_BY.has(b.scaleBy)) errs.push(`${name}.beds[${i}]: unknown scaleBy "${b.scaleBy}"`);
    });
    layer.details.forEach((d, i) => {
      if (!d || typeof d !== "object") return errs.push(`${name}.details[${i}]: not an object`);
      checkRow(`${name}.details[${i}]`, d, false);
      if (!num(d.perMinute) || d.perMinute < 0) errs.push(`${name}.details[${i}]: perMinute must be a number >= 0`);
      const r = d.radiusM;
      if (r !== undefined && !(Array.isArray(r) && r.length === 2 && num(r[0]) && num(r[1]) && r[0] <= r[1])) {
        errs.push(`${name}.details[${i}]: radiusM must be [near, far] metres`);
      } else if (r !== undefined && r[1] > maxDistanceM) {
        errs.push(`${name}.details[${i}]: radiusM ${r[1]} m is beyond hearing range (${maxDistanceM} m); it would never sound`);
      }
    });
  }
  if (errs.length) throw new Error(`ambience table:\n  ${errs.join("\n  ")}`);
  return t;
}

export function holds(c: AmbienceCondition | undefined, i: AmbienceInputs): boolean {
  if (!c) return true;
  if (c.bands && !c.bands.includes(TIME_BAND[i.dayPhase])) return false;
  if (c.dayPhases && !c.dayPhases.includes(i.dayPhase)) return false;
  if (c.seasons && !c.seasons.includes(i.season)) return false;
  if (c.weathers && !c.weathers.includes(i.weather)) return false;
  if (c.acoustic && !c.acoustic.includes(i.acoustic)) return false;
  if (c.minRain !== undefined && i.rainIntensity < c.minRain) return false;
  if (c.maxRain !== undefined && i.rainIntensity > c.maxRain) return false;
  if (c.minWindMS !== undefined && i.windSpeedMS < c.minWindMS) return false;
  return true;
}

function scale(row: BedRow, i: AmbienceInputs): number {
  const base = Math.pow(10, (row.gainDb ?? 0) / 20);
  switch (row.scaleBy) {
    case "rain":
      return base * Math.min(1, Math.max(0, i.rainIntensity)) * (1 - 0.5 * i.canopy);
    case "wind":
      return base * Math.min(1, i.windSpeedMS / 15) * (1 - 0.6 * i.canopy);
    case "open-sky":
      return base * (1 - i.canopy);
    default:
      return base;
  }
}

/**
 * What should be sounding for these inputs. Pure and deterministic; the
 * manager crossfades from the previous selection to this one. A bed with
 * zero gain is left out. Interior drops the region and weather beds'
 * exterior feel to the manager's bus filter; underwater replaces the lot.
 */
export function selectAmbience(table: AmbienceTable, i: AmbienceInputs): AmbienceSelection {
  if (table.schemaVersion !== AMBIENCE_TABLE_SCHEMA_VERSION) {
    throw new Error(`ambience table schemaVersion ${table.schemaVersion}; parse it with parseAmbienceTable`);
  }
  const layers =
    i.acoustic === "underwater" ? [table.underwater] : [table.regions[String(i.regionClass)], table.weather];
  const beds = new Map<SoundSetId, number>();
  const details = new Map<SoundSetId, ActiveDetail>();
  for (const layer of layers) {
    if (!layer) continue;
    for (const b of layer.beds) {
      if (!holds(b.when, i)) continue;
      const g = scale(b, i);
      if (g > 0) beds.set(b.set, Math.max(beds.get(b.set) ?? 0, g));
    }
    for (const d of layer.details) {
      if (!holds(d.when, i) || d.perMinute <= 0) continue;
      // A set listed by two layers rolls once: the row with the higher rate wins whole
      // (rate, gain and placement together; ties keep the first layer's row).
      const prev = details.get(d.set);
      if (prev && prev.perMinute >= d.perMinute) continue;
      details.set(d.set, { set: d.set, perMinute: d.perMinute, gain: Math.pow(10, (d.gainDb ?? 0) / 20), radiusM: d.radiusM });
    }
  }
  return { beds: [...beds].map(([set, gain]) => ({ set, gain })), details: [...details.values()] };
}
