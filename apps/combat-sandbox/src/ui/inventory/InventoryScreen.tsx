import { useCallback, useMemo } from "react";
import { useInventoryStore } from "../../game/inventory/store";
import { EQUIP_SLOTS } from "../../game/inventory/types";
import { buildInventoryView, type InventoryCell, type InventoryView } from "../../game/inventory/view";
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
 * The item card.
 *
 * Morrowind put an item's whole stat block in a bordered panel beside the
 * cursor, and that is what this is: name, every number the item has, and the
 * flavour underneath. The same panel serves all three platforms — beside the
 * cursor on desktop and pad, and docked to the bottom of the screen on touch,
 * where there is no cursor to sit beside and no room to float over the grid.
 */
function ItemCard({ cell, docked }: { cell: InventoryCell; docked: boolean }) {
  const action = cell.equipped
    ? "Equipped"
    : cell.equipBlocked ?? (docked ? "Tap again to equip" : "Click to equip");
  return (
    <div className="inv-card" data-docked={docked || undefined} role="tooltip">
      <header className="inv-card-title">
        <span>{cell.name}</span>
        {cell.count > 1 && <span className="inv-card-count">×{cell.count}</span>}
      </header>
      <dl className="inv-card-stats">
        {cell.stats.map((stat) => (
          <div key={stat.label} className="inv-card-stat" title={stat.note}>
            <dt>{stat.label}</dt>
            <dd>{stat.value}</dd>
          </div>
        ))}
      </dl>
      <p className="inv-card-flavour">{cell.description}</p>
      {cell.slot && (
        <p className="inv-card-action">
          {action}
        </p>
      )}
      {cell.provisional && <p className="inv-card-warning">{cell.provisional}</p>}
    </div>
  );
}

function DetailLine({ view, focusedId }: { view: InventoryView; focusedId: string | null }) {
  const focused = view.cells.find((cell) => cell.itemId === focusedId);
  if (!focused) {
    return <p className="inv-detail inv-detail-hint">{CATEGORY_HINT[String(view.tabs.find((t) => t.active)?.id)] ?? ""}</p>;
  }
  return (
    <p className="inv-detail">
      <strong>{focused.name}</strong>
      <span className="inv-detail-stats">
        {focused.stats.slice(0, 4).map((stat) => `${stat.label} ${stat.value}`).join(" · ")}
      </span>
      <span className="inv-detail-flavour">{focused.description}</span>
      {focused.provisional && <span className="inv-detail-warning">{focused.provisional}</span>}
    </p>
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
              {focusedCell && <ItemCard cell={focusedCell} docked={touchLike} />}
            </div>

            <div className="inv-footer">
              <DetailLine view={view} focusedId={focused} />
              <span className="inv-gold">{view.gold} gold</span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
