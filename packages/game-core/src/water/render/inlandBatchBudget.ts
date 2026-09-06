import type { BufferGeometry } from 'three';
import { waterGeometryBytes } from './waterStreaming';

/** Resident tile CPU arrays plus the exact merged draw-buffer layout.
 * A single enhanced tile promotes every vertex in this merged batch.
 * Excludes transient outgoing/replacement buffers during atomic swaps. */
export function inlandBatchBudget(sources: readonly BufferGeometry[]) {
  let sourceBytes = 0, vertices = 0, indices = 0;
  const enhanced = sources.some(source => source.hasAttribute('waterLevelResponse'));
  for (const source of sources) {
    sourceBytes += waterGeometryBytes(source);
    vertices += source.getAttribute('position').count;
    indices += source.index?.count ?? 0;
  }
  const indexBytes = vertices > 65535 ? 4 : 2;
  const vertexBytes = enhanced ? 49 : 19;
  const mergedBytes = vertices * vertexBytes + indices * indexBytes;
  return { sourceBytes, mergedBytes, totalBytes: sourceBytes + mergedBytes,
    vertices, indices, enhanced, vertexBytes, indexBytes };
}
