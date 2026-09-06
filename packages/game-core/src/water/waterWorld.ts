/**
 * `WorldWaterQuery` (contracts; module 60 §38) over the compiled water
 * rasters — the one authoritative water model. The renderer's shader samples
 * the same rasters and the same wave table, so gameplay and pixels agree.
 */

import type { Vec3, WaterInteractionEvent, WaterSample, WorldWaterQuery } from "@elder-souls/contracts";
import { seasonOffset, tideOffset } from "./tide";
import type { WaterData, WaterBoundaryStaticSample } from "./waterData";
import { fetchExposure, getWindWaveScale, shoreSwellAt, surfaceWaveAt, swashAt, waveExposure, type WaveSample } from "./waves";

export interface WaterWorldOptions {
  /** FloodBasin amplitudes (province `refined/flood-states.json`). */
  tidalAmplitudeM: number;
  seasonalAmplitudeM: number;
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
}

const CLASS_TEMPERATURE: Record<string, number> = {
  coast: 24, estuary: 25, river: 23, lake: 24, marsh: 27, none: 24,
};

export class WaterWorld implements WorldWaterQuery {
  private events: WaterInteractionEvent[] = [];
  private scratch: WaveSample = { dx: 0, dz: 0, height: 0, nx: 0, ny: 1, nz: 0 };
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

  /** Level offset shared with the renderer's uniforms: [tide, season]. */
  levelOffsets(epochMinutes: number): { tide: number; season: number } {
    const season = this.opts.seasonScalar();
    if (epochMinutes !== this.levelEpoch || season !== this.levelSeason) {
      this.cachedLevels = Object.freeze({
        tide: epochMinutes === this.levelEpoch ? this.cachedLevels.tide : tideOffset(epochMinutes, this.opts.tidalAmplitudeM),
        season: seasonOffset(season, this.opts.seasonalAmplitudeM),
      });
      this.levelEpoch = epochMinutes;
      this.levelSeason = season;
    }
    return this.cachedLevels;
  }

  /** Still-water surface height at (x, z) including tide/season, no waves. */
  stillSurfaceAt(x: number, z: number, epochMinutes: number): number {
    const s = this.data.sample(x, z);
    const { tide, season } = this.levelOffsets(epochMinutes);
    return s.surfaceBase + tide * s.tideResponse + season * s.seasonResponse;
  }

  /** Cheap still-water boundary query for local wave barriers and emitters. */
  sampleBoundary(x: number, z: number, epochMinutes: number) {
    const s = this.data.boundaryAt(x, z, this.boundaryScratch);
    const { tide, season } = this.levelOffsets(epochMinutes);
    const offset = tide * s.tideResponse + season * s.seasonResponse;
    const surfaceHeight = s.surfaceBase + offset;
    const ground = this.opts.groundHeight?.(x, z) ?? null;
    const depth = s.supported ? Math.max(0, ground === null ? s.depthProxy + offset : surfaceHeight - ground) : 0;
    return { waterBodyId: depth > 0.004 ? s.waterBodyId : null, surfaceHeight, depth };
  }

  sample(position: Vec3, epochMinutes: number): WaterSample {
    const s = this.data.sample(position.x, position.z);
    const { tide, season } = this.levelOffsets(epochMinutes);
    const still = s.surfaceBase + tide * s.tideResponse + season * s.seasonResponse;

    const ground = this.opts.groundHeight?.(position.x, position.z) ?? null;
    const depth = ground !== null ? still - ground : s.depthProxy + tide * s.tideResponse + season * s.seasonResponse;

    const canRunup = (s.className === "coast" || s.className === "estuary") && s.shoreDistM < 26 && depth > -0.6;
    if (!s.supported || (depth <= 0.004 && !canRunup)) {
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
    const w = surfaceWaveAt(position.x, position.z, waveTime, exposure, this.scratch);
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
    const surface = still + w.height + surf;
    const finalDepth = Math.max(depth + surface - still, 0);
    const waveNormalLength = Math.hypot(w.nx + surfNx, w.ny, w.nz + surfNz);
    // Match the renderer: normalise the wave/shore normal, then add its
    // horizontal perturbation to the ribbon's geometric triangle normal.
    const nx = (w.nx + surfNx) / waveNormalLength + (s.surfaceNormal?.x ?? 0);
    const ny = s.surfaceNormal?.y ?? w.ny / waveNormalLength;
    const nz = (w.nz + surfNz) / waveNormalLength + (s.surfaceNormal?.z ?? 0);
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

  emitInteraction(event: WaterInteractionEvent): void {
    this.events.push(event);
    if (this.events.length > 256) this.events.splice(0, this.events.length - 256);
  }

  /** Drain pending interaction events (renderer foam/ripples, audio later). */
  drainInteractions(): WaterInteractionEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }
}
