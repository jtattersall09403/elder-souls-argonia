/**
 * perf-diag22 G-a on the PUBLISHED Greenspring bundle: a 400 m walk across
 * the place runs no full (bucket, signature, batch) pass after load; a move
 * runs a reach pass only when the set of placements in reach changes.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { REBUILD_MOVE_M, placementsInReachKey, settlementPassKind, type FullPassInputs } from "./settlementReach";
import type { SettlementBundle } from "./types";

const PUBLIC = resolve(import.meta.dirname, "../../../../apps/world-studio/public");
const place = JSON.parse(readFileSync(resolve(PUBLIC,
  "province/settlements/place.hist-heartland.greenspring.json"), "utf8")) as SettlementBundle & { settlement: SettlementBundle["settlements"][number] };
/** A place file carries its one settlement; the layer reads the assembled list. */
const bundle = { ...place, settlements: [place.settlement] };
/** The perf spot (perf-diag20 D2). */
const FOCUS = { x: 4778.9, z: 1900 };

describe("settlement reach (G-a), Greenspring", () => {
  it("a 400 m walk after load performs 0 full passes", () => {
    const inputs: FullPassInputs = { bundle, kits: new Map(), manifests: new Map(), revision: 0, drawScale: 1, groundAt: null };
    let full = 0; let reach = 0;
    // the load: one full pass
    let live = placementsInReachKey(bundle, FOCUS, 1);
    expect(settlementPassKind(null, inputs, null, live)).toBe("full");
    const lastFull = inputs;
    const at = { x: FOCUS.x - 200, z: FOCUS.z };
    // the walk, 1 m a frame, judged as the layer's frame loop judges it
    for (let step = 0; step <= 400; step++) {
      const focus = { x: FOCUS.x - 200 + step, z: FOCUS.z };
      if (Math.hypot(focus.x - at.x, focus.z - at.z) <= REBUILD_MOVE_M) continue;
      const key = placementsInReachKey(bundle, focus, 1);
      const kind = settlementPassKind(lastFull, { ...inputs }, live, key);
      if (kind === "full") full += 1;
      if (kind === "reach") { reach += 1; live = key; }
      at.x = focus.x; at.z = focus.z;
    }
    expect(full).toBe(0);
    expect(reach).toBeLessThanOrEqual(10);
    // a new loaded piece (the kits map changes) is the one thing that runs a full pass
    expect(settlementPassKind(lastFull, { ...inputs, kits: new Map() }, live, live)).toBe("full");
    expect(settlementPassKind(lastFull, { ...inputs }, live, live)).toBe("none");
  });
});
