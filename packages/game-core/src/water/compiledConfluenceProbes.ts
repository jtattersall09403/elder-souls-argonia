/** Offline artifact-gate selection only; no runtime renderer imports. */
import type { WaterBoundaryStaticSample, WaterData } from './waterData';

export const CONFLUENCE_REPRO_SITES = [
  { id: 'owner-repro-2370-190', x: 2370, z: 190 },
  { id: 'owner-repro-1960-220', x: 1960, z: 220 },
  { id: 'owner-repro-3840-1120', x: 3840, z: 1120 },
] as const;

export interface CompiledConfluenceProbe { x: number; z: number; label: string; site?: string }

export interface InlandVertexBinding {
  waterOverrideX: number;
  waterGround: number;
  waterLevelResponse: readonly [number, number, number];
  waterBodyIndex: number;
}
type InlandStillVertex = Pick<WaterBoundaryStaticSample, 'surfaceBase' | 'depthProxy' | 'tideResponse' | 'seasonResponse'>;

/** Shader binding discriminator, not support/wetness: z=1 makes even a dry
 * explicit boundary vertex authoritative. z=0 retains raster sampling. */
export function resolveInlandStillVertex(sampled: InlandStillVertex, binding?: InlandVertexBinding): InlandStillVertex {
  return binding && binding.waterLevelResponse[2] > 0.5 ? {
    surfaceBase: binding.waterOverrideX,
    depthProxy: binding.waterOverrideX - binding.waterGround,
    tideResponse: binding.waterLevelResponse[0],
    seasonResponse: binding.waterLevelResponse[1],
  } : sampled;
}

/** Exact owner coordinates plus three fixed eight-direction rings. Never
 * relocate a reported dry/excluded point to the nearest convenient water. */
export function confluenceReproProbes(): CompiledConfluenceProbe[] {
  return CONFLUENCE_REPRO_SITES.flatMap(site => [0, 0.25, 10, 30].flatMap(radius =>
    Array.from({ length: radius ? 8 : 1 }, (_, direction) => ({
      x: site.x + radius * Math.cos(direction * Math.PI / 4),
      z: site.z + radius * Math.sin(direction * Math.PI / 4),
      site: site.id, label: `${site.id}:radius${radius}:direction${direction}`,
    }))));
}

/** Still-water vertex shader oracle: heights and level responses are sampled
 * at uploaded vertex XZ then barycentrically interpolated by the GPU. Do not
 * replace this with the raster value at the fragment or omit dry vertices. */
export function interpolateInlandStillFace(vertices: readonly InlandStillVertex[], weights: readonly number[]) {
  if (vertices.length !== 3 || weights.length !== 3) throw Error('Inland oracle requires one triangle');
  return vertices.reduce((out, sample, i) => ({
    height: out.height + weights[i] * sample.surfaceBase,
    tide: out.tide + weights[i] * sample.tideResponse,
    season: out.season + weights[i] * sample.seasonResponse,
  }), { height: 0, tide: 0, season: 0 });
}

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
