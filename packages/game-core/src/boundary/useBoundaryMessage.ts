import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { PROVINCE_BOUNDARY } from "@elder-souls/contracts";
import { CATALOGUE, text } from "@elder-souls/text-catalogue";
import {
  BOUNDARY_MESSAGE_ID,
  BOUNDARY_MESSAGE_SECONDS,
  BOUNDARY_NEAR_M,
  boundaryMessageStep,
  distanceToBoundary,
  type BoundaryMessageState,
} from "./boundaryMessage";

/**
 * Shows the edge-of-the-world line once per approach to the boundary wall
 * (16d). Returns the string to display, or null. The studio puts it in its HUD
 * line; the game will route the same key through its system-message surface.
 */
export function useBoundaryMessage(
  positionRef: React.MutableRefObject<{ x: number; z: number }>,
  extentM: number = PROVINCE_BOUNDARY.extentM,
): string | null {
  const state = useRef<BoundaryMessageState>({ armed: true });
  const until = useRef(0);
  const [message, setMessage] = useState<string | null>(null);
  useFrame((_, delta) => {
    const { x, z } = positionRef.current;
    const step = boundaryMessageStep(state.current, x, z, extentM);
    state.current = step.state;
    if (step.fire) {
      until.current = BOUNDARY_MESSAGE_SECONDS;
      setMessage(text(CATALOGUE, BOUNDARY_MESSAGE_ID));
    } else if (distanceToBoundary(x, z, extentM) <= BOUNDARY_NEAR_M && until.current > 0) {
      // still at the wall: the line stays up (it only counts down once you step back)
      until.current = BOUNDARY_MESSAGE_SECONDS;
    } else if (until.current > 0) {
      until.current -= delta;
      if (until.current <= 0) setMessage(null);
    }
  });
  return message;
}
