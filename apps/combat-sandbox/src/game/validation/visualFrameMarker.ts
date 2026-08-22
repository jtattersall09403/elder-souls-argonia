import protocol from "./visualFrameMarkerProtocol.json";

export const VISUAL_FRAME_MARKER_ID = "visual-frame-marker";

/** Negative priorities preserve R3F's production auto-render at priority 0. */
export const VISUAL_FRAME_PHASE_PRIORITY = Object.freeze({
  combat: -2,
  actorPoseAndProbe: -1,
  telemetryAndMarker: -0.5,
});

export const VISUAL_FRAME_MARKER_WIDTH = (
  protocol.syncBits.length + protocol.dataBits
) * protocol.cellPixels;
export const VISUAL_FRAME_MARKER_HEIGHT = protocol.rows * protocol.cellPixels;

function markerBits(frame: number) {
  if (!Number.isInteger(frame) || frame < 0 || frame >= 2 ** protocol.dataBits) {
    throw new RangeError(`Visual capture frame ${frame} does not fit the marker protocol`);
  }
  return [
    ...protocol.syncBits,
    ...Array.from(
      { length: protocol.dataBits },
      (_, index) => (frame >> (protocol.dataBits - index - 1)) & 1,
    ),
  ];
}

export function drawVisualFrameMarker(canvas: HTMLCanvasElement, frame: number) {
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Visual capture frame marker needs a 2D canvas context");
  const bits = markerBits(frame);
  context.imageSmoothingEnabled = false;
  for (const [column, bit] of bits.entries()) {
    context.fillStyle = bit === 1 ? "#ffffff" : "#000000";
    context.fillRect(
      column * protocol.cellPixels,
      0,
      protocol.cellPixels,
      protocol.cellPixels,
    );
    context.fillStyle = bit === 1 ? "#000000" : "#ffffff";
    context.fillRect(
      column * protocol.cellPixels,
      protocol.cellPixels,
      protocol.cellPixels,
      protocol.cellPixels,
    );
  }
  canvas.dataset.simulationFrame = String(frame);
}

/**
 * Publish after the production simulation has updated and before R3F renders.
 * The browser compositor therefore records this code and the matching WebGL
 * pose in the same actual video frame.
 */
export function publishVisualFrameMarker(frame: number) {
  const marker = document.getElementById(VISUAL_FRAME_MARKER_ID);
  if (!(marker instanceof HTMLCanvasElement)) return;
  drawVisualFrameMarker(marker, frame);
}

export function visualFrameMarkerIndex(elapsed: number) {
  return Math.max(0, Math.round(elapsed * protocol.framesPerSecond));
}
