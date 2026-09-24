import type { AudioBackend, ClipHandle } from "./backend";
import type { AssetId, AudioManifest } from "./manifest";

/** How long a failed asset is left alone before one more try (s). */
export const FAILED_RETRY_S = 30;

export type FetchBytes = (url: string) => Promise<ArrayBuffer>;

export const defaultFetchBytes: FetchBytes = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`audio: ${res.status} for ${url}`);
  return res.arrayBuffer();
};

export interface AssetCacheOptions {
  backend: AudioBackend;
  manifest: AudioManifest;
  /** URL prefix of the audio root, ending in `/` (the app's `<base>audio/`). */
  baseUrl: string;
  fetchBytes?: FetchBytes;
  /**
   * Ceiling on IDLE decoded audio kept for reuse (bytes); least recently used
   * idle clips go first. Playing and pinned clips are the scene's working set,
   * bounded by the voice budgets and the scene's prefetch, not by this: 12
   * median beds decode to ~19 MB, every combat clip to ~32 MB (0095).
   */
  maxIdleDecodedBytes?: number;
  /** Idle clips (not playing) unload after this long unused (s). */
  idleUnloadS?: number;
  /**
   * Wall clock (s) for spacing retries of a failed load. Not the backend's
   * clock, which stands still while the context is suspended; default Date.now.
   */
  wallClock?: () => number;
}

interface Entry {
  clip: ClipHandle;
  lastUsed: number;
  retained: number;
}

/**
 * Streaming: an asset is fetched and decoded the first time something needs
 * it, kept while it plays (retain/release), and unloaded when it has been
 * idle too long or the decoded ceiling is exceeded. Only the manifest is
 * loaded up front (decision 0094).
 */
export class AssetCache {
  private entries = new Map<AssetId, Entry>();
  /** Pins survive loading and unloading: a pinned asset is never evicted. */
  private pins = new Map<AssetId, number>();
  /** A failed fetch or decode is not retried before this WALL-clock time (s): no refetch every frame, and a
   * failure before the first gesture (backend clock frozen) still retries on time. */
  private failedUntil = new Map<AssetId, number>();
  private pending = new Map<AssetId, Promise<ClipHandle>>();
  private decoded = 0;
  private fetched = 0;
  private readonly fetchBytes: FetchBytes;
  private readonly maxIdle: number;
  private readonly idleS: number;
  private readonly wall: () => number;

  constructor(private readonly o: AssetCacheOptions) {
    this.fetchBytes = o.fetchBytes ?? defaultFetchBytes;
    this.maxIdle = o.maxIdleDecodedBytes ?? 16 * 1024 * 1024;
    this.idleS = o.idleUnloadS ?? 60;
    this.wall = o.wallClock ?? (() => Date.now() / 1000);
  }

  /** The decoded clip if resident (and marks it used). */
  get(id: AssetId): ClipHandle | undefined {
    const e = this.entries.get(id);
    if (e) e.lastUsed = this.o.backend.now();
    return e?.clip;
  }

  load(id: AssetId): Promise<ClipHandle> {
    const e = this.entries.get(id);
    if (e) {
      e.lastUsed = this.o.backend.now();
      return Promise.resolve(e.clip);
    }
    const inflight = this.pending.get(id);
    if (inflight) return inflight;
    const retry = this.failedUntil.get(id);
    if (retry !== undefined && this.wall() < retry) return Promise.reject(new Error(`audio: ${id} failed recently`));
    const asset = this.o.manifest.assets[id];
    if (!asset) return Promise.reject(new Error(`audio: unknown asset ${id}`));
    const p = this.fetchBytes(this.o.baseUrl + asset.file)
      .then((bytes) => {
        this.fetched += bytes.byteLength;
        return this.o.backend.decode(bytes);
      })
      .then((clip) => {
        this.pending.delete(id);
        this.entries.set(id, { clip, lastUsed: this.o.backend.now(), retained: 0 });
        this.decoded += clip.decodedBytes;
        return clip;
      })
      .catch((err) => {
        this.pending.delete(id);
        this.failedUntil.set(id, this.wall() + FAILED_RETRY_S);
        throw err;
      });
    this.pending.set(id, p);
    return p;
  }

  pin(id: AssetId): void {
    this.pins.set(id, (this.pins.get(id) ?? 0) + 1);
  }

  unpin(id: AssetId): void {
    const n = (this.pins.get(id) ?? 0) - 1;
    if (n > 0) this.pins.set(id, n);
    else this.pins.delete(id);
  }

  retain(id: AssetId): void {
    const e = this.entries.get(id);
    if (e) e.retained++;
  }

  release(id: AssetId): void {
    const e = this.entries.get(id);
    if (e && e.retained > 0) {
      e.retained--;
      e.lastUsed = this.o.backend.now();
    }
  }

  /** Unload idle unpinned clips past `idleUnloadS`, then the least recently used while idle bytes pass the ceiling. */
  evict(): void {
    const now = this.o.backend.now();
    for (const [id, e] of this.entries) {
      if (e.retained === 0 && !this.pins.has(id) && now - e.lastUsed > this.idleS) this.drop(id, e);
    }
    const idle = [...this.entries].filter(([id, e]) => e.retained === 0 && !this.pins.has(id));
    let idleBytes = idle.reduce((sum, [, e]) => sum + e.clip.decodedBytes, 0);
    if (idleBytes <= this.maxIdle) return;
    idle.sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    for (const [id, e] of idle) {
      if (idleBytes <= this.maxIdle) break;
      idleBytes -= e.clip.decodedBytes;
      this.drop(id, e);
    }
  }

  stats(): { resident: number; decodedBytes: number; fetchedBytes: number; pending: number } {
    return { resident: this.entries.size, decodedBytes: this.decoded, fetchedBytes: this.fetched, pending: this.pending.size };
  }

  isResident(id: AssetId): boolean {
    return this.entries.has(id);
  }

  private drop(id: AssetId, e: Entry): void {
    this.entries.delete(id);
    this.decoded -= e.clip.decodedBytes;
    this.o.backend.release(e.clip);
  }
}
