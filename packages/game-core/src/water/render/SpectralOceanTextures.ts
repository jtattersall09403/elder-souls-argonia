import * as THREE from "three";
import type { TslNode } from "../../render/nodes/materialNodes";
import { SpectralOcean } from "../spectralOcean";
import * as TSL from "three/tsl";
// Loose TSL (decision 0107 §1): the chained typings are too deep for tsc to
// check usefully and cost minutes of type-checking; values are TslNode.
const {If, float, floor, fract, int, ivec2, log2, max, mix, textureLoad, vec3} = TSL as TslNode;

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
    // Compatibility with the existing handle; the shader samples only `field`.
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

/** One band's texel-bilinear field sample at one mip `level` (int node) of
 * cascade `layer` (0..2) from the atlas `field` (texture node of
 * SpectralOceanTextures.field). Levels above 4 are zero. Call inside a Fn. */
export function esOceanGrid(field: TslNode, p: TslNode, lengthM: number, layer: number, level: TslNode): TslNode {
  const out = vec3(0).toVar();
  If(level.lessThanEqual(4), () => {
    const n = int(64).shiftRight(level);
    const grid: TslNode = fract(p.div(lengthM)).mul(float(n));
    const a: TslNode = ivec2(floor(grid));
    const b = a.add(1).mod(n);
    const t: TslNode = fract(grid);
    const row = int(layer * 128 + 128).sub(n.mul(2));
    const fetch = (x: TslNode, y: TslNode) => textureLoad(field, ivec2(x, y.add(row))).rgb;
    out.assign(mix(mix(fetch(a.x, a.y), fetch(b.x, a.y), t.x), mix(fetch(a.x, b.y), fetch(b.x, b.y), t.x), t.y));
  });
  return out;
}

/** Footprint-filtered sum of the populated mip levels of one cascade band. */
export function esOceanBand(field: TslNode, p: TslNode, layer: 0 | 1 | 2, footprintM: TslNode): TslNode {
  const lengthM = layer === 0 ? 512.0 : (layer === 1 ? 96.0 : 16.0);
  const lod = max(0.0, log2(max(1.0, float(footprintM).mul(2.0).mul(64.0).div(lengthM))));
  const first = int(floor(lod));
  // Levels with no possible modes in this band's authored wavelength range.
  const last = layer === 0 ? 3 : 2;
  const out = vec3(0).toVar();
  If(first.lessThanEqual(last), () => {
    const blend = fract(lod);
    const a = esOceanGrid(field, p, lengthM, layer, first);
    out.assign(a);
    If(blend.greaterThanEqual(0.00001), () => {
      const b = vec3(0).toVar();
      If(first.lessThan(last), () => { b.assign(esOceanGrid(field, p, lengthM, layer, first.add(1))); });
      out.assign(mix(a, b, blend));
    });
  });
  return out;
}

/** Filtered ocean spectrum at world XZ `p` (vec2) for a pixel footprint in
 * metres: `spectrum` = vec3(height, slopeX, slopeZ) summed over the three
 * cascades, `detailSlope` = the two finer cascades' slope (vec2). `field` is
 * a texture node of SpectralOceanTextures.field (the ONLY sampler). */
export function esOceanSpectrum(field: TslNode, p: TslNode, footprintM: TslNode): { spectrum: TslNode; detailSlope: TslNode } {
  const detail = esOceanBand(field, p, 1, footprintM).add(esOceanBand(field, p, 2, footprintM)).toVar();
  return { spectrum: esOceanBand(field, p, 0, footprintM).add(detail), detailSlope: detail.yz };
}
