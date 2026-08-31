import { useCallback, useMemo } from "react";
import { useInventoryStore } from "@elder-souls/game-core/inventory/store";
import { EQUIP_SLOTS } from "@elder-souls/game-core/inventory/types";
import { buildInventoryView, type InventoryCell } from "@elder-souls/game-core/inventory/view";
import { PaperDoll } from "./PaperDoll";
import { useInventoryCursor, type CursorDirection } from "./useInventoryCursor";
import "./inventory.css";

/**
 * The inventory screen.
 *
 * This file is *layout only*. Everything it draws comes from the view model in
 * `game/inventory/view.ts`, and everything it looks like comes from the
 * stylesheet named by `theme`. Neither the rules nor the skin live here, so
 * re-theming the game is a different stylesheet and porting the inventory to
 * another engine is a different file of the same shape.
 */

export type InventoryTheme = "morrowind";

const CATEGORY_HINT: Record<string, string> = {
  all: "Everything you are carrying.",
  weapon: "Blades, hafts and hammers.",
  apparel: "Worn and carried protection.",
  magic: "Potions, scrolls and enchanted things.",
  misc: "Everything else.",
};

function Cell({
  cell,
  cursor,
  onActivate,
  onFocus,
}: {
  cell: InventoryCell;
  cursor: boolean;
  onActivate: (itemId: string) => void;
  onFocus: (itemId: string | null) => void;
}) {
  return (
    <button
      type="button"
      className="inv-cell"
      data-equipped={cell.equipped || undefined}
      data-provisional={cell.provisional ? true : undefined}
      data-blocked={cell.equipBlocked ? true : undefined}
      data-cursor={cursor || undefined}
      title={cell.name}
      onClick={() => onActivate(cell.itemId)}
      onMouseEnter={() => onFocus(cell.itemId)}
      onFocus={() => onFocus(cell.itemId)}
    >
      {cell.icon
        ? <img className="inv-cell-art" src={`${import.meta.env.BASE_URL}${cell.icon}`} alt="" draggable={false} />
        : <span className="inv-cell-initials">{cell.initials}</span>}
      {cell.count > 1 && <span className="inv-cell-count">{cell.count}</span>}
    </button>
  );
}

/**
 * The item panel.
 *
 * Morrowind put an item's whole stat block in a bordered panel beside the
 * cursor. This is that panel, with two changes the owner asked for.
 *
 * It does not float. It used to be absolutely positioned over the bottom-right
 * of the item column, which meant it covered the encumbrance and gold line
 * underneath it — and on a phone, where it docks, it covered them completely.
 * It is now a row of the item column in its own right, so it can never overlap
 * anything, and the old separate one-line summary underneath it is gone: there
 * is one item panel, in one place, on every screen size.
 *
 * And it carries no flavour text. Item descriptions were a per-material blurb
 * repeated across every item made of that material, which is noise beside the
 * numbers that actually decide what to wear.
 */
function ItemPanel({ cell, hint, gold, touch }: {
  cell: InventoryCell | null;
  hint: string;
  gold: number;
  touch: boolean;
}) {
  const action = cell?.equipped
    ? "Equipped"
    : cell?.equipBlocked ?? (touch ? "Tap again to equip" : "Click to equip");
  return (
    <div className="inv-panel" role="status">
      {cell ? (
        <>
          <header className="inv-panel-title">
            <span>{cell.name}</span>
            {cell.count > 1 && <span className="inv-panel-count">×{cell.count}</span>}
          </header>
          <dl className="inv-panel-stats">
            {cell.stats.map((stat) => (
              <div key={stat.label} className="inv-panel-stat" title={stat.note}>
                <dt>{stat.label}</dt>
                <dd>{stat.value}</dd>
              </div>
            ))}
          </dl>
          <p className="inv-panel-foot">
            {cell.slot && <span className="inv-panel-action">{action}</span>}
            {cell.provisional && <span className="inv-panel-warning">{cell.provisional}</span>}
            <span className="inv-gold">{gold} gold</span>
          </p>
        </>
      ) : (
        <p className="inv-panel-hint">
          <span>{hint}</span>
          <span className="inv-gold">{gold} gold</span>
        </p>
      )}
    </div>
  );
}

/** Columns the grid lays out at, so a cursor can move up and down it. */
const GRID_COLUMNS = 12;

export function InventoryScreen({ theme = "morrowind" }: { theme?: InventoryTheme }) {
  const open = useInventoryStore((state) => state.open);
  const inventory = useInventoryStore((state) => state.inventory);
  const category = useInventoryStore((state) => state.category);
  const search = useInventoryStore((state) => state.search);
  const sort = useInventoryStore((state) => state.sort);
  const focused = useInventoryStore((state) => state.focused);
  const setOpen = useInventoryStore((state) => state.setOpen);
  const setCategory = useInventoryStore((state) => state.setCategory);
  const setSearch = useInventoryStore((state) => state.setSearch);
  const setFocused = useInventoryStore((state) => state.setFocused);
  const toggle = useInventoryStore((state) => state.toggle);
  // Touch and pad share one rule: select first, act second. Detected once,
  // because a device does not change shape mid-session.
  const touchLike = useMemo(
    () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches === true,
    [],
  );

  const view = useMemo(
    () => buildInventoryView(inventory, { category, search, sort, title: "Ashen Ring" }),
    [inventory, category, search, sort],
  );

  const focusedCell = view.cells.find((cell) => cell.itemId === focused) ?? null;
  const cells = view.cells;

  /**
   * One tap inspects, the next equips.
   *
   * A pointer can hover to inspect and click to act, but a finger and a
   * D-pad cannot — so selecting is always the first step and acting is always
   * the second. Desktop keeps its one-click equip because the hover has
   * already done the inspecting.
   */
  const select = useCallback((itemId: string) => {
    if (touchLike && useInventoryStore.getState().focused !== itemId) {
      setFocused(itemId);
      return;
    }
    toggle(itemId);
  }, [setFocused, toggle, touchLike]);

  const moveCursor = useCallback((direction: CursorDirection) => {
    if (cells.length === 0) return;
    const current = Math.max(0, cells.findIndex((cell) => cell.itemId === focused));
    const step = direction === "left" ? -1
      : direction === "right" ? 1
        : direction === "up" ? -GRID_COLUMNS : GRID_COLUMNS;
    const next = Math.min(cells.length - 1, Math.max(0, current + step));
    setFocused(cells[next].itemId);
  }, [cells, focused, setFocused]);

  useInventoryCursor(open, {
    move: moveCursor,
    activate: () => { if (focused) toggle(focused); },
    close: () => setOpen(false),
    cycleTab: (delta) => {
      const order = view.tabs.map((tab) => tab.id);
      const index = order.findIndex((id) => id === category);
      setCategory(order[(index + delta + order.length) % order.length]);
    },
  });

  if (!open) return null;

  const { encumbrance } = view;
  return (
    <div className="inv-root" data-inventory-theme={theme} role="dialog" aria-label="Inventory">
      <div className="inv-window">
        <header className="inv-titlebar">
          <span className="inv-title">{view.title}</span>
          <button type="button" className="inv-close" onClick={() => setOpen(false)} aria-label="Close">×</button>
        </header>

        <div className="inv-body">
          <aside className="inv-doll-column">
            <div className="inv-encumbrance" data-over={encumbrance.over || undefined}>
              <div className="inv-encumbrance-fill" style={{ width: `${encumbrance.ratio * 100}%` }} />
              <span className="inv-encumbrance-label">
                {Math.round(encumbrance.currentKg)}/{Math.round(encumbrance.capacityKg)}
              </span>
            </div>
            <div className="inv-doll">
              <PaperDoll loadoutKey={EQUIP_SLOTS.map((slot) => inventory.equipped[slot] ?? "").join("|")} />
              <ul className="inv-slots">
                {view.slots.map((slot) => (
                  <li key={slot.slot} data-filled={slot.cell ? true : undefined}>
                    <span className="inv-slot-label">{slot.label}</span>
                    <span className="inv-slot-value">{slot.cell?.name ?? "—"}</span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="inv-armor">Armor: {view.armourRating}</p>
          </aside>

          <section className="inv-items">
            <div className="inv-toolbar">
              {view.tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className="inv-tab"
                  data-active={tab.active || undefined}
                  onClick={() => setCategory(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
              <input
                className="inv-search"
                value={search}
                placeholder=""
                aria-label="Search items"
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            <div className="inv-grid">
              {view.cells.map((cell) => (
                <Cell
                  key={cell.itemId}
                  cell={cell}
                  cursor={cell.itemId === focused}
                  onActivate={select}
                  onFocus={setFocused}
                />
              ))}
              {view.cells.length === 0 && <p className="inv-empty">Nothing here.</p>}
            </div>
            {/* A row of the column, not a floating card: see `ItemPanel`. */}
            <ItemPanel
              cell={focusedCell}
              hint={CATEGORY_HINT[String(view.tabs.find((tab) => tab.active)?.id)] ?? ""}
              gold={view.gold}
              touch={touchLike}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
