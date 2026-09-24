import type { ArrowPhysics } from "@elder-souls/game-core/combat/ballistics";
import { useEffect } from "react";
import type { FlightSample } from "@elder-souls/character";
import { useArrowStore } from "@elder-souls/game-core/combat/arrowStore";
import { DEFAULT_ARROW } from "@elder-souls/game-core/equipment/arrows";

declare global {
  interface Window {
    __arrowProbe?: { samples: FlightSample[]; steps: number; physics: ArrowPhysics; shaftLengthMeters?: number };
    __fireProbeArrow?: (speed: number, angleDeg: number) => number;
  }
}

/** Collects every flight step while `scripts/probe-arrow-flight.mjs` is recording. */
export function recordArrowProbeSample(sample: FlightSample) {
  if (window.__arrowProbe) {
    window.__arrowProbe.samples.push(sample);
    window.__arrowProbe.steps++;
  }
}

/**
 * The arrow-flight probe's entry point: `window.__fireProbeArrow(speed, deg)`
 * fires a default arrow from 20 m up so the probe can sample its flight.
 * Sandbox debug only.
 */
export function ArrowProbe() {
  const fire = useArrowStore((s) => s.fire);
  useEffect(() => {
    window.__fireProbeArrow = (speed, degrees) => {
      const angle = degrees * Math.PI / 180;
      window.__arrowProbe = { samples: [], steps: 0, physics: DEFAULT_ARROW.physics, shaftLengthMeters: 0.75 };
      return fire({ arrow: DEFAULT_ARROW, origin: [0, 20, 0],
        velocity: [0, speed * Math.sin(angle), speed * Math.cos(angle)], shooter: "probe" });
    };
    return () => { delete window.__fireProbeArrow; };
  }, [fire]);
  return null;
}
