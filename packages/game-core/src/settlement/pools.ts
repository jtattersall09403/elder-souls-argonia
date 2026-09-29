import type { LocalPoolRecord, LocalWaterSurfaces } from "../water/localSurfaces";

/** The first settlement bundle schema that may carry a place's `pools[]`
 * (16k walk 4; `export_settlement_bundle.SCHEMA_VERSION` 5). */
export const SETTLEMENT_POOLS_SCHEMA_VERSION = 5;

/** Refuses a bundle whose schema predates pools but whose place carries
 * them: an old reader would draw the basin (the `pool` ground overlay) with
 * no water in it. */
export function assertPoolsSchema(
  schemaVersion: number, settlements: readonly { id: string; pools?: readonly LocalPoolRecord[] }[],
): void {
  if (schemaVersion >= SETTLEMENT_POOLS_SCHEMA_VERSION) return;
  const carrying = settlements.filter((s) => (s.pools?.length ?? 0) > 0).map((s) => s.id);
  if (carrying.length) {
    throw new Error(`settlement schema ${schemaVersion} carries pools (${carrying.join(", ")}); `
      + `pools need schema ${SETTLEMENT_POOLS_SCHEMA_VERSION}`);
  }
}

/**
 * Registers every loaded place's pools with the injected registry and
 * unregisters the places no longer loaded. Returns the place ids now
 * registered; pass them back on the next load (and `[]` settlements on
 * unload) so each place is cleared exactly once.
 */
export function syncPlacePools(
  surfaces: LocalWaterSurfaces, registered: ReadonlySet<string>,
  settlements: readonly { id: string; pools?: readonly LocalPoolRecord[] }[],
): Set<string> {
  const now = new Set(settlements.map((s) => s.id));
  for (const id of registered) if (!now.has(id)) surfaces.set(id, []);
  for (const s of settlements) {
    if (s.pools?.length || registered.has(s.id)) surfaces.set(s.id, s.pools ?? []);
  }
  return new Set(settlements.filter((s) => s.pools?.length).map((s) => s.id));
}
