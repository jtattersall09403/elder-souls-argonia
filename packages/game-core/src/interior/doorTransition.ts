import * as THREE from "three";
import type { PlayerMovementController } from "../physics/PlayerMovementController";
import type { SettlementDoor } from "../settlement/types";
import type { InteractionCandidate } from "../interaction/arbiter";
import { isLoadDoor, type InteriorBundle, type InteriorMarker, type Vec3 } from "./bundle";
import {
  DOOR_REACH_M, DOOR_REACH_VERTICAL_M, DOOR_TEXT, EXIT_OUTWARD_M, INTERIOR_SPACE_LIFT_M,
  cellsToPrefetch, compassDirection, doorAccess, doorDisplayName, nearestDoor,
} from "./doors";
import { loadDoorsOf } from "./swingDoors";
import type { LoadedInterior } from "./interiorLoader";

/** Fade out, swap, fade in: each half lasts this long (0103 decision 4 brief). */
export const DOOR_FADE_S = 0.4;
const PREFETCH_EVERY_S = 0.5;
/** Lift over the recorded doorstep height, so the return never lands in the step. */
export const RETURN_LIFT_M = 0.2;

/** The cell source the transition reads; `InteriorLoader` satisfies it. */
export interface InteriorSource {
  request(cellId: string): Promise<LoadedInterior>;
  ready(cellId: string): LoadedInterior | undefined;
  failure(cellId: string): Error | undefined;
}

export interface DoorTransitionHosts {
  /** The controller boundary: the transition never touches ecctrl. */
  controller: Pick<PlayerMovementController,
    "position" | "teleport" | "faceDirection" | "releaseFacing" | "setLinearVelocity">;
  interiors: InteriorSource;
  /** Height of the character's body centre over its feet. */
  bodyCentreHeightM: number;
  /** Terrain height at a world point, or null where none is loaded. */
  groundAt(x: number, z: number): number | null;
  /** Swap the world scene for the cell, standing at `originM` (the host hides the exterior). */
  showInterior(interior: LoadedInterior, originM: Vec3): void;
  /** Swap back: the exterior shows again and the cell comes down. */
  showExterior(): void;
  /**
   * Whether the shown cell is ready to be seen: its colliders in the physics
   * world and its shader programs linked (the studio host). The fade holds at
   * black, keeping the player on the arrival marker, until it is, so nobody
   * falls through a floor that is not built yet and the first visible frame
   * compiles nothing. Absent reads as resident.
   */
  interiorResident?(): boolean;
}

export interface DoorPrompt {
  /** `swing`: a door that opens in place (swingDoors.ts), its prompt Open or Close. */
  kind: "enter" | "leave" | "closed" | "swing";
  /** The text-catalogue id the prompt shows. */
  textId: string;
  doorId: string;
}

type ReturnPoint = { x: number; z: number; y: number; facingDeg: number };

type Inside = {
  cellId: string;
  originM: Vec3;
  interior: LoadedInterior;
  /** The exterior door entered by, its id and place (null for `openDirect`): leaving returns to it. */
  enteredBy: SettlementDoor | null;
  /** Where the player stands on arrival, in the cell frame. */
  arrival: InteriorMarker;
  /** Where leaving puts the player when no pairing names another door, and the height floor for it. */
  returnTo: ReturnPoint;
  /** The cell's load doors the place entered from claims (`openLoadDoorRefs`); the rest show the closed line. */
  openRefs: ReadonlySet<string>;
};

type Pending =
  | { kind: "enter"; cellId: string; originM: Vec3; returnTo: ReturnPoint; door: SettlementDoor | null }
  | { kind: "leave"; loadDoorRef: string };

/** An `activate` press: a plain edge, or asked per door (the interaction arbiter's `answers`). */
export type DoorActivate = boolean | ((doorId: string) => boolean);

/** The load door `door` claims in `cellId`, from the place's door record (`interiorClaim`). */
const claimedRef = (door: SettlementDoor, cellId: string): string | null => {
  const c = door.interiorClaim;
  return c?.cellId === cellId && typeof c.interiorLoadDoorRef === "string" ? c.interiorLoadDoorRef : null;
};

/**
 * The cell's load doors the place entered from pairs with: every
 * `interiorClaim.interiorLoadDoorRef` of that place's doors on `cellId`
 * (decision 0104: the pairing's home is the place's door record, and one
 * cell file is shared by several places). Empty for a cell opened directly.
 */
export function openLoadDoorRefs(
  cellId: string, doors: readonly SettlementDoor[], enteredBy: SettlementDoor | null,
): Set<string> {
  const out = new Set<string>();
  if (!enteredBy) return out;
  for (const d of [enteredBy, ...doors]) {
    if (d.settlementId !== enteredBy.settlementId) continue;
    const ref = claimedRef(d, cellId);
    if (ref) out.add(ref);
  }
  return out;
}

/**
 * The load doors inside a cell the player can leave by: every load door of
 * the bundle, open when `openRefs` names it (the place entered from pairs
 * with it; with none named, the `exitDoor` alone is open) and closed
 * otherwise (planner ruling 3, interiors round 3); the bundle's `exitDoor`
 * when the cell lists no load door. The load door that is the `exitDoor`
 * keeps that door's id.
 */
export function interiorExitDoors(
  bundle: InteriorBundle, openRefs: ReadonlySet<string> = new Set(),
): { id: string; refId: string; positionM: Vec3; closed: boolean }[] {
  const loads = bundle.doors.filter(isLoadDoor);
  if (!loads.length) return [{ ...bundle.exitDoor, closed: false }];
  const open = openRefs.size ? openRefs : new Set([bundle.exitDoor.refId]);
  const out = new Map<string, { id: string; refId: string; positionM: Vec3; closed: boolean }>();
  for (const d of loads) {
    if (out.has(d.interiorLoadDoorRef)) continue;
    const id = d.interiorLoadDoorRef === bundle.exitDoor.refId
      ? bundle.exitDoor.id : `${bundle.cellId}.exit.${d.interiorLoadDoorRef}`;
    out.set(d.interiorLoadDoorRef, {
      id, refId: d.interiorLoadDoorRef, positionM: d.loadDoor.positionM, closed: !open.has(d.interiorLoadDoorRef),
    });
  }
  return [...out.values()];
}

const isMarker = (v: unknown): v is InteriorMarker => {
  const m = v as InteriorMarker | null | undefined;
  return Array.isArray(m?.positionM) && m!.positionM.length === 3
    && m!.positionM.every((n) => Number.isFinite(n)) && Number.isFinite(m!.yawDeg);
};

/**
 * Where entering by `door` arrives (owner ruling B): the door record's own
 * `interiorClaim.arrivalMarker` (the place holds the pairing, 0104), else the
 * bundle's arrival marker (the plugin's own).
 */
export function arrivalFor(bundle: InteriorBundle, door: SettlementDoor | null): InteriorMarker {
  const claimed = door?.interiorClaim?.arrivalMarker;
  return isMarker(claimed) ? claimed : bundle.arrivalMarker;
}

/**
 * The exterior door leaving through the load door `loadDoorRef` returns to
 * (owner ruling B, walk 4 defect b): the door entered by, unless another
 * door of the SAME place claims that load door (`interiorClaim`). A cell is
 * shared by places (Claywater Station and Greenspring both claim
 * KeebaHouseFisher), so another place's claim is never followed. Null only
 * for a cell opened directly (`openDirect`, no door entered by).
 */
export function exteriorDoorFor(
  bundle: InteriorBundle, loadDoorRef: string, doors: readonly SettlementDoor[],
  enteredBy: SettlementDoor | null,
): SettlementDoor | null {
  if (!enteredBy) return null;
  if (claimedRef(enteredBy, bundle.cellId) === loadDoorRef) return enteredBy;
  return doors.find((d) => d.settlementId === enteredBy.settlementId
    && claimedRef(d, bundle.cellId) === loadDoorRef) ?? enteredBy;
}

/**
 * The TES door (0081 decision 4, 0103 decision 4). Each frame the host calls
 * `update(dt, activate)`; the transition answers with the prompt to show,
 * the `candidate` to offer the interaction arbiter, and the fade to draw
 * (0 clear, 1 black). A tier A door fades out, swaps to its cell with the
 * player at that door's arrival marker, fades in; a load door inside
 * reverses it to the threshold of the exterior door it pairs with, plus
 * 1 m outward. A reserved door shows the closed line and does nothing.
 */
export class DoorTransition {
  prompt: DoorPrompt | null = null;
  /** The door within reach this frame, as the interaction arbiter takes it (null while fading). */
  candidate: InteractionCandidate | null = null;
  fade = 0;
  /** A cell that failed to load while the player waited at black. */
  lastError: Error | null = null;
  /**
   * The last entry's black hold, seconds: the door press (or `openDirect`)
   * to the frame the fade starts to lift on the cell (bundle, parts,
   * colliders and the host's shader link all in). Null before any entry.
   * The loader timer a regression check reads instead of a browser probe (F3).
   */
  enterS: number | null = null;
  private beganMs = 0;
  private doors: readonly SettlementDoor[] = [];
  private inside: Inside | null = null;
  private pending: Pending | null = null;
  private phase: "idle" | "out" | "hold" | "settle" | "in" = "idle";
  private prefetchIn = 0;
  private readonly at = new THREE.Vector3();

  constructor(private readonly hosts: DoorTransitionHosts) {}

  /** The place's doors; swing doors are `SwingDoorController`'s and are left out here. */
  setDoors(doors: readonly SettlementDoor[]): void { this.doors = loadDoorsOf(doors); }

  /**
   * The line the fade shows while the screen is black waiting for a cell
   * (its bundle, kits or colliders): the text-catalogue id, else null. The
   * game reuses the same overlay (walk 4 c).
   */
  get loadingTextId(): string | null {
    if (!this.waiting) return null;
    return this.loadingName ? DOOR_TEXT.loadingNamed : DOOR_TEXT.loading;
  }

  /**
   * The name the named loading line fills in (`DOOR_TEXT.loadingNamed`): the
   * entered door's display name from the compiled place record, else null.
   */
  get loadingName(): string | null {
    if (!this.waiting) return null;
    const door = this.pending?.kind === "enter" ? this.pending.door : this.inside?.enteredBy ?? null;
    return doorDisplayName(door);
  }

  private get waiting(): boolean {
    return (this.phase === "hold" && this.pending?.kind === "enter") || this.phase === "settle";
  }

  get cellId(): string | null { return this.inside?.cellId ?? null; }

  /** Open a cell directly (studio `?interior=<cellId>`); leaving returns to `anchor`. */
  openDirect(cellId: string, anchor: { x: number; y: number; z: number }): void {
    this.hosts.interiors.request(cellId).catch(() => undefined);
    this.begin({
      kind: "enter", cellId, originM: [anchor.x, INTERIOR_SPACE_LIFT_M, anchor.z],
      returnTo: { x: anchor.x, z: anchor.z, y: anchor.y, facingDeg: 0 }, door: null,
    });
    this.fade = 1;
    this.phase = "hold";
  }

  update(dt: number, activate: DoorActivate): void {
    if (this.phase !== "idle") { this.candidate = null; this.advance(dt); return; }
    const pressed = (doorId: string) => (typeof activate === "function" ? activate(doorId) : activate);
    const p = this.hosts.controller.position(this.at);
    if (this.inside) {
      const o = this.inside.originM;
      const feetY = p.y - this.hosts.bodyCentreHeightM;
      let exit: ReturnType<typeof interiorExitDoors>[number] | null = null;
      let exitD = DOOR_REACH_M;
      for (const door of interiorExitDoors(this.inside.interior.bundle, this.inside.openRefs)) {
        const d = Math.hypot(o[0] + door.positionM[0] - p.x, o[2] + door.positionM[2] - p.z);
        if (d <= exitD && Math.abs(o[1] + door.positionM[1] - feetY) <= DOOR_REACH_VERTICAL_M) {
          exit = door; exitD = d;
        }
      }
      // a closed load door (ruling 3, interiors round 3) shows the closed line and does nothing
      const textId = exit?.closed ? DOOR_TEXT.closed : DOOR_TEXT.leave;
      this.prompt = exit ? { kind: exit.closed ? "closed" : "leave", textId, doorId: exit.id } : null;
      this.candidate = exit ? {
        id: exit.id, kind: "door", positionM: [o[0] + exit.positionM[0], o[2] + exit.positionM[2]],
        reachM: DOOR_REACH_M, promptTextId: textId,
      } : null;
      if (exit && !exit.closed && pressed(exit.id)) this.begin({ kind: "leave", loadDoorRef: exit.refId });
      return;
    }
    this.prefetchIn -= dt;
    if (this.prefetchIn <= 0) {
      this.prefetchIn = PREFETCH_EVERY_S;
      for (const cellId of cellsToPrefetch(this.doors, p.x, p.z)) {
        this.hosts.interiors.request(cellId).catch(() => undefined);
      }
    }
    const door = nearestDoor(this.doors, p.x, p.z);
    if (!door) { this.prompt = null; this.candidate = null; return; }
    const access = doorAccess(door);
    const textId = access.kind === "closed" ? DOOR_TEXT.closed : DOOR_TEXT.enter;
    this.prompt = { kind: access.kind, textId, doorId: door.id };
    this.candidate = { id: door.id, kind: "door", positionM: door.thresholdM, reachM: DOOR_REACH_M, promptTextId: textId };
    if (access.kind === "closed" || !pressed(door.id)) return;
    this.hosts.interiors.request(access.cellId).catch(() => undefined);
    this.begin({
      kind: "enter", cellId: access.cellId,
      originM: [door.thresholdM[0], INTERIOR_SPACE_LIFT_M, door.thresholdM[1]],
      returnTo: { x: door.thresholdM[0], z: door.thresholdM[1], y: p.y, facingDeg: door.facingDeg ?? 0 },
      door,
    });
  }

  private begin(pending: Pending): void {
    this.pending = pending;
    this.beganMs = performance.now();
    this.phase = "out";
    this.prompt = null;
    this.lastError = null;
  }

  private advance(dt: number): void {
    if (this.phase === "out") {
      this.fade = Math.min(1, this.fade + dt / DOOR_FADE_S);
      if (this.fade >= 1) this.phase = "hold";
      return;
    }
    if (this.phase === "hold") {
      const pending = this.pending;
      if (!pending) { this.phase = "in"; return; }
      if (pending.kind === "enter") {
        const failed = this.hosts.interiors.failure(pending.cellId);
        if (failed) { this.lastError = failed; this.pending = null; this.phase = "in"; return; }
        const interior = this.hosts.interiors.ready(pending.cellId);
        if (!interior) return;           // wait at black for the bundle
        this.enter(pending, interior);
        this.pending = null;
        this.phase = "settle";
        return;
      }
      this.leave(pending.loadDoorRef);
      this.pending = null;
      this.phase = "in";
      return;
    }
    if (this.phase === "settle") {
      if (this.hosts.interiorResident?.() === false) { this.placeAtArrival(); return; }
      this.enterS = (performance.now() - this.beganMs) / 1000;
      this.phase = "in";
      return;
    }
    this.fade = Math.max(0, this.fade - dt / DOOR_FADE_S);
    if (this.fade <= 0) this.phase = "idle";
  }

  private enter(pending: Extract<Pending, { kind: "enter" }>, interior: LoadedInterior): void {
    this.hosts.showInterior(interior, pending.originM);
    this.inside = {
      cellId: pending.cellId, originM: pending.originM, interior, enteredBy: pending.door,
      arrival: arrivalFor(interior.bundle, pending.door), returnTo: pending.returnTo,
      openRefs: openLoadDoorRefs(pending.cellId, this.doors, pending.door),
    };
    this.placeAtArrival();
  }

  private placeAtArrival(): void {
    if (!this.inside) return;
    const a = this.inside.arrival;
    const o = this.inside.originM;
    this.place({ x: o[0] + a.positionM[0], y: o[1] + a.positionM[1] + this.hosts.bodyCentreHeightM,
      z: o[2] + a.positionM[2] }, a.yawDeg);
  }

  private leave(loadDoorRef: string): void {
    const inside = this.inside;
    if (!inside) return;
    this.hosts.showExterior();
    // The load door left by decides the exterior door, within the place
    // entered from (`exteriorDoorFor`). Height: at the door entered by, the
    // body height recorded on entry (a deck or stilt threshold stands over
    // the terrain), never below the ground there; at another door of the
    // place, that door's ground (the recorded height belongs to a different
    // threshold), the recorded height only where no ground is loaded.
    const target = exteriorDoorFor(inside.interior.bundle, loadDoorRef, this.doors, inside.enteredBy);
    const sameDoor = !target || target.id === inside.enteredBy?.id;
    const r: ReturnPoint = sameDoor
      ? inside.returnTo
      : { x: target.thresholdM[0], z: target.thresholdM[1], y: inside.returnTo.y, facingDeg: target.facingDeg ?? 0 };
    const out = compassDirection(r.facingDeg);
    const x = r.x + out.x * EXIT_OUTWARD_M;
    const z = r.z + out.z * EXIT_OUTWARD_M;
    const ground = this.hosts.groundAt(x, z);
    const standing = ground === null ? null : ground + this.hosts.bodyCentreHeightM;
    const y = (standing === null ? r.y : sameDoor ? Math.max(r.y, standing) : standing) + RETURN_LIFT_M;
    this.place({ x, y, z }, r.facingDeg);
    this.inside = null;
  }

  private place(position: { x: number; y: number; z: number }, yawDeg: number): void {
    const { controller } = this.hosts;
    controller.teleport(position);
    controller.setLinearVelocity({ x: 0, y: 0, z: 0 });
    const d = compassDirection(yawDeg);
    controller.faceDirection(new THREE.Vector3(d.x, 0, d.z), false);
    controller.releaseFacing();
  }
}
