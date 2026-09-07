import type { WaterMeta } from './waterData';
import { RasterCutouts, validateRasterCutoutMeta } from './rasterCutouts';
import { fetchWaterBinary } from './fetchWaterBinary';

export async function fetchRasterCutouts(baseUrl: string, meta: WaterMeta, signal: AbortSignal): Promise<RasterCutouts | undefined> {
  const descriptor = meta.rasterCutouts;
  if (!descriptor) return undefined;
  validateRasterCutoutMeta(descriptor);
  if (descriptor.gridSize !== meta.surface.size || descriptor.metresPerPixel !== meta.surface.metresPerPixel
    || descriptor.surfaceOriginM !== (meta.surface.gridOriginM ?? meta.surface.metresPerPixel * 0.5)
    || descriptor.classGrid.size !== meta.klass.size || descriptor.classGrid.metresPerPixel !== meta.klass.metresPerPixel
    || descriptor.classGrid.gridOriginM !== (meta.klass.gridOriginM ?? meta.klass.metresPerPixel * 0.5)
    || descriptor.crossSectionsSha256 !== meta.crossSections?.sha256)
    throw new Error('Raster cutouts do not match water grid or cross sections');
  // Capture the serialized source before PackedCrossSections attaches getters.
  const source = new TextEncoder().encode(JSON.stringify(meta.ribbons ?? []));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', source));
  const hash = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
  if (hash !== descriptor.sourceRibbonsSha256) throw new Error('Raster cutouts do not match channel records');
  signal.throwIfAborted();
  return new RasterCutouts(descriptor, await fetchWaterBinary(baseUrl, descriptor, signal));
}
