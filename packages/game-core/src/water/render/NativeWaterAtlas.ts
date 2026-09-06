import * as THREE from 'three';
import type { NativeWaterGround, NativeGroundAtlasLayout } from '../nativeWaterGround';

export const HERO_FIELD_SCALARS = 128 * 128 * 4;
/** One sampler for immutable sparse ground and the bounded mutable pool.
 * Only the first256KiB changes after initialization, using eight row uploads
 * for the province atlas. No render target, readback or generated artwork. */
export class NativeWaterAtlas {
  readonly field: THREE.DataTexture;
  readonly layout: NativeGroundAtlasLayout | null;
  readonly diagnostics = { gpuUpdates: 0, fullUploads: 0, partialUploads: 0, pendingUploadBytes: 0, residentBytes: 0 };
  private uploaded = false;
  constructor(ground?: NativeWaterGround) {
    this.layout = ground?.gpuLayout(HERO_FIELD_SCALARS) ?? null;
    const width = ground ? 2048 : 128;
    const height = Math.ceil((this.layout?.scalarCount ?? HERO_FIELD_SCALARS) / (width * 4));
    if (height > 2048 || (this.layout?.scalarCount ?? 0) >= 2 ** 24) throw new Error('Native water atlas exceeds bounded2048² texture capacity');
    const pixels = new Float32Array(width * height * 4);
    ground?.writeGpuAtlas(pixels, HERO_FIELD_SCALARS);
    this.field = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat, THREE.FloatType);
    this.field.minFilter = this.field.magFilter = THREE.NearestFilter;
    this.field.generateMipmaps = false; this.field.colorSpace = THREE.NoColorSpace;
    this.field.needsUpdate = true;
    this.diagnostics.residentBytes = pixels.byteLength;
    this.diagnostics.pendingUploadBytes = pixels.byteLength;
    this.field.onUpdate = () => {
      this.diagnostics.gpuUpdates++;
      if (this.uploaded) this.diagnostics.partialUploads++; else this.diagnostics.fullUploads++;
      this.uploaded = true; this.diagnostics.pendingUploadBytes = 0;
    };
  }
  markHeroDirty(): void {
    this.field.clearUpdateRanges();
    if (this.uploaded) {
      const row = this.field.image.width * 4;
      for (let start = 0; start < HERO_FIELD_SCALARS; start += row) this.field.addUpdateRange(start, Math.min(row, HERO_FIELD_SCALARS - start));
    }
    this.diagnostics.pendingUploadBytes = this.uploaded ? HERO_FIELD_SCALARS * 4 : this.diagnostics.residentBytes;
    this.field.needsUpdate = true;
  }
  /** Context restoration must upload immutable ground again, not only hero. */
  invalidate(): void {
    this.uploaded = false; this.field.clearUpdateRanges(); this.field.needsUpdate = true;
    this.diagnostics.pendingUploadBytes = this.diagnostics.residentBytes;
  }
  dispose(): void { this.field.dispose(); }
}

/** Requires the shared uLocalWaterField declaration. Returns true native
 * terrain, including diagonal flips and per-sourcechunk border quantisation. */
export const NATIVE_WATER_GROUND_GLSL = /* glsl */ `
uniform float uNativeGroundActive;
uniform vec4 uNativeGroundInfo; // mpp, gridSize, tileCells, tileStride
uniform vec3 uNativeGroundOffsets; // axis scalar, tile-index scalar, tile-record scalars
float esNativeScalar(int index) {
  ivec2 size = textureSize(uLocalWaterField, 0);
  int pixel = index / 4;
  return texelFetch(uLocalWaterField, ivec2(pixel % size.x, pixel / size.x), 0)[index % 4];
}
int esNativeCell(float p, out float lo, out float hi) {
  int n = int(uNativeGroundInfo.y), base = int(uNativeGroundOffsets.x);
  int cell = clamp(int(floor(p / uNativeGroundInfo.x)), 0, n - 2);
  lo = esNativeScalar(base + cell); hi = esNativeScalar(base + cell + 1);
  if (p < lo && cell > 0) { cell--; hi = lo; lo = esNativeScalar(base + cell); }
  else if (p >= hi && cell < n - 2) { cell++; lo = hi; hi = esNativeScalar(base + cell + 1); }
  return cell;
}
float esNativeGroundAt(vec2 p) {
  float x0, x1, z0, z1;
  int x = esNativeCell(p.x, x0, x1), z = esNativeCell(p.y, z0, z1);
  if (p.x < x0 || p.x > x1 || p.y < z0 || p.y > z1) return 1e9;
  int n = int(uNativeGroundInfo.z), stride = int(uNativeGroundInfo.w);
  int tile = (z / n) * stride + x / n;
  int base = int(esNativeScalar(int(uNativeGroundOffsets.y) + tile));
  if (base == 0) return 1e9;
  int ix = x % n, iz = z % n, sampleIndex = base + iz * (n + 1) + ix;
  float a = esNativeScalar(sampleIndex), b = esNativeScalar(sampleIndex + 1);
  float c = esNativeScalar(sampleIndex + n + 1), d = esNativeScalar(sampleIndex + n + 2);
  vec2 t = (p - vec2(x0,z0)) / vec2(x1-x0,z1-z0);
  int localCell = iz * n + ix;
  int word = int(esNativeScalar(base + (n + 1) * (n + 1) + localCell / 16));
  bool flipped = ((word >> (localCell % 16)) & 1) != 0;
  if (flipped) return t.x >= t.y ? a*(1.0-t.x)+b*(t.x-t.y)+d*t.y : a*(1.0-t.y)+c*(t.y-t.x)+d*t.x;
  return t.x+t.y <= 1.0 ? a*(1.0-t.x-t.y)+b*t.x+c*t.y : d*(t.x+t.y-1.0)+b*(1.0-t.y)+c*(1.0-t.x);
}
`;
