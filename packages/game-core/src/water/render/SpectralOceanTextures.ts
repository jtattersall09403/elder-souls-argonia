import * as THREE from "three";
import { SpectralOcean } from "../spectralOcean";

/** One reused CPU-temporally-blended atlas. This trades a bounded 384KiB
 * upload per rendered frame for half the endpoint texture fetches. No
 * sampler increase for mip levels; no float-linear extension is required. */
export class SpectralOceanTextures {
  readonly field: THREE.DataTexture;
  readonly previous: THREE.DataTexture;
  readonly next: THREE.DataTexture;
  private revision = -1;
  private alpha = NaN;
  readonly diagnostics = { uploads: 0, blendedFloats: 0, uploadBytes: 0 };
  constructor(readonly ocean: SpectralOcean) {
    const size = ocean.cascades[0].size;
    this.field = new THREE.DataTexture(new Float32Array(size * size * 8 * ocean.cascades.length),
      size, size * 2 * ocean.cascades.length, THREE.RGBAFormat, THREE.FloatType);
    this.field.minFilter = this.field.magFilter = THREE.NearestFilter;
    this.field.generateMipmaps = false; this.field.colorSpace = THREE.NoColorSpace;
    // Compatibility with the existing handle; GLSL samples only previous.
    this.previous = this.next = this.field;
    this.diagnostics.uploadBytes = (this.field.image.data as Float32Array).byteLength;
  }
  sync(): void {
    if (this.ocean.revision === this.revision && this.ocean.alpha === this.alpha) return;
    const size = this.ocean.cascades[0].size, pixels = this.field.image.data as Float32Array;
    let written = 0;
    for (let layer = 0; layer < this.ocean.cascades.length; layer++) {
      const cascade = this.ocean.cascades[layer];
      let row = layer * size * 2;
      for (let level = 0; level < cascade.previousLods.length; level++) {
        const n = size >> level, before = cascade.previousLods[level], after = cascade.nextLods[level];
        for (let z = 0; z < n; z++) for (let x = 0; x < n * 4; x++) {
          pixels[(row + z) * size * 4 + x] = before[z * n * 4 + x] * (1 - this.ocean.alpha) + after[z * n * 4 + x] * this.ocean.alpha;
          written++;
        }
        row += n;
      }
    }
    this.field.needsUpdate = true; this.diagnostics.uploads++; this.diagnostics.blendedFloats = written;
    this.revision = this.ocean.revision; this.alpha = this.ocean.alpha;
  }
  dispose(): void { this.field.dispose(); }
}

export const SPECTRAL_OCEAN_GLSL = /* glsl */ `
uniform sampler2D uOceanPrevious;
uniform float uOceanEnabled;
vec3 esOceanGrid(vec2 p, float lengthM, int layer, int level) {
  if (level > 4) return vec3(0.0);
  int n = 64 >> level;
  vec2 grid = fract(p / lengthM) * float(n);
  ivec2 a = ivec2(floor(grid));
  ivec2 b = (a + 1) % n;
  vec2 t = fract(grid);
  int row = layer * 128 + 128 - 2 * n;
  return mix(mix(texelFetch(uOceanPrevious, ivec2(a.x, a.y + row), 0).rgb,
                 texelFetch(uOceanPrevious, ivec2(b.x, a.y + row), 0).rgb, t.x),
             mix(texelFetch(uOceanPrevious, ivec2(a.x, b.y + row), 0).rgb,
                 texelFetch(uOceanPrevious, ivec2(b.x, b.y + row), 0).rgb, t.x), t.y);
}
vec3 esOceanBand(vec2 p, int layer, float footprintM) {
  float lengthM = layer == 0 ? 512.0 : (layer == 1 ? 96.0 : 16.0);
  float lod = max(0.0, log2(max(1.0, 2.0 * footprintM * 64.0 / lengthM)));
  int first = int(floor(lod));
  // Levels with no possible modes in this band's authored wavelength range.
  int last = layer == 0 ? 3 : 2;
  if (first > last) return vec3(0.0);
  float blend = fract(lod);
  vec3 a = esOceanGrid(p, lengthM, layer, first);
  if (blend < 0.00001) return a;
  vec3 b = first < last ? esOceanGrid(p, lengthM, layer, first + 1) : vec3(0.0);
  return mix(a, b, blend);
}
vec3 esOceanSpectrum(vec2 p, float footprintM, out vec2 detailSlope) {
  vec3 detail = esOceanBand(p, 1, footprintM) + esOceanBand(p, 2, footprintM);
  detailSlope = detail.yz;
  return esOceanBand(p, 0, footprintM) + detail;
}`;
