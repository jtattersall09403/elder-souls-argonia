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
  schemaVersion?: number;
  /** Compiled physical descent sites (cascade lips) — optional; the field
   * compiler emits none yet, the particle stack consumes them when it does. */
  cascades?: { id: string; lip: { x: number; y: number; z: number };
    plunge: { x: number; y: number; z: number }; direction: { x: number; y?: number; z: number };
    widthM: number; dropM: number; riverBand: number; bodyIndex: number;
    /** Refined-terrain heights (m) under the fall line, `profileStepM` apart,
     * the first at `profileStartM` from the lip along `direction`. The sheet
     * builder needs them to tell a free cliff from a ramp it must hug. */
    profile?: number[]; profileStepM?: number; profileStartM?: number;
    /** Compiled flow speed at the lip (m/s) — the sheet's launch speed. */
    lipSpeedMS?: number }[];
  /** Steep-reach channel strips (decision 0046 item 4): the renderer draws
   * explicit strip meshes along these and masks the field surface out where
   * `ownerFile` says a strip/fall owns the cell. `join` points overlap the
   * field at each end. Points run downstream; `y` is non-increasing. */
  channels?: { id: string; band: number; points: {
    x: number; z: number; y: number; bedY: number; halfWidthM: number;
    speedMS: number; season: number;
    /** v1: steep|fall|field|join. v2 (decision 0047): join|steep|lip|plunge —
     * a strip ends at a `lip` and resumes at the `plunge`; the sheet bridges. */
    kind: 'steep' | 'fall' | 'field' | 'join' | 'lip' | 'plunge';
    /** Cumulative metres along the chain (v2); computed when absent. */
    arcM?: number;
  }[] }[];
  surface: {
    file: string;
    size: number;
    metresPerPixel: number;
    minM: number;
    maxM: number;
    buryM: number;
    /** Raster grid origin in metres; the field compile leaves it at mpp/2. */
    gridOriginM?: number;
    /** Signed-depth encoding of the B channel (decision 0047):
     * `depth = B/255 · depthSpanM + depthMinM`. v1 omits both (0 / 25.5:
     * unsigned 0.1 m steps); v2 ships −6 / 30.6 so dry-but-floodable "table"
     * cells sit in (−2, 0] and truly dry ground is buried at ≤ −2.5. */
    depthMinM?: number;
    depthSpanM?: number;
    /** Fine access-barrier raster; the field compile emits none. */
    accessMinOffsetM?: number;
    accessSpanM?: number;
    nativeChannelCoverage?: boolean;
    /** Hi-res shore-distance field (own grayscale PNG) + its saturation. */
    shoreFile?: string;
    shoreMaxM?: number;
    /** 8-bit owner mask on the surface grid: 0 field, 128 strip, 255 fall. */
    ownerFile?: string;
  };
  flow: { file: string; size: number; metresPerPixel: number; flowMax: number; shoreMaxM: number; gridOriginM?: number };
  klass: { file: string; size: number; metresPerPixel: number; classes: string[]; gridOriginM?: number };
  stats?: Record<string, unknown>;
}

export interface WaterStaticSample {
  /** Still-water surface height before tide/season/waves (m). Over dry land
   * this is the buried surface (ground − buryM) — callers use `depthProxy`
   * or a real ground height to decide wetness. */
  surfaceBase: number;
  /** SIGNED compiled depth `W − ground` (m), bilinear. Wet ⇔ depth + lift > 0.
   * v1 data cannot go below 0 (dry = 0); v2 carries the table band (−2, 0]
   * and buried ground ≤ −2.5. */
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

/** Signed depth at or below which a texel is BURIED (truly dry ground,
 * W = ground − 3): it never contributes to the level-surface interpolation.
 * Table cells (−2, 0] do, so the plane extends over the floodable band and a
 * season/tide lift can wet it. KEEP IN LOCKSTEP with the GLSL `uSurfBuried`. */
export const BURIED_DEPTH_M = -2.5;
/** Depth reported beyond the province (open sea). */
export const OPEN_SEA_DEPTH_M = 25.5;
/** Default (v1) signed-depth encoding: B · 0.1 m, unsigned. */
export const DEPTH_MIN_DEFAULT_M = 0;
export const DEPTH_SPAN_DEFAULT_M = 25.5;

/** The "not buried" threshold for a raster: v2 (depthMinM < 0) uses
 * BURIED_DEPTH_M; v1 (unsigned) keeps "any nonzero depth" so its dry texels
 * (depth 0, W buried) still never tilt the surface into the bank. */
export function buriedThresholdM(meta: WaterMeta): number {
  const min = meta.surface.depthMinM ?? DEPTH_MIN_DEFAULT_M;
  return Math.max(BURIED_DEPTH_M, min + 1e-3);
}

/** Decode the B channel of water-surface.png (0..255) to signed metres. */
export function decodeDepthByte(b: number, meta: WaterMeta): number {
  return (b / 255) * (meta.surface.depthSpanM ?? DEPTH_SPAN_DEFAULT_M)
    + (meta.surface.depthMinM ?? DEPTH_MIN_DEFAULT_M);
}

export class WaterData {
  private readonly buriedBelow: number;

  constructor(
    readonly meta: WaterMeta,
    /** Dequantised W (m), surface.size², row 0 = north. */
    private readonly surface: Float32Array,
    /** Signed depth (m), surface.size² (see `decodeDepthByte`). */
    private readonly depth: Float32Array,
    /** RGBA bytes of water-flow.png, flow.size². */
    private readonly flow: Uint8ClampedArray,
    /** RGBA bytes of water-class.png (R class, G turbidity, B salinity). */
    private readonly klass: Uint8ClampedArray,
    /** Shore distance (m), surface.size², optional (water-shore.png R). */
    private readonly shore?: Float32Array,
    /** Season response 0..1, surface.size², optional (water-shore.png G).
     * Rides the shore raster because data must NEVER sit in a PNG alpha
     * channel — canvas decoding premultiplies and destroys the RGB (the
     * round-3 tide bug). */
    private readonly season?: Float32Array,
  ) {
    this.buriedBelow = buriedThresholdM(meta);
  }

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

  /** Bilinear over `a`, but weighted by the NOT-BURIED flag of the signed
   *  depth. Buried texels carry W = ground − buryM; mixing that into the
   *  surface tilts the last texel down into the bank and pulls the waterline
   *  ~2 m short. Table texels (dry now, floodable) carry their body's level and
   *  DO count, so the plane runs level across the floodable band.
   *  KEEP IN LOCKSTEP with the GLSL esSurfaceAt(). */
  private bilinearWet(a: Float32Array, size: number, mpp: number, x: number, z: number): number {
    const fx = Math.min(Math.max(x / mpp - 0.5, 0), size - 1.001);
    const fz = Math.min(Math.max(z / mpp - 0.5, 0), size - 1.001);
    const x0 = Math.floor(fx);
    const z0 = Math.floor(fz);
    const tx = fx - x0;
    const tz = fz - z0;
    const i = z0 * size + x0;
    const idx = [i, i + 1, i + size, i + size + 1];
    const bw = [(1 - tx) * (1 - tz), tx * (1 - tz), (1 - tx) * tz, tx * tz];
    let sum = 0;
    let acc = 0;
    for (let k = 0; k < 4; k += 1) {
      if (this.depth[idx[k]] > this.buriedBelow) {
        sum += bw[k];
        acc += bw[k] * a[idx[k]];
      }
    }
    if (sum > 0) return acc / sum;
    return this.bilinear(a, size, mpp, x, z);
  }

  private outside(x: number, z: number): boolean {
    const extent = this.meta.surface.size * this.meta.surface.metresPerPixel;
    return x < 0 || z < 0 || x >= extent || z >= extent;
  }

  /** Still-water surface height (m) — open sea (0) outside the province. */
  surfaceBase(x: number, z: number): number {
    if (this.outside(x, z)) return 0;
    return this.bilinearWet(this.surface, this.meta.surface.size, this.meta.surface.metresPerPixel, x, z);
  }

  /** Signed compiled depth (m), bilinear; open sea beyond the province. */
  depthProxy(x: number, z: number): number {
    if (this.outside(x, z)) return OPEN_SEA_DEPTH_M;
    return this.bilinear(this.depth, this.meta.surface.size, this.meta.surface.metresPerPixel, x, z);
  }

  /** Signed depth including the level lift: `depth + tide·tideResponse +
   * season·seasonResponse`. Wet ⇔ > 0. The renderer's `esVDepth` twin. */
  depthAt(x: number, z: number, tideM = 0, seasonM = 0): number {
    const s = this.sample(x, z);
    return s.depthProxy + tideM * s.tideResponse + seasonM * s.seasonResponse;
  }

  /** True where the point is wet after the lift. */
  isWet(x: number, z: number, tideM = 0, seasonM = 0): boolean {
    return this.depthAt(x, z, tideM, seasonM) > 0;
  }

  sample(x: number, z: number): WaterStaticSample {
    if (this.outside(x, z)) {
      return {
        surfaceBase: 0, depthProxy: OPEN_SEA_DEPTH_M, flowX: 0, flowZ: 0,
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
      seasonResponse: this.season
        ? this.bilinear(this.season, this.meta.surface.size, this.meta.surface.metresPerPixel, x, z)
        : 0,
      tideResponse: tideResponseOf(this.klass[ki + 2] / 255),
    };
  }
}
