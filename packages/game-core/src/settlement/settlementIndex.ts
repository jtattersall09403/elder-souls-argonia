/**
 * The published settlements, loaded by range (S8, 16k method review round 2 N0).
 *
 * The export writes one minified bundle per place and per route under
 * `province/settlements/`, and `settlements/index.json` naming each with its
 * centre and bounding radius (`worldgen/settlement_bundles.py`). A
 * `SettlementBundleSource` fetches the index once, picks the bundles in range
 * of a position, fetches each once (cached per bundle path), and reassembles
 * them into the `SettlementBundle` shape the readers used from the old whole
 * `settlements.json`. One source is composed per app and shared through
 * `SettlementBundleSourceContext`, so the settlement layer, the groundcover,
 * the socket overlay and the navigation toast read the same bundles; the
 * layer re-queries as the player moves and the others follow its sets.
 */
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { SettlementBundle } from "./types";

export const SETTLEMENT_INDEX_SCHEMA_VERSION = 1;
/** A bundle loads when its centre is within this range plus its radius. */
export const SETTLEMENT_RANGE_M = 2000;
/** Below this many entries of a kind, every one loads (no range pick). */
export const SETTLEMENT_LOAD_ALL_BELOW = 20;
/** A reader that moves further than this from its last query re-queries. */
export const SETTLEMENT_REQUERY_MOVE_M = 500;

export interface SettlementIndexEntry {
  id: string;
  positionM: [number, number];
  radiusM: number;
  bundle: string;
  sha256: string;
}

export interface SettlementIndex {
  schemaVersion: typeof SETTLEMENT_INDEX_SCHEMA_VERSION;
  places: SettlementIndexEntry[];
  routes?: SettlementIndexEntry[];
}

/** One published bundle (`settlement-place-bundle` or `settlement-route-bundle`). */
export interface SettlementPartBundle {
  schemaVersion: number;
  collisionFrame: string;
  kind: "settlement-place-bundle" | "settlement-route-bundle";
  placeId?: string;
  routeId?: string;
  lod: SettlementBundle["lod"];
  kits: SettlementBundle["kits"];
  settlement?: SettlementBundle["settlements"][number];
  placements: SettlementBundle["placements"];
  groundTreatments: SettlementBundle["groundTreatments"];
  navmeshCuts: unknown[];
  navmeshLinks: unknown[];
  doors: NonNullable<SettlementBundle["doors"]>;
  compiledObjects: unknown[];
  [field: string]: unknown;
}

/** The reassembled record: the whole-file shape plus the navmesh rows. */
export type AssembledSettlementBundle = SettlementBundle & {
  navmeshCuts: unknown[];
  navmeshLinks: unknown[];
  /** The index ids this set was assembled from, sorted. */
  bundleIds: string[];
  /** The bundle paths this set was assembled from, sorted. */
  bundlePaths: string[];
  /** Content key: every bundle path with its sha256, sorted. Equal keys, equal sets. */
  key: string;
};

export interface RangePosition { x: number; z: number }

function pickKind(
  entries: SettlementIndexEntry[], at: RangePosition | null, rangeM: number,
): SettlementIndexEntry[] {
  if (!at || entries.length < SETTLEMENT_LOAD_ALL_BELOW) return entries;
  return entries.filter((e) =>
    Math.hypot(e.positionM[0] - at.x, e.positionM[1] - at.z) <= rangeM + e.radiusM);
}

/**
 * The index entries to load at `at`: every place (and every route) when the
 * index lists fewer than SETTLEMENT_LOAD_ALL_BELOW of them, else those whose
 * centre is within `rangeM` plus their radius. `at` null loads everything.
 */
export function bundlesInRange(
  index: SettlementIndex, at: RangePosition | null, rangeM = SETTLEMENT_RANGE_M,
): SettlementIndexEntry[] {
  return [...pickKind(index.places, at, rangeM), ...pickKind(index.routes ?? [], at, rangeM)];
}

/** The whole-file shape from bundles, in the order the export writes it. */
export function assembleSettlementBundle(
  parts: SettlementPartBundle[], entries: SettlementIndexEntry[] = [],
): AssembledSettlementBundle {
  const bundlePaths = entries.map((e) => e.bundle).sort();
  const key = entries.map((e) => `${e.bundle}@${e.sha256}`).sort().join("|");
  const orderKey = (id: string) => `${id}.settlement.json`;
  const places = parts.filter((p) => p.kind === "settlement-place-bundle")
    .sort((a, b) => (orderKey(a.placeId!) < orderKey(b.placeId!) ? -1 : 1));
  const routes = parts.filter((p) => p.kind === "settlement-route-bundle")
    .sort((a, b) => (a.routeId! < b.routeId! ? -1 : 1));
  const ordered = [...places, ...routes];
  if (!ordered.length) {
    return {
      schemaVersion: 4, collisionFrame: "", bundleIds: [], bundlePaths, key,
      lod: { tiers: 3, absoluteTriangleFloor: [0, 0], distancePerFootprintDiagonal: [0, 0],
        farMergeDistanceM: 0, atlasMaxSize: 0, colliderRadiusM: 0, colliderPartBudget: 0 },
      kits: {}, settlements: [], placements: [], groundTreatments: [], doors: [],
      navmeshCuts: [], navmeshLinks: [],
      stats: { settlements: 0, settlementPlacements: 0, routeStructurePlacements: 0 },
    };
  }
  const settlements = places.map((p) => p.settlement!);
  const placements = ordered.flatMap((p) => p.placements)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    schemaVersion: Math.max(...ordered.map((p) => p.schemaVersion)) as 3 | 4,
    collisionFrame: ordered[0].collisionFrame,
    lod: { ...ordered[0].lod,
      colliderPartBudget: Math.max(...ordered.map((p) => p.lod.colliderPartBudget)) },
    kits: Object.assign({}, ...ordered.map((p) => p.kits)),
    settlements,
    placements,
    groundTreatments: ordered.flatMap((p) => p.groundTreatments),
    navmeshCuts: ordered.flatMap((p) => p.navmeshCuts),
    navmeshLinks: ordered.flatMap((p) => p.navmeshLinks),
    doors: ordered.flatMap((p) => p.doors),
    stats: {
      settlements: settlements.length,
      settlementPlacements: settlements.reduce((n, s) => n + s.placementIds.length, 0),
      routeStructurePlacements: placements.filter((p) => p.kind === "route-structure").length,
    },
    bundleIds: ordered.map((p) => (p.placeId ?? p.routeId)!).sort(),
    bundlePaths,
    key: key || ordered.map((p) => (p.placeId ?? p.routeId)!).sort().join("|"),
  };
}

export type FetchJson = (url: string) => Promise<unknown>;

const defaultFetchJson: FetchJson = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.json();
};

type Listener = (bundle: AssembledSettlementBundle) => void;

/**
 * One app's view of the published settlements. Not a singleton: the app
 * makes one (`new SettlementBundleSource(baseUrl)`) and hands it down.
 *
 * Every `load` result belongs to its caller: nothing is shared or broadcast
 * by a load. The settlement layer, the one reader that follows the player,
 * validates its set and `publish`es it; the other readers follow the
 * published set (`subscribe`, `published`). The bundle cache holds the
 * published set's bundles plus those of loads still in flight: a publish
 * evicts every other bundle, so memory follows the player, not the walk.
 */
export class SettlementBundleSource {
  private indexPromise: Promise<SettlementIndex> | null = null;
  private readonly parts = new Map<string, Promise<SettlementPartBundle>>();
  private readonly inFlight = new Map<string, number>();
  private readonly listeners = new Set<Listener>();
  private readonly errorListeners = new Set<(error: Error) => void>();
  private publishedSet: AssembledSettlementBundle | null = null;

  constructor(readonly baseUrl: string, private readonly fetchJson: FetchJson = defaultFetchJson) {}

  index(): Promise<SettlementIndex> {
    if (!this.indexPromise) {
      this.indexPromise = this.fetchJson(`${this.baseUrl}province/settlements/index.json`)
        .then((raw) => {
          const index = raw as SettlementIndex;
          if (index.schemaVersion !== SETTLEMENT_INDEX_SCHEMA_VERSION) {
            throw new Error(`unsupported settlement index schema ${String(index.schemaVersion)}`);
          }
          return index;
        });
      this.indexPromise.catch(() => { this.indexPromise = null; });
    }
    return this.indexPromise;
  }

  private part(entry: SettlementIndexEntry): Promise<SettlementPartBundle> {
    let pending = this.parts.get(entry.bundle);
    if (!pending) {
      pending = this.fetchJson(`${this.baseUrl}province/${entry.bundle}`)
        .then((raw) => raw as SettlementPartBundle);
      pending.catch(() => this.parts.delete(entry.bundle));
      this.parts.set(entry.bundle, pending);
    }
    return pending;
  }

  /**
   * The bundles in range of `at` (all of them for `null`), reassembled, for
   * the caller alone. `rangeM` is the caller's pick radius (each bundle's
   * own radius is added); the same set yields the same `key`.
   */
  async load(at: RangePosition | null, rangeM = SETTLEMENT_RANGE_M): Promise<AssembledSettlementBundle> {
    const index = await this.index();
    const entries = bundlesInRange(index, at, rangeM);
    const paths = entries.map((e) => e.bundle);
    paths.forEach((path) => this.inFlight.set(path, (this.inFlight.get(path) ?? 0) + 1));
    try {
      return assembleSettlementBundle(await Promise.all(entries.map((e) => this.part(e))), entries);
    } finally {
      paths.forEach((path) => {
        const left = (this.inFlight.get(path) ?? 1) - 1;
        if (left > 0) this.inFlight.set(path, left); else this.inFlight.delete(path);
      });
    }
  }

  /**
   * The layer's validated set, handed to every follower. A set with the
   * key already published is not re-sent. Bundles neither in it nor in a
   * load in flight leave the cache.
   */
  publish(set: AssembledSettlementBundle): void {
    const keep = new Set(set.bundlePaths);
    for (const path of [...this.parts.keys()]) {
      if (!keep.has(path) && !this.inFlight.has(path)) this.parts.delete(path);
    }
    if (this.publishedSet?.key === set.key) return;
    this.publishedSet = set;
    this.listeners.forEach((listener) => listener(set));
  }

  /** The layer could not load or refused its set: followers hear why. */
  fail(error: Error): void {
    this.errorListeners.forEach((listener) => listener(error));
  }

  /** The last published set, if any. */
  published(): AssembledSettlementBundle | null { return this.publishedSet; }

  /** Bundles held in the cache (for tests and the memory proof). */
  cachedBundleCount(): number { return this.parts.size; }

  /** Called with every newly published set (and every `fail`); returns the unsubscribe. */
  subscribe(listener: Listener, onError?: (error: Error) => void): () => void {
    this.listeners.add(listener);
    if (onError) this.errorListeners.add(onError);
    return () => {
      this.listeners.delete(listener);
      if (onError) this.errorListeners.delete(onError);
    };
  }
}

/** The app's source; null outside a provider (a reader then makes its own). */
export const SettlementBundleSourceContext = createContext<SettlementBundleSource | null>(null);

/** The context's source, else one of the reader's own for `baseUrl`. */
export function useSettlementBundleSource(baseUrl: string): SettlementBundleSource {
  const shared = useContext(SettlementBundleSourceContext);
  const own = useMemo(() => (shared ? null : new SettlementBundleSource(baseUrl)), [shared, baseUrl]);
  return shared ?? own!;
}

/**
 * The settlements a reader that does not follow the player sees: the set
 * the settlement layer last published, followed as the layer re-picks.
 * Until the layer publishes, a reader given a `start` loads its own set
 * there (owned by this reader, never broadcast, dropped the moment a
 * published set arrives); `start` undefined only follows. `enabled` false
 * reads nothing.
 */
export function useSettlementBundle(
  source: SettlementBundleSource, start: RangePosition | null | undefined, enabled = true,
): { bundle: AssembledSettlementBundle | null; error: Error | null } {
  const [state, setState] = useState<{ bundle: AssembledSettlementBundle | null; error: Error | null }>(
    () => ({ bundle: enabled ? source.published() : null, error: null }));
  useEffect(() => {
    if (!enabled) { setState({ bundle: null, error: null }); return undefined; }
    let live = true;
    let followed = false;
    const unsubscribe = source.subscribe((bundle) => {
      followed = true;
      if (live) setState({ bundle, error: null });
    }, (error) => { if (live) setState({ bundle: null, error }); });
    const now = source.published();
    if (now) {
      followed = true;
      setState({ bundle: now, error: null });
    } else if (start !== undefined) {
      source.load(start).then((bundle) => {
        if (live && !followed) setState({ bundle, error: null });
      }).catch((error: unknown) => {
        if (live && !followed) {
          setState({ bundle: null, error: error instanceof Error ? error : new Error(String(error)) });
        }
      });
    }
    return () => { live = false; unsubscribe(); };
    // `start` is read once, at the first load (the reader has no position of its own)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, enabled]);
  return state;
}
