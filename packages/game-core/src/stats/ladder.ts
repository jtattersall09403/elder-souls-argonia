/**
 * The semantic compiler for actors (decision 0019, fourth amendment; module 76
 * §128): an author writes a band, a position in it and named variants; this
 * returns fixed numbers. Reads world data only, never player state (0004).
 */
import { STATS_DATA } from "./data";
import { LADDER_FIELDS, type LadderField, type StatsData } from "./types";

/** What an author writes. Literal overrides (uniques) are applied by the caller after compiling. */
export type ActorLadderRef = {
  readonly id: string;
  /** "D1".."D5" (D0 is a location property, never an actor band). */
  readonly band: string;
  /** 0 = the bottom of the band, 1 = the top. */
  readonly position: number;
  readonly variants?: readonly string[];
};

export type CompiledActorStats = {
  readonly id: string;
  readonly band: string;
  readonly position: number;
} & Readonly<Record<LadderField, number>>;

/**
 * Interpolate each field across the band, multiply by each variant's factors,
 * then clamp every field to [band low ÷ clamp, band high × clamp] so a variant
 * never invents a tier (§128).
 */
export function compileActor(entry: ActorLadderRef, data: StatsData = STATS_DATA): CompiledActorStats {
  const { ladder } = data;
  const band = ladder.bands.find((b) => b.id === entry.band);
  if (!band) throw new RangeError(`unknown band: ${entry.band}`);
  const out = {} as Record<LadderField, number>;
  for (const f of LADDER_FIELDS) {
    const [lo, hi] = band[f];
    out[f] = lo + (hi - lo) * entry.position;
  }
  for (const v of entry.variants ?? []) {
    const mods = ladder.variants[v];
    if (!mods) throw new RangeError(`unknown variant: ${v}`);
    for (const [field, mult] of Object.entries(mods)) {
      if (typeof mult === "number" && field in out) out[field as LadderField] *= mult;
    }
  }
  const clamp = ladder.variantClamp;
  for (const f of LADDER_FIELDS) {
    const [lo, hi] = band[f];
    out[f] = Math.max(lo / clamp, Math.min(hi * clamp, out[f]));
  }
  return { id: entry.id, band: entry.band, position: entry.position, ...out };
}

/** A generic actor at a band position, e.g. for a sweep or a trap's damage row. */
export function bandActor(bandId: string, position = 0.5, data: StatsData = STATS_DATA): CompiledActorStats {
  return compileActor({ id: `${bandId}@${position}`, band: bandId, position, variants: [] }, data);
}
