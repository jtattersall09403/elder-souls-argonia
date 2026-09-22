import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import {
  FrameWorkQueue,
  frameWorkBudgetMs,
} from "@elder-souls/game-core/scheduling/frameWork";
import { FrameWorkContext } from "@elder-souls/game-core/scheduling/frameWorkContext";
import { STUDIO_TOOLS } from "../studioTools";

/**
 * The scene's shared frame-work queue (owner 2026-09-20, walking stutter,
 * "option 1"). The rebuilds that used to burst in one frame add generator
 * jobs here instead; this provider pumps them under a budget once per frame.
 *
 * Fly mode deliberately does NOT mount this: `useFrameWork` falls back to a
 * private per-component queue there, so nothing about fly mode changes.
 */
export function FrameWorkProvider({ children }: { children: React.ReactNode }) {
  const queue = useMemo(() => new FrameWorkQueue(), []);
  // Priority -100: r3f sorts frame subscribers ascending and only a POSITIVE
  // priority takes the render loop over, so a negative one simply runs before
  // every other hook in the scene (all of ours use the default 0) and still
  // leaves r3f rendering automatically. Ahead of the player controller is
  // deliberate: a step finishes before the frame's movement reads what it
  // produced, never half a frame later.
  useFrame((_, delta) => {
    const { ms } = queue.pump(performance.now(), frameWorkBudgetMs(delta * 1000));
    if (STUDIO_TOOLS) {
      (window as unknown as { __STUDIO_FRAME_WORK__?: unknown }).__STUDIO_FRAME_WORK__ = {
        pending: queue.pending,
        labels: queue.labels,
        lastPumpMs: Math.round(ms * 10) / 10,
      };
    }
  }, -100);
  return <FrameWorkContext.Provider value={queue}>{children}</FrameWorkContext.Provider>;
}

export { useFrameWork } from "@elder-souls/game-core/scheduling/frameWorkContext";
