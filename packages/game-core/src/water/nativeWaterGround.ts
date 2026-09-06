export interface NativeWaterVertex {
  x: number; y: number; z: number; groundM?: number;
  accessOffsetM?: number; tideResponse?: number; seasonResponse?: number;
}
export interface NativeWaterTriangle { a: NativeWaterVertex; b: NativeWaterVertex; c: NativeWaterVertex }
export interface NativeWaterGroundDescriptor {
  file: string; sha256: string; bytes: number; downloadBytes: number; compression: 'gzip';
  nativeManifestSha256: string; bedOverlaySha256: string; topologySha256: string;
}
export interface NativeGroundAtlasLayout {
  axisOffset: number; tileIndexOffset: number; tileRecordSize: number; scalarCount: number;
  gridSize: number; metresPerPixel: number; tileCells: number; tileStride: number;
}
type XZ = { x: number; z: number };
const cross = (a: XZ, b: XZ, c: XZ) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);

/** Sparse corrected NATIVE PNG terrain, independent of runtime chunk-loading
 * order. Tiles align to source chunks; duplicate chunk-border quantisation is
 * intentionally retained on each side. No Gaussian terrain enters this file. */
export class NativeWaterGround {
  readonly gridSize: number;
  readonly metresPerPixel: number;
  readonly tileCells: number;
  readonly chunkCells: number;
  readonly byteLength: number;
  readonly tileCount: number;
  private readonly tileStride: number;
  private readonly floats: Float32Array;
  private readonly tiles = new Map<number, number>();
  private readonly flipped = new Set<number>();

  constructor(buffer: ArrayBuffer) {
    if (buffer.byteLength < 48 || buffer.byteLength % 4 || buffer.byteLength > 128 * 1024 ** 2) throw new Error('Invalid native water ground size');
    const bytes = new Uint8Array(buffer), header = new DataView(buffer);
    if (String.fromCharCode(...bytes.subarray(0, 8)) !== 'ESWGRND1' || header.getUint32(8, true) !== 1) throw new Error('Unsupported native water ground format');
    this.gridSize = header.getUint32(12, true); this.tileCells = header.getUint32(16, true);
    this.tileCount = header.getUint32(20, true); const flipCount = header.getUint32(24, true);
    this.metresPerPixel = header.getFloat64(32, true); this.chunkCells = header.getUint32(40, true);
    if (this.gridSize < 2 || this.gridSize > 65536 || this.tileCells < 1 || this.tileCells > 64
      || !this.chunkCells || this.chunkCells % this.tileCells || (this.gridSize - 1) % this.tileCells
      || !Number.isFinite(this.metresPerPixel) || this.metresPerPixel <= 0
      || header.getUint32(28, true) || header.getUint32(44, true)) throw new Error('Invalid native water ground lattice');
    this.tileStride = (this.gridSize - 1) / this.tileCells;
    const recordFloats = 1 + (this.tileCells + 1) ** 2;
    if (this.tileCount > this.tileStride ** 2 || flipCount > (this.gridSize - 1) ** 2
      || 48 + flipCount * 4 + this.tileCount * recordFloats * 4 !== buffer.byteLength) throw new Error('Invalid native water ground counts');
    this.floats = new Float32Array(buffer); this.byteLength = buffer.byteLength;
    const integers = new Uint32Array(buffer);
    let previous = -1;
    for (let i = 0; i < flipCount; i++) {
      const cell = integers[12 + i];
      if (cell <= previous || cell >= (this.gridSize - 1) ** 2) throw new Error('Invalid native ground flip order');
      this.flipped.add(cell); previous = cell;
    }
    previous = -1;
    for (let i = 0; i < this.tileCount; i++) {
      const offset = 12 + flipCount + i * recordFloats, tile = integers[offset];
      if (tile <= previous || tile >= this.tileStride ** 2) throw new Error('Invalid native ground tile order');
      for (let vertex = 1; vertex < recordFloats; vertex++) if (!Number.isFinite(this.floats[offset + vertex])) throw new Error('Non-finite native ground height');
      this.tiles.set(tile, offset + 1); previous = tile;
    }
  }

  gpuLayout(startScalar: number): NativeGroundAtlasLayout {
    const axisOffset = startScalar, tileIndexOffset = axisOffset + this.gridSize;
    const tileRecordSize = (this.tileCells + 1) ** 2 + Math.ceil(this.tileCells ** 2 / 16);
    return { axisOffset, tileIndexOffset, tileRecordSize,
      scalarCount: tileIndexOffset + this.tileStride ** 2 + this.tileCount * tileRecordSize,
      gridSize: this.gridSize, metresPerPixel: this.metresPerPixel, tileCells: this.tileCells, tileStride: this.tileStride };
  }

  /** Four scalar samples per RGBA texel. Original Float32 native axes are
   * stored too: multiplying an F32 mpp uniform at kilometre distances can
   * otherwise choose the wrong side of a steep terrain crease. */
  writeGpuAtlas(out: Float32Array, startScalar: number): NativeGroundAtlasLayout {
    const layout = this.gpuLayout(startScalar);
    if (out.length < layout.scalarCount) throw new Error('Native ground atlas buffer is too small');
    for (let i = 0; i < this.gridSize; i++) out[layout.axisOffset + i] = this.coordinate(i);
    out.fill(0, layout.tileIndexOffset, layout.scalarCount);
    const heights = (this.tileCells + 1) ** 2;
    let destination = layout.tileIndexOffset + this.tileStride ** 2;
    for (const [tile, source] of this.tiles) {
      out[layout.tileIndexOffset + tile] = destination;
      for (let i = 0; i < heights; i++) out[destination + i] = this.floats[source + i];
      destination += layout.tileRecordSize;
    }
    for (const cell of this.flipped) {
      const x = cell % (this.gridSize - 1), z = Math.floor(cell / (this.gridSize - 1));
      const tile = Math.floor(z / this.tileCells) * this.tileStride + Math.floor(x / this.tileCells);
      const start = out[layout.tileIndexOffset + tile];
      if (!start) continue;
      const local = (z % this.tileCells) * this.tileCells + x % this.tileCells;
      const word = start + heights + Math.floor(local / 16);
      out[word] = (out[word] | 0) | (1 << (local % 16));
    }
    return layout;
  }

  private coordinate(cell: number): number { return Math.fround(cell * this.metresPerPixel); }
  private cellAt(coordinate: number): number {
    let cell = Math.min(this.gridSize - 2, Math.max(0, Math.floor(coordinate / this.metresPerPixel)));
    // Match actual uploaded Float32 XZ, not idealised double-precision lines.
    if (cell > 0 && coordinate < this.coordinate(cell)) cell--;
    if (cell < this.gridSize - 2 && coordinate >= this.coordinate(cell + 1)) cell++;
    return cell;
  }
  private cellOffset(x: number, z: number): number | null {
    const tx = Math.floor(x / this.tileCells), tz = Math.floor(z / this.tileCells);
    const offset = this.tiles.get(tz * this.tileStride + tx);
    if (offset === undefined) return null;
    return offset + (z % this.tileCells) * (this.tileCells + 1) + x % this.tileCells;
  }

  sample(x: number, z: number): number | null {
    const extent = this.coordinate(this.gridSize - 1);
    if (!Number.isFinite(x) || !Number.isFinite(z) || x < 0 || z < 0 || x > extent || z > extent) return null;
    const cx = this.cellAt(x), cz = this.cellAt(z), offset = this.cellOffset(cx, cz);
    if (offset === null) return null;
    const h0 = this.floats[offset], h1 = this.floats[offset + 1];
    const h2 = this.floats[offset + this.tileCells + 1], h3 = this.floats[offset + this.tileCells + 2];
    const tx = (x - this.coordinate(cx)) / (this.coordinate(cx + 1) - this.coordinate(cx));
    const tz = (z - this.coordinate(cz)) / (this.coordinate(cz + 1) - this.coordinate(cz));
    if (this.flipped.has(cz * (this.gridSize - 1) + cx)) return tx >= tz
      ? h0 * (1 - tx) + h1 * (tx - tz) + h3 * tz
      : h0 * (1 - tz) + h2 * (tz - tx) + h3 * tx;
    return tx + tz <= 1 ? h0 * (1 - tx - tz) + h1 * tx + h2 * tz
      : h3 * (tx + tz - 1) + h1 * (1 - tz) + h2 * (1 - tx);
  }

  cellKeyAt(x: number, z: number): number | null {
    const extent = this.coordinate(this.gridSize - 1);
    if (!Number.isFinite(x) || !Number.isFinite(z) || x < 0 || z < 0 || x > extent || z > extent) return null;
    return this.cellAt(z) * (this.gridSize - 1) + this.cellAt(x);
  }

  /** Conservative local F32 clipping/height interpolation error envelope,
   * for diagnostics. Slopes include neighbouring faces at a crossed crease;
   * this is not a global epsilon that excuses arbitrary bed mismatches. */
  roundoffBoundAt(x: number, z: number): number | null {
    const cell = this.cellKeyAt(x, z);
    if (cell === null) return null;
    const cx = cell % (this.gridSize - 1), cz = Math.floor(cell / (this.gridSize - 1));
    let gx = 0, gz = 0, height = 0, found = false;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const ix = cx + dx, iz = cz + dz;
      if (ix < 0 || iz < 0 || ix >= this.gridSize - 1 || iz >= this.gridSize - 1) continue;
      const offset = this.cellOffset(ix, iz);
      if (offset === null) continue;
      found = true;
      const a = this.floats[offset], b = this.floats[offset + 1], c = this.floats[offset + this.tileCells + 1], d = this.floats[offset + this.tileCells + 2];
      gx = Math.max(gx, Math.abs(b - a) / (this.coordinate(ix + 1) - this.coordinate(ix)), Math.abs(d - c) / (this.coordinate(ix + 1) - this.coordinate(ix)));
      gz = Math.max(gz, Math.abs(c - a) / (this.coordinate(iz + 1) - this.coordinate(iz)), Math.abs(d - b) / (this.coordinate(iz + 1) - this.coordinate(iz)));
      height = Math.max(height, Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d));
    }
    const ulp = (value: number) => value > 0 ? 2 ** Math.max(-149, Math.floor(Math.log2(value)) - 23) : 2 ** -149;
    return found ? 2 * (gx * ulp(x + this.metresPerPixel * 2) + gz * ulp(z + this.metresPerPixel * 2) + ulp(height)) : null;
  }

  refineTriangle(a: NativeWaterVertex, b: NativeWaterVertex, c: NativeWaterVertex): NativeWaterTriangle[] {
    return this.refine(a, b, c);
  }

  /** Point-query twin: identical children, but only the queried native cell.
   * Physics need not construct all million far-away bank-margin triangles. */
  refineTriangleAt(a: NativeWaterVertex, b: NativeWaterVertex, c: NativeWaterVertex, x: number, z: number): NativeWaterTriangle[] {
    const cell = this.cellKeyAt(x, z);
    return cell === null ? [] : this.refine(a, b, c, cell);
  }

  private refine(a: NativeWaterVertex, b: NativeWaterVertex, c: NativeWaterVertex, onlyCell?: number): NativeWaterTriangle[] {
    const area = cross(a, b, c);
    if (Math.abs(area) < 1e-10) return [];
    const minX = Math.min(a.x, b.x, c.x), maxX = Math.max(a.x, b.x, c.x);
    const minZ = Math.min(a.z, b.z, c.z), maxZ = Math.max(a.z, b.z, c.z);
    const extent = this.coordinate(this.gridSize - 1);
    if (maxX < 0 || maxZ < 0 || minX > extent || minZ > extent) return [];
    // Potential coastal bank envelopes can cross the province boundary.
    // Clip to actual native faces there; missing INNER tiles remain fatal.
    let x0 = this.cellAt(Math.max(0, minX)), x1 = this.cellAt(Math.min(extent, maxX));
    let z0 = this.cellAt(Math.max(0, minZ)), z1 = this.cellAt(Math.min(extent, maxZ));
    if (onlyCell !== undefined) {
      const cx = onlyCell % (this.gridSize - 1), cz = Math.floor(onlyCell / (this.gridSize - 1));
      x0 = Math.max(x0, cx); x1 = Math.min(x1, cx); z0 = Math.max(z0, cz); z1 = Math.min(z1, cz);
    }
    const out: NativeWaterTriangle[] = [];
    const vertex = (p: XZ): NativeWaterVertex => {
      const x = Math.fround(Math.max(0, Math.min(extent, p.x))), z = Math.fround(Math.max(0, Math.min(extent, p.z)));
      const q = { x, z }, wa = cross(b, c, q) / area, wb = cross(c, a, q) / area, wc = 1 - wa - wb;
      const interpolate = (key: 'accessOffsetM' | 'tideResponse' | 'seasonResponse') => a[key] === undefined || b[key] === undefined || c[key] === undefined
        ? undefined : Math.fround(a[key]! * wa + b[key]! * wb + c[key]! * wc);
      const ground = this.sample(x, z);
      if (ground === null) throw new Error(`Native water ground does not cover refined vertex ${x},${z}`);
      const y = Math.fround(a.y * wa + b.y * wb + c.y * wc);
      return { x, z, y, groundM: Math.fround(ground),
        accessOffsetM: Math.fround(Math.max(interpolate('accessOffsetM') ?? -Infinity, ground - y)),
        tideResponse: interpolate('tideResponse'), seasonResponse: interpolate('seasonResponse') };
    };
    let visited = 0;
    for (let cz = z0; cz <= z1; cz++) {
      // A long narrow diagonal river must not scan its mostly empty bounding
      // rectangle. Intersect each native row slab first, then only visit the
      // actual triangle's X interval in that slab.
      const loZ = this.coordinate(cz), hiZ = this.coordinate(cz + 1);
      let rowMin = Infinity, rowMax = -Infinity;
      const originals = [a, b, c];
      for (let i = 0; i < 3; i++) {
        const p = originals[i], q = originals[(i + 1) % 3];
        if (p.z >= loZ && p.z <= hiZ) { rowMin = Math.min(rowMin, p.x); rowMax = Math.max(rowMax, p.x); }
        if (p.z !== q.z) for (const edge of [loZ, hiZ]) {
          const t = (edge - p.z) / (q.z - p.z);
          if (t >= 0 && t <= 1) { const x = p.x + (q.x - p.x) * t; rowMin = Math.min(rowMin, x); rowMax = Math.max(rowMax, x); }
        }
      }
      if (rowMin === Infinity || rowMax < 0 || rowMin > extent) continue;
      const startX = Math.max(x0, this.cellAt(Math.max(0, rowMin))), endX = Math.min(x1, this.cellAt(Math.min(extent, rowMax)));
      for (let cx = startX; cx <= endX; cx++) {
      if (++visited > 65536) throw new Error('Water triangle exceeds bounded native refinement area');
      const nw = { x: this.coordinate(cx), z: this.coordinate(cz) }, ne = { x: this.coordinate(cx + 1), z: nw.z };
      const sw = { x: nw.x, z: this.coordinate(cz + 1) }, se = { x: ne.x, z: sw.z };
      const terrain = this.flipped.has(cz * (this.gridSize - 1) + cx) ? [[nw, ne, se], [nw, se, sw]] : [[nw, ne, sw], [ne, se, sw]];
      for (const face of terrain) {
        let polygon: XZ[] = [a, b, c];
        for (let edge = 0; edge < 3 && polygon.length; edge++) {
          const left = face[edge], right = face[(edge + 1) % 3], clipped: XZ[] = [];
          let previous = polygon[polygon.length - 1], previousDistance = cross(left, right, previous);
          for (const point of polygon) {
            const distance = cross(left, right, point);
            if ((distance >= 0) !== (previousDistance >= 0)) {
              const t = previousDistance / (previousDistance - distance);
              clipped.push({ x: previous.x + (point.x - previous.x) * t, z: previous.z + (point.z - previous.z) * t });
            }
            if (distance >= 0) clipped.push(point);
            previous = point; previousDistance = distance;
          }
          polygon = clipped;
        }
        if (polygon.length < 3) continue;
        const first = vertex(polygon[0]);
        for (let i = 2; i < polygon.length; i++) {
          const second = vertex(polygon[i - 1]), third = vertex(polygon[i]);
          const childArea = cross(first, second, third);
          if (Math.abs(childArea) > 1e-9) out.push(childArea * area > 0 ? { a: first, b: second, c: third } : { a: first, b: third, c: second });
        }
      }
      }
    }
    return out;
  }
}
