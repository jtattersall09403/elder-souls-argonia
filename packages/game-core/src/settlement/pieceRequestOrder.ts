/**
 * The ONE home for the order kit pieces are fetched in (decision 0120) and
 * the fetch priority hint each request carries (perf-diag22 L2). Pure: the
 * settlement layer computes each need from its placements and the 0075/0082
 * ladder and asks for the order here.
 *
 * Order: pieces in the spawn ring or in view first, then by ladder band (0 =
 * the near band, LOD0), then by distance, then by key (deterministic). A
 * piece several placements need takes its most urgent need.
 */

/** The place index and place parts: ahead of every kit fetch. */
export const PLACE_DATA_PRIORITY: RequestPriority = "high";
/** A kit fetch nothing in the spawn ring or in view waits on. */
export const BULK_KIT_PRIORITY: RequestPriority = "low";
/** A kit fetch the spawn ring or the view waits on. */
export const NEEDED_KIT_PRIORITY: RequestPriority = "high";

export interface PieceNeed {
  /** `${kit}#${assetId}` for a part, the kit id for a kit still fetched whole. */
  key: string;
  /** Distance from the focus the order is taken at (the spawn on the first pass), m. */
  distanceM: number;
  /** The ladder band the need falls in at that distance (0 = near band). */
  band: number;
  /** In the camera's view. */
  inView: boolean;
}

export interface PieceRequest {
  key: string;
  /** In the spawn ring (band 0): holds the warm gate until loaded. */
  ring: boolean;
  priority: RequestPriority;
}

/** A need in the near band is in the ring: the warm gate waits for it. */
export const inSpawnRing = (need: Pick<PieceNeed, "band">): boolean => need.band === 0;

const urgent = (n: PieceNeed): boolean => inSpawnRing(n) || n.inView;

function moreUrgent(a: PieceNeed, b: PieceNeed): number {
  return Number(urgent(b)) - Number(urgent(a)) || a.band - b.band || a.distanceM - b.distanceM
    || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
}

/** The requests for `needs`, one per key, most urgent first. */
export function orderPieceRequests(needs: Iterable<PieceNeed>): PieceRequest[] {
  const best = new Map<string, PieceNeed>();
  for (const need of needs) {
    const held = best.get(need.key);
    if (!held || moreUrgent(need, held) < 0) best.set(need.key, need);
  }
  return [...best.values()].sort(moreUrgent).map((n) => ({
    key: n.key, ring: inSpawnRing(n), priority: urgent(n) ? NEEDED_KIT_PRIORITY : BULK_KIT_PRIORITY,
  }));
}

/** The kit a request key names (`kit#asset` or `kit`). */
export const requestKit = (key: string): string => {
  const at = key.indexOf("#");
  return at < 0 ? key : key.slice(0, at);
};
