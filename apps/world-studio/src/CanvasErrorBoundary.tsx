import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Error boundary for the contents of an R3F `<Canvas>` (studio, 2026-09-20).
 *
 * Without one, any throw inside the 3D tree unmounts the whole Canvas: the
 * renderer's GPU context or device is disposed (a "context lost" or "device
 * lost" line in the console, which reads like a GPU fault and is not; the
 * node renderer, decision 0107, on either backend), the Rapier world tears
 * down mid-step, and React's remount starts the cycle again — the stutter the
 * owner saw. This catches the throw instead: 3D renders nothing, the error is
 * logged ONCE, and the host reports it in plain HTML outside the canvas.
 *
 * It never resets itself for a scene error: a remount would reproduce the
 * same crash loop this exists to stop. A GPU-origin error (a lost device)
 * goes to `onGpuError` first: the host remounts the Canvas with a new device
 * (gpuRecovery.ts, bounded); only when that refuses is the banner shown.
 */
import { isGpuOriginError } from "./gpuRecovery";
type Props = {
  /** Called once, with the error message, when the 3D tree throws. */
  onError?: (message: string) => void;
  /** GPU-origin throws: return true when the host remounts the Canvas. */
  onGpuError?: (message: string) => boolean;
  children: ReactNode;
};

export class CanvasErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[studio] 3D tree failed:", error, info.componentStack);
    if (isGpuOriginError(error.message) && this.props.onGpuError?.(error.message)) return;
    this.props.onError?.(error.message);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** Plain HTML banner, drawn OUTSIDE the canvas so it survives the failure.
 * Developer-facing studio debug UI (app-only tooling), not player text. */
export function CanvasErrorBanner({ message }: { message: string }) {
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999,
      background: "#8b1a1a", color: "#fff", font: "13px/1.4 monospace",
      padding: "8px 12px",
    }}>
      3D tree failed — the scene was stopped so the canvas is not remounted. {message}{" "}
      <button onClick={() => location.reload()}>Reload</button>
    </div>
  );
}
