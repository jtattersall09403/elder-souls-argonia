import { useThree } from "@react-three/fiber";
import type * as THREE from "three";
import { kitDecodersFor, type KitDecoders } from "./kitLoader";

/** The current renderer's kit decoders (see kitLoader.ts); stable per renderer. */
export function useKitDecoders(baseUrl: string): KitDecoders {
  const gl = useThree((s) => s.gl) as THREE.WebGLRenderer;
  return kitDecodersFor(gl, baseUrl);
}
