/**
 * Province map overlays (perf10 K5). Overlay images are decoded only while
 * their layer is on, and released when it goes off, so the browser's
 * decoded-image cache never holds the whole set; rasters read for hover
 * lookups are decoded from their bytes with decodePng, never an Image or a
 * canvas (decision 0108 decodePng rule).
 */
import { decodePng } from "@elder-souls/game-core/terrain/groundRasters";

/** Which overlays to start loading and which to release for this layer set. A `failed` overlay (its PNG missing) is never fetched again. */
export function overlayLoadPlan(
  layers: Record<string, boolean>,
  loaded: Iterable<string>,
  pending: Iterable<string>,
  known: Iterable<string>,
  failed: Iterable<string> = [],
): { load: string[]; release: string[] } {
  const have = new Set(loaded);
  const busy = new Set([...pending, ...failed]);
  const load: string[] = [];
  const release: string[] = [];
  for (const name of known) {
    if (layers[name] && !have.has(name) && !busy.has(name)) load.push(name);
  }
  for (const name of have) if (!layers[name]) release.push(name);
  return { load, release };
}

/** RGBA pixels of a PNG at `url`, or null when it is missing or unreadable. */
export async function fetchPngPixels(url: string): Promise<{ width: number; height: number; data: Uint8Array } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await decodePng(new Uint8Array(await res.arrayBuffer()));
  } catch {
    return null;
  }
}
