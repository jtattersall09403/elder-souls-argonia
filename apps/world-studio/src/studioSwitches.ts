/**
 * Diagnosis-only URL switches (webgpu10 C2; no effect unless present):
 * `?obuf=8` renders into an 8-bit output buffer instead of half-float,
 * `?tone=0` uses no tone mapping and linear output (no frame target),
 * `?refr=<scale>` overrides the water scene target scale (> 0).
 * `?post=0` (CharacterMode) already switches the bloom pass off.
 */
export interface StudioSwitches {
  obuf8: boolean;
  tone0: boolean;
  /** Scene-target scale override, or null. */
  refr: number | null;
}

/** Read at import: the App re-serialises the query string and drops keys it does not know before the water and sky mount. */
export const INITIAL_SWITCHES: Readonly<StudioSwitches> = Object.freeze(
  parseStudioSwitches(typeof location === "undefined" ? "" : location.search),
);

export function parseStudioSwitches(search: string): StudioSwitches {
  const q = new URLSearchParams(search);
  const refr = Number(q.get("refr"));
  return {
    obuf8: q.get("obuf") === "8",
    tone0: q.get("tone") === "0",
    refr: q.has("refr") && Number.isFinite(refr) && refr > 0 ? Math.min(refr, 2) : null,
  };
}
