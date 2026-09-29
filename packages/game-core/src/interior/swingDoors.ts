import * as THREE from "three";
import type { SoundEvent } from "@elder-souls/audio";
import type { ArchitectureAsset } from "../settlement/kit";
import type { SettlementDoor } from "../settlement/types";
import type { InteractionCandidate } from "../interaction/arbiter";
import type { Vec3 } from "./bundle";
import { DOOR_REACH_M } from "./doors";

/**
 * Swing doors (16k walk 4, owner 2026-09-28: built now, not in a later
 * phase). A `swing` door opens in place about its hinge; it loads nothing
 * (0104 decision 4; doors-interiors-sockets.md §1). One record kind serves
 * both sides: an interior bundle's `doors[]` entry (the exporter writes one
 * per DOOR reference with no XTEL teleport) and a place's compiled door with
 * `doorType: "swing"` and a `swing` pose. The runtime here toggles it on the
 * action input, turns the leaf about the hinge with an ease, keeps its
 * collider off while it moves and back on at rest, refuses to move while a
 * body stands in the arc it would sweep, and says `door.open`/`door.close`
 * on the typed sound bus. No module state: the host owns the controller.
 */

/** The hinge, in the door asset's own frame (glTF y up, metres from its pivot). */
export interface SwingHinge {
  pivotM: Vec3;
  /** Unit axis the leaf turns about; a positive angle turns right-handed about it. */
  axis: Vec3;
  /** Signed: where the NIF's `Open` sequence ends (farmhouseanimdoor01 -92). */
  openAngleDeg: number;
  /** How long opening takes (the NIF's sequence length, else the default). */
  openS: number;
  source?: string;
  /**
   * The leaf's box `[min, max]` in the asset frame, present when the door NIF
   * also draws shapes that do not turn (a frame, a wall: impwooddoorsingle01,
   * farmbtrapdoor02): only parts whose box centre lies in it turn. Absent:
   * the whole asset is the leaf.
   */
  leafBoundsM?: [Vec3, Vec3];
}

/** Where a swing door stands and how it turns: interior cell frame or world metres. */
export interface SwingDoorPose {
  assetId: string;
  /** The published kit holding `assetId`. */
  kit: string;
  positionM: Vec3;
  /** `[pitch, yaw, roll]` degrees for Euler(pitch, -yaw, roll, "YXZ"), as placements. */
  rotationDeg: Vec3;
  scale: number;
  hinge: SwingHinge;
  initiallyOpen: boolean;
}

/** A swing entry of an interior bundle's `doors[]`. */
export interface InteriorSwingDoor extends SwingDoorPose {
  doorType: "swing";
  id: string;
  /** The plugin reference (REFR form id). */
  refId: string;
}

/** A place's compiled swing door: the door record plus its pose (world metres). */
export type ExteriorSwingDoor = SettlementDoor & { doorType: "swing"; swing: SwingDoorPose };

/** Fallback when a record has no usable duration. */
export const SWING_DOOR_OPEN_S = 0.6;
/** A body within this radius of the swept arc blocks the door. */
export const SWING_BODY_RADIUS_M = 0.35;

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isVec3 = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every(isNum);

/** Why a swing pose is malformed, or null (the bundle parser's refusal). */
export function swingPoseProblem(d: Partial<SwingDoorPose> | null | undefined): string | null {
  if (!d || typeof d.assetId !== "string" || !d.assetId) return "no assetId";
  if (typeof d.kit !== "string" || !d.kit) return "no kit";
  if (!isVec3(d.positionM) || !isVec3(d.rotationDeg) || !isNum(d.scale)) return "bad transform";
  const h = d.hinge;
  if (!h || !isVec3(h.pivotM) || !isVec3(h.axis) || Math.abs(Math.hypot(...h.axis) - 1) > 1e-3) return "bad hinge";
  if (!isNum(h.openAngleDeg) || !isNum(h.openS) || h.openS <= 0) return "bad hinge angle/duration";
  if (h.leafBoundsM !== undefined && !(Array.isArray(h.leafBoundsM) && h.leafBoundsM.length === 2
    && isVec3(h.leafBoundsM[0]) && isVec3(h.leafBoundsM[1]))) return "bad leafBoundsM";
  if (typeof d.initiallyOpen !== "boolean") return "no initiallyOpen";
  return null;
}

/** Whether a compiled place door is a swing door carrying a usable pose. */
export function isSwingDoor(door: SettlementDoor): door is ExteriorSwingDoor {
  const d = door as Partial<ExteriorSwingDoor>;
  return d.doorType === "swing" && swingPoseProblem(d.swing) === null;
}

/** The place doors that load a cell (or show the closed line): every door but a swing one. */
export function loadDoorsOf(doors: readonly SettlementDoor[]): SettlementDoor[] {
  return doors.filter((d) => (d as { doorType?: unknown }).doorType !== "swing");
}

/** Smooth ease in and out over t in [0, 1]. */
export const swingEase = (t: number): number => t * t * (3 - 2 * t);

/** One drawn swing door. `leaf` turns; `object` carries the placement. */
export interface SwingDoor {
  id: string;
  pose: SwingDoorPose;
  /** The placement: position, rotation and scale; add it to the scene or cell group. */
  object: THREE.Group;
  /** Turns about the hinge: positioned at the pivot, the mesh offset by -pivot under it. */
  leaf: THREE.Group;
  /** Parts that stay put (a frame around the leaf), children of `object` in the asset frame. */
  frame: THREE.Mesh[];
  /** Planar leaf reach from the hinge (m, placement scale applied) for the sweep test. */
  leafLengthM: number;
  /** Direction from the hinge to the leaf's far edge at rest, in the leaf's frame. */
  leafDirection: THREE.Vector3;
  open: boolean;
  /** Current angle (radians) about the hinge axis, 0 closed. */
  angle: number;
  moving: boolean;
  from: number;
  to: number;
  t: number;
}

/** A leaf's mesh parts in the asset frame (the kit asset's LOD0). */
export type LeafParts = ArchitectureAsset["levels"][number];

function rotationQuaternion(rotationDeg: Vec3): THREE.Quaternion {
  const d = THREE.MathUtils.degToRad;
  return new THREE.Quaternion().setFromEuler(
    new THREE.Euler(d(rotationDeg[0]), -d(rotationDeg[1]), d(rotationDeg[2]), "YXZ"));
}

/**
 * Build a door: the placement group, the hinge group at the pivot, the
 * asset's LOD0 parts under it offset by -pivot, at the rest angle
 * (`initiallyOpen` starts it open). `parts` null draws nothing (a test, or
 * an asset still loading) and the leaf length falls back to 1 m.
 */
export function buildSwingDoor(id: string, pose: SwingDoorPose, parts: LeafParts | null): SwingDoor {
  const object = new THREE.Group();
  object.name = `swing-door:${id}`;
  object.position.set(...pose.positionM);
  object.quaternion.copy(rotationQuaternion(pose.rotationDeg));
  object.scale.setScalar(pose.scale);
  const leaf = new THREE.Group();
  leaf.position.set(...pose.hinge.pivotM);
  object.add(leaf);
  const box = new THREE.Box3();
  const frame: THREE.Mesh[] = [];
  const lb = pose.hinge.leafBoundsM;
  const leafBox = lb ? new THREE.Box3(new THREE.Vector3(...lb[0]), new THREE.Vector3(...lb[1])).expandByScalar(0.02) : null;
  for (const part of parts ?? []) {
    const mesh = new THREE.Mesh(part.geometry, part.material);
    mesh.matrixAutoUpdate = false;
    part.geometry.computeBoundingBox();
    const centre = part.geometry.boundingBox?.getCenter(new THREE.Vector3()).applyMatrix4(part.localMatrix);
    if (leafBox && centre && !leafBox.containsPoint(centre)) {
      mesh.matrix.copy(part.localMatrix);
      object.add(mesh);
      frame.push(mesh);
      continue;
    }
    mesh.matrix.copy(part.localMatrix).premultiply(
      new THREE.Matrix4().makeTranslation(-pose.hinge.pivotM[0], -pose.hinge.pivotM[1], -pose.hinge.pivotM[2]));
    leaf.add(mesh);
    if (part.geometry.boundingBox) box.union(part.geometry.boundingBox.clone().applyMatrix4(mesh.matrix));
  }
  // The far edge: the box corner farthest from the hinge in the plane normal to the axis.
  const axis = new THREE.Vector3(...pose.hinge.axis);
  let far = new THREE.Vector3(1, 0, 0);
  if (!box.isEmpty()) {
    let best = -1;
    for (const x of [box.min.x, box.max.x]) for (const z of [box.min.z, box.max.z]) for (const y of [box.min.y, box.max.y]) {
      const v = new THREE.Vector3(x, y, z);
      v.sub(axis.clone().multiplyScalar(v.dot(axis)));
      if (v.length() > best) { best = v.length(); far = v; }
    }
  }
  const leafLengthM = Math.max(0.1, far.length()) * pose.scale;
  const angle = pose.initiallyOpen ? THREE.MathUtils.degToRad(pose.hinge.openAngleDeg) : 0;
  leaf.quaternion.setFromAxisAngle(axis, angle);
  return {
    id, pose, object, leaf, frame, leafLengthM, leafDirection: far.clone().normalize(),
    open: pose.initiallyOpen, angle, moving: false, from: angle, to: angle, t: 1,
  };
}

/** The injected hosts: the sound bus, the collider switch, and where bodies stand. */
export interface SwingDoorHosts {
  /** The scene's typed sound bus (packages/audio); absent says nothing. */
  sounds?: { emit(e: SoundEvent): void };
  /** Collider off while the leaf moves, on (rebuilt at `door.leaf`'s world pose) at rest. */
  setColliderEnabled?(door: SwingDoor, enabled: boolean): void;
  /** World points (planar x, z) of bodies that block a door: the player, NPCs. */
  bodies?(): readonly { x: number; z: number }[];
}

/**
 * The swing doors of one scene (a cell, or a place's exterior). Each frame
 * the host offers `candidates(x, z)` to the interaction arbiter and calls
 * `update(dt, pressed)`; `origin` is the frame the poses are in (a cell's
 * lift; zero outside).
 */
export class SwingDoorController {
  readonly doors: SwingDoor[];
  private readonly origin = new THREE.Vector3();

  constructor(doors: SwingDoor[], private readonly hosts: SwingDoorHosts = {}, originM: Vec3 = [0, 0, 0]) {
    this.doors = doors;
    this.origin.set(...originM);
  }

  /** The hinge's world position (the frame's origin plus the placed pivot). */
  hingeWorld(door: SwingDoor, out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(...door.pose.hinge.pivotM).multiplyScalar(door.pose.scale)
      .applyQuaternion(door.object.quaternion).add(door.object.position).add(this.origin);
  }

  /** The prompt candidates: one per door within reach of its placed position. */
  candidates(x: number, z: number): InteractionCandidate[] {
    const out: InteractionCandidate[] = [];
    for (const door of this.doors) {
      const px = this.origin.x + door.pose.positionM[0];
      const pz = this.origin.z + door.pose.positionM[2];
      if (Math.hypot(px - x, pz - z) > DOOR_REACH_M) continue;
      out.push({ id: door.id, kind: "door", positionM: [px, pz], reachM: DOOR_REACH_M,
        promptTextId: door.open ? SWING_TEXT.close : SWING_TEXT.open });
    }
    return out;
  }

  /**
   * Whether a body stands in the arc the leaf would sweep going from its
   * current angle to `to`: within the leaf's reach (plus the body radius)
   * of the hinge, at a bearing between the two leaf directions.
   */
  sweepBlocked(door: SwingDoor, to: number, bodies = this.hosts.bodies?.() ?? []): boolean {
    const hinge = this.hingeWorld(door);
    const axis = new THREE.Vector3(...door.pose.hinge.axis).applyQuaternion(door.object.quaternion);
    const dirAt = (a: number) => door.leafDirection.clone()
      .applyAxisAngle(new THREE.Vector3(...door.pose.hinge.axis), a).applyQuaternion(door.object.quaternion);
    const lo = Math.min(door.angle, to);
    const hi = Math.max(door.angle, to);
    const reach = door.leafLengthM + SWING_BODY_RADIUS_M;
    for (const b of bodies) {
      const v = new THREE.Vector3(b.x - hinge.x, 0, b.z - hinge.z);
      if (v.length() > reach) continue;
      // sample the arc: the body blocks when it lies within its radius of the leaf at any step
      const steps = Math.max(2, Math.ceil(Math.abs(hi - lo) / THREE.MathUtils.degToRad(5)));
      for (let i = 0; i <= steps; i++) {
        const d = dirAt(lo + ((hi - lo) * i) / steps);
        d.sub(axis.clone().multiplyScalar(d.dot(axis)));
        const flat = new THREE.Vector3(d.x, 0, d.z);
        if (flat.lengthSq() < 1e-9) continue;
        flat.normalize();
        const along = THREE.MathUtils.clamp(v.dot(flat), 0, door.leafLengthM);
        if (v.clone().sub(flat.multiplyScalar(along)).length() <= SWING_BODY_RADIUS_M) return true;
      }
    }
    return false;
  }

  /** Toggle one door: refused (false) while moving or while a body is in the sweep. */
  toggle(door: SwingDoor): boolean {
    if (door.moving) return false;
    const target = door.open ? 0 : THREE.MathUtils.degToRad(door.pose.hinge.openAngleDeg);
    if (this.sweepBlocked(door, target)) return false;
    door.open = !door.open;
    door.from = door.angle;
    door.to = target;
    door.t = 0;
    door.moving = true;
    this.hosts.setColliderEnabled?.(door, false);
    const at = this.hingeWorld(door);
    this.hosts.sounds?.emit({ type: door.open ? "door.open" : "door.close", at: { x: at.x, y: at.y, z: at.z }, source: door.id });
    return true;
  }

  update(dt: number, pressed: (doorId: string) => boolean): void {
    for (const door of this.doors) {
      if (!door.moving && pressed(door.id)) this.toggle(door);
      if (!door.moving) continue;
      const openS = door.pose.hinge.openS > 0 ? door.pose.hinge.openS : SWING_DOOR_OPEN_S;
      door.t = Math.min(1, door.t + dt / openS);
      door.angle = door.from + (door.to - door.from) * swingEase(door.t);
      door.leaf.quaternion.setFromAxisAngle(new THREE.Vector3(...door.pose.hinge.axis), door.angle);
      if (door.t >= 1) {
        door.moving = false;
        door.leaf.updateMatrixWorld(true);
        this.hosts.setColliderEnabled?.(door, true);
      }
    }
  }
}

export const SWING_TEXT = {
  open: "text.door.prompt-open",
  close: "text.door.prompt-close",
} as const;

/**
 * The leaf's colliders: each drawn part's triangles in the leaf's frame, the
 * placement scale baked in (a rigid body carries no scale). The host puts the
 * body at `leafWorldPose` and rebuilds that pose each time the door comes to
 * rest (`SwingDoorHosts.setColliderEnabled`).
 */
export function swingLeafShapes(door: SwingDoor): TrimeshShape[] {
  return bakedShapes(door.leaf.children as THREE.Mesh[], door.pose.scale);
}

/** The parts that stay put, in the placement's frame, scale baked; the host puts their body at the placement. */
export function swingFrameShapes(door: SwingDoor): TrimeshShape[] {
  return bakedShapes(door.frame, door.pose.scale);
}

type TrimeshShape = { kind: "trimesh"; vertices: Float32Array; indices: Uint32Array };

function bakedShapes(meshes: readonly THREE.Mesh[], s: number): TrimeshShape[] {
  const out: TrimeshShape[] = [];
  const v = new THREE.Vector3();
  for (const child of meshes) {
    const mesh = child as THREE.Mesh;
    const position = mesh.geometry?.getAttribute("position");
    const index = mesh.geometry?.index;
    if (!position || !index) continue;
    const vertices = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i).applyMatrix4(mesh.matrix).multiplyScalar(s);
      vertices[i * 3] = v.x; vertices[i * 3 + 1] = v.y; vertices[i * 3 + 2] = v.z;
    }
    out.push({ kind: "trimesh", vertices, indices: Uint32Array.from(index.array) });
  }
  return out;
}

/** The leaf's world position and rotation (its world matrix brought up to date first). */
export function leafWorldPose(door: SwingDoor): { position: THREE.Vector3; quaternion: THREE.Quaternion } {
  door.object.updateWorldMatrix(true, true);
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  door.leaf.matrixWorld.decompose(position, quaternion, new THREE.Vector3());
  return { position, quaternion };
}
