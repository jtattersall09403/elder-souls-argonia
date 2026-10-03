import type * as THREE from "three";

/**
 * The KTX2 loader a part GLB is parsed with (kitParts.ts). Parts reference a
 * shared pool by URI (`kits/tex/<sha16>.ktx2`), and several parts of one
 * cell use the same texture (KeebaHouseFisher: 118 references to 66 files).
 * GLTFLoader keeps its texture cache per parse, so without this every part
 * would fetch, transcode and upload its own copy. This transcodes each URL
 * once and hands each caller a clone: clones share the `Source`, so three
 * uploads it to the GPU once, and a caller's sampler or colour-space settings
 * never reach another's texture. One per renderer, on its `KitDecoders` (`decoders.textures`,
 * kitLoader.ts), shared by every part loader; no module state.
 */
/** A URL with its `..` segments resolved, kept relative to the origin if it came that way. */
function normalisedUrl(url: string): string {
  const absolute = /^[a-z][a-z0-9+.-]*:/i.test(url);
  const resolved = new URL(url, "http://origin.invalid/");
  return absolute ? resolved.href : `${resolved.pathname}${resolved.search}`;
}

export class SharedKtx2Textures {
  private readonly cache = new Map<string, Promise<THREE.Texture>>();

  constructor(private readonly inner: { loadAsync(url: string): Promise<THREE.Texture> }) {}

  /** GLTFLoader's loader contract (KHR_texture_basisu calls `load`). */
  load(raw: string, onLoad: (t: THREE.Texture) => void, _onProgress?: unknown, onError?: (e: unknown) => void): void {
    // two kits' `parts/../../tex/<sha>.ktx2` URIs resolve to one pool file: one key
    const url = normalisedUrl(raw);
    let promise = this.cache.get(url);
    if (!promise) {
      promise = this.inner.loadAsync(url);
      promise.catch(() => this.cache.delete(url));
      this.cache.set(url, promise);
    }
    promise.then((t) => onLoad(t.clone()), (e) => onError?.(e));
  }

  /** Distinct texture URLs transcoded so far. */
  get size(): number { return this.cache.size; }
}
