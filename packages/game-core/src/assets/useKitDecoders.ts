import { useThree } from "@react-three/fiber";
import { kitDecodersFor, type KitDecoders, type KitRenderer } from "./kitLoader";

/**
 * The current renderer's kit decoders (see kitLoader.ts). The renderer owns
 * them for its life; mounting or unmounting a consumer never builds or
 * disposes one.
 */
export function useKitDecoders(baseUrl: string): KitDecoders {
  // R3F types `gl` as its classic renderer; it is the node renderer (0107).
  const gl = useThree((s) => s.gl) as unknown as KitRenderer;
  return kitDecodersFor(gl, baseUrl);
}
