/**
 * `WorldWaterQuery` (contracts; module 60 §38) over the compiled water
 * rasters — the one authoritative water model. The renderer's shader samples
 * the same rasters and the same wave table, so gameplay and pixels agree.
 */

import type { Vec3, WaterDisplacementSphere, WaterInteractionEvent, WaterSample, WaterSheetContact,
  WorldWaterQuery } from "@elder-souls/contracts";
import { seasonOffset, tideOffset } from "./tide";
import { WaterInteractionStream } from "./interactionStream";
import { WaterDisplacementRegistry } from "./displacementRegistry";
import type { LocalWaterPatch } from "./LocalWaterPatch";
import type { WaterData } from "./waterData";
import { FLOW_WAVE_MIN_SPEED_MS, fetchExposure, flowWaveAt, getWindWaveScale, shoreSwellAt, standingWaveRatio,
  surfaceWaveAt, swashAt, waveExposure, type WaveSample } from "./waves";

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
  private readonly interactions = new WaterInteractionStream();
  readonly displacementRegistry = new WaterDisplacementRegistry();
  private activeLocalPatch: LocalWaterPatch | null = null;
  private scratch: WaveSample = { dx: 0, dz: 0, height: 0, nx: 0, ny: 1, nz: 0 };
  private flowScratch: WaveSample = { dx: 0, dz: 0, height: 0, nx: 0, ny: 1, nz: 0 };

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

    // Depth: the real terrain where a chunk is loaded, else the compiled
    // SIGNED depth lifted by the same tide/season offsets as the surface
    // (decision 0047: wet ⇔ signedDepth + lift > 0, so a season floods the
    // table band and drains the shallows on the CPU exactly as on the GPU).
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

    const exposure = waveExposure(s.shoreDistM, depth, s.turbidity) * getWindWaveScale();
    const waveTime = this.opts.waveTimeS?.() ?? epochMinutes * 60;
    // per-band fetch limit + class standing ratio: the vertex stage's
    // esWaveSampleEx call, argument for argument
    const w = surfaceWaveAt(position.x, position.z, waveTime, exposure, this.scratch,
      s.shoreDistM, standingWaveRatio(s.className, s.shoreDistM));
    // Shore surf (round 7) — mirrors the vertex shader exactly: fetch is
    // sampled ~30 m seaward via the shore-distance gradient, then the
    // asymmetric swash + shoaling swell ride on the still level.
    let surf = 0;
    if (s.shoreDistM < 90) {
      const eG = 8;
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
      const fetch = fetchExposure(Math.max(seaward, s.shoreDistM), s.turbidity);
      surf = swashAt(s.shoreDistM, fetch, waveTime)
        + shoreSwellAt(s.shoreDistM, Math.max(s.depthProxy, 0), fetch, waveTime);
    }
    // Along-flow travelling undulation on moving water (decision 0047 item 6)
    // — the GLSL vertex twin is `esFlowWave`; buoyancy rides the same crests.
    const speed = Math.hypot(s.flowX, s.flowZ);
    let nx = w.nx;
    let ny = w.ny;
    let nz = w.nz;
    let flowH = 0;
    if (speed > FLOW_WAVE_MIN_SPEED_MS) {
      const fw = flowWaveAt(position.x, position.z, s.flowX / speed, s.flowZ / speed, speed, waveTime, this.flowScratch);
      flowH = fw.height;
      // combine normals as summed slopes (both are small-slope height fields)
      nx = w.nx / w.ny + fw.nx / fw.ny;
      nz = w.nz / w.ny + fw.nz / fw.ny;
      const inv = 1 / Math.hypot(nx, 1, nz);
      nx *= inv; nz *= inv; ny = inv;
    }
    const surface = still + w.height + surf + flowH;
    return {
      waterBodyId: s.className,
      surfaceHeight: surface,
      surfaceNormal: { x: nx, y: ny, z: nz },
      flowVelocity: { x: s.flowX, y: 0, z: s.flowZ },
      depth: Math.max(depth, 0),
      immersion: Math.max(0, Math.min(1, (surface - position.y) / 1.7 + 1)),
      turbidity: s.turbidity,
      salinity: s.salinity,
      temperature: CLASS_TEMPERATURE[s.className] ?? 24,
      hazardIds: [],
    };
  }

  get localPatch(): LocalWaterPatch | null { return this.activeLocalPatch; }

  /** One bounded near-field domain, shared by rendering and physical queries.
   * The field model has no producer for it yet (decision 0046 §4); the
   * displacement registry needs the hook, so it stays wired. */
  setLocalPatch(patch: LocalWaterPatch | null): void {
    this.displacementRegistry.setPatch(patch);
    this.activeLocalPatch = patch;
  }

  setDisplacementSpheres(actorId: string, spheres: readonly WaterDisplacementSphere[] | null): boolean {
    return this.displacementRegistry.set(actorId, spheres);
  }

  /** Explicit sheet geometry (waterfall faces) is not compiled by the field
   * model yet; contact emitters fall back to the surface query. */
  sampleSheetContact(_position: Vec3, _radiusM: number, _epochMinutes: number): WaterSheetContact | null {
    return null;
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
