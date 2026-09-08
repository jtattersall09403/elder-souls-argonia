import type {
  SettlementBundle,
  SettlementGroundAudit,
  SettlementPlacement,
  SettlementPlacementGroundAudit,
  TerrainHeight,
} from "./types";

export interface AnchoredPlacement {
  y: number;
  gapM: number;
  buryM: number;
  requestedBuryM: number;
  overBuryM: number;
  terrainMinM: number;
  terrainMaxM: number;
  groundLineM: number;
  pivotToBaseM: number;
  complete: boolean;
}

const GROUND_EPSILON_M = 0.001;

/**
 * Re-ground a placed kit from the streamed terrain. The kit manifest records
 * pivot-to-base as originOffsetM.z (source was z-up); no asset is guessed from
 * its node name. Perimeter mode uses the high edge, then increases the asset's
 * declared bury by a bounded slope term so no low corner floats.
 */
export function anchorPlacement(
  placement: SettlementPlacement,
  groundAt: TerrainHeight,
): AnchoredPlacement {
  const samples = placement.anchor.mode === "streamed-perimeter" && placement.footprintM.length
    ? placement.footprintM
    : [[placement.positionM[0], placement.positionM[2]] as [number, number]];
  const heights = samples.map(([x, z]) => groundAt(x, z));
  const known = heights.filter((h): h is number => h !== null && Number.isFinite(h));
  if (known.length !== heights.length || !known.length) {
    return {
      y: placement.positionM[1], gapM: Infinity, buryM: 0,
      requestedBuryM: 0, overBuryM: 0,
      terrainMinM: NaN, terrainMaxM: NaN, groundLineM: NaN,
      pivotToBaseM: placement.anchor.originOffsetM[2] * placement.scale,
      complete: false,
    };
  }
  const lo = Math.min(...known);
  const hi = Math.max(...known);
  // Seat the whole planar base through the measured height range; the
  // additional slope term is the small class/asset margin. Pads should have
  // almost no range after grading, while stilts are allowed to bridge it.
  const slopeBury = placement.anchor.groundFit === "stilt"
    ? (hi - lo) * placement.anchor.slopeBuryPerM
    : (hi - lo) * (1 + placement.anchor.slopeBuryPerM);
  const requestedBuryM = placement.anchor.buryM + slopeBury;
  const buryM = Math.min(placement.anchor.buryCapM, requestedBuryM);
  const pivotToBase = placement.anchor.originOffsetM[2] * placement.scale;
  return {
    y: hi + pivotToBase - buryM,
    gapM: placement.anchor.groundFit === "stilt" ? 0 : Math.max(0, hi - lo - buryM),
    buryM,
    requestedBuryM,
    overBuryM: Math.max(0, requestedBuryM - placement.anchor.buryCapM),
    terrainMinM: lo,
    terrainMaxM: hi,
    groundLineM: hi,
    pivotToBaseM: pivotToBase,
    complete: true,
  };
}

export function placementGroundAudit(
  placement: SettlementPlacement,
  anchored: AnchoredPlacement,
): SettlementPlacementGroundAudit {
  const floating = anchored.complete && anchored.gapM > GROUND_EPSILON_M;
  const overBuried = anchored.complete && anchored.overBuryM > GROUND_EPSILON_M;
  const status = !anchored.complete ? "terrain-unavailable"
    : floating && overBuried ? "floating-and-over-buried"
    : floating ? "floating"
    : overBuried ? "over-buried"
    : "grounded";
  return {
    placementId: placement.id,
    settlementId: placement.sourceId,
    status,
    terrainMinM: anchored.complete ? anchored.terrainMinM : null,
    terrainMaxM: anchored.complete ? anchored.terrainMaxM : null,
    groundLineM: anchored.complete ? anchored.groundLineM : null,
    pivotToBaseM: anchored.pivotToBaseM,
    configuredBuryM: placement.anchor.buryM,
    requestedBuryM: anchored.complete ? anchored.requestedBuryM : null,
    appliedBuryM: anchored.complete ? anchored.buryM : null,
    buryCapM: placement.anchor.buryCapM,
    gapM: anchored.complete ? anchored.gapM : null,
    overBuryM: anchored.complete ? anchored.overBuryM : null,
  };
}

/** Keep reports settlement-shaped so a bad place cannot hide in province totals. */
export function settlementGroundAudits(
  settlements: SettlementBundle["settlements"],
  placements: readonly SettlementPlacementGroundAudit[],
): SettlementGroundAudit[] {
  const byId = new Map(placements.map((placement) => [placement.placementId, placement]));
  return settlements.map((settlement) => {
    const rows = settlement.placementIds
      .map((id) => byId.get(id))
      .filter((row): row is SettlementPlacementGroundAudit => row?.settlementId === settlement.id)
      .sort((a, b) => a.placementId.localeCompare(b.placementId));
    const has = (status: string, part: string) => status === part || status.includes(part);
    return {
      settlementId: settlement.id,
      placementsExpected: settlement.placementIds.length,
      placementsAudited: rows.length,
      terrainUnavailable: rows.filter((row) => row.status === "terrain-unavailable").length,
      floating: rows.filter((row) => has(row.status, "floating")).length,
      overBuried: rows.filter((row) => has(row.status, "over-buried")).length,
      maxGapM: Math.max(0, ...rows.map((row) => row.gapM ?? 0)),
      maxOverBuryM: Math.max(0, ...rows.map((row) => row.overBuryM ?? 0)),
      placements: rows,
    };
  });
}

export function footprintDiagonalM(placement: SettlementPlacement): number {
  const points = placement.footprintM;
  if (!points.length) return 8;
  let best = 0;
  for (const a of points) for (const b of points) {
    best = Math.max(best, Math.hypot(a[0] - b[0], a[1] - b[1]));
  }
  return Math.max(1, best);
}
