/**
 * The shipped audio manifest (`files/audio-manifest.json`), written by
 * `tooling/audio-pipeline` (decision 0094). Keys are stable ids:
 *
 * - an **asset** is one encoded file, id `skyrim/<archive path without sound/ and extension>`;
 * - a **set** is what the game plays: 1..n variants with Skyrim's own gain,
 *   dB and pitch variance (read from the SNDR record that defined it), id
 *   `<category>.<family>.<...>` e.g. `combat.impact.blade.flesh`,
 *   `footstep.light.walk.mud`, `ambient.marsh.crickets-marsh-night01-lpsd`.
 *
 * Provenance (source hash, codec evidence, loop-seam scores) stays in the repo
 * (`tooling/audio-pipeline/provenance.json`) and is never downloaded.
 */

export const AUDIO_MANIFEST_SCHEMA_VERSION = 1;

export type AssetId = string & { readonly __brand?: "AudioAssetId" };
export type SoundSetId = string & { readonly __brand?: "SoundSetId" };

/** Mixer category of a set; each maps to one bus (see `buses.ts`). */
export type SoundCategory = "combat" | "movement" | "ambient" | "weather" | "object" | "ui" | "music";

export interface LoopPoints {
  /** Loop start and end in the encoded file (s); the pads either side are the loop wrapped. */
  startS: number;
  endS: number;
  /** Runtime crossfade from one cycle into the next (s), played inside the pad. */
  fadeS: number;
}

export interface AudioAsset {
  /** Path relative to the audio root (`<base>audio/`). */
  file: string;
  bytes: number;
  sha256: string;
  durationS: number;
  channels: number;
  /** Archive path of the source (`sound/fx/...`), for credits and audits. */
  source: string;
  loop: LoopPoints | null;
}

export interface SoundSet {
  category: SoundCategory;
  loop: boolean;
  variants: AssetId[];
  /** Static gain (dB, <= 0): Skyrim's static attenuation, negated (the loudest variant's). */
  gainDb: number;
  /** Per-variant offsets (dB, <= 0) when the set merges records with different attenuation. */
  variantGainDb?: number[];
  /** Random +/- gain per play (dB). */
  dbVariance: number;
  /** Random +/- playback-rate change per play (%). */
  pitchVariancePct: number;
  source: {
    plugin: string;
    sndr: string[];
    /** Vanilla region-table row this set came from (chance per roll, weathers it plays in). */
    region?: { regn: string; chance: number; weather: string[] };
  };
  note?: string;
}

export interface AudioManifest {
  schemaVersion: number;
  generator: string;
  codec: { container: "webm"; codec: "opus"; sampleRate: number; [k: string]: unknown };
  sets: Record<SoundSetId, SoundSet>;
  assets: Record<AssetId, AudioAsset>;
}

/** Validate the shape the runtime depends on; throws with every problem listed. */
export function parseManifest(json: unknown): AudioManifest {
  const m = json as AudioManifest;
  const errs: string[] = [];
  if (!m || typeof m !== "object") throw new Error("audio manifest: not an object");
  if (m.schemaVersion !== AUDIO_MANIFEST_SCHEMA_VERSION) {
    errs.push(`schemaVersion ${String(m.schemaVersion)} != ${AUDIO_MANIFEST_SCHEMA_VERSION}`);
  }
  for (const [id, s] of Object.entries(m.sets ?? {})) {
    if (!s.variants?.length) errs.push(`${id}: no variants`);
    for (const v of s.variants ?? []) {
      const a = m.assets?.[v];
      if (!a) errs.push(`${id}: variant ${v} is not an asset`);
      else if (s.loop !== (a.loop !== null)) errs.push(`${id}: loop flag disagrees with ${v}`);
    }
    if (s.variantGainDb && s.variantGainDb.length !== s.variants.length) errs.push(`${id}: variantGainDb length`);
  }
  if (errs.length) throw new Error(`audio manifest:\n  ${errs.join("\n  ")}`);
  return m;
}

/** Sum of shipped bytes for the assets a list of sets needs (each asset counted once). */
export function setBytes(manifest: AudioManifest, sets: Iterable<SoundSetId>): number {
  const seen = new Set<AssetId>();
  let total = 0;
  for (const id of sets) {
    for (const v of manifest.sets[id]?.variants ?? []) {
      if (seen.has(v)) continue;
      seen.add(v);
      total += manifest.assets[v]?.bytes ?? 0;
    }
  }
  return total;
}
