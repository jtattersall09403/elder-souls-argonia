import type { BufferGeometry } from 'three';

/** Immutable tile range in a published batch. Indices address the whole batch;
 * readers subtract vertexStart when copying this tile into another batch. */
export interface InlandBatchSpan {
  readonly geometry: BufferGeometry;
  readonly vertexStart: number;
  readonly vertexCount: number;
  readonly indexStart: number;
  readonly indexCount: number;
}
export type InlandBatchSource = BufferGeometry | InlandBatchSpan;
export function inlandSourceRange(source: InlandBatchSource): InlandBatchSpan {
  if ('geometry' in source) return source;
  return { geometry: source, vertexStart: 0, vertexCount: source.getAttribute('position').count,
    indexStart: 0, indexCount: source.index?.count ?? 0 };
}
export function disposeInlandSource(source: InlandBatchSource): void {
  // A span never owns the published GPU geometry. Its JS backing remains
  // reachable until the last source/display reference releases it.
  if (!('geometry' in source)) source.dispose();
}

/** Count complete reachable JS backing allocations, not just the slice a
 * tile reads. Device buffers are outside this existing geometry-array metric. */
export function inlandBackingBytes(sources: readonly InlandBatchSource[], displayed?: BufferGeometry): number {
  const buffers = new Set<ArrayBufferLike>();
  const geometries = new Set(sources.map(source => inlandSourceRange(source).geometry));
  if (displayed) geometries.add(displayed);
  for (const geometry of geometries) {
    for (const attribute of Object.values(geometry.attributes)) buffers.add(attribute.array.buffer);
    if (geometry.index) buffers.add(geometry.index.array.buffer);
  }
  let bytes = 0; for (const buffer of buffers) bytes += buffer.byteLength;
  return bytes;
}
