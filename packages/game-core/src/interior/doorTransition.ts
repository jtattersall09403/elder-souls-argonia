import * as THREE from "three";
import type { PlayerMovementController } from "../physics/PlayerMovementController";
import type { SettlementDoor } from "../settlement/types";
import type { InteractionCandidate } from "../interaction/arbiter";
import { isOpenDoor, type InteriorBundle, type InteriorMarker, type Vec3 } from "./bundle";
import {
  DOOR_REACH_M, DOOR_REACH_VERTICAL_M, DOOR_TEXT, EXIT_OUTWARD_M, INTERIOR_SPACE_LIFT_M,
  cellsToPrefetch, compassDirection, doorAccess, nearestDoor,
} from "./doors";
import type { LoadedInterior } from "./interiorLoader";

/** Fade out, swap, fade in: each half lasts this long (0103 decision 4 brief). */
export const DOOR_FADE_S = 0.4;
const PREFETCH_EVERY_S = 0.5;
/** Lift over the recorded doorstep height, so the return never lands in the step. */
const RETURN_LIFT_M = 0.2;

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
   * Whether the shown cell's colliders are in the physics world. The fade
   * holds at black, keeping the player on the arrival marker, until they
   * are, so nobody falls through a floor that is not built yet. Absent reads
   * as resident.
   */
  interiorResident?(): boolean;
}

export interface DoorPrompt {
  kind: "enter" | "leave" | "closed";
  /** The text-catalogue id the prompt shows. */
  textId: string;
  doorId: string;
}

type ReturnPoint = { x: number; z: number; y: number; facingDeg: number };

type Inside = {
  cellId: string;
  originM: Vec3;
  interior: LoadedInterior;
  /** The exterior door entered by (null for `openDirect`). */
  enteredBy: SettlementDoor | null;
  /** Where the player stands on arrival, in the cell frame. */
  arrival: InteriorMarker;
  /** Where leaving puts the player when no pairing names another door, and the height floor for it. */
  returnTo: ReturnPoint;
};

type Pending =
  | { kind: "enter"; cellId: string; originM: Vec3; returnTo: ReturnPoint; door: SettlementDoor | null }
  | { kind: "leave"; loadDoorRef: string };

/** An `activate` press: a plain edge, or asked per door (the interaction arbiter's `answers`). */
export type DoorActivate = boolean | ((doorId: string) => boolean);

/**
 * The load doors inside a cell the player can leave by: every `doors[]`
 * pairing's `loadDoor` (one per load door ref), else the bundle's `exitDoor`
 * when the cell pairs no door. The pairing whose ref is the `exitDoor`'s keeps
 * that door's id.
 */
export function interiorExitDoors(
  bundle: InteriorBundle,
): { id: string; refId: string; positionM: Vec3; closed: boolean }[] {
  if (!bundle.doors.length) return [{ ...bundle.exitDoor, closed: false }];
  const out = new Map<string, { id: string; refId: string; positionM: Vec3; closed: boolean }>();
  for (const d of bundle.doors) {
    if (out.has(d.interiorLoadDoorRef)) continue;
    const id = d.interiorLoadDoorRef === bundle.exitDoor.refId
      ? bundle.exitDoor.id : `${bundle.cellId}.exit.${d.interiorLoadDoorRef}`;
    out.set(d.interiorLoadDoorRef, {
      id, refId: d.interiorLoadDoorRef, positionM: d.loadDoor.positionM, closed: !isOpenDoor(d),
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
 * Where entering by `door` arrives (owner ruling B): the bundle's pairing
 * for that exterior door, else the door record's own `arrivalMarker`, else
 * the bundle's arrival marker.
 */
export function arrivalFor(bundle: InteriorBundle, door: SettlementDoor | null): InteriorMarker {
  if (door) {
    const paired = bundle.doors.filter(isOpenDoor).find((d) => d.exteriorDoorId === door.id);
    if (paired) return paired.arrivalMarker;
    const claimed = door.interiorClaim?.arrivalMarker;
    if (isMarker(claimed)) return claimed;
  }
  return bundle.arrivalMarker;
}

/**
 * The exterior door leaving through the load door `loadDoorRef` returns to:
 * the bundle's pairing, else a door record whose claim names this cell and
 * that load door; null when neither pairs it (the caller returns to the
 * door entered by).
 */
export function exteriorDoorFor(
  bundle: InteriorBundle, loadDoorRef: string, doors: readonly SettlementDoor[],
): SettlementDoor | null {
  const paired = bundle.doors.filter(isOpenDoor).find((d) => d.interiorLoadDoorRef === loadDoorRef);
  if (paired) {
    const door = doors.find((d) => d.id === paired.exteriorDoorId);
    if (door) return door;
  }
  return doors.find((d) => d.interiorClaim?.cellId === bundle.cellId
    && d.interiorClaim?.interiorLoadDoorRef === loadDoorRef) ?? null;
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
  private doors: readonly SettlementDoor[] = [];
  private inside: Inside | null = null;
  private pending: Pending | null = null;
  private phase: "idle" | "out" | "hold" | "settle" | "in" = "idle";
  private prefetchIn = 0;
  private readonly at = new THREE.Vector3();

  constructor(private readonly hosts: DoorTransitionHosts) {}

  setDoors(doors: readonly SettlementDoor[]): void { this.doors = doors; }

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
      for (const door of interiorExitDoors(this.inside.interior.bundle)) {
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
    // The load door left by decides the exterior door (owner ruling B); the
    // height floor stays the one recorded on entry (a door record has no y).
    const paired = exteriorDoorFor(inside.interior.bundle, loadDoorRef, this.doors);
    const r: ReturnPoint = paired && paired.id !== inside.enteredBy?.id
      ? { x: paired.thresholdM[0], z: paired.thresholdM[1], y: inside.returnTo.y, facingDeg: paired.facingDeg ?? 0 }
      : inside.returnTo;
    const out = compassDirection(r.facingDeg);
    const x = r.x + out.x * EXIT_OUTWARD_M;
    const z = r.z + out.z * EXIT_OUTWARD_M;
    const ground = this.hosts.groundAt(x, z);
    const y = Math.max(r.y, ground === null ? -Infinity : ground + this.hosts.bodyCentreHeightM) + RETURN_LIFT_M;
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
