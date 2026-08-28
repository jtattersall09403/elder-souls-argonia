/**
 * Decoded province water rasters (compiled by `worldgen/compile_water.py`,
 * decision 0025) with bilinear CPU samplers. Construction takes raw typed
 * arrays — PNG decoding is the app's job (needs a canvas) — so this stays
 * portable between the studio and the game.
 *
 * Conventions: world metres, X east / Z south, sea level y = 0; raster (0,0)
 * texel centre sits at world (mpp/2, mpp/2) of the province's NW corner.
 */

export interface WaterMeta {
  surface: {
    file: string;
    size: number;
    metresPerPixel: number;
    minM: number;
    maxM: number;
    buryM: number;
    /** Hi-res shore-distance field (own grayscale PNG) + its saturation. */
    shoreFile?: string;
    shoreMaxM?: number;
  };
  flow: { file: string; size: number; metresPerPixel: number; flowMax: number; shoreMaxM: number };
  klass: { file: string; size: number; metresPerPixel: number; classes: string[] };
  stats?: Record<string, unknown>;
}

export interface WaterStaticSample {
  /** Still-water surface height before tide/season/waves (m). Over dry land
   * this is the buried surface (ground − buryM) — callers use `depthProxy`
   * or a real ground height to decide wetness. */
  surfaceBase: number;
  /** clamp(surface − ground, 0, 25.5) from the compile — 0 means dry. */
  depthProxy: number;
  flowX: number;
  flowZ: number;
  shoreDistM: number;
  classIndex: number;
  className: string;
  turbidity: number;
  salinity: number;
  /** 1 where the wet season raises this surface (fresh lowland). */
  seasonResponse: number;
  /** 1 where the tide moves this surface. Derived from salinity
   * (smoothstep 0.02→0.15) so the GPU can compute the identical value —
   * KEEP IN LOCKSTEP with the water material's esTideResponse(). */
  tideResponse: number;
}

export function tideResponseOf(salinity: number): number {
  const t = Math.min(Math.max((salinity - 0.02) / (0.15 - 0.02), 0), 1);
  return t * t * (3 - 2 * t);
}

export class WaterData {
  constructor(
    readonly meta: WaterMeta,
    /** Dequantised W (m), surface.size², row 0 = north. */
    private readonly surface: Float32Array,
    /** Depth proxy (m), surface.size². */
    private readonly depth: Float32Array,
    /** RGBA bytes of water-flow.png, flow.size². */
    private readonly flow: Uint8ClampedArray,
    /** RGBA bytes of water-class.png, klass.size². */
    private readonly klass: Uint8ClampedArray,
    /** Shore distance (m), surface.size² (surface alpha), optional. */
    private readonly shore?: Float32Array,
  ) {}

  private bilinear(a: Float32Array, size: number, mpp: number, x: number, z: number): number {
    const fx = Math.min(Math.max(x / mpp - 0.5, 0), size - 1.001);
    const fz = Math.min(Math.max(z / mpp - 0.5, 0), size - 1.001);
    const x0 = Math.floor(fx);
    const z0 = Math.floor(fz);
    const tx = fx - x0;
    const tz = fz - z0;
    const i = z0 * size + x0;
    const top = a[i] * (1 - tx) + a[i + 1] * tx;
    const bot = a[i + size] * (1 - tx) + a[i + size + 1] * tx;
    return top * (1 - tz) + bot * tz;
  }

  private outside(x: number, z: number): boolean {
    const extent = this.meta.surface.size * this.meta.surface.metresPerPixel;
    return x < 0 || z < 0 || x >= extent || z >= extent;
  }

  /** Still-water surface height (m) — open sea (0) outside the province. */
  surfaceBase(x: number, z: number): number {
    if (this.outside(x, z)) return 0;
    return this.bilinear(this.surface, this.meta.surface.size, this.meta.surface.metresPerPixel, x, z);
  }

  depthProxy(x: number, z: number): number {
    if (this.outside(x, z)) return 25.5;
    return this.bilinear(this.depth, this.meta.surface.size, this.meta.surface.metresPerPixel, x, z);
  }

  sample(x: number, z: number): WaterStaticSample {
    if (this.outside(x, z)) {
      return {
        surfaceBase: 0, depthProxy: 25.5, flowX: 0, flowZ: 0,
        shoreDistM: this.meta.flow.shoreMaxM, classIndex: 1, className: "coast",
        turbidity: 0.25, salinity: 1, seasonResponse: 0, tideResponse: tideResponseOf(1),
      };
    }
    const fm = this.meta.flow;
    const fx = Math.min(Math.max(Math.round(x / fm.metresPerPixel - 0.5), 0), fm.size - 1);
    const fz = Math.min(Math.max(Math.round(z / fm.metresPerPixel - 0.5), 0), fm.size - 1);
    const fi = (fz * fm.size + fx) * 4;
    const flowX = ((this.flow[fi] / 255 - 0.5) * 2) * fm.flowMax;
    const flowZ = ((this.flow[fi + 1] / 255 - 0.5) * 2) * fm.flowMax;
    // prefer the hi-res shore field (surface alpha) — same data the GPU uses
    const shoreDistM = this.shore
      ? this.bilinear(this.shore, this.meta.surface.size, this.meta.surface.metresPerPixel, x, z)
      : (this.flow[fi + 3] / 255) * fm.shoreMaxM;
    const km = this.meta.klass;
    const kx = Math.min(Math.max(Math.round(x / km.metresPerPixel - 0.5), 0), km.size - 1);
    const kz = Math.min(Math.max(Math.round(z / km.metresPerPixel - 0.5), 0), km.size - 1);
    const ki = (kz * km.size + kx) * 4;
    const classIndex = this.klass[ki];
    const className = km.classes[classIndex] ?? "none";
    return {
      surfaceBase: this.surfaceBase(x, z),
      depthProxy: this.depthProxy(x, z),
      flowX,
      flowZ,
      shoreDistM,
      classIndex,
      className,
      turbidity: this.klass[ki + 1] / 255,
      salinity: this.klass[ki + 2] / 255,
      seasonResponse: this.klass[ki + 3] / 255,
      tideResponse: tideResponseOf(this.klass[ki + 2] / 255),
    };
  }
}
