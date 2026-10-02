import { useEffect, useRef, useState } from "react";

/** How often a perf HUD line re-reads its published numbers. */
export const HUD_POLL_MS = 1000;

/**
 * One poll step: the sample's serialised key against the last one. A changed
 * sample yields a fresh snapshot (published HUD objects are rewritten in
 * place, so their identity never changes); an unchanged one yields null and
 * the caller sets no state.
 */
export function pollStep<T>(next: T, lastKey: string | undefined): { key: string; snapshot: T } | null {
  const key = JSON.stringify(next) ?? "undefined";
  if (key === lastKey) return null;
  return { key, snapshot: next === undefined ? next : (JSON.parse(key) as T) };
}

/** Whether a HUD poll should read: never with the HUD hidden (`?hud=0`) or the tab in the background. */
export function hudPollActive(search: string, documentHidden: boolean): boolean {
  return !documentHidden && new URLSearchParams(search).get("hud") !== "0";
}

/**
 * A HUD line's 1 Hz sample of a published value (plain JSON data). It sets
 * state only when the sample changed (perf10 diag10 C4: six 1 Hz timers
 * re-rendered the HUD every tick, 3-4 work-bound frames every ~1.25 s) and
 * reads nothing while the HUD is hidden or the tab is in the background; a
 * closed perf panel unmounts its lines, which stops their timers.
 */
export function useHudPoll<T>(read: () => T, deps: readonly unknown[]): T {
  const lastKey = useRef<string | undefined>(undefined);
  const [value, setValue] = useState<T>(() => {
    const first = pollStep(read(), undefined)!;
    lastKey.current = first.key;
    return first.snapshot;
  });
  useEffect(() => {
    const tick = () => {
      if (!hudPollActive(window.location.search, document.hidden)) return;
      const step = pollStep(read(), lastKey.current);
      if (!step) return;
      lastKey.current = step.key;
      setValue(step.snapshot);
    };
    tick();
    const timer = window.setInterval(tick, HUD_POLL_MS);
    return () => window.clearInterval(timer);
    // `read` closes over exactly `deps`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}
