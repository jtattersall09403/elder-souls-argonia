import { useEffect, useRef } from "react";

import { SWITCH_GAMEPAD } from "../../game/io/input";

/**
 * Moving around the inventory without a mouse.
 *
 * The inventory is a DOM screen, so the gamepad the rest of the game reads
 * never reaches it: nothing polls it while a menu is up, and a pad has no
 * pointer to hover with. This closes that gap for the keyboard and the pad at
 * once, since both want the same thing — a cursor, a way to move it, one button
 * that acts and one that leaves.
 *
 * Touch needs none of this: a tap *is* a cursor. What touch needs instead is
 * for the first tap to inspect rather than equip, which the screen handles.
 */

export type CursorDirection = "left" | "right" | "up" | "down";

export type InventoryCursorHandlers = {
  move: (direction: CursorDirection) => void;
  /** Equip or unequip whatever the cursor is on. */
  activate: () => void;
  close: () => void;
  /** Step the category tabs. */
  cycleTab: (delta: number) => void;
};

/** Seconds before a held direction starts repeating, and the repeat interval. */
const REPEAT_DELAY = 0.36;
const REPEAT_INTERVAL = 0.11;
const STICK_DEAD_ZONE = 0.5;
/** D-pad button indices in the standard gamepad mapping. */
const DPAD = { up: 12, down: 13, left: 14, right: 15 };

export function useInventoryCursor(active: boolean, handlers: InventoryCursorHandlers) {
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    if (!active) return undefined;

    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      // A search box gets to keep its arrow keys.
      if (target?.tagName === "INPUT") return;
      const direction = KEY_DIRECTIONS[event.code];
      if (direction) {
        event.preventDefault();
        latest.current.move(direction);
        return;
      }
      if (event.code === "Enter" || event.code === "Space") {
        event.preventDefault();
        latest.current.activate();
      } else if (event.code === "BracketLeft") latest.current.cycleTab(-1);
      else if (event.code === "BracketRight") latest.current.cycleTab(1);
    };
    window.addEventListener("keydown", onKey);

    let frame = 0;
    let last = performance.now();
    const held = new Map<string, number>();
    const previousButtons = new Set<number>();

    const edge = (index: number, pressed: boolean) => {
      const was = previousButtons.has(index);
      if (pressed) previousButtons.add(index);
      else previousButtons.delete(index);
      return pressed && !was;
    };

    /** Fire once on press, then repeat while held, rather than once per frame. */
    const repeat = (key: string, pressed: boolean, dt: number, run: () => void) => {
      if (!pressed) { held.delete(key); return; }
      const elapsed = held.get(key);
      if (elapsed === undefined) { held.set(key, 0); run(); return; }
      const next = elapsed + dt;
      if (elapsed < REPEAT_DELAY && next >= REPEAT_DELAY) {
        held.set(key, REPEAT_DELAY - REPEAT_INTERVAL);
        run();
      } else {
        held.set(key, next);
      }
    };

    const poll = () => {
      frame = requestAnimationFrame(poll);
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;

      const pads = typeof navigator !== "undefined" && navigator.getGamepads
        ? navigator.getGamepads()
        : [];
      const pad = Array.from(pads).find((candidate) => candidate?.connected);
      if (!pad) return;

      const axisX = pad.axes[0] ?? 0;
      const axisY = pad.axes[1] ?? 0;
      const button = (index: number) => Boolean(pad.buttons[index]?.pressed);

      repeat("left", axisX < -STICK_DEAD_ZONE || button(DPAD.left), dt, () => latest.current.move("left"));
      repeat("right", axisX > STICK_DEAD_ZONE || button(DPAD.right), dt, () => latest.current.move("right"));
      repeat("up", axisY < -STICK_DEAD_ZONE || button(DPAD.up), dt, () => latest.current.move("up"));
      repeat("down", axisY > STICK_DEAD_ZONE || button(DPAD.down), dt, () => latest.current.move("down"));

      if (edge(SWITCH_GAMEPAD.A_RIGHT_JUMP, button(SWITCH_GAMEPAD.A_RIGHT_JUMP))) latest.current.activate();
      if (edge(SWITCH_GAMEPAD.B_BOTTOM_DODGE, button(SWITCH_GAMEPAD.B_BOTTOM_DODGE))) latest.current.close();
      if (edge(SWITCH_GAMEPAD.L_GUARD, button(SWITCH_GAMEPAD.L_GUARD))) latest.current.cycleTab(-1);
      if (edge(SWITCH_GAMEPAD.R_LIGHT, button(SWITCH_GAMEPAD.R_LIGHT))) latest.current.cycleTab(1);
    };
    frame = requestAnimationFrame(poll);

    return () => {
      window.removeEventListener("keydown", onKey);
      cancelAnimationFrame(frame);
    };
  }, [active]);
}

const KEY_DIRECTIONS: Record<string, CursorDirection | undefined> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
};
