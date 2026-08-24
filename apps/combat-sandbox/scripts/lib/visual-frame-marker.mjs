import { readFileSync } from "node:fs";

export const VISUAL_FRAME_MARKER_PROTOCOL = JSON.parse(readFileSync(
  new URL("../../../../packages/game-core/src/validation/visualFrameMarkerProtocol.json", import.meta.url),
  "utf8",
));

export const VISUAL_FRAME_MARKER_WIDTH = (
  VISUAL_FRAME_MARKER_PROTOCOL.syncBits.length
  + VISUAL_FRAME_MARKER_PROTOCOL.dataBits
) * VISUAL_FRAME_MARKER_PROTOCOL.cellPixels;
export const VISUAL_FRAME_MARKER_HEIGHT = (
  VISUAL_FRAME_MARKER_PROTOCOL.rows * VISUAL_FRAME_MARKER_PROTOCOL.cellPixels
);

function cellMean(pixels, width, column, row, cellPixels) {
  // Ignore each cell's compressed boundary pixels. The complementary row then
  // gives a local black/white comparison that survives VP9/YUV quantisation.
  const inset = Math.max(1, Math.floor(cellPixels / 4));
  let total = 0;
  let samples = 0;
  for (let y = row * cellPixels + inset; y < (row + 1) * cellPixels - inset; y += 1) {
    for (let x = column * cellPixels + inset; x < (column + 1) * cellPixels - inset; x += 1) {
      total += pixels[y * width + x];
      samples += 1;
    }
  }
  return total / samples;
}

/** Decode one greyscale crop of the marker; null means the pixels are unsafe. */
export function decodeVisualFrameMarker(
  pixels,
  protocol = VISUAL_FRAME_MARKER_PROTOCOL,
  { minimumContrast = 48 } = {},
) {
  const columns = protocol.syncBits.length + protocol.dataBits;
  const width = columns * protocol.cellPixels;
  const height = protocol.rows * protocol.cellPixels;
  if (!(pixels instanceof Uint8Array) || pixels.length !== width * height) {
    throw new TypeError(`Visual frame marker needs ${width * height} greyscale pixels`);
  }
  if (protocol.rows !== 2) throw new Error("Visual frame marker protocol needs two complementary rows");

  const bits = [];
  const contrasts = [];
  for (let column = 0; column < columns; column += 1) {
    const top = cellMean(pixels, width, column, 0, protocol.cellPixels);
    const bottom = cellMean(pixels, width, column, 1, protocol.cellPixels);
    const contrast = Math.abs(top - bottom);
    if (contrast < minimumContrast) return null;
    bits.push(top > bottom ? 1 : 0);
    contrasts.push(contrast);
  }
  if (protocol.syncBits.some((bit, index) => bits[index] !== bit)) return null;
  let frame = 0;
  for (const bit of bits.slice(protocol.syncBits.length)) frame = frame * 2 + bit;
  return {
    frame,
    minimumContrast: Math.min(...contrasts),
    meanContrast: contrasts.reduce((sum, contrast) => sum + contrast, 0) / contrasts.length,
  };
}

export function decodeVisualFrameMarkerStream(
  pixels,
  frameCount,
  protocol = VISUAL_FRAME_MARKER_PROTOCOL,
  options,
) {
  if (!(pixels instanceof Uint8Array) || !Number.isInteger(frameCount) || frameCount <= 0) {
    throw new TypeError("Visual frame marker stream needs bytes and a positive frame count");
  }
  const frameBytes = VISUAL_FRAME_MARKER_WIDTH * VISUAL_FRAME_MARKER_HEIGHT;
  if (pixels.length !== frameBytes * frameCount) {
    throw new Error(
      `Visual frame marker stream has ${pixels.length} bytes; expected ${frameBytes * frameCount}`,
    );
  }
  return Array.from({ length: frameCount }, (_, sourceFrame) => ({
    sourceFrame,
    ...decodeVisualFrameMarker(
      pixels.subarray(sourceFrame * frameBytes, (sourceFrame + 1) * frameBytes),
      protocol,
      options,
    ),
  }));
}
