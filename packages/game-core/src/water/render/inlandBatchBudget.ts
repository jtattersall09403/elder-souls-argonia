import { inlandBackingBytes, inlandSourceRange, type InlandBatchSource } from './inlandBatchSource';

/** Resident tile CPU arrays plus the exact merged draw-buffer layout.
 * A single enhanced tile promotes every vertex in this merged batch.
 * Excludes transient outgoing/replacement buffers during atomic swaps. */
export function inlandBatchBudget(sources: readonly InlandBatchSource[], compactNative = false) {
  let vertices = 0, indices = 0;
  const enhanced = compactNative || sources.some(source => inlandSourceRange(source).geometry.hasAttribute('waterLevelResponse'));
  for (const source of sources) {
    const range = inlandSourceRange(source);
    vertices += range.vertexCount;
    indices += range.indexCount;
  }
  const sourceBytes = inlandBackingBytes(sources);
  const indexBytes = vertices > 65535 ? 4 : 2;
  const vertexBytes = (enhanced ? (compactNative ? 39 : 49) : 19) + (sources.some(source => inlandSourceRange(source).geometry.hasAttribute('waterCellSize')) ? 4 : 0);
  const mergedBytes = vertices * vertexBytes + indices * indexBytes;
  return { sourceBytes, mergedBytes, totalBytes: sourceBytes + mergedBytes,
    vertices, indices, enhanced, vertexBytes, indexBytes };
}
