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
}

/** What the arbiter weighed at its last resolve, and the door transition's state (walk_run's focus record). */
export interface WalkHarnessDoors {
  /** Every candidate offered before the last resolve: id, kind, planar xz, reach. */
  offered: { id: string; kind: string; xz: [number, number]; reachM: number }[];
  /** The interior-door transition's own candidate and fade (0 idle). */
  candidate: string | null;
  fade: number;
}

export function walkHarnessHooks(d: WalkHarnessDeps) {
  // Snapshot the offers each resolve weighs: wraps this one arbiter instance (the harness's own), never the class.
  const arb = d.interaction;
  let pending: WalkHarnessDoors["offered"] = [];
  let lastOffered: WalkHarnessDoors["offered"] = [];
  const offer = arb.offer.bind(arb), resolve = arb.resolve.bind(arb);
  arb.offer = (c) => { pending.push({ id: c.id, kind: c.kind, xz: [c.positionM[0], c.positionM[1]], reachM: c.reachM }); offer(c); };
  arb.resolve = (p, a) => { lastOffered = pending; pending = []; resolve(p, a); };
  return {
    /** The candidates the arbiter weighed at its last resolve and the door transition's state. */
    doors: (): WalkHarnessDoors => {
      const probe = d.interior();
      return { offered: lastOffered, candidate: probe?.candidate ?? null, fade: probe?.fade ?? 0 };
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
