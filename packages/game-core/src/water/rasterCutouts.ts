/** Prepared native-channel subtraction for constant standing-water planes.
 * Missing cells are untouched rectangles; present empty cells are fully cut.
 * Positions are final Float32 XZ triangles, with upward winding. */
export interface RasterCutoutDescriptor {
  schemaVersion: 1; file: string; compression: 'gzip'; sha256: string;
  bytes: number; downloadBytes: number; sourceRibbonsSha256: string; crossSectionsSha256?: string;
  gridSize: number; metresPerPixel: number; tileCells: 64; steps: [4, 8, 16];
  cells: number; triangles: number; complete: true;
}
export function validateRasterCutoutMeta(value: unknown): asserts value is RasterCutoutDescriptor {
  const m = value as Partial<RasterCutoutDescriptor> | null;
  const hash = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  if (!m || m.schemaVersion !== 1 || m.complete !== true || m.compression !== 'gzip'
    || typeof m.file !== 'string' || !/^[a-zA-Z0-9_-]+\.bin\.gz$/.test(m.file)
    || !hash(m.sha256) || !hash(m.sourceRibbonsSha256) || (m.crossSectionsSha256 !== undefined && !hash(m.crossSectionsSha256))
    || !Number.isSafeInteger(m.bytes) || m.bytes! < 16 || m.bytes! > 128 * 1024 ** 2 || m.bytes! % 4
    || !Number.isSafeInteger(m.downloadBytes) || m.downloadBytes! < 1 || m.downloadBytes! > 128 * 1024 ** 2
    || !Number.isSafeInteger(m.gridSize) || m.gridSize! < 2 || m.gridSize! > 65536
    || !Number.isFinite(m.metresPerPixel) || m.metresPerPixel! <= 0 || m.tileCells !== 64
    || !Array.isArray(m.steps) || m.steps.join(',') !== '4,8,16'
    || !Number.isSafeInteger(m.cells) || m.cells! < 0 || !Number.isSafeInteger(m.triangles) || m.triangles! < 0
    || m.bytes !== 16 + m.cells! * 8 + m.triangles! * 24)
    throw new Error('Invalid raster water cutout descriptor');
}

export class RasterCutouts {
  private readonly cells = new Map<number, Float32Array>();
  private readonly tileCount: number;
  readonly byteLength: number;
  constructor(readonly meta: RasterCutoutDescriptor, buffer: ArrayBuffer) {
    validateRasterCutoutMeta(meta);
    const header = new DataView(buffer);
    if (buffer.byteLength !== meta.bytes || new TextDecoder().decode(new Uint8Array(buffer, 0, 8)) !== 'ESWCUT01'
      || header.getUint32(8, true) !== 1 || header.getUint32(12, true) !== meta.cells)
      throw new Error('Raster cutout header or byte length mismatch');
    this.tileCount = Math.ceil(meta.gridSize / 64); this.byteLength = buffer.byteLength;
    let offset = 16, triangles = 0;
    for (let i = 0; i < meta.cells; i++) {
      if (offset + 8 > buffer.byteLength) throw new Error('Truncated raster cutout record');
      const key = header.getUint32(offset, true), count = header.getUint32(offset + 4, true); offset += 8;
      const col = key % 16, row = Math.floor(key / 16) % 16;
      const tx = Math.floor(key / 256) % this.tileCount, tz = Math.floor(key / 256 / this.tileCount) % this.tileCount;
      const variant = Math.floor(key / 256 / this.tileCount ** 2), step = meta.steps[variant];
      if (!step || row >= 64 / step || col >= 64 / step || this.cells.has(key) || offset + count * 24 > buffer.byteLength)
        throw new Error('Invalid raster cutout address or triangle count');
      const values = new Float32Array(buffer, offset, count * 6); offset += count * 24; triangles += count;
      const minX = Math.fround((tx * 64 + col * step) * meta.metresPerPixel), maxX = Math.fround((tx * 64 + (col + 1) * step) * meta.metresPerPixel);
      const minZ = Math.fround((tz * 64 + row * step) * meta.metresPerPixel), maxZ = Math.fround((tz * 64 + (row + 1) * step) * meta.metresPerPixel);
      for (let j = 0; j < values.length; j += 2) {
        if (!Number.isFinite(values[j]) || !Number.isFinite(values[j + 1]) || values[j] < minX || values[j] > maxX || values[j + 1] < minZ || values[j + 1] > maxZ)
          throw new Error('Raster cutout vertex lies outside its cell');
      }
      for (let j = 0; j < values.length; j += 6) {
        const cross = (values[j + 2] - values[j]) * (values[j + 5] - values[j + 1]) - (values[j + 3] - values[j + 1]) * (values[j + 4] - values[j]);
        if (!(cross < 0)) throw new Error('Raster cutout triangle has invalid winding');
      }
      this.cells.set(key, values);
    }
    if (offset !== buffer.byteLength || triangles !== meta.triangles) throw new Error('Raster cutout totals mismatch');
  }
  triangles(tx: number, tz: number, step: number, row: number, col: number): Float32Array | undefined {
    const variant = this.meta.steps.findIndex(value => value === step);
    if (variant < 0) return undefined;
    return this.cells.get((((variant * this.tileCount + tz) * this.tileCount + tx) * 16 + row) * 16 + col);
  }
}
