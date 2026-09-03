import { create } from "zustand";

import type { ArrowDefinition } from "../equipment/arrows";

/**
 * Arrows currently in the air.
 *
 * Its own store rather than more state in the combat scene, because a
 * projectile outlives the action that fired it: the archer can be dead, staggered
 * or three rooms away by the time the arrow lands, so tying its life to the
 * shooter's state machine is exactly wrong.
 */

export type LiveArrow = {
  id: number;
  arrow: ArrowDefinition;
  origin: readonly [number, number, number];
  /** Metres per second, already resolved from draw and bow. */
  velocity: readonly [number, number, number];
  /** HURTBOX name of whoever loosed it, so it cannot hit its own archer. */
  shooter: string;
};

type ArrowStore = {
  arrows: readonly LiveArrow[];
  fire: (shot: Omit<LiveArrow, "id">) => number;
  retire: (id: number) => void;
  clear: () => void;
};

let nextId = 1;

/**
 * Hard cap on arrows in the world at once.
 *
 * Not a memory concern — it is a physics one. Every live arrow is a rigid body
 * with CCD enabled, and an archer who holds the button through a stamina bar
 * should not be able to halve the frame rate.
 */
export const MAX_LIVE_ARROWS = 32;

export const useArrowStore = create<ArrowStore>((set) => ({
  arrows: [],
  fire: (shot) => {
    const id = nextId++;
    set((state) => ({
      // Oldest first out: an arrow still in the air two seconds later is
      // already a miss.
      arrows: [...state.arrows, { ...shot, id }].slice(-MAX_LIVE_ARROWS),
    }));
    return id;
  },
  retire: (id) => set((state) => ({ arrows: state.arrows.filter((arrow) => arrow.id !== id) })),
  clear: () => set({ arrows: [] }),
}));

/** Fire without subscribing. Called from the frame loop, not from render. */
export function fireArrow(shot: Omit<LiveArrow, "id">) {
  return useArrowStore.getState().fire(shot);
}

export function clearArrows() {
  useArrowStore.getState().clear();
}
