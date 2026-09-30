/**
 * WebGPU device-loss recovery for the studio's `<Canvas>`es (webgpu branch,
 * 2026-09-30). Dawn can drop the device below JS (`device.lost` reason
 * "destroyed" or "unknown") with nothing wrong in our code; without recovery
 * every later frame errors and the canvas stays black. On a loss we did not
 * cause, the host remounts the Canvas (a new key): R3F disposes the dead
 * renderer and the `gl` factory requests a new adapter, device and renderer.
 * World state lives outside the Canvas (URL, props), so the view comes back
 * where it was. Bounded: past MAX_RECOVERIES in WINDOW_MS the host gives up
 * and shows the banner.
 */
import { useCallback, useRef, useState } from "react";

export const MAX_RECOVERIES = 3;
export const WINDOW_MS = 60_000;

export type RecoveryDecision = "recover" | "give-up" | "ignore";

/** Pure policy: what to do about one device loss. */
export function decideRecovery(args: {
  /** True when our own teardown disposed the renderer (the loss is expected). */
  disposedByUs: boolean;
  /** Times (ms) of earlier recoveries. */
  recent: readonly number[];
  now: number;
}): RecoveryDecision {
  if (args.disposedByUs) return "ignore";
  const inWindow = args.recent.filter((t) => args.now - t < WINDOW_MS).length;
  return inWindow < MAX_RECOVERIES ? "recover" : "give-up";
}

/** Live view pose the host keeps across a remount (metres; yaw/pitch degrees: compass yaw in fly mode, follow-camera yaw in character mode). */
export type LivePose = { x: number; y: number; z: number; yaw?: number; pitch?: number };

/** Store a follow camera's yaw/pitch (radians) on the saved pose, in degrees. */
export function saveCameraAngles(pose: LivePose, yawRad: number, pitchRad: number): void {
  pose.yaw = DEG_PER_RAD * yawRad;
  pose.pitch = DEG_PER_RAD * pitchRad;
}

/** The follow camera's yaw/pitch (radians) a saved pose carries, or null when it has none. */
export function cameraAnglesOf(pose: LivePose | null): { yaw: number; pitch: number } | null {
  if (!pose || pose.yaw === undefined || pose.pitch === undefined) return null;
  return { yaw: pose.yaw / DEG_PER_RAD, pitch: pose.pitch / DEG_PER_RAD };
}

const DEG_PER_RAD = 180 / Math.PI;

/** Pose writes per second at most, so the ref costs nothing per frame. */
export const POSE_SAVE_INTERVAL_S = 0.25;

export type DeviceLossInfo = { message?: string; reason?: string | null };

/** Host-side state: the Canvas key and the loss handler the renderer factory calls. */
export function useGpuRecovery(onGiveUp: (message: string) => void) {
  const [canvasKey, setCanvasKey] = useState(0);
  const recent = useRef<number[]>([]);
  const onDeviceLost = useCallback((info: DeviceLossInfo, disposedByUs: boolean) => {
    const now = performance.now();
    const decision = decideRecovery({ disposedByUs, recent: recent.current, now });
    if (decision === "ignore") return;
    const what = `${info.reason ?? "unknown"}: ${info.message ?? ""}`;
    if (decision === "give-up") {
      console.error(`[studio] GPU device lost again (${what}); giving up after ${MAX_RECOVERIES} recoveries in a minute`);
      onGiveUp(`GPU device lost (${what}).`);
      return;
    }
    recent.current = [...recent.current.filter((t) => now - t < WINDOW_MS), now];
    console.warn(`[studio] GPU device lost (${what}); recovering: new device and renderer`);
    setCanvasKey((k) => k + 1);
  }, [onGiveUp]);
  /** Error-boundary path: a GPU-origin throw gets the same bounded remount. */
  const recoverFromError = useCallback((message: string): boolean => {
    const now = performance.now();
    if (decideRecovery({ disposedByUs: false, recent: recent.current, now }) !== "recover") return false;
    recent.current = [...recent.current.filter((t) => now - t < WINDOW_MS), now];
    console.warn(`[studio] GPU error in the 3D tree (${message}); remounting the canvas`);
    setCanvasKey((k) => k + 1);
    return true;
  }, []);
  return { canvasKey, onDeviceLost, recoverFromError };
}

/** True for errors that come from the GPU device rather than our scene code. */
export function isGpuOriginError(message: string): boolean {
  return /device (was )?lost|GPUDevice|GPUBuffer|GPUTexture|WebGPU|context lost/i.test(message);
}
