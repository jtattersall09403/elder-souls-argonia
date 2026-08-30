import { SWITCH_GAMEPAD } from "./input";

/**
 * UI screen bindings — the menu layer, kept separate from `InputController`.
 *
 * Combat actions are polled inside the frame loop; that loop stops while a
 * modal screen is up, so the button that closes the screen can never live
 * there. This module owns its own edge detection and is polled from the app
 * shell regardless of whether the world is running.
 *
 * Adding a screen (map, journal, magic, pause) is one entry in
 * UI_MENU_BINDINGS plus a case where the app opens it — the touch button and
 * the controls help list are both generated from this table.
 */
export type UiMenu = "inventory";

export interface UiMenuBinding {
  menu: UiMenu;
  /** Display name of the screen. */
  label: string;
  /** KeyboardEvent.code values that toggle it. */
  keys: string[];
  /** Gamepad button indices that toggle it. */
  buttons: number[];
  /** Short caption for the on-screen touch button and the help panel. */
  keyLabel: string;
  padLabel: string;
}

export const UI_MENU_BINDINGS: readonly UiMenuBinding[] = [
  {
    menu: "inventory",
    label: "Inventory",
    keys: ["KeyI"],
    buttons: [SWITCH_GAMEPAD.START_MENU],
    keyLabel: "I",
    padLabel: "Start",
  },
];

export function menuForKey(code: string): UiMenu | null {
  return UI_MENU_BINDINGS.find((binding) => binding.keys.includes(code))?.menu ?? null;
}

/**
 * Edge-detected gamepad/touch source for the menu bindings.
 *
 * Keyboard toggles stay on a plain keydown listener in the app shell — key
 * repeat already gives an edge — so this only has to poll the pad and the
 * virtual (touch) presses.
 */
export class UiMenuInput {
  private held = new Map<UiMenu, boolean>();
  private virtual = new Set<UiMenu>();

  /** Touch buttons call this on press and release. */
  press(menu: UiMenu, active: boolean) {
    if (active) this.virtual.add(menu);
    else this.virtual.delete(menu);
  }

  /** Returns the menus whose button went down since the last poll. */
  poll(): UiMenu[] {
    const pads = typeof navigator !== "undefined" && navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = Array.from(pads).find((candidate): candidate is Gamepad => Boolean(candidate?.connected));
    const fired: UiMenu[] = [];
    for (const binding of UI_MENU_BINDINGS) {
      const down = this.virtual.has(binding.menu)
        || binding.buttons.some((index) => Boolean(pad?.buttons[index]?.pressed));
      if (down && !this.held.get(binding.menu)) fired.push(binding.menu);
      this.held.set(binding.menu, down);
    }
    return fired;
  }
}

export const uiMenuInput = new UiMenuInput();
