import type { WaterBoundaryStaticSample, WaterData } from "../waterData";

export interface InlandLeaf { x: number; z: number; step: number }
export interface InlandStageRange { tidalAmplitudeM: number; seasonalAmplitudeM: number }
export function inlandPotentiallyWet(sample: WaterBoundaryStaticSample, stage?: InlandStageRange): boolean {
  const maximumOffset = stage ? stage.tidalAmplitudeM * sample.tideResponse + stage.seasonalAmplitudeM * sample.seasonResponse : 2;
  return sample.supported && sample.waterBodyId !== null && sample.depthProxy + maximumOffset > 0.004
    && (sample.floodAccessOffsetM ?? -Infinity) <= maximumOffset;
}

/** Refine only offending cells, not an entire234m tile because one stream
 * crosses it. Every native sample participates; broad pools cannot vanish
 * between coarse sample points. Rendering can omit only subpixel cells. */
export function inlandAdaptiveLeaves(data: WaterData, tx: number, tz: number, requestedStep: number,
  errorM = 0.04, subpixelM = 0, stage?: InlandStageRange): InlandLeaf[] {
  const size = 65, mpp = data.meta.surface.metresPerPixel;
  const height = new Float64Array(size * size);
  const bodies: (string | null)[] = new Array(size * size);
  const wet = new Uint8Array(size * size);
  const scratch: WaterBoundaryStaticSample = { surfaceBase: 0, depthProxy: 0,
    tideResponse: 0, seasonResponse: 0, supported: false, waterBodyId: null };
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const i = z * size + x, wx = (tx * 64 + x) * mpp, wz = (tz * 64 + z) * mpp;
    const sample = data.boundaryAt(wx, wz, scratch, false);
    height[i] = sample.surfaceBase;
    bodies[i] = sample.supported ? sample.waterBodyId : null;
    wet[i] = inlandPotentiallyWet(sample, stage) && data.rasterClassAt(wx, wz) >= 3 ? 1 : 0;
  }
  const leaves: InlandLeaf[] = [];
  const visit = (x: number, z: number, step: number): void => {
    const a = z * size + x, b = a + step, c = a + step * size, d = c + step;
    let anyWet = false, refine = false;
    for (let dz = 0; dz <= step; dz++) for (let dx = 0; dx <= step; dx++) {
      const i = (z + dz) * size + x + dx;
      anyWet ||= wet[i] !== 0;
      const fx = dx / step, fz = dz / step;
      const triangle = fx + fz <= 1 ? [a, b, c] : [d, c, b];
      if (wet[i] && (triangle.some(v => bodies[v] !== bodies[i]) || !triangle.some(v => wet[v]))) refine = true;
      const interpolated = fx + fz <= 1
        ? height[a] + (height[b] - height[a]) * fx + (height[c] - height[a]) * fz
        : height[d] + (height[c] - height[d]) * (1 - fx) + (height[b] - height[d]) * (1 - fz);
      // Extra fan vertices can consume the other half of the budget. Check
      // dry interior heights too: a buried fan centre must not pull down a pool.
      if (Math.abs(height[i] - interpolated) > errorM * 0.5) refine = true;
    }
    if (!anyWet) return;
    if (step * mpp < subpixelM) return;
    if (refine && step > 1) {
      const half = step / 2;
      visit(x, z, half); visit(x + half, z, half); visit(x, z + half, half); visit(x + half, z + half, half);
    } else leaves.push({ x, z, step });
  };
  for (let z = 0; z < 64; z += requestedStep) for (let x = 0; x < 64; x += requestedStep) visit(x, z, requestedStep);
  return leaves;
}
