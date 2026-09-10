/**
 * Arrow-key movement inside a fixed-column grid of options.
 *
 * Pure and separate from the component on purpose: this is the part a gamepad
 * d-pad will drive later, and it is the part worth testing without a DOM.
 * Movement wraps on both axes, so a stick held in one direction never dead-ends
 * — the behaviour Skyrim's own menus have and the one a controller expects.
 */
export type GridKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";

export const GRID_KEYS: readonly GridKey[] = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];

export function isGridKey(key: string): key is GridKey {
  return (GRID_KEYS as readonly string[]).includes(key);
}

/**
 * The index arrow `key` moves to from `index`, in a `columns`-wide grid of
 * `count` options laid out row by row. Returns `index` unchanged when the move
 * would land outside a ragged final row, so a short row cannot select nothing.
 */
export function gridStep(index: number, key: GridKey, count: number, columns: number): number {
  if (count <= 0 || columns <= 0) return index;
  const clamped = Math.min(Math.max(index, 0), count - 1);
  const rows = Math.ceil(count / columns);
  const row = Math.floor(clamped / columns);
  const column = clamped % columns;

  if (key === "ArrowLeft" || key === "ArrowRight") {
    const delta = key === "ArrowLeft" ? -1 : 1;
    // Wrap along the whole list, not the row: reading order is what a player
    // follows with left/right, and it keeps the last option reachable from the
    // first with one press.
    return (clamped + delta + count) % count;
  }

  const delta = key === "ArrowUp" ? -1 : 1;
  for (let step = 1; step <= rows; step += 1) {
    const candidate = (((row + delta * step) % rows) + rows) % rows * columns + column;
    if (candidate < count) return candidate;
  }
  return clamped;
}
