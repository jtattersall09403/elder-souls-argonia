import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useRapier } from "@react-three/rapier";
import type { RigidBody } from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import type { PlayerMovementController } from "@elder-souls/game-core/physics/PlayerMovementController";
import type { SettlementDoor } from "@elder-souls/game-core/settlement/types";
import { buildArchitectureKit } from "@elder-souls/game-core/settlement/kit";
import { createKitLoader } from "@elder-souls/game-core/assets/kitLoader";
import { useKitDecoders } from "@elder-souls/game-core/assets/useKitDecoders";
import { CAMERA_BLOCKING_GROUPS } from "@elder-souls/game-core/camera/cameraCollision";
import { bodySetAlive, captureBodySet } from "@elder-souls/game-core/physics/rapierWorldAlive";
import { InteriorLoader, solidsAt, type LoadedInterior } from "@elder-souls/game-core/interior/interiorLoader";
import { DoorTransition } from "@elder-souls/game-core/interior/doorTransition";
import { InteriorEnvironment } from "@elder-souls/game-core/interior/interiorEnvironment";
import type { Vec3 } from "@elder-souls/game-core/interior/bundle";
import type { InteractionArbiter } from "@elder-souls/game-core/interaction/arbiter";
import type { KitCache } from "@elder-souls/game-core/settlement/kitCache";
import { settlementColliderDesc } from "./SettlementColliders";
import type { DoorOverlayChannel } from "./doorOverlay";

type Shown = { interior: LoadedInterior; originM: Vec3 };

/** What the headless interior probe reads each frame (dev hook, CharacterMode's debug object). */
export interface InteriorDoorsProbe {
  cellId: string | null;
  originM: Vec3 | null;
  meshes: number;
  /** The shown cell's drawn bounds, world metres: [min, max]. */
  boundsM: [Vec3, Vec3] | null;
  candidate: string | null;
  focused: boolean;
  prompt: string | null;
  fade: number;
  error: string | null;
}

/**
 * Studio wiring for the interior runtime (0103 decision 4): the door
 * prompt (offered to the interaction arbiter, shown only when it is the
 * focus), the fade, the cell's draw and colliders, and `?interior=<cellId>`
 * opening a cell directly. Everything that decides lives in
 * `game-core/interior`; this only mounts it. Inside <Physics>; the prompt,
 * fade and error line are drawn outside the canvas by `DoorOverlay`, fed
 * through `overlay` (walk 2 D2).
 */
export function InteriorDoors({
  baseUrl, controller, doors, groundAt, bodyCentreHeightM, directCellId, onInside, interaction, kitCache,
  overlay, probeRef,
}: {
  baseUrl: string;
  controller: PlayerMovementController;
  doors: readonly SettlementDoor[];
  groundAt: (x: number, z: number) => number | null;
  bodyCentreHeightM: number;
  /** `?interior=<cellId>`: open this cell at its arrival marker on load. */
  directCellId: string | null;
  /** The host hides the exterior's drawn layers while this is true. */
  onInside: (inside: boolean) => void;
  /** The scene's one arbiter: the door answers `activate` only when it is the focus. */
  interaction: InteractionArbiter;
  /** The kit cache the settlement layer shares: a kit resident outside is not loaded again. */
  kitCache: KitCache;
  /** The DOM overlay the prompt, fade and error line are drawn on. */
  overlay: DoorOverlayChannel;
  /** Dev hook for the headless probe: a getter, so nothing is measured unless a probe asks. */
  probeRef?: { current: (() => InteriorDoorsProbe) | null };
}) {
  const decoders = useKitDecoders(baseUrl);
  const { world, rapier } = useRapier();
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const [shown, setShown] = useState<Shown | null>(null);
  const resident = useRef(false);
  const opened = useRef(false);

  const loader = useMemo(() => new InteriorLoader(baseUrl, {
    fetchJson: (url) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${url}: HTTP ${r.status}`)))),
    loadKit: (kit, url) => kitCache.load(kit.id, url, (u) => createKitLoader(decoders).loadAsync(u))
      .then(buildArchitectureKit),
  }), [baseUrl, decoders, kitCache]);

  const transition = useMemo(() => new DoorTransition({
    controller, interiors: loader, bodyCentreHeightM, groundAt,
    showInterior: (interior, originM) => { resident.current = false; setShown({ interior, originM }); },
    showExterior: () => setShown(null),
    interiorResident: () => resident.current,
  }), [controller, loader, bodyCentreHeightM, groundAt]);

  useEffect(() => { transition.setDoors(doors); }, [transition, doors]);
  useEffect(() => { onInside(shown !== null); }, [shown, onInside]);

  // The cell's colliders, built in one go while the screen is black (the
  // transition waits on `resident`), so the arrival floor is solid on the
  // first visible frame. They block the follow camera like any building,
  // which is the 16h item 24 pull-in and player fade inside.
  useEffect(() => {
    if (!shown) return undefined;
    const bodySet = captureBodySet(world);
    const bodies: RigidBody[] = [];
    for (const solid of solidsAt(shown.interior.solids, shown.originM)) {
      const [rx, ry, rz, rw] = solid.rotation;
      const body = world.createRigidBody(rapier.RigidBodyDesc.fixed()
        .setTranslation(...solid.position).setRotation({ x: rx, y: ry, z: rz, w: rw }));
      for (const part of solid.parts) {
        const desc = settlementColliderDesc(rapier, part, solid.scale);
        desc.setCollisionGroups(CAMERA_BLOCKING_GROUPS);
        world.createCollider(desc, body);
      }
      bodies.push(body);
    }
    resident.current = true;
    return () => {
      resident.current = false;
      if (!bodySetAlive(bodySet)) return;
      for (const body of bodies) world.removeRigidBody(body);
    };
  }, [shown, world, rapier]);

  // No sun, sky, IBL or scene fog but the cell's while inside.
  const environment = useRef<InteriorEnvironment | null>(null);
  useEffect(() => {
    if (!shown) return undefined;
    const env = new InteriorEnvironment(scene, gl, shown.interior);
    environment.current = env;
    return () => { environment.current = null; env.restore(); };
  }, [shown, scene, gl]);

  useFrame((_, delta) => {
    if (directCellId && !opened.current && controller.ready) {
      opened.current = true;
      // The body's own pose: `position()` is the controller's per-frame copy,
      // still (0, 0, 0) on the first frame, which put the cell over the world
      // origin, 3 km from the door it belongs to (walk 2 D2 probe).
      const p = new THREE.Vector3();
      controller.readPose(p, new THREE.Quaternion());
      transition.openDirect(directCellId, { x: p.x, y: p.y, z: p.z });
    }
    transition.update(Math.min(delta, 0.1), (doorId) => interaction.answers(doorId));
    if (transition.candidate) interaction.offer(transition.candidate);
    environment.current?.frame();
    overlay.setFade(directCellId && !opened.current ? 1 : transition.fade);
    const prompt = transition.prompt;
    overlay.setPrompt(prompt && interaction.isFocused(prompt.doorId) ? prompt : null);
    overlay.setError(transition.lastError?.message ?? null);
  });

  useEffect(() => {
    if (!probeRef) return undefined;
    probeRef.current = () => probeState(shown, transition,
      transition.prompt ? interaction.isFocused(transition.prompt.doorId) : false, overlay);
    return () => { probeRef.current = null; };
  }, [probeRef, shown, transition, interaction, overlay]);

  return shown ? <primitive object={shown.interior.group} position={shown.originM} /> : null;
}

const probeBox = new THREE.Box3();

function probeState(
  shown: Shown | null, transition: DoorTransition, focused: boolean, overlay: DoorOverlayChannel,
): InteriorDoorsProbe {
  let boundsM: InteriorDoorsProbe["boundsM"] = null;
  if (shown) {
    shown.interior.group.updateMatrixWorld(true);
    probeBox.setFromObject(shown.interior.group);
    if (!probeBox.isEmpty()) boundsM = [probeBox.min.toArray() as Vec3, probeBox.max.toArray() as Vec3];
  }
  return {
    cellId: transition.cellId, originM: shown?.originM ?? null, meshes: shown?.interior.counts.meshes ?? 0,
    boundsM, candidate: transition.candidate?.id ?? null, focused,
    prompt: transition.prompt?.doorId ?? null, fade: transition.fade, error: overlay.error,
  };
}
