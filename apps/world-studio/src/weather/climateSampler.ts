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

let worker: Worker | null = null;

/** One worker decodes every raster (climateRaster.worker.ts); the main thread
 * only receives the transferred pixel buffer. */
function decoder(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL("./climateRaster.worker.ts", import.meta.url), { type: "module" });
  w.onmessage = (e: MessageEvent<{ url: string; buf?: ArrayBuffer; w?: number; h?: number; error?: string }>) => {
    const { url, buf, error } = e.data;
    const name = url.slice(url.lastIndexOf("/") + 1);
    if (error || !buf) rasters.set(name, "failed");
    else rasters.set(name, { data: new Uint8ClampedArray(buf), w: e.data.w!, h: e.data.h! });
  };
  worker = w;
  return w;
}

function ensure(base: string, name: string): RasterPixels | null {
  const state = rasters.get(name);
  if (state && state !== "pending" && state !== "failed") return state;
  if (state) return null;
  rasters.set(name, "pending");
  if (typeof Worker === "undefined") {
    rasters.set(name, "failed");
    return null;
  }
  decoder().postMessage({ url: new URL(`${base}province/${name}`, location.href).href });
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

/** climate-vis at (x, z): [orographic belt mask, region extinction /0.02, –]
 * (Phase 8c round 3 — fog locality + region ambient visibility). */
export function climateVisAt(base: string, xM: number, zM: number, extentM: number): [number, number, number] | null {
  return sample(ensure(base, "climate-vis.png"), xM, zM, extentM);
}
