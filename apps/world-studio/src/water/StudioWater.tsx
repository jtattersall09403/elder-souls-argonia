import { useCallback, useEffect, useRef, useState } from "react";
import { sharedWaterAssets, type WaterAssets } from "./waterAssets";
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

export function StudioWater({ base, verticalScale, contactBodies }: {
  base: string;
  verticalScale: number;
  /** Live churn sources (e.g. the wading player), read every frame. */
  contactBodies?: () => ContactBody[];
}) {
  const [assets, setAssets] = useState<WaterAssets | null>(null);
  const [tier] = useState<WaterTier>(() => pickWaterTier());
  const handleRef = useRef<WaterSurfaceHandle | null>(null);
  const onSurfaceReady = useCallback((h: WaterSurfaceHandle) => {
    handleRef.current = h;
  }, []);

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
        assets={assets}
        tier={tier}
        verticalScale={verticalScale}
        contactBodies={contactBodies}
        onReady={onSurfaceReady}
      />
      <WaterPipeline
        assets={assets}
        tier={tier}
        verticalScale={verticalScale}
        handle={() => handleRef.current}
      />
    </>
  );
}
