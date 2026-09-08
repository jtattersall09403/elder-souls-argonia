import type { WaterAssets } from "./types";

/**
 * Dev-only numeric probe over the CPU water model (decision 0047 item 8).
 * The browser probe (`apps/world-studio/scripts/probe-water.mjs`) calls this
 * through a window hook the APP installs (`window.__STUDIO_WATER_PROBE__`);
 * nothing here touches globals, so any host can expose it its own way.
 *
 * Every row is what the shader would decide at that (x, z): the still surface
 * (with tide + season), the SIGNED depth + lift (wet ⇔ > 0), the real ground
 * where a chunk is loaded, class and flow speed. Sites are asserted numerically
 * — no screenshot is ever read by an agent.
 */
export interface WaterProbeRow {
  x: number;
  z: number;
  /** Still surface incl. tide + season (m, true metres). */
  stillM: number;
  /** Compiled signed depth + tide/season lift (m). Wet ⇔ > 0. */
  depthM: number;
  /** Raw compiled signed depth before the lift (m). */
  rawDepthM: number;
  /** Real terrain height where a chunk is loaded, else null. */
  groundM: number | null;
  /** `stillM − groundM` where ground is known (the physical depth). */
  physicalDepthM: number | null;
  wet: boolean;
  className: string;
  speedMS: number;
  shoreDistM: number;
  seasonResponse: number;
  tideResponse: number;
}

export interface WaterProbeSummary {
  schemaVersion: number;
  depthMinM: number;
  depthSpanM: number;
  tideM: number;
  seasonM: number;
  channels: number;
  cascades: number;
  rows: WaterProbeRow[];
}

export function createWaterProbe(assets: WaterAssets, options: {
  epochMinutes: () => number;
  groundHeight?: (x: number, z: number) => number | null;
}): (points: readonly { x: number; z: number }[]) => WaterProbeSummary {
  return (points) => {
    const epoch = options.epochMinutes();
    const { tide, season } = assets.world.levelOffsets(epoch);
    const rows = points.map(({ x, z }) => {
      const s = assets.data.sample(x, z);
      const still = s.surfaceBase + tide * s.tideResponse + season * s.seasonResponse;
      const depth = s.depthProxy + tide * s.tideResponse + season * s.seasonResponse;
      const ground = options.groundHeight?.(x, z) ?? null;
      return {
        x, z, stillM: still, depthM: depth, rawDepthM: s.depthProxy, groundM: ground,
        physicalDepthM: ground === null ? null : still - ground,
        wet: depth > 0, className: s.className, speedMS: Math.hypot(s.flowX, s.flowZ),
        shoreDistM: s.shoreDistM, seasonResponse: s.seasonResponse, tideResponse: s.tideResponse,
      };
    });
    return {
      schemaVersion: assets.meta.schemaVersion ?? 1,
      depthMinM: assets.meta.surface.depthMinM ?? 0,
      depthSpanM: assets.meta.surface.depthSpanM ?? 25.5,
      tideM: tide, seasonM: season,
      channels: assets.meta.channels?.length ?? 0,
      cascades: assets.meta.cascades?.length ?? 0,
      rows,
    };
  };
}
