export interface WaterGeometryCost { triangles: number; bytes: number }

/** One injected ledger per water surface. Replacement is atomic: a failed
 * reservation leaves the caller's old allocation available and unchanged. */
export class WaterGeometryBudget {
  private readonly allocations = new Map<object, WaterGeometryCost>();
  private triangles = 0;
  private bytes = 0;
  constructor(readonly maxTriangles: number, readonly maxBytes: number) {}
  get usage(): Readonly<WaterGeometryCost> { return { triangles: this.triangles, bytes: this.bytes }; }
  replace(owner: object, next: WaterGeometryCost): boolean {
    if (!Number.isSafeInteger(next.triangles) || !Number.isSafeInteger(next.bytes) || next.triangles < 0 || next.bytes < 0)
      throw new Error('Invalid water geometry reservation');
    const previous = this.allocations.get(owner);
    const triangles = this.triangles - (previous?.triangles ?? 0) + next.triangles;
    const bytes = this.bytes - (previous?.bytes ?? 0) + next.bytes;
    if (triangles > this.maxTriangles || bytes > this.maxBytes) return false;
    this.allocations.set(owner, { ...next }); this.triangles = triangles; this.bytes = bytes;
    return true;
  }
  release(owner: object): void {
    const previous = this.allocations.get(owner);
    if (!previous) return;
    this.triangles -= previous.triangles; this.bytes -= previous.bytes; this.allocations.delete(owner);
  }
}

export function createWaterGeometryBudget(low: boolean): WaterGeometryBudget {
  return new WaterGeometryBudget(2048576, (low ? 128 : 160) * 1024 * 1024);
}
