import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useRapier } from "@react-three/rapier";
import type { RigidBody } from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import type { WebGPURenderer } from "three/webgpu";
import type { PlayerMovementController } from "@elder-souls/game-core/physics/PlayerMovementController";
import type { SettlementDoor } from "@elder-souls/game-core/settlement/types";
import { buildArchitectureKit } from "@elder-souls/game-core/settlement/kit";
import { createKitLoader } from "@elder-souls/game-core/assets/kitLoader";
import { useKitDecoders } from "@elder-souls/game-core/assets/useKitDecoders";
import { CAMERA_BLOCKING_GROUPS } from "@elder-souls/game-core/camera/cameraCollision";
import { bodySetAlive, captureBodySet } from "@elder-souls/game-core/physics/rapierWorldAlive";
import { daylightShare, InteriorLoader, solidsAt, type LoadedInterior } from "@elder-souls/game-core/interior/interiorLoader";
import { drawnLightRigOf } from "../sky/lightRig";
import { SharedKtx2Textures } from "@elder-souls/game-core/assets/sharedTextures";
import { kitPartsDir } from "@elder-souls/game-core/assets/kitParts";
import type { ShownCellSockets } from "@elder-souls/game-core/interior/interiorSockets";
import type { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { DoorTransition, type InteriorSource } from "@elder-souls/game-core/interior/doorTransition";
import { fixtureLightFieldOf } from "@elder-souls/game-core/render/fixtureLights/index";
import { DrawTargetLinker, type LinkingRenderer } from "@elder-souls/game-core/render/drawTargetLinker";
import { InteriorEnvironment, InteriorFogNode, interiorFogProfile } from "@elder-souls/game-core/interior/interiorEnvironment";
import { MAX_VOLUME_LIGHTS, type VolumeLight } from "@elder-souls/game-core/air/volumetrics/froxelGrid";
import { nearestVolumeLights } from "@elder-souls/game-core/air/volumetrics/studioSamplers";
import {
  BEAM_OVER_LAMP, WindowBeams, cellCompassOffsetDeg, cellFloorLevels, brightestLampFloor, pluginWindowApertures, windowSkyLight, worldToCellDirection,
} from "@elder-souls/game-core/air/volumetrics/windowApertures";
import { moonsAt, sunAt } from "@elder-souls/world-time";
import { SkyContext } from "../sky/WorldSky";
import { worldClock } from "../sky/timeState";
import { waterTimeS } from "../water/waterClock";
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

/** Scratch: the sun's colour handed to the shown cell's daylight each frame. */
const daylightColour = new THREE.Color();

type Shown = { interior: LoadedInterior; originM: Vec3 };

/** What the headless interior probe reads each frame (dev hook, CharacterMode's debug object). */
export interface InteriorDoorsProbe {
  cellId: string | null;
  originM: Vec3 | null;
  meshes: number;
  /** Fire emitters the shown cell burns (interiorLoader `counts.fires`). */
  fires: number;
  /** The shown cell's drawn bounds, world metres: [min, max]. */
  boundsM: [Vec3, Vec3] | null;
  candidate: string | null;
  focused: boolean;
  prompt: string | null;
  fade: number;
  error: string | null;
  /** The shown cell's load time, request to built (InteriorLoader). */
  loadS: number | null;
  /** The shown cell's shader link, seconds, while the screen was black (null until linked). */
  linkS: number | null;
  /** Shader programs the shown cell's link added (`renderer.info.programs`, at prefetch or entry). */
  programs: number | null;
  /** Bytes the shown cell's load fetched over the network (resource timing; cached files count 0). */
  bytes: number | null;
  /** Requests the shown cell's load made (resource timing, cached included). */
  requests: number | null;
  /** The last entry's black hold, door press to reveal (`DoorTransition.enterS`): the loader timer. */
  enterS: number | null;
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
  overlay, probeRef, sounds, onShown,
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
  /** The cell on screen and its sockets (the socket overlay), null outside. */
  onShown?: (cell: ShownCellSockets | null) => void;
}) {
  const decoders = useKitDecoders(baseUrl);
  const { world, rapier } = useRapier();
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  // The froxel medium inside the cell (0112 §6): the sky's Volumetrics,
  // driven here while the sky is hidden, through the cell's fog node.
  const { volumetrics } = useContext(SkyContext);
  const interiorFog = useMemo(() => (volumetrics ? new InteriorFogNode(volumetrics) : null), [volumetrics]);
  const volLights = useRef<VolumeLight[]>([]);
  const dark = useMemo(() => new THREE.Color(0, 0, 0), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const [shown, setShown] = useState<Shown | null>(null);
  // The cell is drawn only once its programs are linked (`linked === shown`).
  const [linked, setLinked] = useState<Shown | null>(null);
  const linkS = useRef<number | null>(null);
  const loadNet = useRef<{ bytes: number; requests: number } | null>(null);
  // The fade lifts only when the colliders are in AND the linked cell is drawn.
  const collidersIn = useRef(false);
  const drawn = useRef(false);
  const opened = useRef(false);

  const loader = useMemo(() => {
    // Parts share a kit's textures by URI: each is transcoded and uploaded once (sharedTextures.ts).
    const textures = new SharedKtx2Textures(decoders.ktx2) as unknown as KTX2Loader;
    return new InteriorLoader(baseUrl, {
      fetchJson: (url) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${url}: HTTP ${r.status}`)))),
      // One part GLB per (kit, asset) the cell draws (assets/kitParts.ts), kept in the scene's cache.
      loadPart: (kit, assetId, url) => kitCache.load(`${kit.id}#${assetId}`, url,
        (u) => createKitLoader(decoders).setKTX2Loader(textures).loadAsync(u)).then(buildArchitectureKit),
    });
  }, [baseUrl, decoders, kitCache]);

  const linker = useMemo(() => new InteriorLinker(gl as unknown as WebGPURenderer, scene), [gl, scene]);
  useEffect(() => () => linker.dispose(), [linker]);

  // A cell the doors prefetch is linked as soon as it is built, against the
  // inside's lighting (`InteriorLinker.warm`), so entering finds it compiled.
  const interiors = useMemo<InteriorSource>(() => ({
    request: (cellId) => loader.request(cellId).then((interior) => { linker.warm(interior, camera, interiorFog); return interior; }),
    ready: (cellId) => loader.ready(cellId),
    failure: (cellId) => loader.failure(cellId),
  }), [loader, linker, camera, interiorFog]);

  const transition = useMemo(() => new DoorTransition({
    controller, interiors, bodyCentreHeightM, groundAt,
    showInterior: (interior, originM) => {
      collidersIn.current = false; drawn.current = false; setShown({ interior, originM });
    },
    showExterior: () => setShown(null),
    interiorResident: () => collidersIn.current && drawn.current,
  }), [controller, interiors, bodyCentreHeightM, groundAt]);

  useEffect(() => { transition.setDoors(doors); }, [transition, doors]);
  useEffect(() => { onInside(shown !== null); }, [shown, onInside]);
  useEffect(() => {
    onShown?.(shown ? { cellId: shown.interior.bundle.cellId, originM: shown.originM, sockets: shown.interior.bundle.sockets } : null);
  }, [shown, onShown]);

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
    collidersIn.current = true;
    return () => {
      collidersIn.current = false;
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
    const env = new InteriorEnvironment(scene, gl, shown.interior, interiorFog);
    environment.current = env;
    return () => { environment.current = null; env.restore(); };
  }, [shown, scene, gl, interiorFog]);

  // The cell's programs are linked while the screen is black (F3): the
  // environment above has already hidden the exterior's lights and set the
  // cell's fog, so the detached group compiles against exactly the light
  // state it is drawn under. Drawing it unlinked made its first visible frame
  // compile every program synchronously (5-11 s on the owner's M2).
  useEffect(() => {
    if (!shown) { setLinked(null); linkS.current = null; return undefined; }
    let live = true;
    const startedMs = performance.now();
    shown.interior.group.position.set(...shown.originM);
    // the window lights take their slots in the scene's fixture light field (0108)
    shown.interior.daylight.bind(fixtureLightFieldOf(scene));
    linker.link(shown.interior.group, camera, scene).then((added) => {
      if (!live) return;
      linkS.current = (performance.now() - startedMs) / 1000;
      linker.noteLinked(shown.interior, added);
      loadNet.current = loadNetOf(shown.interior, baseUrl);
      setLinked(shown);
    });
    return () => { live = false; shown.interior.daylight.unbind(); };
  }, [shown, linker, camera, scene, baseUrl]);
  // after the commit that mounted the linked group: the fade may lift
  useEffect(() => { drawn.current = shown !== null && linked === shown; }, [shown, linked]);

  // Window light (0112 §6): the cell's plugin-placed windows (interiorLight.json); a beam is BEAM_OVER_LAMP x the brightest lamp pool at the floor.
  const windows = useMemo(() => {
    if (!shown) return null;
    const { group, bundle } = shown.interior;
    const floorY = bundle.arrivalMarker.positionM[1];
    const lamps: { intensity: number; heightM: number }[] = [];
    group.traverse((o) => {
      const l = o as THREE.PointLight;
      if (l.isPointLight && o.parent === group) lamps.push({ intensity: l.intensity, heightM: l.position.y - floorY });
    });
    const apertures = pluginWindowApertures(bundle.cellId);
    return apertures.length ? { beams: new WindowBeams(apertures, WINDOW_BEAM_LENGTH_M, cellFloorLevels(group)), unit: BEAM_OVER_LAMP * brightestLampFloor(lamps) } : null;
  }, [shown]);
  const sky = useMemo(() => ({ dir: new THREE.Vector3(0, -1, 0), tint: new THREE.Color(), strength: 0, inFrames: 0 }), []);

  // Per-frame scratch (walk 5 perf): no vector or closure made per frame.
  const bodyPos = useMemo(() => new THREE.Vector3(), []);
  const frustum = useMemo(() => new THREE.Frustum(), []);
  const viewProj = useMemo(() => new THREE.Matrix4(), []);
  const answers = useMemo(() => (doorId: string) => interaction.answers(doorId), [interaction]);
  const reportedHold = useRef<number | null>(null);
  useFrame((state, delta) => {
    // the shown cell's fires (interiorLoader `fire`): an interior burns at any hour
    shown?.interior.fire?.update(state.clock.elapsedTime, () => 1);
    if (directCellId && !opened.current && controller.ready) {
      opened.current = true;
      // The body's own pose: `position()` is the controller's per-frame copy,
      // still (0, 0, 0) on the first frame, which put the cell over the world
      // origin, 3 km from the door it belongs to (walk 2 D2 probe).
      const p = new THREE.Vector3();
      controller.readPose(p, new THREE.Quaternion());
      transition.openDirect(directCellId, { x: p.x, y: p.y, z: p.z });
    }
    transition.update(Math.min(delta, 0.1), answers);
    if (transition.candidate) interaction.offer(transition.candidate);
    if (swing && transition.fade === 0) {
      const p = controller.position(bodyPos);
      for (const c of swing.controller.candidates(p.x, p.z)) interaction.offer(c);
      swing.controller.update(Math.min(delta, 0.1), answers);
    }
    const focus = interaction.focused;
    const swingDoor = swing && focus ? swing.controller.doors.find((d) => d.id === focus.id) : undefined;
    environment.current?.frame();
    if (shown) {
      // the cell's daylight follows the sky the exterior draws, weather
      // included (interiorLoader InteriorDaylight; WorldSky publishes the rig)
      const rig = drawnLightRigOf(scene);
      if (rig) {
        daylightColour.setRGB(rig.sunColor[0], rig.sunColor[1], rig.sunColor[2]);
        shown.interior.daylight.set(daylightShare(rig.sun.altitude, rig.directFactor), daylightColour);
      }
    }
    if (shown && environment.current && volumetrics && volumetrics.band !== "off") {
      const field = fixtureLightFieldOf(scene);
      nearestVolumeLights((v) => field.forEachLight(v), camera.position.x, camera.position.y, camera.position.z,
        MAX_VOLUME_LIGHTS, volLights.current);
      let apertures: ReturnType<WindowBeams["update"]> | undefined;
      if (windows) {
        // the ephemeris allocates: the sky light is re-read twice a second
        if (--sky.inFrames <= 0) {
          sky.inFrames = SKY_LIGHT_REFRESH_FRAMES;
          const epoch = worldClock.epochMinutes();
          sky.strength = windowSkyLight(sunAt(epoch), moonsAt(epoch), sky.dir, sky.tint);
          // the sky as the cell sees it: its compass turned to the door it was entered by (0112 §6)
          worldToCellDirection(sky.dir, cellCompassOffsetDeg(transition.entranceFacingDeg ?? 0,
            shown.interior.bundle.arrivalMarker.yawDeg), sky.dir);
        }
        camera.updateMatrixWorld();
        frustum.setFromProjectionMatrix(viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
        apertures = windows.beams.update(shown.interior.group.position, sky.dir, sky.strength * windows.unit, sky.tint,
          controller.position(bodyPos), frustum, Math.min(delta, 0.1));
      }
      volumetrics.update({
        camera: camera as THREE.PerspectiveCamera, timeS: waterTimeS(), sunDir: up, sunIrradiance: dark, skyIrradiance: dark,
        lights: volLights.current, apertures, interior: interiorFogProfile(shown.interior, shown.interior.group.position.y),
      });
    }
    overlay.setFade(directCellId && !opened.current ? 1 : transition.fade);
    const prompt = transition.prompt;
    overlay.setPrompt(prompt && interaction.isFocused(prompt.doorId) ? prompt
      : swingDoor && focus ? { kind: "swing", textId: focus.promptTextId, doorId: swingDoor.id } : null);
    overlay.setError(transition.lastError?.message ?? null);
    overlay.setLoading(transition.loadingTextId, transition.loadingName);
    // the loader timer (F3): one line per entry, door press to reveal
    if (transition.enterS !== null && transition.enterS !== reportedHold.current) {
      reportedHold.current = transition.enterS;
      console.info(`interior ${transition.cellId ?? "?"}: black hold ${fmtS(transition.enterS)} `
        + `(load ${fmtS(shown?.interior.loadS ?? null)}, link ${fmtS(linkS.current)}, `
        + `programs ${shown ? linker.programsOf(shown.interior) ?? "-" : "-"}, `
        + `${loadNet.current ? `${loadNet.current.requests} requests ${(loadNet.current.bytes / 1e6).toFixed(2)} MB` : "-"})`);
    }
  });

  useEffect(() => {
    if (!probeRef) return undefined;
    probeRef.current = () => probeState(shown, transition,
      transition.prompt ? interaction.isFocused(transition.prompt.doorId) : false, overlay, linkS.current,
      shown ? linker.programsOf(shown.interior) ?? null : null, loadNet.current);
    return () => { probeRef.current = null; };
  }, [probeRef, shown, transition, interaction, overlay]);

  if (shown) return linked === shown ? <primitive object={shown.interior.group} position={shown.originM} /> : null;
  return exteriorSwing.length ? <>{exteriorSwing.map((d) => <primitive key={d.id} object={d.object} />)}</> : null;
}

const WINDOW_BEAM_LENGTH_M = 10;
const SKY_LIGHT_REFRESH_FRAMES = 30;
const probeBox = new THREE.Box3();
const fmtS = (s: number | null) => (s === null ? "-" : `${s.toFixed(2)} s`);

/**
 * Links a cell's shader programs before the cell is drawn (F3) through the
 * shared DrawTargetLinker (game-core render/drawTargetLinker.ts): the sky's
 * lit preparer patches every material first (CSM, fixture lights), the link
 * binds a 1x1 target of the kind the layer-0 pass draws into, so the key it links is the
 * one drawn (perf10 c12 B5: one pre-link path for every caller).
 */
class InteriorLinker {
  private readonly linker: DrawTargetLinker;
  private readonly warmed = new WeakSet<LoadedInterior>();
  private readonly programs = new WeakMap<LoadedInterior, number>();

  constructor(private readonly gl: WebGPURenderer, scene: THREE.Scene) {
    this.linker = new DrawTargetLinker(gl as unknown as LinkingRenderer, scene).attach();
  }

  /** Patch and link `group` (detached, lights under it) against `target`'s lights and fog. */
  link(group: THREE.Object3D, camera: THREE.Camera, target: THREE.Scene): Promise<number> {
    const programsBefore = (this.gl.info as unknown as { programs?: unknown[] }).programs?.length ?? 0;
    group.updateMatrixWorld(true);
    let linking: Promise<unknown>;
    try {
      linking = this.linker.compileAsync(group, camera, target);
    } catch (err) {
      linking = Promise.reject(err);
    }
    // never hold the black screen on a link that does not resolve
    const cap = new Promise<void>((resolve) => { setTimeout(resolve, INTERIOR_LINK_WAIT_MS); });
    return Promise.race([linking.then(() => undefined, (err: unknown) => {
      console.error("interior: shader link failed", err);
    }), cap]).then(() => ((this.gl.info as unknown as { programs?: unknown[] }).programs?.length ?? 0) - programsBefore);
  }

  /** Keep the larger of the prefetch link's and the entry link's program count for `interior`. */
  noteLinked(interior: LoadedInterior, added: number): void {
    this.programs.set(interior, Math.max(added, this.programs.get(interior) ?? 0));
  }

  /** Programs the cell's links added (the prefetch link does the work when the cell was warmed). */
  programsOf(interior: LoadedInterior): number | undefined { return this.programs.get(interior); }

  /**
   * Link a prefetched cell before it is entered: inside, every light but the
   * cell's own is hidden and the fog is the cell's (InteriorEnvironment), so
   * a bare scene holding only that fog gives the same program keys.
   */
  warm(interior: LoadedInterior, camera: THREE.Camera, fog: InteriorFogNode | null): void {
    if (this.warmed.has(interior) || interior.group.parent) return;
    this.warmed.add(interior);
    const inside = new THREE.Scene();
    inside.fog = interior.fog;
    if (fog) (inside as unknown as { fogNode: unknown }).fogNode = fog.node;
    void this.link(interior.group, camera, inside).then((added) => this.noteLinked(interior, added));
  }

  dispose(): void {
    this.linker.detach();
  }
}

/** The longest the black hold waits on a link (the settlement layer's cap). */
const INTERIOR_LINK_WAIT_MS = 4000;

function probeState(
  shown: Shown | null, transition: DoorTransition, focused: boolean, overlay: DoorOverlayChannel,
  linkS: number | null, programs: number | null, net: { bytes: number; requests: number } | null,
): InteriorDoorsProbe {
  let boundsM: InteriorDoorsProbe["boundsM"] = null;
  if (shown) {
    shown.interior.group.updateMatrixWorld(true);
    // the fire's instanced quads carry no bounds of their own: the cell's meshes only
    probeBox.makeEmpty();
    for (const child of shown.interior.group.children) {
      if (child !== shown.interior.fire?.group) probeBox.expandByObject(child);
    }
    if (!probeBox.isEmpty()) boundsM = [probeBox.min.toArray() as Vec3, probeBox.max.toArray() as Vec3];
  }
  return {
    cellId: transition.cellId, originM: shown?.originM ?? null, meshes: shown?.interior.counts.meshes ?? 0,
    fires: shown?.interior.counts.fires ?? 0,
    boundsM, candidate: transition.candidate?.id ?? null, focused,
    prompt: transition.prompt?.doorId ?? null, fade: transition.fade, error: overlay.error,
    loadS: shown?.interior.loadS ?? null,
    linkS, enterS: transition.enterS, programs, bytes: net?.bytes ?? null, requests: net?.requests ?? null,
  };
}

/**
 * What the cell's load fetched (walk 6, so a load-time claim is measured):
 * the browser's resource timing entries for the cell's bundle and the parts
 * folders of the kits it names, since page load (a part another cell shared
 * counts here too). `transferSize` is 0 for a cached file. The browser keeps
 * 250 entries unless the page raises `setResourceTimingBufferSize`, so a
 * second cell in one session reads low: open cells by `?interior=` to measure.
 */
function loadNetOf(interior: LoadedInterior, baseUrl: string): { bytes: number; requests: number } | null {
  if (typeof performance === "undefined" || !performance.getEntriesByType) return null;
  const prefixes = [`${baseUrl}province/interiors/${interior.bundle.cellId}.json`,
    ...Object.values(interior.bundle.kits).map((k) => `${baseUrl}${kitPartsDir(k)}`), `${baseUrl}kits/tex/`];
  let bytes = 0;
  let requests = 0;
  for (const e of performance.getEntriesByType("resource") as PerformanceResourceTiming[]) {
    const path = new URL(e.name, window.location.href).pathname;
    if (!prefixes.some((p) => path.startsWith(new URL(p, window.location.href).pathname))) continue;
    bytes += e.transferSize; requests += 1;
  }
  return { bytes, requests };
}
