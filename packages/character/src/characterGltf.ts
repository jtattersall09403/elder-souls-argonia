import { useLoader } from "@react-three/fiber";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { configureKitLoader, type KitDecoders } from "@elder-souls/game-core/assets/kitLoader";
import { useKitDecoders } from "@elder-souls/game-core/assets/useKitDecoders";

/**
 * Load a character-assets GLB. Every one ships compressed (race bodies,
 * first-person arms, weapons, armour, arrows, quivers, bow rigs, clutter,
 * lights: KTX2 textures, meshopt geometry; `pipeline/publish_characters.py`).
 * The KTX2 transcoder is the app's own (`basisTranscoder()` serves it under
 * the app's BASE_URL), even when the GLB comes from the shared asset base.
 * Three's own GLTFLoader through R3F's `useLoader` (the kit path), so the
 * decoders type-check without bridging drei's three-stdlib loader types.
 */
export function useCharacterGLTF(url: string): GLTF;
export function useCharacterGLTF(urls: string[]): GLTF[];
export function useCharacterGLTF(url: string | string[]): GLTF | GLTF[] {
  const decoders = useCharacterDecoders();
  return useLoader(GLTFLoader, url as string, (loader) => {
    configureKitLoader(loader, decoders);
  });
}

/** The renderer's kit decoders under the app's BASE_URL. */
export function useCharacterDecoders(): KitDecoders {
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
  return useKitDecoders(base);
}

/** Fetch a character-assets GLB into the cache `useCharacterGLTF` reads. */
export function preloadCharacterGLTF(url: string, decoders: KitDecoders): void {
  useLoader.preload(GLTFLoader, url, (loader) => {
    configureKitLoader(loader as GLTFLoader, decoders);
  });
}
