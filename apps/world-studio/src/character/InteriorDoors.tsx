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
import { SharedKtx2Textures } from "@elder-souls/game-core/interior/sharedTextures";
import type { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { DoorTransition } from "@elder-souls/game-core/interior/doorTransition";
import { InteriorEnvironment } from "@elder-souls/game-core/interior/interiorEnvironment";
import type { Vec3 } from "@elder-souls/game-core/interior/bundle";
import {
  SwingDoorController, buildSwingDoor, isSwingDoor, leafWorldPose, swingFrameShapes, swingLeafShapes,
  type SwingDoor, type SwingDoorHosts,
} from "@elder-souls/game-core/interior/swingDoors";
import type { SoundEvent } from "@elder-souls/audio";
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
  /** The shown cell's load time, request to built (InteriorLoader). */
  loadS: number | null;
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
  overlay, probeRef, sounds,
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
  /** The scene's typed sound bus: swing doors say `door.open`/`door.close` on it. */
  sounds?: { emit(e: SoundEvent): void };
}) {
  const decoders = useKitDecoders(baseUrl);
  const { world, rapier } = useRapier();
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const [shown, setShown] = useState<Shown | null>(null);
  const resident = useRef(false);
  const opened = useRef(false);

  const loader = useMemo(() => {
    // Parts share a kit's textures by URI: each is transcoded and uploaded once (sharedTextures.ts).
    const textures = new SharedKtx2Textures(decoders.ktx2) as unknown as KTX2Loader;
    return new InteriorLoader(baseUrl, {
      fetchJson: (url) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${url}: HTTP ${r.status}`)))),
      // One part GLB per (kit, asset) the cell draws (interior/kitParts.ts), kept in the scene's cache.
      loadPart: (kit, assetId, url) => kitCache.load(`${kit.id}#${assetId}`, url,
        (u) => createKitLoader(decoders).setKTX2Loader(textures).loadAsync(u)).then(buildArchitectureKit),
    });
  }, [baseUrl, decoders, kitCache]);

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

  // Swing doors (16k walk 4, owner 2026-09-28): the shown cell's, else the
  // place's exterior ones. One body per leaf, its collider off while the leaf
  // moves and back at the leaf's pose at rest; the player's body blocks a sweep.
  const [exteriorSwing, setExteriorSwing] = useState<SwingDoor[]>([]);
  useEffect(() => {
    const swingDoors = doors.filter(isSwingDoor);
    if (!swingDoors.length) { setExteriorSwing([]); return undefined; }
    let live = true;
    const kitIds = [...new Set(swingDoors.map((d) => d.swing.kit))];
    Promise.all(kitIds.map((id) => kitCache.load(id, `${baseUrl}kits/${id}.glb`,
      (u) => createKitLoader(decoders).loadAsync(u)).then(buildArchitectureKit).then((kit) => [id, kit] as const)))
      .then((kits) => {
        if (!live) return;
        const byKit = new Map(kits);
        setExteriorSwing(swingDoors.map((d) => buildSwingDoor(d.id, d.swing,
          byKit.get(d.swing.kit)?.get(d.swing.assetId)?.levels[0] ?? null)));
      })
      .catch((err: unknown) => console.error("swing doors: kit load failed", err));
    return () => { live = false; };
  }, [doors, baseUrl, kitCache, decoders]);

  const swing = useMemo(() => {
    const list = shown ? shown.interior.swingDoors : exteriorSwing;
    if (!list.length) return null;
    const bodyAt = new THREE.Vector3();
    const colliders = new Map<string, { body: RigidBody; enabled: boolean }>();
    const hosts: SwingDoorHosts = {
      sounds,
      bodies: () => { controller.position(bodyAt); return [{ x: bodyAt.x, z: bodyAt.z }]; },
      setColliderEnabled: (door, enabled) => {
        const c = colliders.get(door.id);
        if (!c) return;
        if (enabled) {
          const pose = leafWorldPose(door);
          c.body.setTranslation(pose.position, true);
          c.body.setRotation(pose.quaternion, true);
        }
        for (let i = 0; i < c.body.numColliders(); i++) c.body.collider(i).setEnabled(enabled);
        c.enabled = enabled;
      },
    };
    return { controller: new SwingDoorController(list, hosts, shown ? shown.originM : [0, 0, 0]), colliders };
  }, [shown, exteriorSwing, controller, sounds]);

  useEffect(() => {
    if (!swing) return undefined;
    const bodySet = captureBodySet(world);
    const frames: RigidBody[] = [];
    const fixedAt = (at: THREE.Vector3, q: THREE.Quaternion) => world.createRigidBody(rapier.RigidBodyDesc.fixed()
      .setTranslation(at.x, at.y, at.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }));
    const addShapes = (body: RigidBody, shapes: ReturnType<typeof swingLeafShapes>) => {
      for (const part of shapes) {
        const desc = settlementColliderDesc(rapier, part, 1);
        desc.setCollisionGroups(CAMERA_BLOCKING_GROUPS);
        world.createCollider(desc, body);
      }
    };
    for (const door of swing.controller.doors) {
      const pose = leafWorldPose(door);
      const body = fixedAt(pose.position, pose.quaternion);
      addShapes(body, swingLeafShapes(door));
      swing.colliders.set(door.id, { body, enabled: true });
      const frameShapes = swingFrameShapes(door);
      if (frameShapes.length) {
        // the frame round the leaf (impwooddoorsingle01's wall) stands with the placement
        const at = new THREE.Vector3();
        const q = new THREE.Quaternion();
        door.object.matrixWorld.decompose(at, q, new THREE.Vector3());
        const frameBody = fixedAt(at, q);
        addShapes(frameBody, frameShapes);
        frames.push(frameBody);
      }
    }
    return () => {
      const bodies = [...swing.colliders.values()].map((c) => c.body).concat(frames);
      swing.colliders.clear();
      if (!bodySetAlive(bodySet)) return;
      for (const body of bodies) world.removeRigidBody(body);
    };
  }, [swing, world, rapier]);

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
    if (swing && transition.fade === 0) {
      const p = controller.position(new THREE.Vector3());
      for (const c of swing.controller.candidates(p.x, p.z)) interaction.offer(c);
      swing.controller.update(Math.min(delta, 0.1), (doorId) => interaction.answers(doorId));
    }
    const focus = interaction.focused;
    const swingDoor = swing && focus ? swing.controller.doors.find((d) => d.id === focus.id) : undefined;
    environment.current?.frame();
    overlay.setFade(directCellId && !opened.current ? 1 : transition.fade);
    const prompt = transition.prompt;
    overlay.setPrompt(prompt && interaction.isFocused(prompt.doorId) ? prompt
      : swingDoor && focus ? { kind: "swing", textId: focus.promptTextId, doorId: swingDoor.id } : null);
    overlay.setError(transition.lastError?.message ?? null);
    overlay.setLoading(transition.loadingTextId, transition.loadingName);
  });

  useEffect(() => {
    if (!probeRef) return undefined;
    probeRef.current = () => probeState(shown, transition,
      transition.prompt ? interaction.isFocused(transition.prompt.doorId) : false, overlay);
    return () => { probeRef.current = null; };
  }, [probeRef, shown, transition, interaction, overlay]);

  if (shown) return <primitive object={shown.interior.group} position={shown.originM} />;
  return exteriorSwing.length ? <>{exteriorSwing.map((d) => <primitive key={d.id} object={d.object} />)}</> : null;
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
    loadS: shown?.interior.loadS ?? null,
  };
}
