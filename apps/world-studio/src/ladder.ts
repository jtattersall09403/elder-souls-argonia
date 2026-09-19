/**
 * The Phase 16 ladder record (`province/ladder.json`, written by
 * `tooling/world-generation/scripts/terrain-chain.sh` at the end of every run).
 *
 * A studio layer is shown only if it was rebuilt on the current ground
 * (plan 16 §3, owner 2026-09-12): a chain stage a later chunk still owns is
 * skipped, and the layer it would have produced (settlements, bridges…) is
 * listed here as hidden rather than drawn stale over new terrain. A missing
 * file hides nothing (a build made before the ladder existed).
 */
import { useEffect, useState } from "react";

export interface Ladder {
  schemaVersion: number;
  through: string;
  ran: string[];
  skipped: string[];
  hiddenLayers: string[];
}

const cache = new Map<string, Promise<Ladder | null>>();

export function loadLadder(baseUrl: string): Promise<Ladder | null> {
  let p = cache.get(baseUrl);
  if (!p) {
    p = fetch(`${baseUrl}province/ladder.json`)
      .then((r) => (r.ok && (r.headers.get("content-type") ?? "").includes("json") ? r.json() : null))
      .then((j) => (j && j.schemaVersion === 1 ? (j as Ladder) : null))
      .catch(() => null);
    cache.set(baseUrl, p);
  }
  return p;
}

/**
 * Every layer the ladder can hide. Until the record has loaded ALL of them
 * are hidden: the old "nothing hidden until we know" default mounted the
 * settlement layer for the frames before ladder.json arrived, which started
 * its 9.7 MB bundle download on every start-up and then unmounted it
 * (16f round 4). The ladder is a 600-byte file; waiting for it costs
 * nothing visible.
 */
export const LADDER_LAYERS = ["apron", "settlements", "vegetation", "water", "route-structures",
  "places", "waterways", "services"] as const;

/** The set of hidden layer names: everything until the record loads, then the record's list (empty if there is none). */
export function useHiddenLayers(baseUrl: string): Set<string> {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set<string>(LADDER_LAYERS));
  useEffect(() => {
    let alive = true;
    loadLadder(baseUrl).then((l) => { if (alive) setHidden(new Set(l ? l.hiddenLayers : [])); });
    return () => { alive = false; };
  }, [baseUrl]);
  return hidden;
}
