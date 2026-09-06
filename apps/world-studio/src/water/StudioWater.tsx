import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { RippleSim } from "@elder-souls/game-core/water/render/RippleSim";
import { sharedWaterAssets, LEGACY_WATER, type WaterAssets } from "./waterAssets";
import { StudioWater as LegacyStudioWater } from "./legacy/StudioWater";
import { SkyContext, sharedAerialUniforms } from "../sky/WorldSky";
import { applyAerialPerspective } from "../sky/aerial";
import { worldClock } from "../sky/timeState";
import { waterTimeS, advanceWaterClock } from "./waterClock";
import { lastWeatherSample } from "../weather/weatherState";
import { wetnessUniforms } from "./groundWetness";
import { updateGroundLocalWater } from "@elder-souls/game-core/water/render/groundWetness";
import type { WaterRuntime } from "@elder-souls/game-core/water/render/types";
import type { Vec3 } from "@elder-souls/contracts";
import { WATER_TIERS, type WaterTier } from "./waterMaterial";
import { WaterPipeline } from "./WaterPipeline";
import { WaterSurfaceMesh, type ContactBody, type WaterSurfaceHandle } from "./WaterSurfaceMesh";

/**
 * The Phase 8b water stack for a studio canvas: loads the compiled water
 * data once, picks a quality tier (auto by device, `?wq=low|high` override)
 * and mounts the surface + the shared render-pass pipeline. Mount INSIDE
 * `<WorldSky>` so the material sees the CSM context.
 */

// Captured at module load — the App re-serialises the query string with its
// own known keys and would drop ?wq= before the water mounts.
const INITIAL_WQ = new URLSearchParams(window.location.search).get("wq");

export function pickWaterTier(): WaterTier {
  const q = INITIAL_WQ;
  if (q === "low" || q === "high") return WATER_TIERS[q];
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const weak = (navigator.hardwareConcurrency ?? 8) <= 4;
  return coarse || weak ? WATER_TIERS.low : WATER_TIERS.high;
}

export function StudioWater(props: Parameters<typeof CurrentStudioWater>[0]) {
  return LEGACY_WATER ? <LegacyStudioWater {...props} /> : <CurrentStudioWater {...props} />;
}

function CurrentStudioWater({ base, verticalScale, farExtentM, contactBodies, surfaceFocus }: {
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
  const runtime = useMemo<WaterRuntime>(() => ({
    csm, surfaceFocus, epochMinutes: () => worldClock.epochMinutes(), waveTimeS: waterTimeS,
    advanceClock: dt => advanceWaterClock(dt, worldClock.rate),
    rainIntensity: () => lastWeatherSample()?.rainIntensity ?? 0,
    windVelocity: () => {
      const w = lastWeatherSample();
      return { x: (w?.windDirXZ[0] ?? 0) * (w?.windSpeedMS ?? 0), y: 0,
        z: (w?.windDirXZ[1] ?? 0) * (w?.windSpeedMS ?? 0) };
    },
    applyAerial: material => applyAerialPerspective(material, sharedAerialUniforms),
    sunDirection: sharedAerialUniforms.uSunDirW,
    ambient: sharedAerialUniforms.uHazeAmbient,
    sunLight: sharedAerialUniforms.uHazeSunLight,
    causticsInOpaque: true,
    onLocalSurface: state => updateGroundLocalWater(wetnessUniforms, state),
    onLevels: (tide, season, wind) => {
      wetnessUniforms.uWetLevels.value.set(tide, season);
      wetnessUniforms.uWetWind.value = wind;
      wetnessUniforms.uWetTime.value = waterTimeS();
      wetnessUniforms.uWetSun.value.copy(sharedAerialUniforms.uSunDirW.value);
    },
    onDebug: state => { window.__STUDIO_WATER_DEBUG__ = state; },
  }), [csm, surfaceFocus]);
  const [assets, setAssets] = useState<WaterAssets | null>(null);
  const [tier] = useState<WaterTier>(() => pickWaterTier());
  const handleRef = useRef<WaterSurfaceHandle | null>(null);
  const onSurfaceReady = useCallback((h: WaterSurfaceHandle) => {
    handleRef.current = h;
  }, []);
  const ripple = useMemo(() => (tier.ripples ? new RippleSim() : null), [tier]);
  useEffect(() => () => ripple?.dispose(), [ripple]);
  useEffect(() => { if (assets) ripple?.configureBoundary(assets.world, runtime.epochMinutes); }, [ripple, assets, runtime]);

  useEffect(() => {
    let alive = true;
    sharedWaterAssets(base).then((a) => {
      if (alive) setAssets(a);
    }).catch((err) => console.error("water assets failed to load", err));
    return () => {
      alive = false;
    };
  }, [base]);

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
