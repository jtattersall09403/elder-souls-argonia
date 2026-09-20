import { createContext, useContext, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { FrameWorkQueue } from "./frameWork";

/**
 * The scene's shared frame-work queue. Lives in the package because both the
 * app's layers (vegetation, colliders, chunk terrain) and the package's own
 * `SettlementLayer` add jobs to the same queue; the PROVIDER is the app's
 * scene root (`apps/world-studio/src/character/FrameWorkProvider.tsx`).
 */
export const FrameWorkContext = createContext<FrameWorkQueue | null>(null);

/**
 * The scene's queue, or — outside a provider (fly mode, tests) — a private
 * one this component owns and pumps itself, so behaviour there is exactly
 * what it was before the queue existed.
 */
export function useFrameWork(): FrameWorkQueue {
  const shared = useContext(FrameWorkContext);
  const fallback = useMemo(() => new FrameWorkQueue(), []);
  // Priority -100: r3f sorts frame subscribers ascending and only a POSITIVE
  // priority takes the render loop over, so a negative one runs before every
  // other hook in the scene (all of ours use the default 0) while r3f keeps
  // rendering automatically.
  useFrame(() => { if (!shared) fallback.pump(); }, -100);
  return shared ?? fallback;
}
