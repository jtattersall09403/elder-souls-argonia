/**
 * `WorldWaterQuery` (contracts; module 60 §38) over the compiled water
 * rasters — the one authoritative water model. The renderer's shader samples
 * the same rasters and the same wave table, so gameplay and pixels agree.
 */

import type { Vec3, WaterInteractionEvent, WaterSample, WorldWaterQuery } from "@elder-souls/contracts";
import { seasonOffset, tideOffset } from "./tide";
import type { WaterData } from "./waterData";
import { surfaceWaveAt, swashAt, waveExposure, type WaveSample } from "./waves";

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

  constructor(
    readonly data: WaterData,
    private readonly opts: WaterWorldOptions,
  ) {}

  /** Level offset shared with the renderer's uniforms: [tide, season]. */
  levelOffsets(epochMinutes: number): { tide: number; season: number } {
    return {
      tide: tideOffset(epochMinutes, this.opts.tidalAmplitudeM),
      season: seasonOffset(this.opts.seasonScalar(), this.opts.seasonalAmplitudeM),
    };
  }

  /** Still-water surface height at (x, z) including tide/season, no waves. */
  stillSurfaceAt(x: number, z: number, epochMinutes: number): number {
    const s = this.data.sample(x, z);
    const { tide, season } = this.levelOffsets(epochMinutes);
    return s.surfaceBase + tide * s.tideResponse + season * s.seasonResponse;
  }

  sample(position: Vec3, epochMinutes: number): WaterSample {
    const s = this.data.sample(position.x, position.z);
    const { tide, season } = this.levelOffsets(epochMinutes);
    const still = s.surfaceBase + tide * s.tideResponse + season * s.seasonResponse;

    const ground = this.opts.groundHeight?.(position.x, position.z) ?? null;
    const depth = ground !== null ? still - ground : s.depthProxy + tide * s.tideResponse + season * s.seasonResponse;

    if (depth <= 0.02) {
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

    const exposure = waveExposure(s.shoreDistM, depth, s.turbidity);
    const waveTime = this.opts.waveTimeS?.() ?? epochMinutes * 60;
    const w = surfaceWaveAt(position.x, position.z, waveTime, exposure, this.scratch);
    const surface = still + w.height + swashAt(s.shoreDistM, exposure, waveTime);
    return {
      waterBodyId: s.className,
      surfaceHeight: surface,
      surfaceNormal: { x: w.nx, y: w.ny, z: w.nz },
      flowVelocity: { x: s.flowX, y: 0, z: s.flowZ },
      depth: Math.max(depth, 0),
      immersion: Math.max(0, Math.min(1, (surface - position.y) / 1.7 + 1)),
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
