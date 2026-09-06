/**
 * Decoded province water rasters (compiled by `worldgen/compile_water.py`,
 * decision 0025) with bilinear CPU samplers. Construction takes raw typed
 * arrays — PNG decoding is the app's job (needs a canvas) — so this stays
 * portable between the studio and the game.
 *
 * Conventions: world metres, X east / Z south, sea level y = 0. Schema 2
 * records each raster's grid origin explicitly; legacy defaults to mpp/2.
 */

import { ChannelRibbonSampler, type ChannelRibbonRecord } from "./channelRibbons";
import type { PackedCrossSectionMeta } from './packedCrossSections';
import type { NativeWaterGround, NativeWaterGroundDescriptor } from './nativeWaterGround';
import { isPhysicalWaterBody, type WaterBodyIdentity, type WaterBodyRecord } from './waterBodies';

export interface WaterMeta {
  schemaVersion?: number;
  /** Index identifies a hydraulic surface owner; connected basin membership
   * is separate and must never imply a shared standing head. */
  bodies?: (WaterBodyIdentity | WaterBodyRecord)[];
  ribbons?: ChannelRibbonRecord[];
  crossSections?: PackedCrossSectionMeta;
  nativeGround?: NativeWaterGroundDescriptor;
  cascades?: { id: string; lip: { x: number; y: number; z: number };
    plunge: { x: number; y: number; z: number }; direction: { x: number; z: number };
    widthM: number; dropM: number; riverBand: number; bodyIndex: number }[];
  terrainMismatches?: { id: string; x: number; z: number; status: string; reason: string }[];
  surface: {
    file: string;
    size: number;
    metresPerPixel: number;
    minM: number;
    maxM: number;
    buryM: number;
    gridOriginM?: number;
    supportFile?: string;
    bedOverlayFile?: string;
    terrainTopologyFile?: string;
    depthMinM?: number;
    /** R128 support pixels are proxy-only: native channel geometry owns them. */
    nativeChannelCoverage?: boolean;
    /** RG16 minimum access stage, B fine tidal response; no PNG alpha data. */
    accessFile?: string;
    accessMinOffsetM?: number;
    accessSpanM?: number;
    /** Hi-res shore-distance field (own grayscale PNG) + its saturation. */
    shoreFile?: string;
    shoreMaxM?: number;
  };
  flow: { file: string; size: number; metresPerPixel: number; flowMax: number; shoreMaxM: number; gridOriginM?: number };
  klass: { file: string; size: number; metresPerPixel: number; classes: string[]; gridOriginM?: number; characterFile?: string };
  stats?: Record<string, unknown>;
}

export interface WaterStaticSample {
  fallingSheet?: boolean;
  supported: boolean;
  bodyIndex: number;
  waterBodyId: string | null;
  riverBand: number;
  region: number;
  waveShelter: number;
  tannin: number;
  /** Still-water surface height before tide/season/waves (m). Schema 2
   * extends nearby planes into dry margins; supported + depth decides wetness. */
  surfaceBase: number;
  /** Signed surface − ground in schema 2 (legacy unsigned). */
  depthProxy: number;
  /** Minimum tide+season stage needed to cross an intervening bank. */
  floodAccessOffsetM?: number;
  flowX: number;
  /** Ribbons follow their actual sloping plane; raster currents are level. */
  flowY?: number;
  flowZ: number;
  surfaceNormal?: { x: number; y: number; z: number };
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

export interface WaterBoundaryStaticSample {
  surfaceBase: number;
  depthProxy: number;
  floodAccessOffsetM?: number;
  tideResponse: number;
  seasonResponse: number;
  supported: boolean;
  waterBodyId: string | null;
  flowX?: number;
  flowZ?: number;
}

export function tideResponseOf(salinity: number): number {
  const t = Math.min(Math.max((salinity - 0.02) / (0.15 - 0.02), 0), 1);
  return t * t * (3 - 2 * t);
}

export class WaterData {
  private readonly bodyIds: Map<number, string>;
  private readonly physicalBodies: Map<string, WaterBodyRecord>;
  readonly ribbons: ChannelRibbonSampler;
  constructor(
    readonly meta: WaterMeta,
    /** Dequantised W (m), surface.size², row 0 = north. */
    private readonly surface: Float32Array,
    /** Depth proxy (m), surface.size². */
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
    private readonly support?: Uint8ClampedArray,
    private readonly character?: Uint8ClampedArray,
    private readonly tannin?: Float32Array,
    /** Shared RGBA source bytes: retain fine access/tide without float copies. */
    private readonly access?: Uint8ClampedArray,
    readonly nativeGround?: NativeWaterGround,
    /** Sum of the actual authored tide and season maxima, injected by loader. */
    maximumStageOffsetM?: number,
  ) {
    if (meta.nativeGround && !nativeGround) throw new Error('Water metadata requires its matching native ground provider');
    this.bodyIds = new Map(meta.bodies?.map(b => [b.index, b.id]));
    this.physicalBodies = new Map(meta.bodies?.filter(isPhysicalWaterBody).map(b => [b.id, b]));
    this.ribbons = new ChannelRibbonSampler(meta.ribbons ?? [], 32, nativeGround, maximumStageOffsetM);
  }

  waterBodyIdForIndex(index: number): string | null { return this.bodyIds.get(index) ?? null; }
  /** Physical metadata only; current wetness/levels still require sample(). */
  waterBodyRecord(id: string | null): Readonly<WaterBodyRecord> | null { return id === null ? null : this.physicalBodies.get(id) ?? null; }

  private bilinear(a: Float32Array, size: number, mpp: number, x: number, z: number): number {
    const origin = this.meta.surface.gridOriginM ?? mpp * 0.5;
    const fx = Math.min(Math.max((x - origin) / mpp, 0), size - 1.001);
    const fz = Math.min(Math.max((z - origin) / mpp, 0), size - 1.001);
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

  private channel(a: Uint8ClampedArray, meta: { size: number; metresPerPixel: number; gridOriginM?: number }, x: number, z: number, channel: number): number {
    const origin = meta.gridOriginM ?? meta.metresPerPixel * 0.5;
    const fx = Math.min(meta.size - 1.001, Math.max(0, (x - origin) / meta.metresPerPixel));
    const fz = Math.min(meta.size - 1.001, Math.max(0, (z - origin) / meta.metresPerPixel));
    const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
    const i = (iz * meta.size + ix) * 4 + channel;
    return (a[i] * (1 - tx) + a[i + 4] * tx) * (1 - tz)
      + (a[i + meta.size * 4] * (1 - tx) + a[i + meta.size * 4 + 4] * tx) * tz;
  }

  private rasterSupported(index: number): boolean {
    return !this.support || (this.meta.surface.nativeChannelCoverage
      ? this.support[index] === 255 : this.support[index] > 127);
  }

  /** Standing heads are discrete hydraulic planes, not a heightfield to
   * smooth between different owners. Same-owner signed dry fringe still
   * participates so a shoreline can move continuously with its own stage. */
  private rasterPlaneAt(x: number, z: number, out?: { surfaceBase: number; depthProxy: number }) {
    const result = out ?? { surfaceBase: 0, depthProxy: 0 }, sm = this.meta.surface;
    if (!sm.nativeChannelCoverage || !this.support) {
      result.surfaceBase = this.bilinear(this.surface, sm.size, sm.metresPerPixel, x, z);
      result.depthProxy = this.bilinear(this.depth, sm.size, sm.metresPerPixel, x, z);
      return result;
    }
    const origin = sm.gridOriginM ?? sm.metresPerPixel * 0.5;
    const fx = Math.min(sm.size - 1, Math.max(0, (x - origin) / sm.metresPerPixel));
    const fz = Math.min(sm.size - 1, Math.max(0, (z - origin) / sm.metresPerPixel));
    const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
    const nearest = (Math.round(fz) * sm.size + Math.round(fx)) * 4;
    const g = this.support[nearest + 1], b = this.support[nearest + 2];
    let total = 0, height = 0, depth = 0;
    for (let dz = 0; dz <= 1; dz++) for (let dx = 0; dx <= 1; dx++) {
      const index = Math.min(sm.size - 1, iz + dz) * sm.size + Math.min(sm.size - 1, ix + dx), p = index * 4;
      if (this.support[p + 1] !== g || this.support[p + 2] !== b) continue;
      const weight = (dx ? tx : 1 - tx) * (dz ? tz : 1 - tz);
      total += weight; height += this.surface[index] * weight; depth += this.depth[index] * weight;
    }
    result.surfaceBase = total > 0 ? height / total : this.surface[nearest / 4];
    result.depthProxy = total > 0 ? depth / total : this.depth[nearest / 4];
    return result;
  }

  /** CPU twin of the shader's owner-aware fine level stencil. Body identity
   * is discrete; same-owner dry fringe still contributes, another owner's
   * access sentinel/tide/season never bleeds across the boundary. */
  private fineLevelsAt(x: number, z: number): { accessOffset?: number; tide: number; season: number } {
    const sm = this.meta.surface;
    if (!this.access) return { tide: tideResponseOf(this.channel(this.klass, this.meta.klass, x, z, 2) / 255),
      season: this.season ? this.bilinear(this.season, sm.size, sm.metresPerPixel, x, z) : 0 };
    const origin = sm.gridOriginM ?? sm.metresPerPixel * 0.5;
    const gx = (x - origin) / sm.metresPerPixel, gz = (z - origin) / sm.metresPerPixel;
    const fx = Math.min(sm.size - 1, Math.max(0, gx)), fz = Math.min(sm.size - 1, Math.max(0, gz));
    const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
    const nearest = Math.min(sm.size - 1, Math.max(0, Math.round(gz))) * sm.size
      + Math.min(sm.size - 1, Math.max(0, Math.round(gx)));
    const ownerAt = (index: number) => this.support ? this.support[index * 4 + 1] * 256 + this.support[index * 4 + 2] : 0;
    const owner = ownerAt(nearest);
    let total = 0, access = 0, tide = 0, season = 0;
    for (let dz = 0; dz <= 1; dz++) for (let dx = 0; dx <= 1; dx++) {
      const index = Math.min(sm.size - 1, iz + dz) * sm.size + Math.min(sm.size - 1, ix + dx);
      if (ownerAt(index) !== owner) continue;
      const weight = (dx ? tx : 1 - tx) * (dz ? tz : 1 - tz), p = index * 4;
      total += weight;
      access += (this.access[p] * 256 + this.access[p + 1]) * weight;
      tide += this.access[p + 2] / 255 * weight;
      season += (this.season?.[index] ?? 0) * weight;
    }
    if (total === 0) {
      total = 1; access = this.access[nearest * 4] * 256 + this.access[nearest * 4 + 1];
      tide = this.access[nearest * 4 + 2] / 255; season = this.season?.[nearest] ?? 0;
    }
    return { accessOffset: sm.accessMinOffsetM! + access / total / 65535 * sm.accessSpanM!,
      tide: tide / total, season: season / total };
  }

  /** Still-water surface height (m) — open sea (0) outside the province. */
  surfaceBase(x: number, z: number): number {
    if (this.outside(x, z)) return 0;
    return this.rasterPlaneAt(x, z).surfaceBase;
  }

  depthProxy(x: number, z: number): number {
    if (this.outside(x, z)) return 25.5;
    return this.rasterPlaneAt(x, z).depthProxy;
  }

  /** Discrete raster classification without flow/chemistry/ribbon sampling.
   * Useful when selecting the raster mesh's LOD; ribbons own their own mesh. */
  rasterClassAt(x: number, z: number): number {
    if (this.outside(x, z)) return 1;
    const m = this.meta.klass, origin = m.gridOriginM ?? m.metresPerPixel * 0.5;
    const ix = Math.min(m.size - 1, Math.max(0, Math.round((x - origin) / m.metresPerPixel)));
    const iz = Math.min(m.size - 1, Math.max(0, Math.round((z - origin) / m.metresPerPixel)));
    const klass = this.klass[(iz * m.size + ix) * 4];
    return this.support && klass === 0 ? 4 : klass;
  }

  /** Minimal static support/depth path. Optional current reuses the ribbon
   * query and skips wave/normal/chemistry evaluation; geometry-only callers
   * do not pay for raster flow decoding.
   * An optional output avoids tens of thousands of allocations per refresh. */
  boundaryAt(x: number, z: number, out?: WaterBoundaryStaticSample, includeRibbons = true, excludeFallingSheets = false, includeCurrent = false): WaterBoundaryStaticSample {
    const result = out ?? { surfaceBase: 0, depthProxy: 0, tideResponse: 0, seasonResponse: 0, supported: false, waterBodyId: null };
    result.floodAccessOffsetM = undefined;
    result.flowX = 0; result.flowZ = 0;
    if (this.outside(x, z)) {
      result.surfaceBase = 0; result.depthProxy = 25.5;
      result.tideResponse = 1; result.seasonResponse = 0;
      result.supported = true; result.waterBodyId = "water.province.open-sea";
      return result;
    }
    const sm = this.meta.surface;
    const origin = sm.gridOriginM ?? sm.metresPerPixel * 0.5;
    const gx = (x - origin) / sm.metresPerPixel;
    const gz = (z - origin) / sm.metresPerPixel;
    this.rasterPlaneAt(x, z, result);
    const surface = result.surfaceBase, depth = result.depthProxy;
    const levels = this.fineLevelsAt(x, z);
    // Raster mesh construction excludes native footprints separately; its
    // support/body tests must not inherit the overlaid ribbon's identity.
    const ribbon = includeRibbons && this.meta.ribbons?.length ? this.ribbons.sample(x, z, { excludeFallingSheets }) : null;
    result.seasonResponse = ribbon?.seasonResponse ?? levels.season;
    result.surfaceBase = ribbon?.height ?? surface;
    result.floodAccessOffsetM = ribbon?.floodAccessOffsetM ?? levels.accessOffset;
    const ground = ribbon?.groundHeight;
    result.depthProxy = ground !== undefined && ribbon ? ribbon.height - ground : depth + (ribbon ? ribbon.height - surface : 0);
    const sx = Math.min(sm.size - 1, Math.max(0, Math.round(gx)));
    const sz = Math.min(sm.size - 1, Math.max(0, Math.round(gz)));
    const si = (sz * sm.size + sx) * 4;
    result.supported = ribbon !== null || this.rasterSupported(si);
    const km = this.meta.klass;
    if (!result.supported) result.waterBodyId = null;
    else if (ribbon) result.waterBodyId = this.bodyIds.get(ribbon.bodyIndex) ?? (this.support ? null : "river");
    else if (this.support) result.waterBodyId = this.bodyIds.get(this.support[si + 1] * 256 + this.support[si + 2]) ?? null;
    else {
      const kOrigin = km.gridOriginM ?? km.metresPerPixel * 0.5;
      const kx = Math.min(km.size - 1, Math.max(0, Math.round((x - kOrigin) / km.metresPerPixel)));
      const kz = Math.min(km.size - 1, Math.max(0, Math.round((z - kOrigin) / km.metresPerPixel)));
      const klass = this.klass[(kz * km.size + kx) * 4];
      result.waterBodyId = this.bodyIds.get(klass) ?? km.classes[klass] ?? "none";
    }
    result.tideResponse = ribbon?.tideResponse ?? levels.tide;
    if (includeCurrent && result.supported) {
      result.flowX = ribbon?.flowX ?? this.flowComponentAt(x, z, 0);
      result.flowZ = ribbon?.flowZ ?? this.flowComponentAt(x, z, 1);
    }
    return result;
  }

  private flowComponentAt(x: number, z: number, component: number): number {
    const value = this.channel(this.flow, this.meta.flow, x, z, component);
    return Math.abs(value - 127.5) <= 0.5 ? 0 : ((value / 255 - 0.5) * 2) * this.meta.flow.flowMax;
  }

  sample(x: number, z: number, options: { excludeFallingSheets?: boolean } = {}): WaterStaticSample {
    if (this.outside(x, z)) {
      return {
        supported: true, bodyIndex: 65535, waterBodyId: "water.province.open-sea",
        riverBand: 0, region: 0, waveShelter: 1, tannin: 0,
        surfaceBase: 0, depthProxy: 25.5, flowX: 0, flowZ: 0,
        shoreDistM: this.meta.flow.shoreMaxM, classIndex: 1, className: "coast",
        turbidity: 0.25, salinity: 1, seasonResponse: 0, tideResponse: tideResponseOf(1),
      };
    }
    const fm = this.meta.flow;
    const fx = Math.min(Math.max(Math.round((x - (fm.gridOriginM ?? fm.metresPerPixel * 0.5)) / fm.metresPerPixel), 0), fm.size - 1);
    const fz = Math.min(Math.max(Math.round((z - (fm.gridOriginM ?? fm.metresPerPixel * 0.5)) / fm.metresPerPixel), 0), fm.size - 1);
    const fi = (fz * fm.size + fx) * 4;
    const flowX = this.flowComponentAt(x, z, 0);
    const flowZ = this.flowComponentAt(x, z, 1);
    // prefer the hi-res shore field (surface alpha) — same data the GPU uses
    const shoreDistM = this.shore
      ? this.bilinear(this.shore, this.meta.surface.size, this.meta.surface.metresPerPixel, x, z)
      : (this.flow[fi + 3] / 255) * fm.shoreMaxM;
    const km = this.meta.klass;
    const kx = Math.min(Math.max(Math.round((x - (km.gridOriginM ?? km.metresPerPixel * 0.5)) / km.metresPerPixel), 0), km.size - 1);
    const kz = Math.min(Math.max(Math.round((z - (km.gridOriginM ?? km.metresPerPixel * 0.5)) / km.metresPerPixel), 0), km.size - 1);
    const ki = (kz * km.size + kx) * 4;
    const ribbon = this.ribbons.sample(x, z, options);
    const classIndex = ribbon ? 3 : this.rasterClassAt(x, z);
    const className = km.classes[classIndex] ?? "none";
    const sm = this.meta.surface;
    const sx = Math.min(sm.size - 1, Math.max(0, Math.round((x - (sm.gridOriginM ?? sm.metresPerPixel * 0.5)) / sm.metresPerPixel)));
    const sz = Math.min(sm.size - 1, Math.max(0, Math.round((z - (sm.gridOriginM ?? sm.metresPerPixel * 0.5)) / sm.metresPerPixel)));
    const si = (sz * sm.size + sx) * 4;
    const supported = !!ribbon || this.rasterSupported(si);
    const bodyIndex = ribbon?.bodyIndex ?? (this.support ? this.support[si + 1] * 256 + this.support[si + 2] : classIndex);
    const levels = this.fineLevelsAt(x, z);
    const plane = this.rasterPlaneAt(x, z);
    return {
      supported, bodyIndex, fallingSheet: ribbon?.fallingSheet,
      floodAccessOffsetM: ribbon?.floodAccessOffsetM ?? levels.accessOffset,
      waterBodyId: supported ? (this.bodyIds.get(bodyIndex) ?? (this.support ? null : className)) : null,
      riverBand: ribbon?.riverBand ?? this.character?.[ki] ?? (className === "river" ? 2 : 0),
      region: this.character?.[ki + 1] ?? 0,
      waveShelter: this.character ? this.character[ki + 2] / 255 : 1,
      tannin: this.tannin ? this.bilinear(this.tannin, sm.size, sm.metresPerPixel, x, z) : 0,
      surfaceBase: ribbon?.height ?? plane.surfaceBase,
      depthProxy: ribbon?.groundHeight !== undefined ? ribbon.height - ribbon.groundHeight
        : plane.depthProxy + (ribbon ? ribbon.height - plane.surfaceBase : 0),
      flowX: ribbon?.flowX ?? flowX,
      flowY: ribbon?.flowY ?? 0,
      flowZ: ribbon?.flowZ ?? flowZ,
      surfaceNormal: ribbon?.surfaceNormal,
      shoreDistM,
      classIndex,
      className,
      turbidity: this.channel(this.klass, km, x, z, 1) / 255,
      salinity: this.channel(this.klass, km, x, z, 2) / 255,
      seasonResponse: ribbon?.seasonResponse ?? levels.season,
      tideResponse: ribbon?.tideResponse ?? levels.tide,
    };
  }
}
