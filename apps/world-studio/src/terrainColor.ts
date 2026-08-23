/** Shared elevation colouring: depth blues below sea level, marsh greens to
 * upland greys above. Used by the 2D map painter and the 3D detail texture. */
export function colour(height: number, seaLevel: number, shade: number): [number, number, number] {
  if (height < seaLevel) {
    const depth = seaLevel - height;
    if (depth < 2) {
      const t = depth / 2; // waterlogged green -> teal
      return [60 - 30 * t, 110 - 15 * t, 90 + 40 * t];
    }
    const d = Math.min(1, (depth - 2) / 60);
    return [18 + 12 * (1 - d), 60 + 35 * (1 - d), 120 + 40 * (1 - d)];
  }
  const a = Math.min(1, (height - seaLevel) / 110);
  let r: number, g: number, b: number;
  if (a < 0.25) {
    const t = a / 0.25; // wet lowland: dark green -> green
    r = 44 + 30 * t; g = 92 + 40 * t; b = 52 + 10 * t;
  } else if (a < 0.6) {
    const t = (a - 0.25) / 0.35; // hills: green -> ochre
    r = 74 + 86 * t; g = 132 - 22 * t; b = 62 - 4 * t;
  } else {
    const t = (a - 0.6) / 0.4; // uplands: ochre -> pale grey
    r = 160 + 60 * t; g = 110 + 90 * t; b = 58 + 130 * t;
  }
  return [r * shade, g * shade, b * shade];
}

/** Paint a heights array to an offscreen canvas with simple hillshade. */
export function paintTerrainCanvas(heights: Float32Array, w: number, h: number,
                                   seaLevel = 0): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const out = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const grad = heights[Math.min(i + 1, heights.length - 1)] - heights[i];
      const shade = Math.max(0.72, Math.min(1.2, 1 + grad * 0.12));
      const [r, g, b] = colour(heights[i], seaLevel, heights[i] < seaLevel ? 1 : shade);
      out.data[i * 4] = r; out.data[i * 4 + 1] = g; out.data[i * 4 + 2] = b; out.data[i * 4 + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return canvas;
}
