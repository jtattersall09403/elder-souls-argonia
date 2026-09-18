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
 * The decoders are cached on the renderer instance (a `KTX2Loader` owns a
 * worker pool; one per renderer, never per load), not in module state.
 */
import type * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

export interface KitDecoders {
  readonly ktx2: KTX2Loader;
  readonly meshopt: typeof MeshoptDecoder;
  /** The site base the transcoder was resolved against. */
  readonly baseUrl: string;
  dispose(): void;
}

export const TRANSCODER_DIR = "basis/";

/** Build decoders for a renderer. Prefer `kitDecodersFor`, which caches. */
export function createKitDecoders(renderer: THREE.WebGLRenderer, baseUrl: string): KitDecoders {
  const ktx2 = new KTX2Loader().setTranscoderPath(`${baseUrl}${TRANSCODER_DIR}`).detectSupport(renderer);
  return {
    ktx2,
    meshopt: MeshoptDecoder,
    baseUrl,
    dispose() { ktx2.dispose(); },
  };
}

const DECODERS = Symbol.for("elder-souls.kitDecoders");
type Carrier = THREE.WebGLRenderer & { [DECODERS]?: KitDecoders };

/** The renderer's decoders, created on first use and shared by every kit load. */
export function kitDecodersFor(renderer: THREE.WebGLRenderer, baseUrl: string): KitDecoders {
  const carrier = renderer as Carrier;
  const existing = carrier[DECODERS];
  if (existing && existing.baseUrl === baseUrl) return existing;
  existing?.dispose();
  const created = createKitDecoders(renderer, baseUrl);
  carrier[DECODERS] = created;
  return created;
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
