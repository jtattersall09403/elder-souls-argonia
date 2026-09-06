export interface OceanGridSpec { uniformCell: number; uniformRadius: number; n: number; halfExtent: number }
export const OCEAN_NEAR_CELL_M = 0.125;
export const OCEAN_NEAR_RADIUS_M = 6;

/** Same total vertex count, redistributed to resolve physical short waves
 * beside the player. Near vertices retain a fixed 1/8m world lattice. */
export function oceanAxisCoords(spec: OceanGridSpec): Float32Array {
  const half = spec.n / 2, steps: number[] = [0];
  const nearRadius = OCEAN_NEAR_RADIUS_M + OCEAN_NEAR_CELL_M * 2;
  while (steps.at(-1)! < nearRadius) steps.push(steps.at(-1)! + OCEAN_NEAR_CELL_M);
  let cell = OCEAN_NEAR_CELL_M;
  while (cell < spec.uniformCell) {
    cell = Math.min(spec.uniformCell, cell * 1.14);
    steps.push(steps.at(-1)! + cell);
  }
  const radius = Math.min(spec.uniformRadius, spec.uniformCell < 1.5 ? 70 : 50);
  while (steps.at(-1)! + cell <= radius && steps.length < half - 12) steps.push(steps.at(-1)! + cell);
  const remaining = half - steps.length + 1, start = steps.at(-1)!, target = spec.halfExtent - start;
  if (remaining < 1 || target <= 0) throw new RangeError('Ocean grid requires sufficient horizon extent and vertices');
  let lo = 1.000001, hi = 4;
  for (let iteration = 0; iteration < 60; iteration++) {
    const g = (lo + hi) / 2, sum = cell * g * (g ** remaining - 1) / (g - 1);
    if (sum > target) hi = g; else lo = g;
  }
  const growth = (lo + hi) / 2;
  for (let i = 1; i <= remaining; i++) steps.push(start + cell * growth * (growth ** i - 1) / (growth - 1));
  const axis = new Float32Array(spec.n + 1);
  for (let i = 0; i <= half; i++) { axis[half + i] = steps[i]; axis[half - i] = -steps[i]; }
  return axis;
}

export function oceanGridCentre(coordinate: number): number {
  return Math.round(coordinate / OCEAN_NEAR_CELL_M) * OCEAN_NEAR_CELL_M;
}
