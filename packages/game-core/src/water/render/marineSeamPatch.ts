import * as THREE from 'three';
import type { WaterData } from '../waterData';
import type { RasterDomainBounds } from './rasterWaterDomain';

export interface MarineSeamOptions { maximumCellM?: number; transitionM?: number; maxTriangles?: number }
export interface MarineSeamPatch {
  geometry: THREE.BufferGeometry;
  bounds: RasterDomainBounds;
  /** Exact source edge endpoints; useful for the animated handoff oracle. */
  boundaryEdges: readonly (readonly [number, number])[];
  diagnostics: { sourceTriangles: number; triangles: number; vertices: number; bytes: number; subdivision: number; scannedTriangles: number };
}
interface Vertex { x: number; z: number; override: number[]; levels: number[]; ground: number; owner: number; normal: number[]; cell: number }
interface Face { vertices: [Vertex, Vertex, Vertex]; keys: [string, string, string]; owner: number }

/** Native-aligned perimeter stays beyond the6m full-detail player ring,
 * leaving at least one native cell for filter/triangulation transition. */
export function marineNearBounds(x: number, z: number, nativeMpp: number): RasterDomainBounds {
  if (![x, z, nativeMpp].every(Number.isFinite) || nativeMpp <= 0 || nativeMpp > 8) throw new RangeError('Invalid marine near domain');
  // Extra native cell gives movement hysteresis after reserving the actual
  // transition band; a patch must not rebuild for every centimetre moved.
  const radius = 6 + nativeMpp * 2;
  return { minX: Math.fround(Math.floor((x - radius) / nativeMpp) * nativeMpp),
    minZ: Math.fround(Math.floor((z - radius) / nativeMpp) * nativeMpp),
    maxX: Math.fround(Math.ceil((x + radius) / nativeMpp) * nativeMpp),
    maxZ: Math.fround(Math.ceil((z + radius) / nativeMpp) * nativeMpp) };
}

/** Refines WHOLE displayed coarse faces, never a guessed rectangle grid.
 * Interior edges use a common subdivision. Every exposed edge retains only
 * its original endpoints: monotone collapse of its extra boundary samples
 * produces a non-overlapping fan in the first fine row. No hanging animated
 * perimeter vertex is introduced. Original boundary attributes (including
 * filter footprint and explicit/legacy semantic samples) are copied exactly.
 *
 * The source must be the displayed step1 near region. A face crossing the
 * requested perimeter is rejected, rather than silently clipping its waves.
 * Native-footprint cuts and class/owner partitions are retained verbatim. */
export function* marineSeamPatchSteps(data: WaterData, sources: readonly THREE.BufferGeometry[], bounds: RasterDomainBounds,
  options: MarineSeamOptions = {}): Generator<void, MarineSeamPatch> {
  const cellM = options.maximumCellM ?? .125, transition = options.transitionM ?? data.meta.surface.metresPerPixel;
  const maxTriangles = Math.min(524288, options.maxTriangles ?? 262144);
  if (!data.meta.surface.nativeChannelCoverage || !Object.values(bounds).every(Number.isFinite)
    || bounds.maxX <= bounds.minX || bounds.maxZ <= bounds.minZ || Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) > 64
    || cellM < .125 || cellM > 1 || !Number.isFinite(transition) || transition <= 0) throw new RangeError('Invalid native marine seam patch');
  const faces: Face[] = [], edges = new Map<string, { count: number; a: Vertex; b: Vertex }>();
  let scanned = 0, largestAxisSpan = 0;
  const inside = (v: Vertex) => v.x >= bounds.minX && v.x <= bounds.maxX && v.z >= bounds.minZ && v.z <= bounds.maxZ;
  const vertexKey = (v: Vertex) => `${v.x},${v.z}`;
  const sourceKey = (v: Vertex) => `${vertexKey(v)}:${v.override}:${v.levels}:${v.ground}:${v.owner}:${v.normal}:${v.cell}`;
  const edgeKey = (a: Vertex, b: Vertex) => { const x = vertexKey(a), y = vertexKey(b); return x < y ? `${x}/${y}` : `${y}/${x}`; };
  for (const geometry of sources) {
    const position = geometry.getAttribute('position'), index = geometry.index;
    if (!position || !index) throw new Error('Marine seam source must be indexed displayed geometry');
    const read = (i: number): Vertex => {
      const values = (name: string, n: number, fallback: number[]) => {
        const a = geometry.getAttribute(name); return a ? Array.from({ length: n }, (_, component) => a.getComponent(i, component)) : fallback;
      };
      return { x: position.getX(i), z: position.getZ(i), override: values('waterOverride', 4, [0, 0, 0, -2]),
        levels: values('waterLevelResponse', 3, [0, 0, 0]), ground: values('waterGround', 1, [0])[0],
        owner: values('waterBodyIndex', 1, [0])[0], normal: values('normal', 3, [0, 1, 0]), cell: values('waterCellSize', 1, [0])[0] };
    };
    for (let i = 0; i < index.count; i += 3) {
      if ((++scanned & 63) === 0) yield;
      const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
      const xs = ids.map(j => position.getX(j)), zs = ids.map(j => position.getZ(j));
      if (Math.max(...xs) <= bounds.minX || Math.min(...xs) >= bounds.maxX || Math.max(...zs) <= bounds.minZ || Math.min(...zs) >= bounds.maxZ) continue;
      const v = ids.map(read) as [Vertex, Vertex, Vertex];
      if (!v.every(inside)) throw new Error('Marine patch perimeter cuts a displayed coarse face; wait for native step1 coverage');
      if (v.some(vertex => vertex.override[3] !== -2)) throw new Error('Marine seam source contains a non-marine face');
      const keys = [edgeKey(v[0], v[1]), edgeKey(v[1], v[2]), edgeKey(v[2], v[0])] as [string, string, string];
      for (let edge = 0; edge < 3; edge++) {
        const a = v[edge], b = v[(edge + 1) % 3], existing = edges.get(keys[edge]);
        if (existing) existing.count++; else edges.set(keys[edge], { count: 1, a, b });
        largestAxisSpan = Math.max(largestAxisSpan, Math.abs(a.x - b.x), Math.abs(a.z - b.z));
      }
      faces.push({ vertices: v, keys, owner: data.rasterBodyIndexAt((v[0].x + v[1].x + v[2].x) / 3, (v[0].z + v[1].z + v[2].z) / 3) });
      if (faces.length > 4096) throw new RangeError('Marine seam source exceeds bounded near-face budget');
    }
  }
  const n = Math.max(1, Math.ceil(largestAxisSpan / cellM));
  if (faces.length * n * n > maxTriangles) throw new RangeError('Marine seam refinement exceeds near geometry budget');
  if ([...edges.values()].some(edge => edge.count > 2)) throw new Error('Marine displayed source has overlapping/non-manifold edges');
  const boundaryKeys = new Set([...edges].filter(([, edge]) => edge.count === 1).map(([key]) => key));
  const borderVertices = new Set<string>();
  for (const key of boundaryKeys) { const edge = edges.get(key)!; borderVertices.add(vertexKey(edge.a)); borderVertices.add(vertexKey(edge.b)); }
  const positions: number[] = [], overrides: number[] = [], levels: number[] = [], grounds: number[] = [], owners: number[] = [], normals: number[] = [], cells: number[] = [], indices: number[] = [];
  const sourceEndpoints = new Map<string, number>();
  let work = 0;
  const append = (v: Vertex): number => {
    const i = grounds.length; positions.push(v.x, 0, v.z); overrides.push(v.override[0], v.override[1], v.override[2], -3);
    levels.push(...v.levels); grounds.push(v.ground); owners.push(v.owner); normals.push(...v.normal); cells.push(v.cell); return i;
  };
  const smooth = (t: number) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
  for (const face of faces) {
    const [a, b, c] = face.vertices;
    const ids = new Map<string, number>();
    const point = (u: number, v: number): number => {
      let weights = [n - u - v, u, v];
      // Locked AB, BC, CA edges keep exactly their source endpoints.
      const locked = v === 0 ? 0 : u + v === n ? 1 : u === 0 ? 2 : -1;
      if (locked >= 0 && boundaryKeys.has(face.keys[locked as 0 | 1 | 2])) {
        const dominant = weights.indexOf(Math.max(...weights)); weights = [0, 0, 0]; weights[dominant] = n;
      }
      const key = weights.join(','); const cached = ids.get(key); if (cached !== undefined) return cached;
      const sourceIndex = weights.indexOf(n), source = sourceIndex >= 0 ? face.vertices[sourceIndex] : undefined;
      let vertex: Vertex;
      if (source) {
        vertex = { ...source, owner: source.levels[2] > .5 ? source.owner : face.owner,
          cell: borderVertices.has(vertexKey(source)) ? source.cell : cellM };
      } else {
        const w = weights.map(value => value / n), x = Math.fround(a.x * w[0] + b.x * w[1] + c.x * w[2]), z = Math.fround(a.z * w[0] + b.z * w[1] + c.z * w[2]);
        let sx = Math.fround(face.vertices.reduce((sum, p, i) => sum + (p.levels[2] > .5 ? p.override[1] : p.x) * w[i], 0));
        let sz = Math.fround(face.vertices.reduce((sum, p, i) => sum + (p.levels[2] > .5 ? p.override[2] : p.z) * w[i], 0));
        if (data.rasterBodyIndexAt(sx, sz) !== face.owner) {
          const cx = (a.x + b.x + c.x) / 3, cz = (a.z + b.z + c.z) / 3;
          sx = Math.fround(sx + Math.sign(cx - sx) * Math.max(2 ** -149, 2 ** (Math.floor(Math.log2(Math.abs(sx))) - 23)));
          sz = Math.fround(sz + Math.sign(cz - sz) * Math.max(2 ** -149, 2 ** (Math.floor(Math.log2(Math.abs(sz))) - 23)));
        }
        if (data.rasterBodyIndexAt(sx, sz) !== face.owner) throw new Error('Fine marine vertex crosses its displayed hydraulic owner');
        const sample = data.boundaryAt(sx, sz, undefined, false);
        const distance = Math.min(x - bounds.minX, bounds.maxX - x, z - bounds.minZ, bounds.maxZ - z);
        const parentCell = face.vertices.reduce((sum, p, i) => sum + Math.max(.125, p.cell) * w[i], 0);
        vertex = { x, z, override: [0, sx, sz, -3], levels: [sample.tideResponse, sample.seasonResponse, 1],
          ground: sample.surfaceBase - sample.depthProxy, owner: face.owner, normal: [0, 1, 0], cell: cellM + (parentCell - cellM) * (1 - smooth(distance / transition)) };
      }
      const i = append(vertex); ids.set(key, i);
      if (source) sourceEndpoints.set(sourceKey(source), i);
      return i;
    };
    for (let v = 0; v < n; v++) for (let u = 0; u < n - v; u++) {
      if ((++work & 63) === 0) yield;
      const aa = point(u, v), bb = point(u + 1, v), cc = point(u, v + 1);
      if (aa !== bb && bb !== cc && cc !== aa) indices.push(aa, bb, cc);
      if (u + v < n - 1) {
        const dd = point(u + 1, v + 1); if (bb !== dd && dd !== cc && cc !== bb) indices.push(bb, dd, cc);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('waterOverride', new THREE.Float32BufferAttribute(overrides, 4));
  geometry.setAttribute('waterLevelResponse', new THREE.Float32BufferAttribute(levels, 3));
  geometry.setAttribute('waterGround', new THREE.Float32BufferAttribute(grounds, 1));
  geometry.setAttribute('waterBodyIndex', new THREE.Uint16BufferAttribute(owners, 1));
  geometry.setAttribute('waterCellSize', new THREE.Float32BufferAttribute(cells, 1));
  geometry.setIndex(indices);
  const bytes = Object.values(geometry.attributes).reduce((sum, attribute) => sum + attribute.array.byteLength, 0) + geometry.index!.array.byteLength;
  return { geometry, bounds, boundaryEdges: [...boundaryKeys].map(key => { const edge = edges.get(key)!; return [sourceEndpoints.get(sourceKey(edge.a))!, sourceEndpoints.get(sourceKey(edge.b))!] as const; }),
    diagnostics: { sourceTriangles: faces.length, triangles: indices.length / 3, vertices: grounds.length, bytes, subdivision: n, scannedTriangles: scanned } };
}
