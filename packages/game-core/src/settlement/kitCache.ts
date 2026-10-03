import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { KitPartsIndex } from "../assets/kitParts";

/**
 * One loaded GLTF per published kit id, shared by every runtime layer that
 * draws kit pieces (the settlement layer, the interior loader), so a kit
 * resident outside is not loaded again inside: the same GLTF, the same
 * geometry buffers on the GPU. Owned and injected by the scene that mounts
 * the layers (no module state); a failed load is forgotten so the next ask
 * retries. The cache is unbounded for its owner's life: eviction is the
 * Phase 14 streaming item (docs/phases/P-polish/backlog.md).
 */
export class KitCache {
  private readonly entries = new Map<string, Promise<GLTF>>();

  /** The kit's GLTF, loading it through `load(url)` only if no one has asked yet. */
  load(kitId: string, url: string, load: (url: string) => Promise<GLTF>): Promise<GLTF> {
    let entry = this.entries.get(kitId);
    if (!entry) {
      entry = load(url);
      entry.catch(() => { if (this.entries.get(kitId) === entry) this.entries.delete(kitId); });
      this.entries.set(kitId, entry);
    }
    return entry;
  }

  private readonly indexes = new Map<string, Promise<KitPartsIndex>>();

  /** The kit's parts index (decision 0120), fetched through `load()` only once; a failure is forgotten. */
  partsIndex(kitId: string, load: () => Promise<KitPartsIndex>): Promise<KitPartsIndex> {
    let entry = this.indexes.get(kitId);
    if (!entry) {
      entry = load();
      entry.catch(() => { if (this.indexes.get(kitId) === entry) this.indexes.delete(kitId); });
      this.indexes.set(kitId, entry);
    }
    return entry;
  }

  /** Kit ids asked for so far. */
  get kitIds(): string[] { return [...this.entries.keys()]; }
}
