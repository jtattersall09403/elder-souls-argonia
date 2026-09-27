import { useSyncExternalStore, type ReactNode } from "react";

/**
 * Screen-space UI that a component inside the canvas owns, drawn as plain
 * DOM over the canvas (walk 2 D2 and its travel twin): a drei
 * `<Html fullscreen>` inside the canvas projects its world anchor every frame,
 * and anchored at the origin it sat kilometres from the player, off screen.
 * The canvas-side owner puts its node in a named slot when what it shows
 * changes; `ScreenOverlay` (outside the canvas, inside the character view's
 * full-screen box) draws every slot. React nodes carry their handlers across
 * the two roots, so a menu's buttons still call the owner's state.
 *
 * The door prompt keeps its own channel (doorOverlay.tsx): its fade is
 * written onto the element every frame, never through a re-render.
 */
export interface ScreenOverlayChannel {
  /** Put `node` in `slot`, or clear the slot with null. */
  set(slot: string, node: ReactNode | null): void;
  /** The slots in insertion order; a new array only when a slot changed. */
  snapshot(): readonly (readonly [string, ReactNode])[];
  subscribe(listener: () => void): () => void;
}

export function createScreenOverlayChannel(): ScreenOverlayChannel {
  const slots = new Map<string, ReactNode>();
  const listeners = new Set<() => void>();
  let snap: readonly (readonly [string, ReactNode])[] = [];
  return {
    set(slot, node) {
      if (node === null ? !slots.has(slot) : slots.get(slot) === node) return;
      if (node === null) slots.delete(slot);
      else slots.set(slot, node);
      snap = [...slots.entries()];
      for (const listener of listeners) listener();
    },
    snapshot: () => snap,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

export function ScreenOverlay({ channel }: { channel: ScreenOverlayChannel }) {
  const slots = useSyncExternalStore(channel.subscribe, channel.snapshot, channel.snapshot);
  return (
    <div data-screen-overlay style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {slots.map(([slot, node]) => <div key={slot} data-screen-slot={slot}>{node}</div>)}
    </div>
  );
}
