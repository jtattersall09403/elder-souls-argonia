/**
 * Minimap math (HUD): pure transforms between world metres, province-map
 * pixels and a square minimap viewport. Renderer-agnostic — the world-studio
 * walk-mode minimap and, later, the game HUD both draw from these numbers.
 *
 * Conventions (decision 0003): world x = metres east, z = metres south; the
 * province raster has +x → +px right and +z → +py down, so the map is
 * north-up and heading 0° points to the top of the map.
 */

export interface MapMeta {
  /** Raster width in pixels. */
  imageWidth: number;
  /** Raster height in pixels. */
  imageHeight: number;
  /** World metres covered by one raster pixel. */
  metresPerPixel: number;
}

/** World position (metres) → map-pixel position (unclamped, fractional). */
export function worldToMapPx(
  xM: number,
  zM: number,
  meta: MapMeta,
): { px: number; py: number } {
  return { px: xM / meta.metresPerPixel, py: zM / meta.metresPerPixel };
}

/** Map-pixel position → world metres. */
export function mapPxToWorld(
  px: number,
  py: number,
  meta: MapMeta,
): { xM: number; zM: number } {
  return { xM: px * meta.metresPerPixel, zM: py * meta.metresPerPixel };
}

/** A square source rectangle on the map raster, in pixels. */
export interface CropRect {
  x: number;
  y: number;
  size: number;
}

/**
 * Square crop of `spanM` world metres centred on the player, clamped so it
 * never leaves the raster: near a border the window stops sliding and the
 * player dot moves off-centre instead (standard minimap behaviour). If the
 * requested span exceeds the raster, the whole raster's largest square is
 * returned.
 */
export function cropRectFor(
  xM: number,
  zM: number,
  spanM: number,
  meta: MapMeta,
): CropRect {
  const size = Math.min(
    spanM / meta.metresPerPixel,
    meta.imageWidth,
    meta.imageHeight,
  );
  const { px, py } = worldToMapPx(xM, zM, meta);
  const clamp = (v: number, max: number) =>
    Math.max(0, Math.min(v, max - size));
  return {
    x: clamp(px - size / 2, meta.imageWidth),
    y: clamp(py - size / 2, meta.imageHeight),
    size,
  };
}

/**
 * Where a world position lands inside a crop drawn on a `viewportPx`-wide
 * square canvas. Centre of the viewport unless the crop is border-clamped.
 */
export function positionInCrop(
  xM: number,
  zM: number,
  crop: CropRect,
  meta: MapMeta,
  viewportPx: number,
): { x: number; y: number } {
  const { px, py } = worldToMapPx(xM, zM, meta);
  const scale = viewportPx / crop.size;
  return { x: (px - crop.x) * scale, y: (py - crop.y) * scale };
}

/**
 * Triangle wedge for the player's heading (degrees clockwise from north;
 * north-up map, so 0° points up). Returns tip, then the two base corners,
 * in viewport pixels around centre (cx, cy).
 */
export function headingWedge(
  cx: number,
  cy: number,
  headingDeg: number,
  radius: number,
): [number, number][] {
  const at = (deg: number, r: number): [number, number] => {
    const rad = (deg * Math.PI) / 180;
    return [cx + Math.sin(rad) * r, cy - Math.cos(rad) * r];
  };
  return [
    at(headingDeg, radius),
    at(headingDeg + 140, radius * 0.6),
    at(headingDeg - 140, radius * 0.6),
  ];
}
