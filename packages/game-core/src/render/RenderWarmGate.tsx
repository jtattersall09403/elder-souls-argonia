/**
 * The frame-loop half of the warm-before-ready gate (`warmGate.ts`). Mounted
 * inside the canvas; once `armed` (the world around the spawn is in), it
 * measures each frame's main-thread work (first useFrame callback to a
 * MessageChannel task posted from it, which runs after the render) and feeds
 * the `WarmGate`. `onProgress` gets the gate state every frame until open, so
 * the host can show it; `onOpen` fires once. The game and the studio share it.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { WarmGate, type WarmGateOptions, type WarmGateState } from "./warmGate";

export function RenderWarmGate({ armed, onOpen, onProgress, options }: {
  armed: boolean;
  onOpen: () => void;
  onProgress?: (state: WarmGateState) => void;
  options?: Partial<WarmGateOptions>;
}) {
  const gate = useMemo(() => new WarmGate(options), [options]);
  const channel = useMemo(() => new MessageChannel(), []);
  const start = useRef(0);
  const cb = useRef({ onOpen, onProgress });
  cb.current = { onOpen, onProgress };
  useEffect(() => {
    channel.port1.onmessage = () => {
      if (gate.state.open) return;
      const opened = gate.step(performance.now() - start.current);
      cb.current.onProgress?.(gate.state);
      if (opened) { performance.mark("es:load:warm-gate"); cb.current.onOpen(); }
    };
    return () => { channel.port1.onmessage = null; channel.port1.close(); };
  }, [channel, gate]);
  // Before every other subscriber (FrameWorkProvider is -100) so the sample spans the whole frame.
  useFrame(() => {
    if (!armed || gate.state.open) return;
    start.current = performance.now();
    channel.port2.postMessage(0);
  }, -101);
  return null;
}
