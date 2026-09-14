/**
 * Decoded province water rasters (compiled by `worldgen/compile_water.py`,
 * decision 0025) with bilinear CPU samplers. Construction takes raw typed
 * arrays — PNG decoding is the app's job (needs a canvas) — so this stays
 * portable between the studio and the game.
 *
 * Conventions: world metres, X east / Z south, sea level y = 0; raster (0,0)
 * texel centre sits at world (mpp/2, mpp/2) of the province's NW corner.
 */

/** The compiled water schema this runtime reads (compile_water.py). A
 * bundle of another version is refused at load, never quietly decoded. */
export const WATER_SCHEMA_VERSION = 3;

/** Throws when `meta` is not the schema this runtime was written for. */
export function assertWaterSchema(meta: WaterMeta): void {
  if (meta.schemaVersion !== WATER_SCHEMA_VERSION) {
    throw new Error(`water-meta.json schemaVersion ${String(meta.schemaVersion)}: this runtime reads schema `
      + `${WATER_SCHEMA_VERSION} (re-run worldgen.compile_water, or npm run province:fetch)`);
  }
}

/** One graph entity the id raster names: a body or a reach (schema 3). */
export interface WaterEntity {
  id: string;
  kind: string;
  levelM: number | null;
  season?: string;
  drySeasonLevelM?: number | null;
  origin?: string;
}

export interface WaterMeta {
  schemaVersion?: number;
  /** Schema 3: the graph entities the id raster's labels index (label = 1 + index). */
  entities?: WaterEntity[];
  /** Schema 3: the season is a DRAW-DOWN from the compiled high-water line. */
  season?: { amplitudeM: number; model?: string };
  /** Compiled physical descent sites (cascade lips) — optional; the field
   * compiler emits none yet, the particle stack consumes them when it does. */
  cascades?: { id: string; lip: { x: number; y: number; z: number };
    plunge: { x: number; y: number; z: number }; direction: { x: number; y?: number; z: number };
    widthM: number; dropM: number; riverBand: number; bodyIndex: number;
    /** The width the WATER occupies at the lip (m), derived from the flow —
     * `widthM` is the channel's hydraulic (bank-to-bank) width and the water
     * inside that trench does not fill it. Absent on pre-2026-09-09 compiles;
     * the renderer falls back to `widthM`. */
    wettedWidthM?: number;
    /** Refined-terrain heights (m) under the fall line, `profileStepM` apart,
     * the first at `profileStartM` from the lip along `direction`. The sheet
     * builder needs them to tell a free cliff from a ramp it must hug. */
    profile?: number[]; profileStepM?: number; profileStartM?: number;
    /** Compiled flow speed at the lip (m/s) — the sheet's launch speed. */
    lipSpeedMS?: number;
    /** 16c: the ballistic throw (m), the plunge bowl's radius (m) and the
     * held pool depth (m) the compile dug — the kit stack and the mist
     * volume size the base from them. */
    throwM?: number; bowlRadiusM?: number; holdM?: number }[];
  /** Steep-reach channel strips (decision 0046 item 4): the renderer draws
   * explicit strip meshes along these and masks the field surface out where
   * `ownerFile` says a strip/fall owns the cell. `join` points overlap the
   * field at each end. Points run downstream; `y` is non-increasing. */
  channels?: { id: string; band: number; points: {
    x: number; z: number; y: number; bedY: number; halfWidthM: number;
    /** Half-width of the WETTED cross-section here (m); `halfWidthM` is the
     * trench. Absent on older compiles — callers fall back to `halfWidthM`. */
    wettedHalfWidthM?: number;
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
    /** Schema 3: 16-bit entity label per texel (R,G), 0 = none. */
    idFile?: string;
  };
  flow: { file: string; size: number; metresPerPixel: number; flowMax: number; shoreMaxM: number; gridOriginM?: number;
    /** Schema 3: B = sqrt(fetch / fetchMaxM), the open-water directional fetch. */
    fetchMaxM?: number };
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
  /** Open-water fetch (m) the waves reaching this point have crossed (the
   * compiled directional fetch, schema 3); the shore distance on older data. */
  fetchM: number;
  /** The graph id of the body or reach owning this point (schema 3), else null. */
  entityId: string | null;
  classIndex: number;
  className: string;
  turbidity: number;
  salinity: number;
  /** DRAW-DOWN response 0..1: the dry season lowers this surface by
   * `season.amplitudeM × seasonResponse` (schema 3; the compiled level is
   * the high-water line and nothing ever rises above it). */
  seasonResponse: number;
  /** 1 where the tide moves this surface: the sea's own classes, which the
   * compile takes from the graph (coast, and estuary for a brackish inlet or
   * a lagoon). KEEP IN LOCKSTEP with the water material's esTideResponse(). */
  tideResponse: number;
}

/** The tide moves the water the graph calls tidal, read from the CLASS.
 *
 * It used to be read from the Phase 3 salinity field (smoothstep 0.02→0.15).
 * That field is near zero in brackish inlets, so 3,592 texels of open sea sat
 * still while the coast beside them fell a metre at springs — a wall of water
 * at river mouths at low tide, and the measured seam was 8,539 texels against
 * 3,153 for this rule (2026-09-14). Salinity stays what it is: chemistry for
 * colour and surf, not a proxy for whether a surface is tidal (0065/0066:
 * read the record, do not infer it). Class order is `meta.klass.classes`.
 */
export const TIDAL_CLASSES = ["coast", "estuary"] as const;

export function tideResponseOfClass(classIndex: number, classes: readonly string[]): number {
  const name = classes[Math.round(classIndex)];
  return name !== undefined && (TIDAL_CLASSES as readonly string[]).includes(name) ? 1 : 0;
}

/** GLSL twin of `tideResponseOfClass`, baked over the compiled class table
 * (index order from `water-meta.json` `klass.classes`). */
export function tideResponseGlsl(classes: readonly string[]): string {
  const tidal = classes
    .map((name, i) => ((TIDAL_CLASSES as readonly string[]).includes(name) ? i : -1))
    .filter((i) => i >= 0);
  const test = tidal.length
    ? tidal.map((i) => `ci == ${i}`).join(" || ")
    : "false";
  return `
  // KEEP IN LOCKSTEP with tideResponseOfClass(): the tide moves the classes
  // the graph calls tidal (${TIDAL_CLASSES.join(", ")}), never a salinity proxy.
  float esTideResponse(float classIndex){
    int ci = int(classIndex + 0.5);
    return (${test}) ? 1.0 : 0.0;
  }
  `;
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
    /** Entity label per texel (water-id.png, schema 3), surface.size². */
    private readonly ids?: Uint16Array,
  ) {
    this.buriedBelow = buriedThresholdM(meta);
  }

  /** The graph entity (body or reach) owning world (x, z), or null. */
  entityAt(x: number, z: number): WaterEntity | null {
    if (!this.ids || !this.meta.entities || this.outside(x, z)) return null;
    const size = this.meta.surface.size;
    const mpp = this.meta.surface.metresPerPixel;
    const ix = Math.min(Math.max(Math.round(x / mpp - 0.5), 0), size - 1);
    const iz = Math.min(Math.max(Math.round(z / mpp - 0.5), 0), size - 1);
    const label = this.ids[iz * size + ix];
    return label > 0 ? this.meta.entities[label - 1] ?? null : null;
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

  /** Still-water surface height (m). Beyond the raster the EDGE texel
   * continues (clamp-to-edge, the GLSL twin's rule): a sea border carries
   * the sea outward, a land border carries buried ground, so the province
   * edge is never a seam between the raster and a hard plane (audit
   * mechanism 5). */
  surfaceBase(x: number, z: number): number {
    return this.bilinearWet(this.surface, this.meta.surface.size, this.meta.surface.metresPerPixel, x, z);
  }

  /** Signed compiled depth (m), bilinear; the edge texel beyond the raster. */
  depthProxy(x: number, z: number): number {
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
    // schema 3: the open-water fetch rides the flow raster's B (sqrt-encoded)
    const fetchM = fm.fetchMaxM !== undefined ? (this.flow[fi + 2] / 255) ** 2 * fm.fetchMaxM : shoreDistM;
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
      fetchM,
      entityId: this.entityAt(x, z)?.id ?? null,
      classIndex,
      className,
      turbidity: this.klass[ki + 1] / 255,
      salinity: this.klass[ki + 2] / 255,
      seasonResponse: this.season
        ? this.bilinear(this.season, this.meta.surface.size, this.meta.surface.metresPerPixel, x, z)
        : 0,
      tideResponse: tideResponseOfClass(this.klass[ki], this.meta.klass.classes ?? []),
    };
  }
}
