import { describe, expect, it } from "vitest";
import {
  decodeVisualFrameMarker,
  VISUAL_FRAME_MARKER_HEIGHT,
  VISUAL_FRAME_MARKER_PROTOCOL,
  VISUAL_FRAME_MARKER_WIDTH,
} from "./visual-frame-marker.mjs";

function encodedMarker(frame, { white = 238, black = 17 } = {}) {
  const protocol = VISUAL_FRAME_MARKER_PROTOCOL;
  const bits = [
    ...protocol.syncBits,
    ...Array.from(
      { length: protocol.dataBits },
      (_, index) => (frame >> (protocol.dataBits - index - 1)) & 1,
    ),
  ];
  const pixels = new Uint8Array(VISUAL_FRAME_MARKER_WIDTH * VISUAL_FRAME_MARKER_HEIGHT);
  for (const [column, bit] of bits.entries()) {
    for (let row = 0; row < 2; row += 1) {
      const value = (row === 0 ? bit : 1 - bit) === 1 ? white : black;
      for (let y = row * protocol.cellPixels; y < (row + 1) * protocol.cellPixels; y += 1) {
        pixels.fill(
          value,
          y * VISUAL_FRAME_MARKER_WIDTH + column * protocol.cellPixels,
          y * VISUAL_FRAME_MARKER_WIDTH + (column + 1) * protocol.cellPixels,
        );
      }
    }
  }
  return pixels;
}

describe("in-pixel visual frame marker", () => {
  it("decodes a quantised complementary-row frame code", () => {
    expect(decodeVisualFrameMarker(encodedMarker(913))).toMatchObject({ frame: 913 });
  });

  it("rejects a low-contrast crop instead of inventing a frame identity", () => {
    expect(decodeVisualFrameMarker(new Uint8Array(
      VISUAL_FRAME_MARKER_WIDTH * VISUAL_FRAME_MARKER_HEIGHT,
    ).fill(120))).toBeNull();
  });

  it("rejects a crisp non-marker whose sync cells do not match", () => {
    const pixels = encodedMarker(17);
    const cell = VISUAL_FRAME_MARKER_PROTOCOL.cellPixels;
    for (let y = 0; y < cell; y += 1) pixels.fill(0, y * VISUAL_FRAME_MARKER_WIDTH, y * VISUAL_FRAME_MARKER_WIDTH + cell);
    for (let y = cell; y < cell * 2; y += 1) pixels.fill(255, y * VISUAL_FRAME_MARKER_WIDTH, y * VISUAL_FRAME_MARKER_WIDTH + cell);
    expect(decodeVisualFrameMarker(pixels)).toBeNull();
  });
});
