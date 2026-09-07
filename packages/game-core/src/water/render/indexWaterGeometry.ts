import { BufferAttribute, BufferGeometry } from 'three';

/** Exact attribute-preserving indexing. No position/normal/flow rounding and
 * no welding across a hydraulic/material boundary. Hash collisions receive
 * a full typed-value comparison, so they cannot silently corrupt geometry. */
export function indexWaterGeometry(source: BufferGeometry): BufferGeometry {
  const work = indexWaterGeometrySteps(source);
  for (;;) { const result = work.next(); if (result.done) return result.value; }
}

/** The same lossless indexing, resumable within a streaming frame budget. */
export function* indexWaterGeometrySteps(source: BufferGeometry): Generator<void, BufferGeometry> {
  const attributes = Object.entries(source.attributes) as [string, BufferAttribute][];
  const count = source.getAttribute('position').count;
  const heads = new Map<number, number>(), previous = new Int32Array(count), representatives = new Uint32Array(count);
  const remap = new Uint32Array(count), bits = new Uint32Array(1), float = new Float32Array(bits.buffer);
  let unique = 0;
  for (let vertex = 0; vertex < count; vertex++) {
    let hash = 2166136261;
    for (const [, attribute] of attributes) for (let c = 0; c < attribute.itemSize; c++) {
      float[0] = attribute.array[vertex * attribute.itemSize + c];
      hash = Math.imul(hash ^ bits[0], 16777619);
    }
    let candidate = heads.get(hash) ?? -1, match = -1;
    while (candidate >= 0) {
      const other = representatives[candidate];
      let equal = true;
      for (const [, attribute] of attributes) {
        for (let c = 0; c < attribute.itemSize; c++) {
          if (!Object.is(attribute.array[vertex * attribute.itemSize + c], attribute.array[other * attribute.itemSize + c])) { equal = false; break; }
        }
        if (!equal) break;
      }
      if (equal) { match = candidate; break; }
      candidate = previous[candidate] - 1;
    }
    if (match < 0) {
      match = unique++; representatives[match] = vertex;
      previous[match] = (heads.get(hash) ?? -1) + 1; heads.set(hash, match);
    }
    remap[vertex] = match;
    if ((vertex & 127) === 127) yield;
  }
  const geometry = new BufferGeometry();
  for (const [name, attribute] of attributes) {
    const ArrayType = attribute.array.constructor as { new(size: number): typeof attribute.array };
    const values = new ArrayType(unique * attribute.itemSize);
    for (let i = 0; i < unique; i++) {
      for (let c = 0; c < attribute.itemSize; c++) values[i * attribute.itemSize + c] = attribute.array[representatives[i] * attribute.itemSize + c];
      if ((i & 1023) === 1023) yield;
    }
    geometry.setAttribute(name, new BufferAttribute(values, attribute.itemSize, attribute.normalized));
  }
  const sourceIndices = source.index, indices = unique <= 65535 ? new Uint16Array(sourceIndices?.count ?? count) : new Uint32Array(sourceIndices?.count ?? count);
  for (let i = 0; i < indices.length; i++) {
    indices[i] = remap[sourceIndices ? sourceIndices.getX(i) : i];
    if ((i & 2047) === 2047) yield;
  }
  geometry.setIndex(new BufferAttribute(indices, 1));
  return geometry;
}

/** Concatenate independently admitted records into one spatial draw. Existing
 * record-local indices are retained; no cross-record normal averaging. */
export function mergeWaterGeometry(parts: readonly BufferGeometry[]): BufferGeometry {
  const geometry = new BufferGeometry();
  if (!parts.length) { geometry.setAttribute('position', new BufferAttribute(new Float32Array(), 3)); geometry.setIndex([]); return geometry; }
  const vertices = parts.reduce((sum, part) => sum + part.getAttribute('position').count, 0);
  for (const [name, source] of Object.entries(parts[0].attributes) as [string, BufferAttribute][]) {
    const ArrayType = source.array.constructor as { new(size: number): typeof source.array };
    const array = new ArrayType(vertices * source.itemSize);
    let offset = 0;
    for (const part of parts) { const attr = part.getAttribute(name) as BufferAttribute; array.set(attr.array, offset); offset += attr.array.length; }
    geometry.setAttribute(name, new BufferAttribute(array, source.itemSize, source.normalized));
  }
  const indexCount = parts.reduce((sum, part) => sum + part.index!.count, 0);
  const indices = vertices <= 65535 ? new Uint16Array(indexCount) : new Uint32Array(indexCount);
  let cursor = 0, vertexOffset = 0;
  for (const part of parts) {
    for (let i = 0; i < part.index!.count; i++) indices[cursor++] = vertexOffset + part.index!.getX(i);
    vertexOffset += part.getAttribute('position').count;
  }
  geometry.setIndex(new BufferAttribute(indices, 1));
  return geometry;
}
