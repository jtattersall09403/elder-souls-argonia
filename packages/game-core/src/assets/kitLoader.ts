/**
 * The one way a kit GLB is loaded at runtime.
 *
 * Every published kit is compressed by `pipeline/kit_compress.py` (owner
 * 2026-09-18, pulled forward from Phase 14): KTX2/UASTC textures
 * (`KHR_texture_basisu`) and meshopt geometry (`EXT_meshopt_compression`,
 * `KHR_mesh_quantization`). A plain `GLTFLoader` rejects such a file, so
 * every kit load goes through here:
 *
 *   const decoders = kitDecodersFor(renderer, baseUrl);   // once per renderer
 *   const gltf = await createKitLoader(decoders).loadAsync(url);
 *   useLoader(GLTFLoader, url, (l) => configureKitLoader(l, decoders));  // R3F
 *
 * The KTX2 transcoder is served at `${baseUrl}basis/` by
 * `@elder-souls/basis-transcoder/plugin` (both apps) — the same base the
 * kits load from, so the Pages sub-path is right by construction. The
 * transcoded format is chosen per device by `detectSupport` (BC7 on
 * desktop, ASTC on mobile, ETC2 as the floor), and the texture STAYS
 * compressed in VRAM. The meshopt decoder is a wasm module three.js bundles
 * inline (no file to serve).
 *
 * The renderer is the node renderer (decision 0107); `createRenderer` has
 * already awaited `init()`, which `detectSupport` needs on WebGPU to read
 * the device's compression features (three r181+: no async variant).
 *
 * The decoders are owned by the renderer instance for its life (a
 * `KTX2Loader` owns a worker pool; one per renderer, never per load or per
 * component), not in module state.
 */
import type { WebGPURenderer } from "three/webgpu";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { SharedKtx2Textures } from "./sharedTextures";

/** The renderer kits are decoded for (the shared node renderer). */
export type KitRenderer = WebGPURenderer;

export interface KitDecoders {
  readonly ktx2: KTX2Loader;
  readonly meshopt: typeof MeshoptDecoder;
  /** The renderer's one kit texture pool: every part loader (settlements, interiors, flora, groundcover) transcodes and uploads a `kits/tex` file once (decision 0120). */
  readonly textures: SharedKtx2Textures;
  /** The site base the transcoder was resolved against. */
  readonly baseUrl: string;
  dispose(): void;
}

export const TRANSCODER_DIR = "basis/";

/** KTX2 transcode workers per renderer (three's default is 4, each with its own wasm Memory). */
export const KTX2_WORKERS = 2;

/** Build decoders for a renderer. Runtime code uses `kitDecodersFor`, which owns them on the renderer. */
export function createKitDecoders(renderer: KitRenderer, baseUrl: string): KitDecoders {
  const ktx2 = new KTX2Loader().setTranscoderPath(`${baseUrl}${TRANSCODER_DIR}`).detectSupport(renderer);
  ktx2.setWorkerLimit(KTX2_WORKERS);
  rejectOnWorkerError(ktx2);
  return {
    ktx2,
    meshopt: MeshoptDecoder,
    textures: new SharedKtx2Textures(ktx2),
    baseUrl,
    dispose() { ktx2.dispose(); },
  };
}

interface PoolInternals {
  workers: Worker[];
  workersResolve: Array<((msg: unknown) => void) | undefined>;
  workerStatus: number;
  queue: Array<{ resolve: (msg: unknown) => void; msg: unknown; transfer: Transferable[] }>;
  _initWorker(id: number): void;
}

/**
 * three's WorkerPool listens only for 'message': a worker whose wasm aborted
 * (e.g. "Out of memory" while instantiating the transcoder) never posts back,
 * its busy bit stays set and every task routed to it, with its whole glTF
 * promise chain, parks forever (webgpu10 diag D §1). On 'error' the pending
 * task gets an error reply (KTX2Loader rejects it, GLTFLoader's texture falls
 * to null), the dead worker is dropped so the next task builds a fresh one,
 * and the slot is freed.
 */
export function rejectOnWorkerError(ktx2: KTX2Loader): void {
  const pool = (ktx2 as unknown as { workerPool: PoolInternals }).workerPool;
  const init = pool._initWorker.bind(pool);
  pool._initWorker = (id: number) => {
    const fresh = !pool.workers[id];
    init(id);
    if (!fresh) return;
    const worker = pool.workers[id];
    worker.addEventListener("error", (event: Event) => {
      if (pool.workers[id] !== worker) return;
      event.preventDefault?.();
      const resolve = pool.workersResolve[id];
      pool.workersResolve[id] = undefined;
      worker.terminate();
      delete pool.workers[id];
      const message = (event as ErrorEvent).message || "KTX2 worker failed";
      resolve?.({ data: { type: "error", error: message } });
      const next = pool.queue.shift();
      if (next) {
        pool._initWorker(id);
        pool.workersResolve[id] = next.resolve;
        pool.workers[id].postMessage(next.msg, next.transfer);
      } else {
        pool.workerStatus &= ~(1 << id);
      }
    });
  };
}

const DECODERS = Symbol.for("elder-souls.kitDecoders");
interface Slot { decoders: KitDecoders; builds: number }
type Carrier = KitRenderer & { [DECODERS]?: Slot };

/**
 * The renderer's decoders: owned by the renderer for its whole life (built by
 * `installKitDecoders` in createRenderer, disposed with the renderer) and
 * handed to every GLTFLoader. A component never creates or disposes them, so
 * a React remount cannot build a second loader, blob URL or wasm pool.
 * Renderers made outside createRenderer (harness scenes) get theirs here on
 * first use, under the same lifetime.
 */
export function kitDecodersFor(renderer: KitRenderer, baseUrl: string): KitDecoders {
  const slot = (renderer as Carrier)[DECODERS];
  if (slot) return slot.decoders;
  return attach(renderer, baseUrl).decoders;
}

function attach(renderer: KitRenderer, baseUrl: string): Slot {
  const carrier = renderer as Carrier;
  const slot: Slot = { decoders: createKitDecoders(renderer, baseUrl), builds: 1 };
  carrier[DECODERS] = slot;
  const dispose = renderer.dispose?.bind(renderer);
  if (dispose) {
    renderer.dispose = () => {
      slot.decoders.dispose();
      delete carrier[DECODERS];
      dispose();
    };
  }
  return slot;
}

/**
 * Build the renderer's decoders and load the transcoder now, while the heap is
 * small, so the wasm instances exist before the world streams. Called once by
 * createRenderer after `init()`.
 */
export async function installKitDecoders(renderer: KitRenderer, baseUrl: string): Promise<KitDecoders> {
  const decoders = kitDecodersFor(renderer, baseUrl);
  await decoders.ktx2.init();
  return decoders;
}

/** How many decoder sets this renderer has built (diag: 1 for its whole life; more is churn). */
export function kitDecoderBuilds(renderer: KitRenderer): number {
  return (renderer as Carrier)[DECODERS]?.builds ?? 0;
}

/** Wire a GLTFLoader (R3F's `useLoader` extension callback, or any instance). */
export function configureKitLoader(loader: GLTFLoader, decoders: KitDecoders): GLTFLoader {
  loader.setKTX2Loader(decoders.ktx2);
  loader.setMeshoptDecoder(decoders.meshopt);
  return loader;
}

export function createKitLoader(decoders: KitDecoders): GLTFLoader {
  return configureKitLoader(new GLTFLoader(), decoders);
}

/** A loader for kit PARTS: their `kits/tex` textures come from the renderer's shared pool (`decoders.textures`). */
export function createKitPartLoader(decoders: KitDecoders): GLTFLoader {
  return createKitLoader(decoders).setKTX2Loader(decoders.textures as unknown as KTX2Loader);
}
