/** Camera-facing compass heading (world axes: north = −Z, east = +X,
 * decision 0003). Returns degrees clockwise from north plus an 8-wind label. */
export function headingOf(dirX: number, dirZ: number): { deg: number; point: string } {
  const deg = ((Math.atan2(dirX, -dirZ) * 180) / Math.PI + 360) % 360;
  const points = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return { deg, point: points[Math.round(deg / 45) % 8] };
}
