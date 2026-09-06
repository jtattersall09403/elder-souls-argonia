/** Offline artifact-gate selection only; no runtime renderer imports. */
import type { WaterData } from './waterData';

export interface OwnershipEdgeProbe {
  id: string;
  point: number;
  inside: readonly number[];
  outside: readonly number[];
}

/** Conservative union before native subtraction: filtering by already
 * submitted faces would hide the very missing-standing-coverage defect the
 * gate must catch. The caller subsequently checks actual generated meshes.
 * Each endpoint costs one owner/stage sample and one exact bed lookup, not
 * one geometry build or one world query per stage. */
export function standingEdgeStageUnion(
  edges: readonly OwnershipEdgeProbe[],
  data: Pick<WaterData, 'boundaryAt' | 'rasterClassAt'>,
  groundHeight: (x: number, z: number) => number | null,
  stages: readonly { tide: number; season: number }[],
): { edge: OwnershipEdgeProbe; stageMask: number }[] {
  if (stages.length > 30) throw Error('Stage-union bit mask supports at most 30 states');
  const selected: { edge: OwnershipEdgeProbe; stageMask: number }[] = [];
  for (const edge of edges) {
    let stageMask = 0;
    for (const [x, z] of [edge.inside, edge.outside]) {
      if (!Number.isFinite(x) || !Number.isFinite(z)) throw Error(`Invalid owner edge coordinate: ${edge.id}`);
      const sample = data.boundaryAt(x, z, undefined, false);
      if (!sample.supported || sample.waterBodyId === null || data.rasterClassAt(x, z) < 3) continue;
      const bed = groundHeight(x, z);
      if (bed === null || !Number.isFinite(bed)) throw Error(`Missing native standing-boundary bed: ${edge.id} ${x},${z}`);
      for (let i = 0; i < stages.length; i++) {
        const offset = stages[i].tide * sample.tideResponse + stages[i].season * sample.seasonResponse;
        if (offset + .001 >= (sample.floodAccessOffsetM ?? -Infinity) && sample.surfaceBase + offset - bed > .004) stageMask |= 1 << i;
      }
    }
    if (stageMask) selected.push({ edge, stageMask });
  }
  return selected;
}
