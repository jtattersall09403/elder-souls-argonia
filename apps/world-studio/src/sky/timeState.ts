import {
  DEFAULT_INSTANT,
  MONTHS,
  WorldClock,
  type WorldInstant,
} from "@elder-souls/world-time";

/**
 * The studio's single world clock (module 55 §94): one instance shared by the
 * map UI, both 3D canvases and the environment query. Paused by default so
 * every URL reproduces one exact frame; a rate control animates it.
 */
export const worldClock = new WorldClock();

/** UI subscription (useSyncExternalStore-compatible). */
const listeners = new Set<() => void>();
let version = 0;
export function subscribeClock(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function clockVersion(): number {
  return version;
}
export function notifyClock(): void {
  version += 1;
  listeners.forEach((fn) => fn());
}

export function setClockInstant(instant: WorldInstant): void {
  worldClock.setInstant(instant);
  notifyClock();
}

/** `t=HH:MM` → minute of day, or null. */
export function parseTimeParam(t: string | null): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return null;
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  return minutes >= 0 && minutes < 1440 ? minutes : null;
}

/** `d=M-D` (1-based month) → {month (0-based), day}, or null. */
export function parseDateParam(d: string | null): { month: number; day: number } | null {
  if (!d) return null;
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(d);
  if (!m) return null;
  const month = Number(m[1]) - 1;
  const day = Number(m[2]);
  if (month < 0 || month > 11 || day < 1 || day > MONTHS[month].days) return null;
  return { month, day };
}

export function formatTimeParam(minuteOfDay: number): string {
  const mins = Math.round(minuteOfDay);
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatDateParam(instant: WorldInstant): string {
  return `${instant.month + 1}-${instant.day}`;
}

/** Apply URL params (t, d, rate) to the clock. Defaults: module 55's canon default instant. */
export function applyTimeParams(params: URLSearchParams): void {
  const time = parseTimeParam(params.get("t"));
  const date = parseDateParam(params.get("d"));
  const instant: WorldInstant = {
    ...DEFAULT_INSTANT,
    ...(date ?? {}),
    minuteOfDay: time ?? DEFAULT_INSTANT.minuteOfDay,
  };
  worldClock.setInstant(instant);
  const rate = Number(params.get("rate"));
  worldClock.rate = Number.isFinite(rate) && rate >= 0 ? rate : 0;
}

/**
 * Named region light presets (module 55 tooling; module 85 §66). Coordinates
 * are representative points of the named region classes on the compiled
 * region map; dates pick the season that shows the preset's character
 * (recession = radiation-mist season; Midyear 4 is a full-moon night).
 */
export interface LightPreset {
  id: string;
  label: string;
  xKm: number;
  zKm: number;
  month: number; // 0-based
  day: number;
  minuteOfDay: number;
  /** Forced weather state (Phase 8c studio preview); omitted = auto. */
  w?: string;
}

export const LIGHT_PRESETS: readonly LightPreset[] = [
  // The 8a *light* references force clear weather — their job is reference
  // light, and the auto calendar legitimately rolls rain on these dates.
  { id: "blackrose-dawn", label: "Blackrose basin, dawn mist", xKm: 2.4, zKm: 6.2, month: 10, day: 15, minuteOfDay: 5 * 60 + 50, w: "clear" },
  { id: "coast-noon", label: "Padomaic coast, clear noon", xKm: 5.16, zKm: 4.64, month: 7, day: 17, minuteOfDay: 12 * 60, w: "clear" },
  { id: "mountains-afternoon", label: "Border mountains, clear afternoon", xKm: 2.25, zKm: 1.09, month: 2, day: 10, minuteOfDay: 15 * 60 + 30, w: "clear" },
  { id: "jungle-night", label: "Deep jungle, full-moon night", xKm: 4.01, zKm: 4.62, month: 5, day: 4, minuteOfDay: 22 * 60, w: "clear" },
  // Phase 8c weather presets (module 55 tooling: "Padomaic coast, storm noon").
  { id: "coast-storm", label: "Padomaic coast, storm noon", xKm: 5.16, zKm: 4.64, month: 6, day: 20, minuteOfDay: 12 * 60, w: "thunderstorm" },
  { id: "basin-downpour", label: "Blackrose basin, monsoon downpour", xKm: 2.4, zKm: 6.2, month: 6, day: 8, minuteOfDay: 16 * 60, w: "downpour" },
  { id: "cloud-forest", label: "Cloud-forest belt, whiteout", xKm: 2.43, zKm: 1.13, month: 8, day: 5, minuteOfDay: 10 * 60, w: "overcast" },
  { id: "coast-squall", label: "Open coast, squall front", xKm: 6.16, zKm: 5.07, month: 4, day: 22, minuteOfDay: 15 * 60, w: "squall" },
];
