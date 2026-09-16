/**
 * Zoom and pan for the 2D province map (owner feedback 2026-09-16: browser
 * zoom does not zoom the map).
 *
 * One transform, one wrapper: the hook returns a `zoom` factor and a pixel
 * `pan`, which App puts on the single element that holds the map canvas AND
 * every layer drawn over it (the raster overlays are the canvas itself; the
 * PlacesLayer and RoutesLayer SVGs share its u/v box). Because the layers are
 * children of that element they scale and pan with it for free, and because
 * `getBoundingClientRect()` reports the TRANSFORMED canvas box, the hover
 * readout's fraction-of-the-map maths keeps returning true province metres
 * with no change (divide by `zoom` only when placing HTML inside the wrapper,
 * whose own coordinates are untransformed).
 *
 * Interaction: wheel over the map zooms about the cursor (nothing else in the
 * map view uses the wheel; ctrl+wheel works the same and is swallowed so the
 * browser does not page-zoom instead), drag pans once zoomed in, and the
 * caller wires +/-/reset buttons to `zoomBy`/`reset`. Panning is clamped so
 * the map always covers the viewport: there is no way to lose it off-screen.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export const MAP_ZOOM_MIN = 1;
export const MAP_ZOOM_MAX = 12;
/** One button press, and one wheel notch at the usual 100 px delta. */
export const MAP_ZOOM_STEP = 1.3;

export interface MapZoomState {
  zoom: number;
  pan: { x: number; y: number };
}

export interface MapZoom extends MapZoomState {
  /** Multiply the zoom, holding the given viewport point still (default: centre). */
  zoomBy: (factor: number, clientX?: number, clientY?: number) => void;
  reset: () => void;
  /** True while a pan drag is in progress (the caller shows a grabbing cursor). */
  dragging: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Keep the scaled content covering the viewport: pan is in [size - size*zoom, 0].
 * At zoom 1 that collapses to 0, so the map cannot drift when fully zoomed out.
 */
export function clampPan(pan: { x: number; y: number }, zoom: number, w: number, h: number) {
  return {
    x: clamp(pan.x, w - w * zoom, 0),
    y: clamp(pan.y, h - h * zoom, 0),
  };
}

/** The new pan that holds viewport point (px, py) still across a zoom change. */
export function panAbout(
  state: MapZoomState, nextZoom: number, px: number, py: number, w: number, h: number,
): MapZoomState {
  const k = nextZoom / state.zoom;
  const pan = { x: px - (px - state.pan.x) * k, y: py - (py - state.pan.y) * k };
  return { zoom: nextZoom, pan: clampPan(pan, nextZoom, w, h) };
}

export function useMapZoom(ref: React.RefObject<HTMLElement | null>): MapZoom {
  const [state, setState] = useState<MapZoomState>({ zoom: 1, pan: { x: 0, y: 0 } });
  const [dragging, setDragging] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const zoomBy = useCallback((factor: number, clientX?: number, clientY?: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = clientX === undefined ? r.width / 2 : clientX - r.left;
    const py = clientY === undefined ? r.height / 2 : clientY - r.top;
    const next = clamp(stateRef.current.zoom * factor, MAP_ZOOM_MIN, MAP_ZOOM_MAX);
    if (next === stateRef.current.zoom) return;
    setState(panAbout(stateRef.current, next, px, py, r.width, r.height));
  }, [ref]);

  const reset = useCallback(() => setState({ zoom: 1, pan: { x: 0, y: 0 } }), []);

  // Non-passive listener: a React onWheel prop cannot preventDefault the
  // browser's own ctrl+wheel page zoom.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const notches = -e.deltaY / 100;
      zoomBy(Math.pow(MAP_ZOOM_STEP, clamp(notches, -3, 3)), e.clientX, e.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [ref, zoomBy]);

  // Drag to pan, only when zoomed in. The drag is not captured until the
  // pointer has actually moved, so a click still reaches the route line or
  // place dot under it.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let start: { x: number; y: number; pan: { x: number; y: number } } | null = null;
    let moved = false;
    const down = (e: PointerEvent) => {
      if (stateRef.current.zoom <= 1 || e.button !== 0) return;
      start = { x: e.clientX, y: e.clientY, pan: stateRef.current.pan };
      moved = false;
    };
    const move = (e: PointerEvent) => {
      if (!start) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      if (!moved) { moved = true; setDragging(true); }
      const r = el.getBoundingClientRect();
      setState((s) => ({
        zoom: s.zoom,
        pan: clampPan({ x: start!.pan.x + dx, y: start!.pan.y + dy }, s.zoom, r.width, r.height),
      }));
    };
    const up = () => { start = null; if (moved) setDragging(false); moved = false; };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [ref]);

  return { ...state, zoomBy, reset, dragging };
}
