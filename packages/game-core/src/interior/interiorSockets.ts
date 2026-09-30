/**
 * Which sockets the studio's socket overlay draws, and where (16k walk 6):
 * outside, the place sockets that stand outside (`interiorCell` null);
 * inside a cell, that cell bundle's own sockets plus the place sockets
 * authored in it, moved from the cell's frame to where the cell is shown
 * (`originM`, doorTransition.ts: a translation, the cell is never turned).
 * An interior socket is never clamped to the terrain: the ground under a
 * shown cell is the exterior's, metres away. Pure: the overlay owns no state.
 */
import type { Vec3 } from "./bundle";
import { SETTLEMENT_SOCKET_KINDS, type SettlementSocket, type SocketInteractPoint } from "../settlement/types";

export interface DrawnSocket {
  id: string;
  kind: SettlementSocket["kind"];
  /** World metres. */
  positionM: Vec3;
  /** Lift to the terrain when the terrain is above it (exterior sockets only). */
  clampToGround: boolean;
  /** Where the player uses it (decision 0113), world metres, or null. */
  interact: { kind: SocketInteractPoint["kind"]; positionM: Vec3; facing: number } | null;
}

export interface ShownCellSockets {
  cellId: string;
  originM: Vec3;
  /** The cell bundle's `sockets` (bundle.ts; loosely typed there). */
  sockets: readonly unknown[];
}

const KINDS = new Set<string>(SETTLEMENT_SOCKET_KINDS);
const isVec3 = (v: unknown): v is Vec3 =>
  Array.isArray(v) && v.length === 3 && v.every((c) => typeof c === "number" && Number.isFinite(c));
const add = (a: Vec3, o: Vec3): Vec3 => [a[0] + o[0], a[1] + o[1], a[2] + o[2]];

function drawn(raw: unknown, origin: Vec3 | null): DrawnSocket | null {
  const s = raw as { id?: unknown; kind?: unknown; positionM?: unknown; interact?: unknown } | null;
  if (!s || typeof s.id !== "string" || !KINDS.has(String(s.kind)) || !isVec3(s.positionM)) return null;
  const at = (p: Vec3): Vec3 => (origin ? add(p, origin) : [p[0], p[1], p[2]]);
  const i = s.interact as Partial<SocketInteractPoint> | undefined;
  return {
    id: s.id, kind: s.kind as DrawnSocket["kind"], positionM: at(s.positionM), clampToGround: origin === null,
    interact: i && isVec3(i.position) && typeof i.facing === "number" && (i.kind === "customer" || i.kind === "station")
      ? { kind: i.kind, positionM: at(i.position), facing: i.facing } : null,
  };
}

/** The sockets to draw for `placeSockets` (the places in range) with `shown` the cell on screen, or null outside. */
export function socketsToDraw(placeSockets: readonly SettlementSocket[], shown: ShownCellSockets | null): DrawnSocket[] {
  const out: DrawnSocket[] = [];
  if (!shown) {
    for (const s of placeSockets) {
      if (s.interiorCell) continue;
      const d = drawn(s, null);
      if (d) out.push(d);
    }
    return out;
  }
  const seen = new Set<string>();
  for (const s of [...placeSockets.filter((p) => p.interiorCell === shown.cellId), ...shown.sockets]) {
    const d = drawn(s, shown.originM);
    if (!d || seen.has(d.id)) continue;
    seen.add(d.id);
    out.push(d);
  }
  return out;
}
