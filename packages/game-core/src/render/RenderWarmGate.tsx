/**
 * The frame-loop half of the warm-before-ready gate (`warmGate.ts`). Mounted
 * inside the canvas; once `armed` (the spawn ring is resident), it first
 * precompiles the scene around the spawn (`precompileScene`, against the
 * render target the frame's scene pass was seen to draw into), then measures
 * each frame's main-thread work (first useFrame callback to a MessageChannel
 * task posted from it, which runs after the render) and feeds the `WarmGate`
 * with the build queue's pending count: it opens once the work is stable and
 * no shader build is pending, or at the cap. `onProgress` gets the gate state
 * every frame until open, so the host can show it; `onOpen` fires once. The
 * game and the studio share it.
 */
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { WarmGate, type WarmGateOptions, type WarmGateState } from "./warmGate";
import { buildQueueOf } from "./shaderBuildQueue";
import { precompileScene, type PrecompileRenderer } from "./precompileScene";

export function RenderWarmGate({ armed, onOpen, onProgress, options, builds }: {
  armed: boolean;
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
  queueRef.current = queue;
  // the target the frame's scene pass draws into (layer 0), recorded as the frames run
  const sceneTarget = useRef<THREE.RenderTarget | null | undefined>(undefined);
  const precompile = useRef<"idle" | "running" | "done">("idle");
  useEffect(() => {
    const previous = scene.onBeforeRender;
    const hook: THREE.Scene["onBeforeRender"] = function (this: THREE.Scene, ...args) {
      const [, , cam, target] = args as unknown as [unknown, unknown, THREE.Camera, THREE.RenderTarget | null];
      if (cam.layers.isEnabled(0)) sceneTarget.current = target;
      previous.apply(this, args);
    };
    scene.onBeforeRender = hook;
    return () => { if (scene.onBeforeRender === hook) scene.onBeforeRender = previous; };
  }, [scene]);
  useEffect(() => {
    channel.port1.onmessage = () => {
      if (gate.state.open) return;
      const opened = gate.step(performance.now() - start.current, queueRef.current?.pending ?? 0);
      cb.current.onProgress?.(gate.state);
      if (opened) cb.current.onOpen();
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
