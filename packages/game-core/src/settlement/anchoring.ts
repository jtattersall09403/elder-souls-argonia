import type { SettlementPlacement, TerrainHeight } from "./types";

export interface AnchoredPlacement {
  y: number;
  gapM: number;
  buryM: number;
  complete: boolean;
}

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
    return { y: placement.positionM[1], gapM: Infinity, buryM: 0, complete: false };
  }
  const lo = Math.min(...known);
  const hi = Math.max(...known);
  // Seat the whole planar base through the measured height range; the
  // additional slope term is the small class/asset margin. Pads should have
  // almost no range after grading, while stilts are allowed to bridge it.
  const slopeBury = placement.anchor.groundFit === "stilt"
    ? (hi - lo) * placement.anchor.slopeBuryPerM
    : (hi - lo) * (1 + placement.anchor.slopeBuryPerM);
  const buryM = Math.min(placement.anchor.buryCapM, placement.anchor.buryM + slopeBury);
  const pivotToBase = placement.anchor.originOffsetM[2] * placement.scale;
  return {
    y: hi + pivotToBase - buryM,
    gapM: placement.anchor.groundFit === "stilt" ? 0 : Math.max(0, hi - lo - buryM),
    buryM,
    complete: true,
  };
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
