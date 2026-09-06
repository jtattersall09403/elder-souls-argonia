import type { ArrowPhysics } from "@elder-souls/game-core/combat/ballistics";
import { useEffect } from "react";
import { Arrows as RuntimeArrows, type ArrowHit, type ArrowTrace, type FlightSample } from "@elder-souls/character";
import { useArrowStore } from "@elder-souls/game-core/combat/arrowStore";
import { useGameStore } from "@elder-souls/game-core/core/store";
import { DEFAULT_ARROW } from "@elder-souls/game-core/equipment/arrows";
export type { ArrowHit };
declare global {
  interface Window {
    __arrowProbe?: { samples: FlightSample[]; steps: number; physics: ArrowPhysics; shaftLengthMeters?: number };
    __fireProbeArrow?: (speed: number, angleDeg: number) => number;
  }
}
export function Arrows({ onHit, traceActor }: { onHit: (hit: ArrowHit) => void; traceActor: ArrowTrace }) {
  const arrows = useArrowStore(s => s.arrows);
  const retire = useArrowStore(s => s.retire);
  const fire = useArrowStore(s => s.fire);
  const gravityScale = useGameStore(s => s.arrowGravityScale);
  useEffect(() => {
    window.__fireProbeArrow = (speed, degrees) => {
      const angle = degrees * Math.PI / 180;
      window.__arrowProbe = { samples: [], steps: 0, physics: DEFAULT_ARROW.physics, shaftLengthMeters: 0.75 };
      return fire({ arrow: DEFAULT_ARROW, origin: [0, 20, 0],
        velocity: [0, speed * Math.sin(angle), speed * Math.cos(angle)], shooter: "probe" });
    };
    return () => { delete window.__fireProbeArrow; };
  }, [fire]);
  return <RuntimeArrows {...{ arrows, retire, onHit, traceActor, gravityScale }} onSample={sample => {
    if (window.__arrowProbe) { window.__arrowProbe.samples.push(sample); window.__arrowProbe.steps++; }
  }} />;
}
