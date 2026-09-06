import type { WaterBoundaryStaticSample, WaterData } from "../waterData";

export interface InlandLeaf { x: number; z: number; step: number; partition?: boolean }
export interface InlandStageRange { tidalAmplitudeM: number; seasonalAmplitudeM: number; lowTideAmplitudeM?: number; drySeasonAmplitudeM?: number }
export type RasterWaterDomain = 'inland' | 'marine';
export function rasterWaterClassInDomain(klass: number, domain: RasterWaterDomain): boolean {
  return domain === 'marine' ? klass >= 1 && klass < 3 : klass >= 3;
}

function fieldInterpolationError(field: Float64Array, i: number, a: number, b: number, c: number, d: number, fx: number, fz: number): number {
  return field[i] - (fx + fz <= 1
    ? field[a] + (field[b] - field[a]) * fx + (field[c] - field[a]) * fz
    : field[d] + (field[c] - field[d]) * (1 - fx) + (field[b] - field[d]) * (1 - fz));
}
export function inlandPotentiallyWet(sample: WaterBoundaryStaticSample, stage?: InlandStageRange): boolean {
  const maximumOffset = stage ? stage.tidalAmplitudeM * sample.tideResponse + stage.seasonalAmplitudeM * sample.seasonResponse : 2;
  return sample.supported && sample.waterBodyId !== null && sample.depthProxy + maximumOffset > 0.004
    && (sample.floodAccessOffsetM ?? -Infinity) <= maximumOffset;
}

/** Refine only offending cells, not an entire234m tile because one stream
 * crosses it. Every native sample participates; broad pools cannot vanish
 * between coarse sample points. Rendering can omit only subpixel cells. */
export function inlandAdaptiveLeaves(data: WaterData, tx: number, tz: number, requestedStep: number,
  errorM = 0.04, subpixelM = 0, stage?: InlandStageRange, domain: RasterWaterDomain = 'inland'): InlandLeaf[] {
  const build = inlandAdaptiveLeavesSteps(data, tx, tz, requestedStep, errorM, subpixelM, stage, domain);
  for (;;) { const result = build.next(); if (result.done) return result.value; }
}

/** Same deterministic geometry oracle, yielding after at most64 native tests. */
export function* inlandAdaptiveLeavesSteps(data: WaterData, tx: number, tz: number, requestedStep: number,
  errorM = 0.04, subpixelM = 0, stage?: InlandStageRange, domain: RasterWaterDomain = 'inland'): Generator<void, InlandLeaf[]> {
  const size = 65, mpp = data.meta.surface.metresPerPixel;
  const height = new Float64Array(size * size);
  const stageVaries = !!stage && (stage.tidalAmplitudeM !== 0 || stage.seasonalAmplitudeM !== 0 || (stage.lowTideAmplitudeM ?? 0) !== 0 || (stage.drySeasonAmplitudeM ?? 0) !== 0);
  // Cache the same one-time boundary samples: extrema never reread World or
  // allocate five complete stage-height fields for each incremental tile.
  const tide = stageVaries ? new Float64Array(size * size) : undefined;
  const season = stageVaries ? new Float64Array(size * size) : undefined;
  const bodies: (string | null)[] = new Array(size * size);
  const wet = new Uint8Array(size * size);
  const classes = new Uint8Array(size * size);
  const support = new Uint8Array(size * size);
  const scratch: WaterBoundaryStaticSample = { surfaceBase: 0, depthProxy: 0,
    tideResponse: 0, seasonResponse: 0, supported: false, waterBodyId: null };
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const i = z * size + x, wx = (tx * 64 + x) * mpp, wz = (tz * 64 + z) * mpp;
    const sample = data.boundaryAt(wx, wz, scratch, false);
    height[i] = sample.surfaceBase;
    if (tide && season) { tide[i] = sample.tideResponse; season[i] = sample.seasonResponse; }
    bodies[i] = sample.supported ? sample.waterBodyId : null;
    classes[i] = data.rasterClassAt(wx, wz);
    support[i] = sample.supported ? 1 : 0;
    wet[i] = inlandPotentiallyWet(sample, stage) && rasterWaterClassInDomain(classes[i], domain) ? 1 : 0;
    if ((i & 63) === 63) yield;
  }
  const leaves: InlandLeaf[] = [];
  let visited = 0;
  function* visit(x: number, z: number, step: number): Generator<void> {
    const a = z * size + x, b = a + step, c = a + step * size, d = c + step;
    let anyWet = false, refine = false, classMismatch = false, partition = false;
    for (let dz = 0; dz <= step; dz++) for (let dx = 0; dx <= step; dx++) {
      const i = (z + dz) * size + x + dx;
      anyWet ||= wet[i] !== 0;
      const fx = dx / step, fz = dz / step;
      const triangle = fx + fz <= 1 ? [a, b, c] : [d, c, b];
      classMismatch ||= triangle.some(v => classes[v] !== classes[i]);
      partition ||= classes[i] !== classes[a] || bodies[i] !== bodies[a] || support[i] !== support[a];
      if (wet[i] && (triangle.some(v => bodies[v] !== bodies[i]) || !triangle.some(v => wet[v]))) refine = true;
      const interpolated = fx + fz <= 1
        ? height[a] + (height[b] - height[a]) * fx + (height[c] - height[a]) * fz
        : height[d] + (height[c] - height[d]) * (1 - fx) + (height[b] - height[d]) * (1 - fz);
      // Extra fan vertices can consume the other half of the budget. Check
      // dry interior heights too: a buried fan centre must not pull down a pool.
      if (Math.abs(height[i] - interpolated) > errorM * 0.5) refine = true;
      if (tide && season && stage) {
        const baseError = height[i] - interpolated;
        const tideError = fieldInterpolationError(tide, i, a, b, c, d, fx, fz);
        const seasonError = fieldInterpolationError(season, i, a, b, c, d, fx, fz);
        const tideLow = -tideError * (stage.lowTideAmplitudeM ?? stage.tidalAmplitudeM);
        const tideHigh = tideError * stage.tidalAmplitudeM;
        const seasonLow = -seasonError * (stage.drySeasonAmplitudeM ?? .2 * stage.seasonalAmplitudeM);
        const seasonHigh = seasonError * stage.seasonalAmplitudeM;
        // Affine interpolation error reaches its extrema at stage corners.
        const low = baseError + Math.min(tideLow, tideHigh) + Math.min(seasonLow, seasonHigh);
        const high = baseError + Math.max(tideLow, tideHigh) + Math.max(seasonLow, seasonHigh);
        if (Math.max(Math.abs(low), Math.abs(high)) > errorM * 0.5) refine = true;
      }
      if (((dz * (step + 1) + dx) & 63) === 63) yield;
    }
    if (!anyWet) return;
    // A semantic island can miss all four corners and the centre while
    // sharing their owner/flat level. Inspect every cached native class.
    refine ||= data.meta.surface.nativeChannelCoverage === true && classMismatch;
    if (step * mpp < subpixelM) return;
    if (refine && step > 1) {
      const half = step / 2;
      yield* visit(x, z, half); yield* visit(x + half, z, half); yield* visit(x, z + half, half); yield* visit(x + half, z + half, half);
    } else leaves.push(partition ? { x, z, step, partition: true } : { x, z, step });
    if ((++visited & 31) === 0) yield;
  }
  for (let z = 0; z < 64; z += requestedStep) for (let x = 0; x < 64; x += requestedStep) yield* visit(x, z, requestedStep);
  return leaves;
}
