import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import type * as THREE from "three";
import { kitDecodersFor, releaseKitDecoders, retainKitDecoders, type KitDecoders } from "./kitLoader";

/**
 * The current renderer's kit decoders (see kitLoader.ts); stable per renderer.
 * The hold is released when the consumer unmounts, so the KTX2 worker pool dies
 * with its Canvas instead of living on beside the next one's.
 */
export function useKitDecoders(baseUrl: string): KitDecoders {
  const gl = useThree((s) => s.gl) as THREE.WebGLRenderer;
  const decoders = kitDecodersFor(gl, baseUrl);
  useEffect(() => {
    retainKitDecoders(gl, baseUrl);
    return () => releaseKitDecoders(gl, baseUrl);
  }, [gl, baseUrl]);
  return decoders;
}
