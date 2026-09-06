import type { WaterData, WaterBoundaryStaticSample } from "../waterData";

/** Preserve native wet features and the compiled level field when choosing
 * distant raster geometry. Connected-body identity does not imply flatness.
 * Includes the actual native-perimeter fan interpolation, not just the
 * interior cell diagonal. */
export function inlandEffectiveStep(data: WaterData, tx: number, tz: number, requestedStep: number): number {
  if (requestedStep <= 1) return 1;
  const size = 65, mpp = data.meta.surface.metresPerPixel;
  const height = new Float64Array(size * size);
  const body: (string | null)[] = new Array(size * size);
  const wet = new Uint8Array(size * size), potential = new Uint8Array(size * size);
  const scratch: WaterBoundaryStaticSample = { surfaceBase: 0, depthProxy: 0, tideResponse: 0,
    seasonResponse: 0, supported: false, waterBodyId: null };
  let wetCount = 0;
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const i = z * size + x, wx = (tx * 64 + x) * mpp, wz = (tz * 64 + z) * mpp;
    const sample = data.boundaryAt(wx, wz, scratch, false);
    height[i] = data.surfaceBase(wx, wz);
    body[i] = sample.supported ? sample.waterBodyId : null;
    potential[i] = sample.supported && sample.depthProxy > -2 ? 1 : 0;
    wet[i] = sample.supported && sample.depthProxy > 0.004 && sample.waterBodyId !== null
      && data.rasterClassAt(wx, wz) >= 3 ? 1 : 0;
    wetCount += wet[i];
  }
  if (!wetCount) return requestedStep;
  for (let step = requestedStep; step > 1; step /= 2) {
    let valid = true;
    for (let z = 0; z < size && valid; z++) for (let x = 0; x < size; x++) {
      const i = z * size + x;
      if (!wet[i]) continue;
      const x0 = Math.min(64 - step, Math.floor(x / step) * step);
      const z0 = Math.min(64 - step, Math.floor(z / step) * step);
      const fx = (x - x0) / step, fz = (z - z0) / step;
      const a = z0 * size + x0, b = a + step, c = a + step * size, d = c + step;
      let vertices = fx + fz <= 1 ? [a, b, c] : [d, c, b];
      let interpolated = fx + fz <= 1
        ? height[a] + (height[b] - height[a]) * fx + (height[c] - height[a]) * fz
        : height[d] + (height[c] - height[d]) * (1 - fx) + (height[b] - height[d]) * (1 - fz);
      if (x0 === 0 || z0 === 0 || x0 === 64 - step || z0 === 64 - step) {
        const center = (z0 + step / 2) * size + x0 + step / 2;
        const dx = fx - 0.5, dz = fz - 0.5;
        const radial = 2 * Math.max(Math.abs(dx), Math.abs(dz));
        if (radial < 1e-12) { interpolated = height[center]; vertices = [center]; }
        else {
          const vertical = Math.abs(dx) >= Math.abs(dz);
          const fixed = vertical ? x0 + (dx > 0 ? step : 0) : z0 + (dz > 0 ? step : 0);
          const edgeStep = fixed === 0 || fixed === 64 ? 1 : step;
          const origin = vertical ? z0 : x0;
          const along = origin + step * (0.5 + (vertical ? dz : dx) / radial);
          const start = Math.max(origin, Math.min(origin + step - edgeStep,
            origin + Math.floor((along - origin) / edgeStep) * edgeStep));
          const edge0 = vertical ? start * size + fixed : fixed * size + start;
          const edge1 = edge0 + (vertical ? size : 1) * edgeStep;
          const t = (along - start) / edgeStep;
          interpolated = height[center] * (1 - radial) + (height[edge0] * (1 - t) + height[edge1] * t) * radial;
          vertices = [center, edge0, edge1];
        }
      }
      // Otherwise the coarse triangle is omitted entirely or joins another
      // connected component while missing an intervening native wet point.
      if (vertices.some(v => body[v] !== body[i]) || !vertices.some(v => potential[v])) { valid = false; break; }
      if (Math.abs(interpolated - height[i]) > 0.04) { valid = false; break; }
    }
    if (valid) return step;
  }
  return 1;
}
