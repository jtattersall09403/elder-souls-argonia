import { useEffect } from "react";

/**
 * The rectangle the player can actually see, published as CSS variables.
 *
 * Full-screen UI on a phone keeps getting cut off, and it keeps getting cut off
 * for the same reason: every unit CSS offers answers a question about the
 * *browser* rather than about the screen.
 *
 *   - `%` of `html`/`body` and `vh`/`vw` are the **layout viewport**, which
 *     extends underneath the address bar and, with `viewport-fit=cover`, under
 *     the notch and the rounded corners as well. That is why the bottom of the
 *     inventory was cut off outside full screen.
 *   - `dvh`/`dvw` track the retracting browser chrome but still describe the
 *     layout viewport, and they say nothing about a display cutout on the side
 *     — which is why the right edge was cut off *in* full screen, where there
 *     is no browser chrome left to explain it.
 *   - `env(safe-area-inset-*)` describe the cutout but not the chrome, and only
 *     with `viewport-fit=cover`.
 *
 * `window.visualViewport` is the one thing that reports the visible rectangle
 * directly, and it stays correct through pinch zoom, the on-screen keyboard,
 * orientation changes and entering or leaving full screen. So a screen that
 * must fit is positioned against these rather than against a unit:
 *
 *     position: fixed;
 *     left: var(--visual-left); top: var(--visual-top);
 *     width: var(--visual-width); height: var(--visual-height);
 *
 * Safe-area padding still belongs *inside* that box: the visible rectangle can
 * include a rounded corner that content should keep clear of.
 *
 * Falls back to `100%`/`0px` where the API is absent (older browsers, jsdom),
 * which is exactly the behaviour this replaces.
 */

const VARIABLES = {
  width: "--visual-width",
  height: "--visual-height",
  left: "--visual-left",
  top: "--visual-top",
} as const;

/** Write the current visible rectangle onto an element's style. */
export function publishVisualViewport(target: HTMLElement, viewport: VisualViewport | null) {
  if (!viewport) {
    target.style.setProperty(VARIABLES.width, "100%");
    target.style.setProperty(VARIABLES.height, "100%");
    target.style.setProperty(VARIABLES.left, "0px");
    target.style.setProperty(VARIABLES.top, "0px");
    return;
  }
  // Rounded down: half a device pixel of overhang is still a scrollbar or a
  // clipped border on some browsers, and losing one pixel is invisible.
  target.style.setProperty(VARIABLES.width, `${Math.floor(viewport.width)}px`);
  target.style.setProperty(VARIABLES.height, `${Math.floor(viewport.height)}px`);
  target.style.setProperty(VARIABLES.left, `${Math.round(viewport.offsetLeft)}px`);
  target.style.setProperty(VARIABLES.top, `${Math.round(viewport.offsetTop)}px`);
}

/**
 * Keep the visible-rectangle variables current on the document root.
 *
 * Cheap enough to leave mounted for the life of the app: it writes four custom
 * properties on the events that can change the answer, and nothing else.
 */
export function useVisualViewportVariables() {
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return undefined;
    const root = document.documentElement;
    const viewport = window.visualViewport ?? null;
    const publish = () => publishVisualViewport(root, viewport);
    publish();
    // `resize` alone is not enough: pinch zoom and the on-screen keyboard move
    // the visible rectangle without resizing it.
    viewport?.addEventListener("resize", publish);
    viewport?.addEventListener("scroll", publish);
    window.addEventListener("orientationchange", publish);
    // Entering or leaving full screen resizes the visual viewport, but some
    // browsers fire the change before the new size is readable.
    const onFullscreen = () => requestAnimationFrame(publish);
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => {
      viewport?.removeEventListener("resize", publish);
      viewport?.removeEventListener("scroll", publish);
      window.removeEventListener("orientationchange", publish);
      document.removeEventListener("fullscreenchange", onFullscreen);
    };
  }, []);
}
