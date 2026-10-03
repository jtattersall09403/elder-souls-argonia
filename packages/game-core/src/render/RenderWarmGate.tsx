/**
 * The frame-loop half of the warm-before-ready gate (`warmGate.ts`). Mounted
 * inside the canvas; once `armed` (the spawn ring is resident), it first
 * precompiles the scene around the spawn (`precompileScene`, against the
 * render target the frame's scene pass was seen to draw into), then measures
 * each frame's main-thread work (first useFrame callback to a MessageChannel
 * task posted from it, which runs after the render) and feeds the `WarmGate`
 * with the build queue's pending count and the spawn ring's undrawn pieces:
 * it opens once the work is stable, no shader build is pending and the ring
 * is in (decision 0120), or at the cap. `onProgress` gets the gate state
 * every frame until open, so the host can show it; `onOpen` fires once. The
 * game and the studio share it.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { WarmGate, type WarmGateOptions, type WarmGateState } from "./warmGate";
import { buildQueueOf } from "./shaderBuildQueue";
import { precompileScene, type PrecompileRenderer } from "./precompileScene";
import { useSceneTarget } from "./useSceneTarget";

export function RenderWarmGate({ armed, onOpen, onProgress, options, builds, ringPendingRef }: {
  armed: boolean;
  /** Spawn-ring pieces not yet drawn (the settlement layer's `ringPendingRef`); the gate holds while it is above 0. */
  ringPendingRef?: { readonly current: number };
  onOpen: () => void;
  onProgress?: (state: WarmGateState) => void;
  options?: Partial<WarmGateOptions>;
  /** The shader build queue whose backlog holds the gate (default: the renderer's, `buildQueueOf`). */
  builds?: { readonly pending: number } | null;
}) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const gate = useMemo(() => new WarmGate(options), [options]);
  const channel = useMemo(() => new MessageChannel(), []);
  const start = useRef(0);
  const cb = useRef({ onOpen, onProgress });
  cb.current = { onOpen, onProgress };
  const queue = builds !== undefined ? builds : buildQueueOf(gl);
  const queueRef = useRef(queue);
  const ring = useRef(ringPendingRef);
  ring.current = ringPendingRef;
  queueRef.current = queue;
  // the target the frame's scene pass draws into (layer 0), recorded as the frames run
  const sceneTarget = useSceneTarget(scene);
  const precompile = useRef<"idle" | "running" | "done">("idle");
  useEffect(() => {
    channel.port1.onmessage = () => {
      if (gate.state.open) return;
      const opened = gate.step(performance.now() - start.current, queueRef.current?.pending ?? 0, ring.current?.current ?? 0);
      cb.current.onProgress?.(gate.state);
      if (opened) { performance.mark("es:load:warm-gate"); cb.current.onOpen(); }
    };
    return () => { channel.port1.onmessage = null; channel.port1.close(); };
  }, [channel, gate]);
  // Before every other subscriber (FrameWorkProvider is -100) so the sample spans the whole frame.
  useFrame(() => {
    if (!armed || gate.state.open) return;
    if (precompile.current === "idle") {
      precompile.current = "running";
      precompileScene(gl as unknown as PrecompileRenderer, scene, camera, [sceneTarget.current ?? null])
        .finally(() => { precompile.current = "done"; });
    }
    if (precompile.current !== "done") return;
    start.current = performance.now();
    channel.port2.postMessage(0);
  }, -101);
  return null;
}
