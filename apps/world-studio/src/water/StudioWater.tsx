import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { RippleSim } from "@elder-souls/game-core/water/render/RippleSim";
import { sharedLocalSurfaces, sharedWaterAssets, waterGroundHeight, type WaterAssets } from "./waterAssets";
import { sharedChunkStore } from "../character/chunkStore";
import { createWaterProbe, type WaterProbeSummary } from "@elder-souls/game-core/water/render/waterProbe";
import { SkyContext, sharedAerialUniforms } from "../sky/WorldSky";
import { applyAerialPerspective } from "../sky/aerial";
import { worldClock } from "../sky/timeState";
import { waterTimeS, advanceWaterClock, waterTransportTimeS, waterTransportDeltaS, setWaterClockHidden } from "./waterClock";
import { lastWeatherSample } from "../weather/weatherState";
import { wetnessUniforms } from "./groundWetness";
import { updateGroundLocalWater } from "@elder-souls/game-core/water/render/groundWetness";
import { parseWaterLayers } from "@elder-souls/game-core/water/render/types";
import type { WaterDebugState, WaterRuntime } from "@elder-souls/game-core/water/render/types";
import type { Vec3 } from "@elder-souls/contracts";
import { WATER_TIERS, type WaterTier } from "@elder-souls/game-core/water/render/waterMaterial";
import { WaterPipeline } from "@elder-souls/game-core/water/render/WaterPipeline";
import { WaterSurfaceMesh, type ContactBody, type WaterSurfaceHandle } from "@elder-souls/game-core/water/render/WaterSurface";

/**
 * The Phase 8b water stack for a studio canvas: loads the compiled water
 * data once, picks a quality tier (auto by device, `?wq=low|high` override)
 * and mounts the surface + the shared render-pass pipeline. Mount INSIDE
 * `<WorldSky>` so the material sees the CSM context.
 */

declare global {
  interface Window {
    __STUDIO_WATER_DEBUG__?: WaterDebugState;
    /** Dev A/B scalar for submerged caustics: 0 off, 1 (default) shipped,
     * larger exaggerates so a probe can locate them. */
    __STUDIO_CAUSTICS__?: number;
    /** Live override of ?waterLayers= — a probe flips layers without the
     * page reload that a 2 fps software-GL run cannot afford. */
    __STUDIO_WATER_LAYERS__?: string | null;
    /** Numeric CPU-model probe (decision 0047 item 8): still surface, signed
     * depth + lift, real ground, class and speed at each (x, z) in metres. */
    __STUDIO_WATER_PROBE__?: (points: readonly { x: number; z: number }[]) => WaterProbeSummary;
  }
}

// Captured at module load — the App re-serialises the query string with its
// own known keys and would drop ?wq= before the water mounts.
const INITIAL_WQ = new URLSearchParams(window.location.search).get("wq");
const INITIAL_WATER_LAYERS = new URLSearchParams(window.location.search).get("waterLayers");

export function pickWaterTier(): WaterTier {
  const q = INITIAL_WQ;
  if (q === "low" || q === "high") return WATER_TIERS[q];
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const weak = (navigator.hardwareConcurrency ?? 8) <= 4;
  return coarse || weak ? WATER_TIERS.low : WATER_TIERS.high;
}

export function StudioWater({ base, verticalScale, farExtentM, contactBodies, surfaceFocus }: {
  base: string;
  verticalScale: number;
  /** Water draw distance — walk mode ~6 km, flyover 30 km (perf). */
  farExtentM?: number;
  /** Live churn sources (e.g. the wading player), read every frame. */
  contactBodies?: () => ContactBody[];
  /** Physical actor centre in true metres; fly mode falls back to camera. */
  surfaceFocus?: () => Vec3 | null;
}) {
  const { csm } = useContext(SkyContext);
  useEffect(() => {
    const visibility = () => setWaterClockHidden(document.hidden);
    visibility(); document.addEventListener('visibilitychange', visibility);
    return () => { document.removeEventListener('visibilitychange', visibility); setWaterClockHidden(true); };
  }, []);
  const runtime = useMemo<WaterRuntime>(() => {
    // The dev layer spec is parsed when it changes, not per call (it is read
    // every frame by the surface and the pipeline; walk 5 perf).
    let layerSpec: string | null | undefined;
    let layerSet = parseWaterLayers(null);
    const wind = { x: 0, y: 0, z: 0 };
    const waterLayers = () => {
      const spec = window.__STUDIO_WATER_LAYERS__ !== undefined ? window.__STUDIO_WATER_LAYERS__ : INITIAL_WATER_LAYERS;
      if (spec !== layerSpec) { layerSpec = spec; layerSet = parseWaterLayers(spec); }
      return layerSet;
    };
    return {
    csm, surfaceFocus, epochMinutes: () => worldClock.epochMinutes(), waveTimeS: waterTimeS,
    transportTimeS: waterTransportTimeS, transportDeltaS: waterTransportDeltaS,
    advanceClock: dt => advanceWaterClock(dt, worldClock.rate),
    rainIntensity: () => lastWeatherSample()?.rainIntensity ?? 0,
    // One wind record rewritten per call: its readers use it at once.
    windVelocity: () => {
      const w = lastWeatherSample();
      wind.x = (w?.windDirXZ[0] ?? 0) * (w?.windSpeedMS ?? 0);
      wind.z = (w?.windDirXZ[1] ?? 0) * (w?.windSpeedMS ?? 0);
      return wind;
    },
    applyAerial: material => applyAerialPerspective(material, sharedAerialUniforms),
    sunDirection: sharedAerialUniforms.uSunDirW,
    ambient: sharedAerialUniforms.uHazeAmbient,
    sunLight: sharedAerialUniforms.uHazeSunLight,
    causticsInOpaque: true,
    waterLayers,
    onLocalSurface: state => updateGroundLocalWater(wetnessUniforms, state),
    onLevels: (tide, season, wind, windMS) => {
      wetnessUniforms.uWetLevels.value.set(tide, season);
      wetnessUniforms.uWetWind.value = wind;
      wetnessUniforms.uWetWindMS.value = windMS;
      wetnessUniforms.uWetTime.value = waterTimeS();
      wetnessUniforms.uWetSun.value.copy(sharedAerialUniforms.uSunDirW.value);
      wetnessUniforms.uWetCausticDebug.value = Number.isFinite(window.__STUDIO_CAUSTICS__)
        ? (window.__STUDIO_CAUSTICS__ as number) : 1;
    },
    onDebug: state => { window.__STUDIO_WATER_DEBUG__ = state; },
    };
  }, [csm, surfaceFocus]);
  const [assets, setAssets] = useState<WaterAssets | null>(null);
  const [tier] = useState<WaterTier>(() => pickWaterTier());
  const handleRef = useRef<WaterSurfaceHandle | null>(null);
  const onSurfaceReady = useCallback((h: WaterSurfaceHandle) => {
    handleRef.current = h;
  }, []);
  const ripple = useMemo(() => (tier.ripples ? new RippleSim() : null), [tier]);
  useEffect(() => () => ripple?.dispose(), [ripple]);
  useEffect(() => { if (assets) ripple?.configureBoundary(assets.world, runtime.epochMinutes); }, [ripple, assets, runtime]);
  // The ripple shoreline mask samples the streamed ground (waterGroundHeight
  // reads this store): a chunk decoding under the patch refreshes it at once
  // (the mask never resamples an unchanged patch on its own).
  useEffect(() => {
    if (!ripple) return;
    return sharedChunkStore(base).onArrival((grid) => {
      const [x0, z0] = grid.meta.originM;
      ripple.groundChanged(x0, z0, x0 + (grid.nx - 1) * grid.metresPerSample, z0 + (grid.ny - 1) * grid.metresPerSample);
    });
  }, [ripple, base]);

  useEffect(() => {
    let alive = true;
    sharedWaterAssets(base).then((a) => {
      if (alive) setAssets(a);
    }).catch((err) => console.error("water assets failed to load", err));
    return () => {
      alive = false;
    };
  }, [base]);
  // Dev hook for the numeric browser probe — installed by the app, built in
  // the package (no global state inside packages/).
  useEffect(() => {
    if (!assets) return;
    window.__STUDIO_WATER_PROBE__ = createWaterProbe(assets, {
      epochMinutes: runtime.epochMinutes, groundHeight: waterGroundHeight,
    });
    return () => { delete window.__STUDIO_WATER_PROBE__; };
  }, [assets, runtime]);

  if (!assets) return null;
  return (
    <>
      <WaterSurfaceMesh
        runtime={runtime}
        assets={assets}
        tier={tier}
        verticalScale={verticalScale}
        farExtentM={farExtentM}
        ripple={ripple}
        contactBodies={contactBodies}
        localSurfaces={sharedLocalSurfaces(base)}
        onReady={onSurfaceReady}
      />
      <WaterPipeline
        runtime={runtime}
        assets={assets}
        tier={tier}
        verticalScale={verticalScale}
        handle={() => handleRef.current}
        ripple={ripple}
      />
    </>
  );
}
