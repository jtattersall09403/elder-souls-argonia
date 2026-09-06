/**
 * `WorldWaterQuery` (contracts; module 60 §38) over the compiled water
 * rasters — the one authoritative water model. The renderer's shader samples
 * the same rasters and the same wave table, so gameplay and pixels agree.
 */

import type { Vec3, WaterInteractionEvent, WaterSample, WorldWaterQuery, WaterDisplacementSphere, WaterSheetContact } from "@elder-souls/contracts";
import { seasonOffset, tideOffset } from "./tide";
import type { SpectralOcean } from "./spectralOcean";
import type { LocalWaterPatch } from "./LocalWaterPatch";
import { sampleLocalPatchSurface } from "./localPatchPresentation";
import type { WaterData, WaterBoundaryStaticSample } from "./waterData";
import { WaterInteractionStream } from "./interactionStream";
import { WaterDisplacementRegistry } from './displacementRegistry';
import { fetchExposure, getWindWaveScale, shoreSwellAt, surfaceWaveAt, swashAt, waveExposure, type WaveSample } from "./waves";

export interface WaterWorldOptions {
  /** FloodBasin amplitudes (province `refined/flood-states.json`). */
  tidalAmplitudeM: number;
  seasonalAmplitudeM: number;
  lowTideAmplitudeM?: number;
  drySeasonAmplitudeM?: number;
  /** Accurate terrain height (chunk store); falls back to the depth proxy. */
  groundHeight?: (x: number, z: number) => number | null;
  /** Season scalar s(t) ∈ [−1..1] (world clock, or the studio wet toggle). */
  seasonScalar: () => number;
  /** Wave-animation time in seconds. The world clock is often paused (the
   * studio pins instants for reproducible URLs) but water must stay alive,
   * so the app supplies its own always-running accumulator — the SAME one
   * the renderer's uWaveTime uses, keeping buoyancy and pixels in lockstep.
   * Defaults to world-clock seconds. */
  waveTimeS?: () => number;
  /** Shared CPU/GPU spectral field for marine water; omitted by legacy. */
  spectralOcean?: SpectralOcean;
}

const CLASS_TEMPERATURE: Record<string, number> = {
  coast: 24, estuary: 25, river: 23, lake: 24, marsh: 27, none: 24,
};

export class WaterWorld implements WorldWaterQuery {
  private readonly interactions = new WaterInteractionStream();
  readonly displacementRegistry = new WaterDisplacementRegistry();
  private scratch: WaveSample = { dx: 0, dz: 0, height: 0, nx: 0, ny: 1, nz: 0 };
  private readonly spectralScratch = { height: 0, slopeX: 0, slopeZ: 0 };
  private activeLocalPatch: LocalWaterPatch | null = null;
  private readonly localScratch = { height: 0, slopeX: 0, slopeZ: 0, foam: 0 };
  private readonly boundaryScratch: WaterBoundaryStaticSample = {
    surfaceBase: 0, depthProxy: 0, tideResponse: 0, seasonResponse: 0, supported: false, waterBodyId: null,
  };
  private levelEpoch = NaN;
  private levelSeason = NaN;
  private cachedLevels: Readonly<{ tide: number; season: number }> = Object.freeze({ tide: 0, season: 0 });

  constructor(
    readonly data: WaterData,
    private readonly opts: WaterWorldOptions,
  ) {}

  get spectralOcean(): SpectralOcean | undefined { return this.opts.spectralOcean; }
  get localPatch(): LocalWaterPatch | null { return this.activeLocalPatch; }
  /** One bounded near-field domain, shared by rendering and physical queries.
   * Scene owners clear their own patch on teardown; terrain-only boundary
   * queries deliberately exclude its transient displacement. */
  setLocalPatch(patch: LocalWaterPatch | null): void {
    this.displacementRegistry.setPatch(patch);
    this.activeLocalPatch = patch;
  }

  setDisplacementSpheres(actorId: string, spheres: readonly WaterDisplacementSphere[] | null): boolean {
    return this.displacementRegistry.set(actorId, spheres);
  }

  /** Level offset shared with the renderer's uniforms: [tide, season]. */
  levelOffsets(epochMinutes: number): { tide: number; season: number } {
    const season = this.opts.seasonScalar();
    if (epochMinutes !== this.levelEpoch || season !== this.levelSeason) {
      this.cachedLevels = Object.freeze({
        tide: epochMinutes === this.levelEpoch ? this.cachedLevels.tide : tideOffset(epochMinutes, this.opts.tidalAmplitudeM, this.opts.lowTideAmplitudeM),
        season: seasonOffset(season, this.opts.seasonalAmplitudeM, this.opts.drySeasonAmplitudeM),
      });
      this.levelEpoch = epochMinutes;
      this.levelSeason = season;
    }
    return this.cachedLevels;
  }

  /** Still-water surface height at (x, z) including tide/season, no waves. */
  stillSurfaceAt(x: number, z: number, epochMinutes: number): number {
    const { tide, season } = this.levelOffsets(epochMinutes);
    const groundHeight = this.opts.groundHeight?.(x, z) ?? undefined;
    const s = this.data.sample(x, z, { excludeFallingSheets: true, stage: { tide, season, groundHeight } });
    return s.surfaceBase + tide * s.tideResponse + season * s.seasonResponse;
  }

  /** Cheap still-water boundary query for local wave barriers and emitters. */
  sampleBoundary(x: number, z: number, epochMinutes: number) {
    const { tide, season } = this.levelOffsets(epochMinutes);
    const ground = this.opts.groundHeight?.(x, z) ?? null;
    const s = this.data.boundaryAt(x, z, this.boundaryScratch, true, true, true, { tide, season, groundHeight: ground ?? undefined });
    const offset = tide * s.tideResponse + season * s.seasonResponse;
    const surfaceHeight = s.surfaceBase + offset;
    const accessible = (s.floodAccessOffsetM ?? -Infinity) <= offset + 0.001;
    const depth = s.supported && accessible ? Math.max(0, ground === null ? s.depthProxy + offset : surfaceHeight - ground) : 0;
    const wetMarginM = Math.min(depth - 0.004, offset + 0.001 - (s.floodAccessOffsetM ?? -Infinity));
    return { waterBodyId: depth > 0.004 ? s.waterBodyId : null, surfaceHeight, depth, wetMarginM,
      flowX: depth > 0.004 ? s.flowX ?? 0 : 0, flowZ: depth > 0.004 ? s.flowZ ?? 0 : 0 };
  }

  sample(position: Vec3, epochMinutes: number): WaterSample {
    const { tide, season } = this.levelOffsets(epochMinutes);
    const ground = this.opts.groundHeight?.(position.x, position.z) ?? null;
    const s = this.data.sample(position.x, position.z, { excludeFallingSheets: true,
      stage: { tide, season, groundHeight: ground ?? undefined } });
    const still = s.surfaceBase + tide * s.tideResponse + season * s.seasonResponse;

    const depth = ground !== null ? still - ground : s.depthProxy + tide * s.tideResponse + season * s.seasonResponse;

    const canRunup = (s.className === "coast" || s.className === "estuary") && s.shoreDistM < 26 && depth > -0.6;
    const accessible = (s.floodAccessOffsetM ?? -Infinity) <= tide * s.tideResponse + season * s.seasonResponse + 0.001;
    if (!s.supported || !accessible || (depth <= 0.004 && !canRunup)) {
      return {
        waterBodyId: null,
        surfaceHeight: still,
        surfaceNormal: { x: 0, y: 1, z: 0 },
        flowVelocity: { x: 0, y: 0, z: 0 },
        depth: 0,
        immersion: 0,
        turbidity: s.turbidity,
        salinity: s.salinity,
        temperature: CLASS_TEMPERATURE[s.className] ?? 24,
        hazardIds: [],
      };
    }

    const exposure = Math.min(waveExposure(s.shoreDistM, depth, Math.max(s.turbidity, s.tannin))
      * s.waveShelter * getWindWaveScale(), Math.max(0, depth) * 0.45);
    const waveTime = this.opts.waveTimeS?.() ?? epochMinutes * 60;
    const spectralMarine = this.opts.spectralOcean && (s.className === "coast" || s.className === "estuary");
    const w = spectralMarine ? this.scratch : surfaceWaveAt(position.x, position.z, waveTime, exposure, this.scratch);
    if (spectralMarine && this.opts.spectralOcean) {
      this.opts.spectralOcean.update(waveTime);
      const spectral = this.opts.spectralOcean.sample(position.x, position.z, this.spectralScratch);
      w.height = spectral.height * exposure;
      const length = Math.hypot(spectral.slopeX * exposure, 1, spectral.slopeZ * exposure);
      w.nx = -spectral.slopeX * exposure / length; w.ny = 1 / length;
      w.nz = -spectral.slopeZ * exposure / length; w.dx = 0; w.dz = 0;
    }
    // Shore surf (round 7) — mirrors the vertex shader exactly: fetch is
    // sampled ~30 m seaward via the shore-distance gradient, then the
    // asymmetric swash + shoaling swell ride on the still level.
    let surf = 0;
    let surfNx = 0, surfNz = 0;
    if (s.shoreDistM < 90 && (s.className === "coast" || s.className === "estuary")) {
      const eG = this.data.meta.surface.metresPerPixel * 2;
      const dx = this.data.sample(position.x + eG, position.z).shoreDistM - s.shoreDistM;
      const dz = this.data.sample(position.x, position.z + eG).shoreDistM - s.shoreDistM;
      const gl = Math.hypot(dx, dz) / eG;
      let seaward = s.shoreDistM;
      if (gl > 0.05) {
        seaward = this.data.sample(
          position.x + (dx / (gl * eG)) * 30,
          position.z + (dz / (gl * eG)) * 30,
        ).shoreDistM;
      }
      const fetch = fetchExposure(Math.max(seaward, s.shoreDistM), Math.max(s.turbidity, s.tannin)) * s.waveShelter;
      surf = swashAt(s.shoreDistM, fetch, waveTime)
        + shoreSwellAt(s.shoreDistM, Math.max(s.depthProxy, 0), fetch, waveTime);
      const derivative = (shoreSwellAt(s.shoreDistM + 0.1, Math.max(s.depthProxy, 0), fetch, waveTime)
        - shoreSwellAt(s.shoreDistM - 0.1, Math.max(s.depthProxy, 0), fetch, waveTime)) / 0.2;
      if (gl > 0.05) { surfNx = -(dx / (gl * eG)) * derivative; surfNz = -(dz / (gl * eG)) * derivative; }
    }
    const local = this.activeLocalPatch?.bodyId === s.waterBodyId
      ? sampleLocalPatchSurface(this.activeLocalPatch, position.x, position.z, this.localScratch) : null;
    const surface = still + w.height + surf + (local?.height ?? 0);
    const finalDepth = Math.max(depth + surface - still, 0);
    const waveNormalLength = Math.hypot(w.nx + surfNx, w.ny, w.nz + surfNz);
    // Match the renderer: normalise the wave/shore normal, then add its
    // horizontal perturbation to the ribbon's geometric triangle normal.
    const ny = s.surfaceNormal?.y ?? w.ny / waveNormalLength;
    const nx = (w.nx + surfNx) / waveNormalLength + (s.surfaceNormal?.x ?? 0) - ny * (local?.slopeX ?? 0);
    const nz = (w.nz + surfNz) / waveNormalLength + (s.surfaceNormal?.z ?? 0) - ny * (local?.slopeZ ?? 0);
    const normalLength = Math.hypot(nx, ny, nz);
    return {
      waterBodyId: finalDepth > 0.004 ? s.waterBodyId : null,
      surfaceHeight: surface,
      surfaceNormal: { x: nx / normalLength, y: ny / normalLength, z: nz / normalLength },
      flowVelocity: { x: s.flowX, y: s.flowY ?? 0, z: s.flowZ },
      depth: finalDepth,
      immersion: finalDepth > 0 ? Math.max(0, Math.min(1, (surface - position.y) / 1.7)) : 0,
      turbidity: s.turbidity,
      salinity: s.salinity,
      temperature: CLASS_TEMPERATURE[s.className] ?? 24,
      hazardIds: [],
    };
  }

  sampleSheetContact(position: Vec3, radiusM: number, epochMinutes: number): WaterSheetContact | null {
    const { tide, season } = this.levelOffsets(epochMinutes);
    const contact = this.data.ribbons.sheetContact(position, radiusM, tide, season);
    if (!contact) return null;
    const waterBodyId = this.data.waterBodyIdForIndex(contact.bodyIndex);
    if (!waterBodyId) return null;
    return { waterBodyId, position: contact.position, normal: contact.normal,
      flowVelocity: contact.flowVelocity, distanceM: contact.distanceM };
  }

  emitInteraction(event: WaterInteractionEvent): void {
    this.interactions.emit(event);
  }

  /** Drain pending interaction events (renderer foam/ripples, audio later). */
  drainInteractions(): WaterInteractionEvent[] {
    return this.interactions.drain();
  }

  subscribeInteractions() { return this.interactions.subscribe(); }
}
