import { useLayoutEffect, useRef } from "react";
import {
  drawVisualFrameMarker,
  VISUAL_FRAME_MARKER_HEIGHT,
  VISUAL_FRAME_MARKER_ID,
  VISUAL_FRAME_MARKER_WIDTH,
} from "../game/validation/visualFrameMarker";

/** Test-only in-pixel clock; present only for deterministic visual scenarios. */
export function VisualFrameMarker() {
  const marker = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    if (marker.current) drawVisualFrameMarker(marker.current, 0);
  }, []);
  return (
    <canvas
      ref={marker}
      id={VISUAL_FRAME_MARKER_ID}
      className="visual-frame-marker"
      width={VISUAL_FRAME_MARKER_WIDTH}
      height={VISUAL_FRAME_MARKER_HEIGHT}
      style={{ top: -VISUAL_FRAME_MARKER_HEIGHT }}
      aria-hidden="true"
    />
  );
}
