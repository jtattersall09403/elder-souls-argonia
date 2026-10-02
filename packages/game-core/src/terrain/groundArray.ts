import * as THREE from "three";
import { useLoader } from "@react-three/fiber";
import type { KitDecoders } from "../assets/kitLoader";
import { useKitDecoders } from "../assets/useKitDecoders";

/** A ground set's albedo array: one KTX2 container (UASTC, encoder mips) whose
 * layers are the materials in id order, then the cliff_rock and cliff_dirt
 * normal maps (written by `pipeline.ground_compress`). `KTX2Loader` returns a
 * `CompressedArrayTexture` that stays BC7/ASTC/ETC2 in VRAM: 42 layers are
 * about 15 MB resident where the PNG upload was 59 MB of RGBA8. It is the one
 * runtime source of the ground albedos: the terrain splat, the apron and the
 * settlement ground paint all sample it, and R3F's loader cache hands every
 * `useGroundArray` caller the same texture. The layer PNGs under
 * `textures/ground/<set>/` are build inputs only and are not published
 * (tooling/pages-site/compose.mjs). */
export const groundArrayUrl = (base: string, set: string) => `${base}textures/ground/${set}/albedo-array.ktx2`;

/** Suspends until the set's albedo array is decoded (see `GroundArrayLoader`). */
export function useGroundArray(base: string, set: string): THREE.CompressedArrayTexture {
  const decoders = useKitDecoders(base);
  return useLoader(GroundArrayLoader, groundArrayUrl(base, set), (l) => { l.setDecoders(decoders); });
}

export class GroundArrayLoader extends THREE.Loader<THREE.CompressedArrayTexture> {
  private decoders: KitDecoders | null = null;
  setDecoders(decoders: KitDecoders): this { this.decoders = decoders; return this; }
  load(url: string, onLoad: (t: THREE.CompressedArrayTexture) => void, _p?: unknown, onError?: (e: unknown) => void): void {
    if (!this.decoders) { onError?.(new Error("GroundArrayLoader: setDecoders first")); return; }
    this.decoders.ktx2.loadAsync(url).then((t) => {
      const tex = t as THREE.CompressedArrayTexture;
      // Sampled raw: the container's sRGB tag on the colour layers must not
      // select an sRGB-decoding GPU format (the splat reads raw bytes; the
      // paint decodes in its shader).
      tex.colorSpace = THREE.NoColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      tex.anisotropy = 4;
      tex.needsUpdate = true;
      onLoad(tex);
    }, (e) => onError?.(e));
  }
}
