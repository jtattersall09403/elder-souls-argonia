/**
 * The agent-walk harness's in-page methods (tooling/gpu-lane/walk/README.md),
 * merged into the existing `window.__STUDIO_CHARACTER_DEBUG__` object; no
 * global of their own. Pure: the caller hands in the refs it owns.
 *
 * Key input stays real (CDP key events into input.ts); these only place the
 * body and read state.
 */
import type { InteractionArbiter } from "@elder-souls/game-core/interaction/arbiter";
import type { InteriorDoorsProbe } from "./InteriorDoors";

export interface WalkHarnessState {
  schemaVersion: 1;
  /** Body centre, world metres. */
  pos: [number, number, number] | null;
  /** Compass bearing the camera looks along (0 north = -z, pi/2 east = +x), camera to body, radians. */
  yaw: number | null;
  /** FollowCamera yaw as `aimCamera` takes it. */
  cameraYaw: number;
  insideInterior: boolean;
  cellId: string | null;
  /** Door fade in progress (0 < fade). */
  transitioning: boolean;
  /** What one activate press would go to now. */
  focus: { id: string; kind: string; promptTextId: string } | null;
}

export interface WalkHarnessDeps {
  teleportBody: (p: { x: number; y: number; z: number }) => void;
  groundAt: (xM: number, zM: number) => number | null;
  bodyCentreHeight: number;
  focusRef: { current: { x: number; z: number } };
  camera: { yaw: number };
  cameraPos: () => [number, number, number];
  player: () => [number, number, number] | null;
  interior: () => InteriorDoorsProbe | null;
  interaction: InteractionArbiter;
  /** Read each frame by the player fade: true draws the body at opacity 0. */
  playerHidden: { current: boolean };
}

/** What the arbiter weighed at its last resolve, and the door transition's state (walk_run's focus record). */
export interface WalkHarnessDoors {
  /** Every candidate offered before the last resolve: id, kind, planar xz, reach. */
  offered: { id: string; kind: string; xz: [number, number]; reachM: number }[];
  /** The interior-door transition's own candidate and fade (0 idle). */
  candidate: string | null;
  fade: number;
}

/** `?walkharness=1` (walk_run.mjs passes it): the agent-walk harness is driving this page. */
export const walkHarnessActive = (): boolean =>
  new URLSearchParams(window.location.search).get("walkharness") === "1";

export interface OfferTap {
  /** The candidates offered before the arbiter's last resolve. */
  offered(): WalkHarnessDoors["offered"];
  /** Put the arbiter's own `offer` and `resolve` back. */
  restore(): void;
}

const taps = new WeakMap<InteractionArbiter, OfferTap>();

/**
 * Snapshot the offers each resolve weighs, on this one arbiter instance (never
 * the class). Installed once per arbiter: a second call returns the live tap.
 * The caller installs it only when the walk harness drives the page, so the
 * normal path keeps the arbiter's own methods and allocates nothing per offer.
 */
export function tapArbiterOffers(arb: InteractionArbiter): OfferTap {
  const existing = taps.get(arb);
  if (existing) return existing;
  let pending: WalkHarnessDoors["offered"] = [];
  let lastOffered: WalkHarnessDoors["offered"] = [];
  const own = { offer: arb.offer, resolve: arb.resolve };
  const offer = own.offer.bind(arb), resolve = own.resolve.bind(arb);
  arb.offer = (c) => { pending.push({ id: c.id, kind: c.kind, xz: [c.positionM[0], c.positionM[1]], reachM: c.reachM }); offer(c); };
  arb.resolve = (p, a) => { lastOffered = pending; pending = []; resolve(p, a); };
  const tap: OfferTap = {
    offered: () => lastOffered,
    restore: () => {
      if (taps.get(arb) !== tap) return;
      taps.delete(arb);
      // the instance had no own methods before the tap: drop the wrappers so the prototype's show through
      delete (arb as Partial<Pick<InteractionArbiter, "offer" | "resolve">>).offer;
      delete (arb as Partial<Pick<InteractionArbiter, "offer" | "resolve">>).resolve;
      if (arb.offer !== own.offer) arb.offer = own.offer;
      if (arb.resolve !== own.resolve) arb.resolve = own.resolve;
    },
  };
  taps.set(arb, tap);
  return tap;
}

export function walkHarnessHooks(d: WalkHarnessDeps & { offers?: OfferTap | null }) {
  return {
    /** The candidates the arbiter weighed at its last resolve (empty unless the harness tap is on) and the door transition's state. */
    doors: (): WalkHarnessDoors => {
      const probe = d.interior();
      return { offered: d.offers?.offered() ?? [], candidate: probe?.candidate ?? null, fade: probe?.fade ?? 0 };
    },
    /** Put the body on the ground at (xM, zM); optionally set the camera yaw. */
    teleport: (xM: number, zM: number, yawRad?: number): boolean => {
      const g = d.groundAt(xM, zM);
      d.teleportBody({ x: xM, y: (g ?? 100) + d.bodyCentreHeight + 1, z: zM });
      d.focusRef.current.x = xM;
      d.focusRef.current.z = zM;
      if (yawRad !== undefined) d.camera.yaw = yawRad;
      return g !== null;
    },
    /** Hide (true) or show the drawn player body; physics and the camera are untouched. */
    hidePlayer: (on: boolean): void => { d.playerHidden.current = on; },
    state: (): WalkHarnessState => {
      const p = d.player();
      const c = d.cameraPos();
      const probe = d.interior();
      const f = d.interaction.focused;
      return {
        schemaVersion: 1,
        pos: p,
        yaw: p ? Math.atan2(p[0] - c[0], c[2] - p[2]) : null,
        cameraYaw: d.camera.yaw,
        insideInterior: Boolean(probe?.cellId),
        cellId: probe?.cellId ?? null,
        transitioning: (probe?.fade ?? 0) > 0.001,
        focus: f ? { id: f.id, kind: f.kind, promptTextId: f.promptTextId } : null,
      };
    },
  };
}
