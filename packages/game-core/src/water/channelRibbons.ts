/** Explicit narrow channels compiled where a height raster loses the bed.
 * The CPU query and renderer use the same triangles, including bend joins.
 */

export interface ChannelRibbonPoint {
  x: number;
  y: number;
  z: number;
  halfWidthM: number;
  /** Actual corrected native channel bed; absent only in legacy records. */
  groundM?: number;
}

export interface ChannelRibbonRecord {
  id: string;
  bodyIndex: number;
  riverBand: number;
  points: readonly ChannelRibbonPoint[];
}

export interface ChannelRibbonSample {
  height: number;
  groundHeight?: number;
  flowX: number;
  flowY: number;
  flowZ: number;
  /** Unit geometric normal of the same triangle sent to the renderer. */
  surfaceNormal: { x: number; y: number; z: number };
  bodyIndex: number;
  riverBand: number;
  ribbonId: string;
}

type Point = { x: number; y: number; z: number; groundM?: number };
export interface ChannelRibbonFootprintTriangle {
  readonly a: Readonly<{ x: number; y: number; z: number }>;
  readonly b: Readonly<{ x: number; y: number; z: number }>;
  readonly c: Readonly<{ x: number; y: number; z: number }>;
}
type Triangle = {
  a: Point; b: Point; c: Point;
  start: Point; end: Point;
  flowX: number; flowY: number; flowZ: number;
  surfaceNormal: { x: number; y: number; z: number };
  bodyIndex: number; riverBand: number; ribbonId: string;
};

function trianglesFor(records: readonly ChannelRibbonRecord[]): Triangle[] {
  const triangles: Triangle[] = [];
  for (const record of records) {
    const points = record.points.filter((point, index, all) =>
      index === 0 || Math.hypot(point.x - all[index - 1].x, point.z - all[index - 1].z) > 1e-6);
    if (points.length < 2) continue;
    const edges = points.map((point, index): [Point, Point] => {
      const before = points[Math.max(0, index - 1)];
      const after = points[Math.min(points.length - 1, index + 1)];
      let inX = point.x - before.x, inZ = point.z - before.z;
      let outX = after.x - point.x, outZ = after.z - point.z;
      const inLength = Math.hypot(inX, inZ), outLength = Math.hypot(outX, outZ);
      if (inLength > 0) { inX /= inLength; inZ /= inLength; }
      if (outLength > 0) { outX /= outLength; outZ /= outLength; }
      if (!inLength) { inX = outX; inZ = outZ; }
      if (!outLength) { outX = inX; outZ = inZ; }
      let normalX = -inZ - outZ, normalZ = inX + outX;
      const length = Math.hypot(normalX, normalZ);
      if (length > 1e-6) { normalX /= length; normalZ /= length; }
      else { normalX = -outZ; normalZ = outX; }
      // Shared cross-sections close bends. Bound the miter at sharp turns.
      const correction = Math.min(2, 1 / Math.max(0.5, normalX * -outZ + normalZ * outX));
      const width = Math.max(0, point.halfWidthM) * correction;
      // The GPU consumes Float32 attributes. Quantise once here, before CPU
      // barycentrics and normals, so a narrow reach far from the origin has
      // exactly the same footprint/plane on both sides of the query boundary.
      const vertex = (side: number): Point => ({
        x: Math.fround(point.x + normalX * width * side),
        y: Math.fround(point.y),
        z: Math.fround(point.z + normalZ * width * side),
        groundM: point.groundM === undefined ? undefined : Math.fround(point.groundM),
      });
      return [
        vertex(1), vertex(-1),
      ];
    });
    for (let i = 0; i < points.length - 1; i++) {
      const start = points[i], end = points[i + 1];
      const dx = end.x - start.x, dz = end.z - start.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 1e-6) continue;
      const drop = start.y - end.y;
      // Ribbons are directed flowing reaches, including flat junction pools.
      // Standing ponds/lakes use the raster model and do not enter this path.
      const speed = Math.min(3, 0.35 + 9 * Math.sqrt(Math.abs(drop) / distance));
      const sign = drop < -1e-5 ? -1 : 1;
      const addTriangle = (a: Point, b: Point, c: Point) => {
        const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
        const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const length = Math.hypot(nx, ny, nz);
        const surfaceNormal = length > 1e-9 ? { x: nx / length, y: ny / length, z: nz / length } : { x: 0, y: 1, z: 0 };
        const flowX = dx / distance * speed * sign, flowZ = dz / distance * speed * sign;
        const flowY = Math.abs(ny) > 1e-9 ? -(nx * flowX + nz * flowZ) / ny : 0;
        // The existing speed ceiling applies along the sloping surface,
        // preventing a near-vertical reach from generating unbounded drag.
        const scale = speed > 0 ? speed / Math.max(speed, Math.hypot(flowX, flowY, flowZ)) : 1;
        triangles.push({ a, b, c, start, end, surfaceNormal,
          flowX: flowX * scale, flowY: flowY * scale, flowZ: flowZ * scale,
          bodyIndex: record.bodyIndex, riverBand: record.riverBand, ribbonId: record.id });
      };
      // Winding faces up in the game's X-east, Z-south, Y-up convention.
      addTriangle(edges[i][0], edges[i + 1][0], edges[i][1]);
      addTriangle(edges[i][1], edges[i + 1][0], edges[i + 1][1]);
    }
  }
  return triangles;
}

export function buildChannelRibbonMeshData(records: readonly ChannelRibbonRecord[]): {
  positions: Float32Array;
  indices: Uint32Array;
  /** NaN denotes legacy records without a native bed sample. */
  groundHeights: Float32Array;
} {
  const triangles = trianglesFor(records);
  const positions = new Float32Array(triangles.length * 9);
  const indices = new Uint32Array(triangles.length * 3);
  const groundHeights = new Float32Array(triangles.length * 3);
  triangles.forEach((triangle, index) => {
    [triangle.a, triangle.b, triangle.c].forEach((point, corner) => {
      const vertex = index * 3 + corner;
      positions.set([point.x, point.y, point.z], vertex * 3);
      indices[vertex] = vertex;
      groundHeights[vertex] = point.groundM ?? NaN;
    });
  });
  return { positions, indices, groundHeights };
}

export class ChannelRibbonSampler {
  private readonly triangles: Triangle[];
  private readonly buckets = new Map<string, number[]>();

  constructor(records: readonly ChannelRibbonRecord[], private readonly bucketSizeM = 32) {
    if (!(bucketSizeM > 0)) throw new Error('Water ribbon bucket size must be positive');
    this.triangles = trianglesFor(records);
    this.triangles.forEach((triangle, index) => {
      const minX = Math.floor(Math.min(triangle.a.x, triangle.b.x, triangle.c.x) / bucketSizeM);
      const maxX = Math.floor(Math.max(triangle.a.x, triangle.b.x, triangle.c.x) / bucketSizeM);
      const minZ = Math.floor(Math.min(triangle.a.z, triangle.b.z, triangle.c.z) / bucketSizeM);
      const maxZ = Math.floor(Math.max(triangle.a.z, triangle.b.z, triangle.c.z) / bucketSizeM);
      for (let z = minZ; z <= maxZ; z++) for (let x = minX; x <= maxX; x++) {
        const key = `${x},${z}`;
        const bucket = this.buckets.get(key);
        if (bucket) bucket.push(index);
        else this.buckets.set(key, [index]);
      }
    });
  }

  /** Shared native footprint for excluding the approximate raster sheet.
   * References are read-only; callers must never mutate sampler geometry. */
  trianglesInBounds(minX: number, minZ: number, maxX: number, maxZ: number): readonly ChannelRibbonFootprintTriangle[] {
    const found = new Set<number>();
    for (let z = Math.floor(minZ / this.bucketSizeM); z <= Math.floor(maxZ / this.bucketSizeM); z++) {
      for (let x = Math.floor(minX / this.bucketSizeM); x <= Math.floor(maxX / this.bucketSizeM); x++) {
        for (const index of this.buckets.get(`${x},${z}`) ?? []) found.add(index);
      }
    }
    return [...found].map(index => this.triangles[index]).filter(({ a, b, c }) =>
      Math.max(a.x, b.x, c.x) >= minX && Math.min(a.x, b.x, c.x) <= maxX
      && Math.max(a.z, b.z, c.z) >= minZ && Math.min(a.z, b.z, c.z) <= maxZ);
  }

  sample(x: number, z: number): ChannelRibbonSample | null {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    const candidates = this.buckets.get(`${Math.floor(x / this.bucketSizeM)},${Math.floor(z / this.bucketSizeM)}`);
    if (!candidates) return null;
    let closest = Infinity;
    let sample: ChannelRibbonSample | null = null;
    for (const index of candidates) {
      const triangle = this.triangles[index];
      const { a, b, c, start, end } = triangle;
      const determinant = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
      if (Math.abs(determinant) < 1e-9) continue;
      const u = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / determinant;
      const v = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / determinant;
      const w = 1 - u - v;
      if (u < -1e-7 || v < -1e-7 || w < -1e-7) continue;
      const dx = end.x - start.x, dz = end.z - start.z;
      const t = Math.min(1, Math.max(0, ((x - start.x) * dx + (z - start.z) * dz) / (dx * dx + dz * dz)));
      const distance2 = (x - start.x - t * dx) ** 2 + (z - start.z - t * dz) ** 2;
      const height = a.y * u + b.y * v + c.y * w;
      // Where reaches meet, physics follows the visible upper surface just
      // as the depth test does; nearest-centre selection could pick a hidden
      // sheet tens of centimetres underneath it.
      if (sample && (height < sample.height - 1e-7 ||
          (Math.abs(height - sample.height) <= 1e-7 && distance2 >= closest))) continue;
      closest = distance2;
      sample = { height,
        groundHeight: a.groundM === undefined || b.groundM === undefined || c.groundM === undefined
          ? undefined : a.groundM * u + b.groundM * v + c.groundM * w,
        flowX: triangle.flowX, flowY: triangle.flowY, flowZ: triangle.flowZ,
        surfaceNormal: { ...triangle.surfaceNormal },
        bodyIndex: triangle.bodyIndex, riverBand: triangle.riverBand, ribbonId: triangle.ribbonId };
    }
    return sample;
  }
}
