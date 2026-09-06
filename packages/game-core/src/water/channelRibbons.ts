/** Explicit narrow channels compiled where a height raster loses the bed.
 * The CPU query and renderer use the same triangles, including bend joins.
 */
import { channelCurrentSpeed, CHANNEL_MIN_THROUGHFLOW_MPS } from "./channelCurrent";
import { closestSheetPoint } from './sheetContact';

export interface ChannelRibbonPoint {
  x: number;
  y: number;
  z: number;
  halfWidthM: number;
  /** Actual corrected native channel bed; absent only in legacy records. */
  groundM?: number;
  /** Authored hydraulic-owner coefficients, constant across each bank section. */
  tideResponse?: number;
  seasonResponse?: number;
  /** This interval is a free falling sheet, not a filled water column. */
  fallingToNext?: boolean;
  /** Compiler-shared junction unit normal. Signed offsets already include
   * widening; never recompute or re-miter an explicitly authored section. */
  crossSectionNormalX?: number;
  crossSectionNormalZ?: number;
  /** Signed metres along the shared unit miter normal; miter widening is
   * already included by the compiler. Ground/access are true world metres. */
  crossSection?: readonly { offsetM: number; groundM: number; accessOffsetM: number }[];
  /** Packed sidecar range; loader installs a bounded non-enumerable getter. */
  crossSectionStart?: number;
  crossSectionCount?: number;
  crossSectionMinOffsetM?: number;
  crossSectionMaxOffsetM?: number;
}

export interface ChannelRibbonRecord {
  id: string;
  bodyIndex: number;
  riverBand: number;
  points: readonly ChannelRibbonPoint[];
}

export interface ChannelRibbonSample {
  fallingSheet?: boolean;
  height: number;
  groundHeight?: number;
  floodAccessOffsetM?: number;
  tideResponse?: number;
  seasonResponse?: number;
  flowX: number;
  flowY: number;
  flowZ: number;
  /** Unit geometric normal of the same triangle sent to the renderer. */
  surfaceNormal: { x: number; y: number; z: number };
  bodyIndex: number;
  riverBand: number;
  ribbonId: string;
}

export interface ChannelRibbonSampleOptions {
  excludeFallingSheets?: boolean;
  /** Physical overlap selection uses the same still-stage access/bed gates
   * as rendering. Omit for static geometry/metadata queries. */
  stage?: {
    tide: number; season: number;
    groundHeight?: number;
    fallbackTideResponse?: number; fallbackSeasonResponse?: number;
    fallbackAccessOffsetM?: number;
  };
}

type Point = { x: number; y: number; z: number; groundM?: number; accessOffsetM?: number; tideResponse?: number; seasonResponse?: number };
/** Optional compiled native terrain authority. Both CPU and GPU geometry
 * are refined through this same instance; raster-subtraction envelopes are
 * deliberately left coarse because subdivision does not change ownership. */
export interface ChannelRibbonGround {
  sample?(x: number, z: number): number | null;
  refineTriangle(a: Point, b: Point, c: Point): { a: Point; b: Point; c: Point }[];
  refineTriangleAt?(a: Point, b: Point, c: Point, x: number, z: number): { a: Point; b: Point; c: Point }[];
  cellKeyAt?(x: number, z: number): number | null;
}
export interface ChannelRibbonFootprintTriangle {
  readonly a: Readonly<Point>;
  readonly b: Readonly<Point>;
  readonly c: Readonly<Point>;
}
type Triangle = {
  a: Point; b: Point; c: Point;
  start: Point; end: Point;
  flowX: number; flowY: number; flowZ: number;
  surfaceNormal: { x: number; y: number; z: number };
  bodyIndex: number; riverBand: number; ribbonId: string;
  fallingSheet: boolean;
};

function interpolateSectionPoint(a: Point, b: Point, t: number): Point {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const optional = (left: number | undefined, right: number | undefined) => left === undefined || right === undefined
    ? undefined : Math.fround(left + (right - left) * t);
  return { x: Math.fround(a.x + (b.x - a.x) * t), y: Math.fround(a.y + (b.y - a.y) * t), z: Math.fround(a.z + (b.z - a.z) * t),
    groundM: optional(a.groundM, b.groundM), accessOffsetM: optional(a.accessOffsetM, b.accessOffsetM),
    tideResponse: optional(a.tideResponse, b.tideResponse), seasonResponse: optional(a.seasonResponse, b.seasonResponse) };
}

/** Native terrain refinement replaces every bed attribute, so ground-only
 * breakpoints need not seed skinny water triangles. Keep the centre, both
 * endpoints and every access change, within Float32 storage roundoff only.
 * This never changes the full profile used by hydraulicRadius(). */
function accessProfile(section: NonNullable<ChannelRibbonPoint['crossSection']>): NonNullable<ChannelRibbonPoint['crossSection']> {
  if (section.length <= 3) return section;
  const centre = section.findIndex(point => point.offsetM === 0), keep = new Uint8Array(section.length);
  keep[0] = keep[section.length - 1] = 1;
  if (centre >= 0) keep[centre] = 1;
  const stack: [number, number][] = centre > 0 && centre < section.length - 1
    ? [[0, centre], [centre, section.length - 1]] : [[0, section.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    const a = section[first], b = section[last], span = b.offsetM - a.offsetM;
    let maximum = 1e-7, split = -1;
    for (let i = first + 1; i < last; i++) {
      const p = section[i], t = (p.offsetM - a.offsetM) / span;
      const error = Math.abs(p.accessOffsetM - (a.accessOffsetM + (b.accessOffsetM - a.accessOffsetM) * t));
      if (error > maximum) { maximum = error; split = i; }
    }
    if (split >= 0) { keep[split] = 1; stack.push([first, split], [split, last]); }
  }
  return section.filter((_, i) => keep[i]);
}

/** Geometric descending-reach guard, not a lateral pressure solver. A broad
 * low pool must not be lofted up to a narrow high lip. Allow gentle bank
 * expansion continuously with run/slope; grade >=1 carries the incident
 * ray footprint, irrespective of total drop. The incident POTENTIAL stage
 * profile remains intact, so wet-season lip widening is not frozen at base.
 * Receiving flat pool ownership is a separate surface at the plunge level. */
function descendingSection(start: Point, end: Point, incident: Point[], downstream: Point[]): Point[] {
  const drop = start.y - end.y, dx = end.x - start.x, dz = end.z - start.z, run = Math.hypot(dx, dz);
  if (drop <= 1e-5 || run < 1e-6) return downstream;
  const nx = -dz / run, nz = dx / run;
  const lateral = (p: Point) => (p.x - end.x) * nx + (p.z - end.z) * nz;
  const spread = Math.max(0, run - drop);
  const lo = Math.min(lateral(incident[0]), lateral(incident[incident.length - 1])) - spread;
  const hi = Math.max(lateral(incident[0]), lateral(incident[incident.length - 1])) + spread;
  if (downstream.every(p => lateral(p) >= lo - 1e-7 && lateral(p) <= hi + 1e-7)) return downstream;
  const result: Point[] = [];
  const append = (point: Point) => {
    const previous = result[result.length - 1];
    if (!previous || point.x !== previous.x || point.z !== previous.z) result.push(point);
  };
  for (let i = 1; i < downstream.length; i++) {
    const a = downstream[i - 1], b = downstream[i], sa = lateral(a), sb = lateral(b), delta = sb - sa;
    if (Math.abs(delta) < 1e-10) {
      if (sa >= lo && sa <= hi) { append(a); append(b); }
      continue;
    }
    const t0 = Math.max(0, Math.min((lo - sa) / delta, (hi - sa) / delta));
    const t1 = Math.min(1, Math.max((lo - sa) / delta, (hi - sa) / delta));
    if (t0 <= t1) { append(interpolateSectionPoint(a, b, t0)); append(interpolateSectionPoint(a, b, t1)); }
  }
  return result;
}

/** Integrate the actually connected, base-stage cross-section, not the
 * maximum seasonal envelope width and not a rectangular bank approximation. */
function hydraulicRadius(point: ChannelRibbonPoint): number {
  const section = point.crossSection;
  if (!section) {
    const depth = Math.max(0.001, point.y - (point.groundM ?? point.y));
    const width = Math.max(0.001, 2 * point.halfWidthM);
    return width * depth / (width + 2 * depth);
  }
  let area = 0, perimeter = 0;
  for (let i = 1; i < section.length; i++) {
    const a = section[i - 1], b = section[i];
    let lo = 0, hi = 1;
    for (const [va, vb] of [[a.groundM - point.y, b.groundM - point.y], [a.accessOffsetM, b.accessOffsetM]]) {
      if (va > 0 && vb > 0) { hi = -1; break; }
      if ((va > 0) !== (vb > 0)) {
        const crossing = va / (va - vb);
        if (va > 0) lo = Math.max(lo, crossing); else hi = Math.min(hi, crossing);
      }
    }
    if (hi <= lo) continue;
    const width = (b.offsetM - a.offsetM) * (hi - lo);
    const d0 = Math.max(0, point.y - a.groundM - (b.groundM - a.groundM) * lo);
    const d1 = Math.max(0, point.y - a.groundM - (b.groundM - a.groundM) * hi);
    area += width * (d0 + d1) / 2;
    perimeter += Math.hypot(width, d1 - d0);
  }
  return perimeter > 0 ? area / perimeter : 0.001;
}

function physicalReachSpeeds(records: readonly ChannelRibbonRecord[]): Map<ChannelRibbonPoint, number> {
  const speeds = new Map<ChannelRibbonPoint, number>();
  const edges: { start: ChannelRibbonPoint; end: ChannelRibbonPoint; band: number }[] = [];
  for (const record of records) {
    // Preserve the retained legacy profile; physical geometry supplies the
    // actual bed cross-sections needed by the new resistance model.
    if (!record.points.every(point => point.crossSectionCount !== undefined || point.crossSection)) continue;
    for (let i = 1; i < record.points.length; i++) edges.push({ start: record.points[i - 1], end: record.points[i], band: record.riverBand });
  }
  edges.sort((a, b) => b.start.y - a.start.y || b.end.y - a.end.y);
  const nodeSpeeds = new Map<string, number>();
  const radii = new Map<ChannelRibbonPoint, number>();
  const radius = (point: ChannelRibbonPoint) => {
    let value = radii.get(point);
    if (value === undefined) { value = hydraulicRadius(point); radii.set(point, value); }
    return value;
  };
  const key = (p: ChannelRibbonPoint) => `${p.x.toFixed(4)},${p.z.toFixed(4)},${p.y.toFixed(4)}`;
  for (const { start, end, band } of edges) {
    const incoming = nodeSpeeds.get(key(start)) ?? CHANNEL_MIN_THROUGHFLOW_MPS;
    const outgoing = channelCurrentSpeed({ hydraulicRadiusM: (radius(start) + radius(end)) / 2,
      dropM: start.y - end.y, horizontalLengthM: Math.hypot(end.x - start.x, end.z - start.z),
      upstreamSpeedMps: incoming, roughnessN: band >= 3 ? 0.035 : band >= 2 ? 0.045 : 0.05 });
    nodeSpeeds.set(key(end), Math.max(nodeSpeeds.get(key(end)) ?? 0, outgoing));
    speeds.set(start, Math.sqrt((incoming ** 2 + outgoing ** 2) / 2));
  }
  return speeds;
}

function trianglesFor(records: readonly ChannelRibbonRecord[], physicalSpeeds: ReadonlyMap<ChannelRibbonPoint, number> = physicalReachSpeeds(records), footprintOnly = false, nativeGround?: ChannelRibbonGround, maximumStageOffsetM?: number, refineNative = true): Triangle[] {
  const triangles: Triangle[] = [];
  for (const record of records) {
    const points = record.points.filter((point, index, all) =>
      index === 0 || Math.hypot(point.x - all[index - 1].x, point.z - all[index - 1].z) > 1e-6);
    if (points.length < 2) continue;
    const sections = points.map((point, index): Point[] => {
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
      const explicitNormal = point.crossSectionNormalX !== undefined || point.crossSectionNormalZ !== undefined;
      if (explicitNormal) {
        if (!Number.isFinite(point.crossSectionNormalX) || !Number.isFinite(point.crossSectionNormalZ)
          || Math.abs(Math.hypot(point.crossSectionNormalX!, point.crossSectionNormalZ!) - 1) > 1e-5) {
          throw new Error(`Invalid shared cross-section normal at ${record.id} point ${index}`);
        }
        normalX = point.crossSectionNormalX!; normalZ = point.crossSectionNormalZ!;
      }
      // Shared cross-sections close bends. Bound the miter at sharp turns.
      const correction = explicitNormal ? 1 : Math.min(2, 1 / Math.max(0.5, normalX * -outZ + normalZ * outX));
      const width = Math.max(0, point.halfWidthM) * correction;
      // The GPU consumes Float32 attributes. Quantise once here, before CPU
      // barycentrics and normals, so a narrow reach far from the origin has
      // exactly the same footprint/plane on both sides of the query boundary.
      const vertex = (offset: number, groundM = point.groundM, accessOffsetM = groundM === undefined ? undefined : groundM - point.y): Point => ({
        x: Math.fround(point.x + normalX * offset),
        y: Math.fround(point.y),
        z: Math.fround(point.z + normalZ * offset),
        groundM: groundM === undefined ? undefined : Math.fround(groundM),
        accessOffsetM: accessOffsetM === undefined ? undefined : Math.fround(accessOffsetM),
        tideResponse: point.tideResponse === undefined ? undefined : Math.fround(point.tideResponse),
        seasonResponse: point.seasonResponse === undefined ? undefined : Math.fround(point.seasonResponse),
      });
      if (point.crossSection) {
        if (footprintOnly) return [point.crossSection[0], point.crossSection[point.crossSection.length - 1]]
          .map(sample => vertex(sample.offsetM, sample.groundM, sample.accessOffsetM));
        let previous = -Infinity, hasCentre = false;
        for (const sample of point.crossSection) {
          if (![sample.offsetM, sample.groundM, sample.accessOffsetM].every(Number.isFinite)
            || sample.offsetM <= previous || sample.accessOffsetM + 0.0001 < sample.groundM - point.y) {
            throw new Error(`Invalid channel cross-section at ${record.id} point ${index}`);
          }
          hasCentre ||= sample.offsetM === 0;
          previous = sample.offsetM;
        }
        if (!hasCentre || point.crossSection.length < 2) throw new Error(`Channel cross-section requires its centre at ${record.id}`);
        const profile = nativeGround ? accessProfile(point.crossSection) : point.crossSection;
        return profile.map(sample => vertex(sample.offsetM, sample.groundM, sample.accessOffsetM));
      }
      return [vertex(-width), vertex(width)];
    });
    for (let i = 0; i < points.length - 1; i++) {
      const start = points[i], end = points[i + 1];
      const dx = end.x - start.x, dz = end.z - start.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 1e-6) continue;
      const drop = start.y - end.y;
      // Ribbons are directed flowing reaches, including flat junction pools.
      // Standing ponds/lakes use the raster model and do not enter this path.
      const speed = physicalSpeeds.get(start) ?? Math.min(3, 0.35 + 9 * Math.sqrt(Math.abs(drop) / distance));
      const sign = drop < -1e-5 ? -1 : 1;
      const emitTriangle = (a: Point, b: Point, c: Point) => {
        // On each native child the bed and water are affine. If every corner
        // remains below the bed even at the maximum authored stage, its whole
        // face is permanently dry. Native wave amplitude is depth-gated and
        // cannot create water from negative still depth. Keep a 4 mm guard.
        if (refineNative && !footprintOnly && nativeGround && maximumStageOffsetM !== undefined
          && [a, b, c].every(p => p.groundM !== undefined && p.groundM - p.y > maximumStageOffsetM + 0.004)) return;
        // Both variable-length cross-sections run negative→positive. Enforce
        // upward winding independently of which zipper side advances.
        if ((b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z) < 0) [b, c] = [c, b];
        const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
        const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const length = Math.hypot(nx, ny, nz);
        if (Math.abs(ny) < 1e-12) return;
        const surfaceNormal = length > 1e-9 ? { x: nx / length, y: ny / length, z: nz / length } : { x: 0, y: 1, z: 0 };
        const flowX = dx / distance * speed * sign, flowZ = dz / distance * speed * sign;
        const flowY = Math.abs(ny) > 1e-9 ? -(nx * flowX + nz * flowZ) / ny : 0;
        // Speed is measured along the sloping surface, not its projection.
        const scale = speed > 0 ? speed / Math.max(speed, Math.hypot(flowX, flowY, flowZ)) : 1;
        triangles.push({ a, b, c, start, end, surfaceNormal,
          fallingSheet: start.fallingToNext === true,
          flowX: flowX * scale, flowY: flowY * scale, flowZ: flowZ * scale,
          bodyIndex: record.bodyIndex, riverBand: record.riverBand, ribbonId: record.id });
      };
      const addTriangle = (a: Point, b: Point, c: Point) => {
        // Access is an affine barrier independent of waves. This cheap test
        // avoids refining dry banks, but leaves ownership envelopes intact.
        if (!footprintOnly && nativeGround && maximumStageOffsetM !== undefined
          && [a, b, c].every(p => p.accessOffsetM !== undefined && p.accessOffsetM > maximumStageOffsetM + 0.0001)) return;
        if (refineNative && nativeGround && !footprintOnly) {
          for (const child of nativeGround.refineTriangle(a, b, c)) emitTriangle(child.a, child.b, child.c);
        } else emitTriangle(a, b, c);
      };
      const a = sections[i], b = descendingSection(start, end, a, sections[i + 1]);
      if (b.length < 2) continue;
      const fraction = (section: Point[], index: number) => {
        const first = section[0], last = section[section.length - 1], point = section[index];
        const total = Math.hypot(last.x - first.x, last.z - first.z);
        return total > 0 ? Math.hypot(point.x - first.x, point.z - first.z) / total : index / Math.max(1, section.length - 1);
      };
      let ai = 0, bi = 0;
      while (ai < a.length - 1 || bi < b.length - 1) {
        if (bi === b.length - 1 || (ai < a.length - 1 && fraction(a, ai + 1) <= fraction(b, bi + 1))) {
          addTriangle(a[ai], b[bi], a[ai + 1]); ai++;
        } else { addTriangle(a[ai], b[bi], b[bi + 1]); bi++; }
      }
    }
  }
  return triangles;
}

export function buildChannelRibbonMeshData(records: readonly ChannelRibbonRecord[], physicalSpeeds?: ReadonlyMap<ChannelRibbonPoint, number>, nativeGround?: ChannelRibbonGround, maximumStageOffsetM?: number, refineGround = true): {
  positions: Float32Array;
  indices: Uint32Array;
  /** NaN denotes legacy records without a native bed sample. */
  groundHeights: Float32Array;
  floodAccessOffsets: Float32Array;
  flowVelocities: Float32Array;
  /** Tide, season, valid flag. Zero valid flag selects legacy raster fallback. */
  levelResponses: Float32Array;
  bodyIndices: Uint16Array;
} {
  const triangles = trianglesFor(records, physicalSpeeds, false, nativeGround, maximumStageOffsetM, refineGround);
  const positions = new Float32Array(triangles.length * 9);
  const indices = new Uint32Array(triangles.length * 3);
  const groundHeights = new Float32Array(triangles.length * 3);
  const floodAccessOffsets = new Float32Array(triangles.length * 3);
  const flowVelocities = new Float32Array(triangles.length * 9);
  const levelResponses = new Float32Array(triangles.length * 9);
  const bodyIndices = new Uint16Array(triangles.length * 3);
  triangles.forEach((triangle, index) => {
    const hasLevels = [triangle.a, triangle.b, triangle.c].every(point => point.tideResponse !== undefined && point.seasonResponse !== undefined);
    [triangle.a, triangle.b, triangle.c].forEach((point, corner) => {
      const vertex = index * 3 + corner;
      positions.set([point.x, point.y, point.z], vertex * 3);
      indices[vertex] = vertex;
      bodyIndices[vertex] = triangle.bodyIndex;
      groundHeights[vertex] = point.groundM ?? NaN;
      floodAccessOffsets[vertex] = point.accessOffsetM ?? -1e6;
      flowVelocities.set([triangle.flowX, triangle.flowY, triangle.flowZ], vertex * 3);
      if (hasLevels) {
        levelResponses.set([point.tideResponse!, point.seasonResponse!, 1], vertex * 3);
      }
    });
  });
  return { positions, indices, groundHeights, floodAccessOffsets, flowVelocities, levelResponses, bodyIndices };
}

export class ChannelRibbonSampler {
  private readonly buckets = new Map<string, number[]>();
  private readonly physicalSpeeds: ReadonlyMap<ChannelRibbonPoint, number>;
  private readonly recordsById: ReadonlyMap<string, ChannelRibbonRecord>;
  private readonly triangleCache = new Map<number, Triangle[]>();
  private readonly footprintCache = new Map<number, Triangle[]>();
  private cachedFootprintTriangles = 0;
  private cachedTriangles = 0;
  private triangleBuilds = 0;
  private readonly localCache = new Map<string, Triangle[]>();
  private readonly triangleIds = new WeakMap<Triangle, number>();
  private nextTriangleId = 0;
  private localTriangles = 0;
  private localBuilds = 0;

  constructor(private readonly records: readonly ChannelRibbonRecord[], private readonly bucketSizeM = 32,
    private readonly nativeGround?: ChannelRibbonGround, private readonly maximumStageOffsetM?: number) {
    if (!(bucketSizeM > 0)) throw new Error('Water ribbon bucket size must be positive');
    if (maximumStageOffsetM !== undefined && (!Number.isFinite(maximumStageOffsetM) || maximumStageOffsetM < 0)) throw new Error('Maximum water stage must be finite and nonnegative');
    this.physicalSpeeds = physicalReachSpeeds(records);
    this.recordsById = new Map(records.map(record => [record.id, record]));
    // Index lightweight record envelopes, not hundreds of thousands of
    // expanded seasonal triangles. Exact triangles are built only on demand.
    records.forEach((record, index) => {
      if (record.points.length < 2) return;
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const point of record.points) {
        const radius = point.crossSectionMinOffsetM !== undefined && point.crossSectionMaxOffsetM !== undefined
          ? Math.max(Math.abs(point.crossSectionMinOffsetM), Math.abs(point.crossSectionMaxOffsetM))
          : point.crossSection ? Math.max(...point.crossSection.map(s => Math.abs(s.offsetM))) : point.halfWidthM * 2;
        x0 = Math.min(x0, point.x - radius - 0.001); x1 = Math.max(x1, point.x + radius + 0.001);
        z0 = Math.min(z0, point.z - radius - 0.001); z1 = Math.max(z1, point.z + radius + 0.001);
      }
      const minX = Math.floor(x0 / bucketSizeM), maxX = Math.floor(x1 / bucketSizeM);
      const minZ = Math.floor(z0 / bucketSizeM), maxZ = Math.floor(z1 / bucketSizeM);
      for (let z = minZ; z <= maxZ; z++) for (let x = minX; x <= maxX; x++) {
        const key = `${x},${z}`;
        const bucket = this.buckets.get(key);
        if (bucket) bucket.push(index);
        else this.buckets.set(key, [index]);
      }
    });
  }

  private trianglesForRecord(index: number): readonly Triangle[] {
    const cached = this.triangleCache.get(index);
    if (cached) { this.triangleCache.delete(index); this.triangleCache.set(index, cached); return cached; }
    // Cache only the compact authored/access triangles. Physics never expands
    // a whole river record into all of its native terrain cells.
    const triangles = trianglesFor([this.records[index]], this.physicalSpeeds, false, this.nativeGround, this.maximumStageOffsetM, false);
    this.triangleBuilds++;
    // Bound both object count and record count: unusually complex sections
    // must not make a nominal 256-record budget arbitrarily large.
    if (triangles.length > 16384) return triangles;
    while (this.triangleCache.size >= 256 || this.cachedTriangles + triangles.length > 16384) {
      const oldest = this.triangleCache.keys().next().value!;
      this.cachedTriangles -= this.triangleCache.get(oldest)!.length;
      this.triangleCache.delete(oldest);
    }
    this.triangleCache.set(index, triangles);
    this.cachedTriangles += triangles.length;
    return triangles;
  }

  private *candidateTriangles(indices: Iterable<number>): IterableIterator<Triangle> {
    for (const index of indices) yield* this.trianglesForRecord(index);
  }

  private *sampleTriangles(indices: Iterable<number>, x: number, z: number): IterableIterator<Triangle> {
    const ground = this.nativeGround;
    // Fragment-ground rendering retains the original authored water plane
    // and samples the exact terrain field independently. Match that path
    // directly, without a redundant geometric approximation of the bed.
    if (!ground || ground.sample) { yield* this.candidateTriangles(indices); return; }
    const cell = ground.cellKeyAt?.(x, z);
    if (cell === null) return;
    for (const source of this.candidateTriangles(indices)) {
      const { a, b, c } = source;
      // Quantized native intersections can move a boundary by one Float32
      // ULP. A scale-derived guard admits those children without losing the
      // broad-phase rejection of unrelated authored triangles.
      const pad = Math.max(1, Math.abs(x), Math.abs(z)) * 2 ** -22;
      if (x < Math.min(a.x, b.x, c.x) - pad || x > Math.max(a.x, b.x, c.x) + pad
        || z < Math.min(a.z, b.z, c.z) - pad || z > Math.max(a.z, b.z, c.z) + pad) continue;
      let key: string | undefined, children: Triangle[] | undefined;
      if (cell !== undefined) {
        let id = this.triangleIds.get(source);
        if (id === undefined) { id = this.nextTriangleId++; this.triangleIds.set(source, id); }
        key = `${id}:${cell}`; children = this.localCache.get(key);
        if (children) { this.localCache.delete(key); this.localCache.set(key, children); }
      }
      if (!children) {
        const geometry = ground.refineTriangleAt ? ground.refineTriangleAt(a, b, c, x, z) : ground.refineTriangle(a, b, c);
        children = [];
        for (const face of geometry) {
          if (this.maximumStageOffsetM !== undefined && [face.a, face.b, face.c].every(p => p.groundM !== undefined
            && p.groundM - p.y > this.maximumStageOffsetM! + 0.004)) continue;
          let { a, b, c } = face;
          if ((b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z) < 0) [b, c] = [c, b];
          const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
          const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
          if (Math.abs(ny) < 1e-12) continue;
          const length = Math.hypot(nx, ny, nz), speed = Math.hypot(source.flowX, source.flowY, source.flowZ);
          const fy = -(nx * source.flowX + nz * source.flowZ) / ny;
          const scale = speed / Math.max(1e-12, Math.hypot(source.flowX, fy, source.flowZ));
          children.push({ ...source, a, b, c, surfaceNormal: { x: nx / length, y: ny / length, z: nz / length },
            flowX: source.flowX * scale, flowY: fy * scale, flowZ: source.flowZ * scale });
        }
        this.localBuilds++;
        if (key !== undefined && children.length <= 2048) {
          while (this.localCache.size >= 256 || this.localTriangles + children.length > 2048) {
            const oldest = this.localCache.keys().next().value!;
            this.localTriangles -= this.localCache.get(oldest)!.length; this.localCache.delete(oldest);
          }
          this.localCache.set(key, children); this.localTriangles += children.length;
        }
      }
      yield* children;
    }
  }

  /** Streaming geometry uses the WHOLE graph's upstream current state, not
   * a fresh momentum solve at every tile boundary. */
  meshDataFor(records: readonly ChannelRibbonRecord[], options: { refineGround?: boolean } = {}) {
    let speeds: Map<ChannelRibbonPoint, number> | undefined;
    for (const record of records) {
      const source = this.recordsById.get(record.id);
      if (!source || source.points.length !== record.points.length) throw new Error(`Streamed ribbon ${record.id} changed its longitudinal topology`);
      for (let i = 0; i < record.points.length; i++) {
        const point = record.points[i], original = source.points[i];
        if (point === original) continue;
        if (point.x !== original.x || point.y !== original.y || point.z !== original.z) throw new Error(`Streamed ribbon ${record.id} moved a longitudinal station`);
        // Screen-error simplification may clone lateral profiles, but cannot
        // reset or recompute the whole graph's physical momentum.
        speeds ??= new Map();
        const speed = this.physicalSpeeds.get(original);
        if (speed !== undefined) speeds.set(point, speed);
      }
    }
    if (!speeds) return buildChannelRibbonMeshData(records, this.physicalSpeeds, this.nativeGround, this.maximumStageOffsetM, options.refineGround ?? true);
    for (const record of records) for (const point of record.points) {
      if (!speeds.has(point)) {
        const speed = this.physicalSpeeds.get(point);
        if (speed !== undefined) speeds.set(point, speed);
      }
    }
    return buildChannelRibbonMeshData(records, speeds, this.nativeGround, this.maximumStageOffsetM, options.refineGround ?? true);
  }

  get cacheStats(): Readonly<{ records: number; triangles: number; builds: number; localEntries: number; localTriangles: number; localBuilds: number }> {
    return { records: this.triangleCache.size, triangles: this.cachedTriangles, builds: this.triangleBuilds,
      localEntries: this.localCache.size, localTriangles: this.localTriangles, localBuilds: this.localBuilds };
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
    const source = [...this.candidateTriangles(found)].filter(({ a, b, c }) =>
      Math.max(a.x, b.x, c.x) >= minX && Math.min(a.x, b.x, c.x) <= maxX
      && Math.max(a.z, b.z, c.z) >= minZ && Math.min(a.z, b.z, c.z) <= maxZ);
    return this.nativeGround ? source.flatMap(({ a, b, c }) => this.nativeGround!.refineTriangle(a, b, c)) : source;
  }

  /** Plan-view ownership union only: omit interior bed samples while keeping
   * every longitudinal station, miter and outer endpoint exactly. This is
   * for raster subtraction, NEVER for depth/access or physics sampling. */
  ownershipFootprintsInBounds(minX: number, minZ: number, maxX: number, maxZ: number): readonly ChannelRibbonFootprintTriangle[] {
    const found = new Set<number>(), result: ChannelRibbonFootprintTriangle[] = [];
    for (let z = Math.floor(minZ / this.bucketSizeM); z <= Math.floor(maxZ / this.bucketSizeM); z++) {
      for (let x = Math.floor(minX / this.bucketSizeM); x <= Math.floor(maxX / this.bucketSizeM); x++) {
        for (const index of this.buckets.get(`${x},${z}`) ?? []) found.add(index);
      }
    }
    for (const index of found) {
      let triangles = this.footprintCache.get(index);
      if (triangles) { this.footprintCache.delete(index); this.footprintCache.set(index, triangles); }
      else {
        triangles = trianglesFor([this.records[index]], this.physicalSpeeds, true);
        if (triangles.length <= 8192) {
          while (this.footprintCache.size >= 256 || this.cachedFootprintTriangles + triangles.length > 8192) {
            const oldest = this.footprintCache.keys().next().value!;
            this.cachedFootprintTriangles -= this.footprintCache.get(oldest)!.length;
            this.footprintCache.delete(oldest);
          }
          this.footprintCache.set(index, triangles);
          this.cachedFootprintTriangles += triangles.length;
        }
      }
      for (const triangle of triangles) {
        const { a, b, c } = triangle;
        if (Math.max(a.x, b.x, c.x) >= minX && Math.min(a.x, b.x, c.x) <= maxX
          && Math.max(a.z, b.z, c.z) >= minZ && Math.min(a.z, b.z, c.z) <= maxZ) result.push(triangle);
      }
    }
    return result;
  }

  /** Conservative wetted core at an EXPLICIT stage. For permanent raster
   * subtraction pass the local minimum seasonal/tidal stage, never assume
   * base level stays wet. Ground and upstream-access barriers both apply. */
  coreTrianglesInBounds(minX: number, minZ: number, maxX: number, maxZ: number,
    minimumStageOffsetM: number): readonly ChannelRibbonFootprintTriangle[] {
    const result: ChannelRibbonFootprintTriangle[] = [];
    if (!Number.isFinite(minimumStageOffsetM)) return result;
    for (const triangle of this.trianglesInBounds(minX, minZ, maxX, maxZ)) {
      let polygon: Readonly<Point>[] = [triangle.a, triangle.b, triangle.c];
      if (polygon.some(p => p.groundM === undefined)) continue;
      for (const distance of [
        (p: Readonly<Point>) => p.groundM! - p.y + 0.004 - minimumStageOffsetM,
        (p: Readonly<Point>) => (p.accessOffsetM ?? -1e6) - minimumStageOffsetM,
      ]) {
        const clipped: Point[] = [];
        for (let i = 0; i < polygon.length; i++) {
          const a = polygon[i], b = polygon[(i + 1) % polygon.length];
          const da = distance(a), db = distance(b);
          if (da <= 0) clipped.push(a);
          if ((da <= 0) !== (db <= 0)) {
            const t = da / (da - db);
            clipped.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t,
              z: a.z + (b.z - a.z) * t, groundM: a.groundM! + (b.groundM! - a.groundM!) * t,
              accessOffsetM: (a.accessOffsetM ?? -1e6) + ((b.accessOffsetM ?? -1e6) - (a.accessOffsetM ?? -1e6)) * t });
          }
        }
        polygon = clipped;
      }
      for (let i = 1; i < polygon.length - 1; i++) result.push({ a: polygon[0], b: polygon[i], c: polygon[i + 1] });
    }
    return result;
  }

  sample(x: number, z: number, options: ChannelRibbonSampleOptions = {}): ChannelRibbonSample | null {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    const candidates = this.buckets.get(`${Math.floor(x / this.bucketSizeM)},${Math.floor(z / this.bucketSizeM)}`);
    if (!candidates) return null;
    let closest = Infinity;
    let sample: ChannelRibbonSample | null = null;
    let selectedHeight = -Infinity, selectedWet = false;
    const nativeBed = this.nativeGround?.sample?.(x, z);
    if (nativeBed === null) return null;
    for (const triangle of this.sampleTriangles(candidates, x, z)) {
      if (options.excludeFallingSheets && triangle.fallingSheet) continue;
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
      const tideResponse = a.tideResponse === undefined || b.tideResponse === undefined || c.tideResponse === undefined
        ? undefined : a.tideResponse * u + b.tideResponse * v + c.tideResponse * w;
      const seasonResponse = a.seasonResponse === undefined || b.seasonResponse === undefined || c.seasonResponse === undefined
        ? undefined : a.seasonResponse * u + b.seasonResponse * v + c.seasonResponse * w;
      const groundHeight = nativeBed ?? (a.groundM === undefined || b.groundM === undefined || c.groundM === undefined
        ? undefined : a.groundM * u + b.groundM * v + c.groundM * w);
      const floodAccessOffsetM = a.accessOffsetM === undefined || b.accessOffsetM === undefined || c.accessOffsetM === undefined
        ? undefined : a.accessOffsetM * u + b.accessOffsetM * v + c.accessOffsetM * w;
      const stage = options.stage;
      const offset = stage ? stage.tide * (tideResponse ?? stage.fallbackTideResponse ?? 0)
        + stage.season * (seasonResponse ?? stage.fallbackSeasonResponse ?? 0) : 0;
      const physicalHeight = height + offset;
      const bed = stage?.groundHeight ?? groundHeight;
      const wet = !stage || ((floodAccessOffsetM ?? stage.fallbackAccessOffsetM ?? -Infinity) <= offset + 0.001
        && (bed === undefined || physicalHeight - bed > 0.004));
      // A higher but access-blocked face is discarded by the GPU. It must
      // not hide a lower wet confluence face from physical queries. Retain
      // the highest dry candidate only when all candidates are dry, so
      // callers still receive meaningful local level/access diagnostics.
      if (sample && ((selectedWet && !wet) || (selectedWet === wet
        && (physicalHeight < selectedHeight - 1e-7
          || (Math.abs(physicalHeight - selectedHeight) <= 1e-7 && distance2 >= closest))))) continue;
      closest = distance2;
      selectedHeight = physicalHeight; selectedWet = wet;
      sample = { height, fallingSheet: triangle.fallingSheet,
        tideResponse, seasonResponse, groundHeight, floodAccessOffsetM,
        flowX: triangle.flowX, flowY: triangle.flowY, flowZ: triangle.flowZ,
        surfaceNormal: { ...triangle.surfaceNormal },
        bodyIndex: triangle.bodyIndex, riverBand: triangle.riverBand, ribbonId: triangle.ribbonId };
    }
    return sample;
  }

  sheetContact(position: { x: number; y: number; z: number }, radiusM: number, tideM = 0, seasonM = 0) {
    if (![position.x, position.y, position.z, radiusM, tideM, seasonM].every(Number.isFinite) || radiusM < 0 || radiusM > 4) return null;
    const found = new Set<number>();
    for (let z = Math.floor((position.z - radiusM) / this.bucketSizeM); z <= Math.floor((position.z + radiusM) / this.bucketSizeM); z++) {
      for (let x = Math.floor((position.x - radiusM) / this.bucketSizeM); x <= Math.floor((position.x + radiusM) / this.bucketSizeM); x++) {
        for (const index of this.buckets.get(`${x},${z}`) ?? []) found.add(index);
      }
    }
    let best: { position: { x: number; y: number; z: number }; distanceM: number; bodyIndex: number;
      normal: { x: number; y: number; z: number }; flowVelocity: { x: number; y: number; z: number } } | null = null;
    for (const triangle of this.candidateTriangles(found)) {
      if (!triangle.fallingSheet) continue;
      const shifted = (p: Point) => ({ x: p.x, y: p.y + tideM * (p.tideResponse ?? 0) + seasonM * (p.seasonResponse ?? 0), z: p.z });
      const a = shifted(triangle.a), b = shifted(triangle.b), c = shifted(triangle.c);
      if (position.y < Math.min(a.y, b.y, c.y) - radiusM || position.y > Math.max(a.y, b.y, c.y) + radiusM) continue;
      const point = closestSheetPoint(position, a, b, c), distanceM = Math.hypot(point.x - position.x, point.y - position.y, point.z - position.z);
      if (distanceM > radiusM || (best && distanceM >= best.distanceM)) continue;
      const ground = this.nativeGround?.sample?.(point.x, point.z);
      if (ground !== undefined && (ground === null || point.y <= ground + 0.004)) continue;
      const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const length = Math.hypot(nx, ny, nz) || 1;
      const fy = Math.abs(ny) > 1e-12 ? -(nx * triangle.flowX + nz * triangle.flowZ) / ny : triangle.flowY;
      const speed = Math.hypot(triangle.flowX, triangle.flowY, triangle.flowZ);
      const scale = speed / Math.max(1e-12, Math.hypot(triangle.flowX, fy, triangle.flowZ));
      best = { position: point, distanceM, bodyIndex: triangle.bodyIndex, normal: { x: nx / length, y: ny / length, z: nz / length },
        flowVelocity: { x: triangle.flowX * scale, y: fy * scale, z: triangle.flowZ * scale } };
    }
    return best;
  }
}
