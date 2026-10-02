import { useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { configureKitLoader } from "@elder-souls/game-core/assets/kitLoader";
import { useKitDecoders } from "@elder-souls/game-core/assets/useKitDecoders";

/**
 * Load a character GLB that ships compressed (race bodies, first-person arms:
 * KTX2/UASTC textures, meshopt geometry; `pipeline/publish_characters.py`).
 * The KTX2 transcoder is the app's own (`basisTranscoder()` serves it under
 * the app's BASE_URL), even when the GLB comes from the shared asset base.
 * Three's own GLTFLoader through R3F's `useLoader` (the kit path), so the
 * decoders type-check without bridging drei's three-stdlib loader types.
 */
export function useCharacterGLTF(url: string) {
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
  const decoders = useKitDecoders(base);
  return useLoader(GLTFLoader, url, (loader) => {
    configureKitLoader(loader, decoders);
  });
}
