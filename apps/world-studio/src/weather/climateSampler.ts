/**
 * CPU access to the compiled climate rasters (Phase 8a/8c): climate-air.png
 * (R humidity, G mist propensity, B canopy closure) and climate-weather.png
 * (R rain amplitude, G storm exposure, B advection sea fog). One decode each,
 * shared by the sky turbidity term, the weather machine's local expression
 * and the environment query.
 */

interface RasterPixels {
  data: Uint8ClampedArray;
  w: number;
  h: number;
}

const rasters = new Map<string, RasterPixels | "pending" | "failed">();

function ensure(base: string, name: string): RasterPixels | null {
  const state = rasters.get(name);
  if (state && state !== "pending" && state !== "failed") return state;
  if (state === "pending") return null;
  rasters.set(name, "pending");
  const img = new Image();
  img.src = `${base}province/${name}`;
  img
    .decode()
    .then(() => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const g = c.getContext("2d", { willReadFrequently: true })!;
      g.drawImage(img, 0, 0);
      rasters.set(name, {
        data: g.getImageData(0, 0, c.width, c.height).data,
        w: c.width,
        h: c.height,
      });
    })
    .catch(() => rasters.set(name, "failed"));
  return null;
}

function sample(px: RasterPixels | null, xM: number, zM: number, extentM: number): [number, number, number] | null {
  if (!px) return null;
  const ix = Math.max(0, Math.min(px.w - 1, Math.round((xM / extentM) * (px.w - 1))));
  const iz = Math.max(0, Math.min(px.h - 1, Math.round((zM / extentM) * (px.h - 1))));
  const i = (iz * px.w + ix) * 4;
  return [px.data[i] / 255, px.data[i + 1] / 255, px.data[i + 2] / 255];
}

/** climate-air at (x, z) world metres: [humidity, mistPropensity, canopy].
 * Null until the raster decodes (callers keep their previous/default). */
export function climateAirAt(base: string, xM: number, zM: number, extentM: number): [number, number, number] | null {
  return sample(ensure(base, "climate-air.png"), xM, zM, extentM);
}

/** climate-weather at (x, z): [rainAmp, stormExposure, seaFog]. */
export function climateWeatherAt(base: string, xM: number, zM: number, extentM: number): [number, number, number] | null {
  return sample(ensure(base, "climate-weather.png"), xM, zM, extentM);
}
