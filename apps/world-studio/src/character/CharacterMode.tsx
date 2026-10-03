import { Suspense, type ReactNode, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Physics, useRapier } from "@react-three/rapier";
import { ShapeType } from '@dimforge/rapier3d-compat';
import * as THREE from "three";
import { BloomPass, type SkyCensus } from "@elder-souls/game-core/render/post/BloomPass";
import type { EcctrlHandle } from "ecctrl";
import { CanvasErrorBoundary, CanvasErrorBanner } from "../CanvasErrorBoundary";
import { SettlementErrorLine } from "../SettlementErrorLine";
import { STUDIO_TOOLS, shaderCheckEnabled } from "../studioTools";
import type { Vec3 } from "@elder-souls/contracts";
import { EcctrlAdapter, PlayerBody, SkyrimFighter } from "@elder-souls/character";
import type { PlayerMovementController } from "@elder-souls/game-core/physics/PlayerMovementController";
import { FollowCamera, FOLLOW_CAMERA } from "@elder-souls/game-core/camera/followCamera";
import { playerOpacityForArm } from "@elder-souls/game-core/camera/cameraCollision";
import { rapierCameraObstruction } from "./cameraObstruction";
import { fadePlayerModel, gatePlayerFirstShow, warmPlayerFadePrograms } from "./playerFade";
import { DrawTargetLinker } from "@elder-souls/game-core/render/drawTargetLinker";
import { RenderWarmGate } from "@elder-souls/game-core/render/RenderWarmGate";
import type { WarmGateState } from "@elder-souls/game-core/render/warmGate";
import { ExplorerLocomotion } from "@elder-souls/game-core/locomotion/explorerLocomotion";
import { input } from "@elder-souls/game-core/io/input";
import { inputToIntent } from "@elder-souls/game-core/combat/intent";
import { actorRegistry } from "@elder-souls/game-core/combat/actorRegistry";
import {
  CHARACTER_BODY_CENTER_HEIGHT,
  CHARACTER_CAPSULE_RADIUS,
  CHARACTER_CAPSULE_HALF_HEIGHT,
  CHARACTER_MODEL_OFFSET,
} from "@elder-souls/game-core/physics/characterPhysics";
import { resolveCapabilityProfile } from "@elder-souls/game-core/physics/capabilityProfiles";
import { visualSupportY } from "@elder-souls/game-core/physics/visualSupport";
import { spawnBodyY } from "./spawnHeight";
import { useHudPoll } from "./hudPoll";
import { TRI_BUCKETS, bucketIndexOf, bucketSlot, emptyBuckets } from "./triangleBuckets";
import type { VegetationStats } from "../vegetation/Vegetation";
import type { GroundcoverPerf } from "../vegetation/Groundcover";
import { useEquippedLoadout, useWornArmour } from "@elder-souls/game-core/inventory/store";
import { DEFAULT_SEX, RACE_IDS, resolveBuild, type RaceId } from "@elder-souls/game-core/actors/races";
import { prefetchChunks, sharedChunkStore, type ChunksManifest } from "./chunkStore";
import { ChunkWorld } from "./chunkWorld";
import { ApronTerrain } from "../ApronTerrain";
import { ChunkColliders } from "./ChunkColliders";
import { VegetationColliders } from "./VegetationColliders";
import type { FloraCollider, SolidInstance } from "@elder-souls/game-core/physics/floraSolids";
import { TouchControls } from "./TouchControls";
import { WorldSky } from "../sky/WorldSky";
import { StudioWater } from "../water/StudioWater";
import { FloatTestCrates } from "../water/FloatTestCrates";
import { setWaterGroundHeight, sharedLocalSurfaces, sharedWaterAssets } from "../water/waterAssets";
import type { WaterWorld } from "@elder-souls/game-core/water/index";
import { WaterContactEmitter } from "@elder-souls/game-core/water/contactEmitter";
import { worldClock } from "../sky/timeState";
import { drawnLightRigOf } from "../sky/lightRig";
import { CityMarkers } from "../CityMarkers";
import { Vegetation, VEGETATION_ENABLED } from "../vegetation/Vegetation";
import { Groundcover, GROUNDCOVER_ENABLED } from "../vegetation/Groundcover";
import { SettlementLayer } from "@elder-souls/game-core/settlement/SettlementLayer";
import type { KitProgramWarmReport } from "@elder-souls/game-core/settlement/kitProgramWarm";
import { groundArrivalsOf } from "@elder-souls/game-core/settlement/groundPaint";
import {
  FrameSegments, FrameSegmentsContext, useFrameSegments, useMarkedFrame,
  type FrameGpuSummary, type FrameSegmentStats, type SegmentStat,
} from "@elder-souls/game-core/fx/frameSegments";
import { useHiddenLayers } from "../ladder";
import { useApronManifest } from "../apronMaterials";
import { BoundaryWalls } from "@elder-souls/game-core/boundary/BoundaryWalls";
import { useBoundaryMessage } from "@elder-souls/game-core/boundary/useBoundaryMessage";
import { PROVINCE_EXTENT_M, TERRAIN_SUPPORT_EXTENT_M } from "../provinceScale";
import type { SettlementLayerError, SettlementSolid } from "@elder-souls/game-core/settlement/types";
import { SettlementColliders } from "./SettlementColliders";
import { InteriorDoors, type InteriorDoorsProbe } from "./InteriorDoors";
import { SoundEventBus } from "@elder-souls/audio";
import { DoorOverlay, createDoorOverlayChannel } from "./doorOverlay";
import { ScreenOverlay, createScreenOverlayChannel } from "./screenOverlay";
import { InteractionArbiter } from "@elder-souls/game-core/interaction/arbiter";
import { walkHarnessHooks } from "./walkHarnessHooks";
import { KitCache } from "@elder-souls/game-core/settlement/kitCache";
import { SocketMarkers, socketsOverlayEnabled } from "./SocketMarkers";
import type { ShownCellSockets } from "@elder-souls/game-core/interior/interiorSockets";
import type { SettlementDoor } from "@elder-souls/game-core/settlement/types";
import { FrameWorkProvider } from "./FrameWorkProvider";
import { lastWeatherSample } from "../weather/weatherState";
import { headingOf } from "../compass";
import { Minimap } from "./Minimap";
import { TravelSockets } from "../travel/TravelSockets";
import { travelSocketsShown } from "../travel/nearestSocket";
import type { MinimapOverlay } from "./minimapOverlay";
import {
  parseQuality,
  FRAME_TRIANGLE_BUDGET,
  QUALITY_PRESETS,
  type QualitySettings,
} from "@elder-souls/game-core/core/quality";
import type { MapMeta } from "@elder-souls/game-core/hud/minimap";


// Module-level so a CharacterMode render does not create a new array and
// invalidate the rapier context (owner 2026-09-22: re-armed the spawn teleport).
const GRAVITY: [number, number, number] = [0, -9.81, 0];

/**
 * Physical-character mode (master plan §66 "Physical character", Phase 7):
 * the combat sandbox's character walking the real province — Rapier
 * heightfield collision from the chunk compiler's LOD-1 grids, the sandbox's
 * grounded ecctrl movement behind `PlayerMovementController`, its follow
 * camera, and desktop/touch/gamepad input parity. The HUD doubles as the
 * environment-query probe: position, chunk, ground material, region, water.
 */

/**
 * The HUD is fed ~7 times a second. Held in this component's own state it
 * re-rendered the WHOLE character tree — canvas children, physics props and
 * all — seven times a second, for two text readouts. So it is published on a
 * channel instead: the driver writes, and only the small components that
 * actually display it subscribe and re-render. React's own
 * `useSyncExternalStore` does the subscribing, so there is no bespoke
 * lifecycle to get wrong.
 */
export interface HudChannel {
  latest: CharacterHudState | null;
  publish: (state: CharacterHudState) => void;
  subscribe: (listener: () => void) => () => void;
}

function createHudChannel(): HudChannel {
  const listeners = new Set<() => void>();
  const channel: HudChannel = {
    latest: null,
    publish: (state) => {
      channel.latest = state;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
  return channel;
}

function useHud(channel: HudChannel): CharacterHudState | null {
  return useSyncExternalStore(channel.subscribe, () => channel.latest);
}

export interface CharacterHudState {
  xKm: number;
  zKm: number;
  altM: number;
  chunk: [number, number];
  groundMaterial?: string;
  region?: string;
  waterDepth?: number;
  /** Water-body class at the player (river / marsh / lake / coast …). */
  waterBody?: string;
  /** From the environment query's TimeLightSample (module 55 §94). */
  dayPhase?: string;
  visibilityM?: number;
  /** Camera compass heading (world north = −Z), degrees clockwise from N. */
  headingDeg: number;
  speed: number;
  grounded: boolean;
}

export function CharacterMode({ spawnKm, raceId, profileId, matSet, tintStrength, exaggeration, onExaggeration, lookupRegion, mapCanvas, mapMeta, minimapOverlay, onPositionKm, onExit, onFlyHere }: {
  spawnKm: { x: number; z: number };
  raceId?: string;
  profileId?: string;
  matSet?: string;
  tintStrength?: number;
  /** Vertical scale for terrain geometry/colliders/queries. Canonical is ×5
   * (decision 0006); the live control exists so the owner can re-judge the
   * scale at ground level. Changing it remounts physics at the same spot. */
  exaggeration?: number;
  onExaggeration?: (value: number) => void;
  /** Region/biome names at a world position, from the studio's map rasters. */
  lookupRegion?: (xM: number, zM: number) => { regionId: string; biomeId: string };
  /** The studio's province-map canvas + raster meta for the minimap. */
  mapCanvas?: HTMLCanvasElement | null;
  mapMeta?: MapMeta | null;
  /** Places + route network for the minimap (App loads it once). */
  minimapOverlay?: MinimapOverlay | null;
  onPositionKm: (xKm: number, zKm: number) => void;
  onExit: () => void;
  onFlyHere: (xKm: number, zKm: number) => void;
}) {
  const base = import.meta.env.BASE_URL;
  const store = useMemo(() => sharedChunkStore(base), [base]);
  const verticalScale = exaggeration ?? 5;
  // The resolver rides in a ref so a parent re-render (e.g. late raster loads)
  // can never recreate the world and re-run the spawn effect.
  const lookupRef = useRef(lookupRegion);
  lookupRef.current = lookupRegion;
  const world = useMemo(
    () => new ChunkWorld(store, base, (x, z) => lookupRef.current?.(x, z) ?? { regionId: "unknown", biomeId: "unknown" }),
    [store, base],
  );
  const [manifest, setManifest] = useState<ChunksManifest | null>(null);
  const [spawn, setSpawn] = useState<Vec3 | null>(null);
  const playerModelRef = useRef<THREE.Group | null>(null);
  // Dev probe handle: the settlement layer's "rebuild now" (flash probe).
  const settlementRebuildRef = useRef<(() => void) | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The settlement layer's failure, shown as a red line atop the HUD
  // (decision 0052 addendum 2026-09-28; it was a magenta shape before).
  const [settlementError, setSettlementError] = useState<SettlementLayerError | null>(null);
  const hudChannel = useMemo(() => createHudChannel(), []);
  const player = useRef<EcctrlHandle | null>(null);
  const focusRef = useRef({ x: spawnKm.x * 1000, z: spawnKm.z * 1000 });
  const hiddenLayers = useHiddenLayers(import.meta.env.BASE_URL);
  const apronManifest = useApronManifest(import.meta.env.BASE_URL, !hiddenLayers.has("apron"));
  // The square of built ground the boundary wall closes (16d): the manifest's
  // own value when it is loaded, the contract's otherwise.
  const terrainExtentM = manifest?.terrainSupportExtentM ?? TERRAIN_SUPPORT_EXTENT_M;
  const [canvasError, setCanvasError] = useState<string | null>(null);
  const [edgeMessage, setEdgeMessage] = useState<string | null>(null);
  const glRef = useRef<HTMLCanvasElement | null>(null);
  const [touch, setTouch] = useState(false);
  // On-foot render quality (module 65 first slice — owner: walking lags).
  // Defaults to MEDIUM in character view: fog usually hides what medium
  // cuts, and the fly modes keep their own full distances. `?quality=` (or `?q=`) seeds it.
  const [quality, setQuality] = useState<QualitySettings>(() =>
    parseQuality((() => {
      const params = new URLSearchParams(window.location.search);
      return params.get("quality") ?? params.get("q");
    })(), "medium"));
  // DEV fill-rate switch (`?dpr=<n>`, 0.5..2): pins the canvas pixel density
  // to one value so a frame can be measured at a known fill cost. Null keeps
  // the quality preset's cap.
  // Canvas MSAA is ON (owner ruling, walk 5: frames are never won by lowering
  // visual quality). It smooths the water surface's edges and the
  // precip/overlay passes; the scene itself reaches the canvas through the
  // water pipeline's samples:0 target as one blit. DEV A/B switch: `?aa=0`
  // creates the canvas without MSAA, so the resolve's cost can be measured.
  const canvasAa = useMemo(() => (
    new URLSearchParams(window.location.search).get("aa") !== "0"
  ), []);
  // DEV comparison switch (`?water=0`, decision 0084 round 10): the water
  // pipeline and surface are not mounted, so the frame can be measured
  // without the render-to-target/blit/water/precip/overlay passes.
  const waterPipelineEnabled = useMemo(() => (
    new URLSearchParams(window.location.search).get("water") !== "0"
  ), []);
  // DEV water debug view (`?wdbg=<n>`, tooling/gpu-lane/README.md): one
  // uniform on the water materials; 0 or absent = the normal output.
  const waterDebugMode = useMemo(() => {
    const n = Number(new URLSearchParams(window.location.search).get("wdbg") ?? 0);
    return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
  }, []);
  // Glow around bright lights (decision 0108 post row), default ON; DEV A/B
  // switch `?post=0` mounts no post pass, so its cost reads on the HUD.
  const postEnabled = useMemo(() => (
    new URLSearchParams(window.location.search).get("post") !== "0"
  ), []);
  const bloom = useMemo(() => (postEnabled ? new BloomPass() : null), [postEnabled]);
  useEffect(() => () => bloom?.dispose(), [bloom]);
  // The segmented frame timer (decision 0084 round 10). Made here, bound to
  // the renderer by the first in-canvas hook, provided to every renderer.
  const frameSegments = useMemo(() => new FrameSegments(), []);
  const dprOverride = useMemo(() => {
    const raw = new URLSearchParams(window.location.search).get("dpr");
    if (raw === null) return null;
    const n = Number.parseFloat(raw);
    if (!Number.isFinite(n)) return null;
    return Math.min(2, Math.max(0.5, n));
  }, []);
  // Settlement beacons in walk mode (owner round 6): on by default; `?markers=0` starts them hidden.
  const [showMarkers, setShowMarkers] = useState(
    () => new URLSearchParams(window.location.search).get("markers") !== "0");
  // The place sockets as labelled posts (0103 decision 6): `?sockets=1` sets
  // the start state, the "sockets" checkbox toggles it live (owner walk 2).
  const [showSockets, setShowSockets] = useState(() => socketsOverlayEnabled());
  // Interiors (0103 decision 4): the published door records, whether the
  // player is inside a cell (the exterior's drawn layers hide, nothing
  // unloads), and `?interior=<cellId>` opening a cell directly.
  const [doors, setDoors] = useState<readonly SettlementDoor[]>([]);
  const [insideInterior, setInsideInterior] = useState(false);
  // the shown cell's sockets, for the socket overlay (16k walk 6)
  const [shownCell, setShownCell] = useState<ShownCellSockets | null>(null);
  const directInterior = useMemo(() => new URLSearchParams(window.location.search).get("interior"), []);
  // Black from the first frame when a cell is opened directly (the fade lifts once it is resident).
  const doorOverlay = useMemo(() => createDoorOverlayChannel(directInterior ? 1 : 0), [directInterior]);
  const screenOverlay = useMemo(() => createScreenOverlayChannel(), []);
  const interiorProbeRef = useRef<(() => InteriorDoorsProbe) | null>(null);
  // The session's typed sound bus (decision 0095): swing doors say
  // door.open/door.close on it. The studio attaches no AudioManager yet.
  const [sounds] = useState(() => new SoundEventBus());
  // One activate press, one answer (doors, travel operators): the arbiter
  // the providers offer to and the driver resolves each frame; and the one
  // kit cache the settlement layer and the interior loader share.
  const interaction = useMemo(() => new InteractionArbiter(), []);
  const kitCache = useMemo(() => new KitCache(), []);
  // Spawn-ring pieces the settlement layer has not drawn yet; the warm gate holds on it (decision 0120).
  const ringPendingRef = useRef(0);
  // Travel sockets (16e deliverable 7): the studio owns the body, so it
  // hands the sockets component a teleport instead of a handle. The adapter
  // is the controller boundary — nothing here touches ecctrl directly.
  const travelAdapter = useMemo(() => new EcctrlAdapter(player), [player]);
  const teleportTo = useCallback((xM: number, zM: number) => {
    const ground = world.groundHeight(xM, zM);
    travelAdapter.teleport({ x: xM, y: (ground ?? 100) + CHARACTER_BODY_CENTER_HEIGHT + 1, z: zM });
    // Stream the chunks around the arrival immediately.
    focusRef.current.x = xM;
    focusRef.current.z = zM;
  }, [travelAdapter, world]);
  const settlementGroundAt = useMemo(
    () => (x: number, z: number) => world.groundHeight(x, z),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [world, verticalScale],
  );
  const groundArrivals = useMemo(() => groundArrivalsOf(store), [store]);
  const markerGroundAt = useMemo(
    () => (xM: number, zM: number) => world.groundHeight(xM, zM) ?? 0,
    // Re-key markers when the vertical scale changes (heights re-seat).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [world, verticalScale],
  );
  // Phase 8b: the authoritative water query rides the shared assets; the
  // environment query and the renderer sample the same data (module 60 §38).
  const waterWorldRef = useRef<WaterWorld | null>(null);
  const settlementSolidsRef = useRef<SettlementSolid[]>([]);
  const settlementEnvironment = useCallback(() => {
    const sample = lastWeatherSample();
    return sample
      ? { rainIntensity: sample.rainIntensity, epochMinutes: worldClock.epochMinutes(),
        windDirXZ: sample.windDirXZ, windSpeedMS: sample.windSpeedMS }
      : null;
  }, []);
  const handleSettlementSolids = useCallback((solids: SettlementSolid[]) => {
    settlementSolidsRef.current = solids;
  }, []);
  // The boot program warm's proof numbers, refreshed into the perf summary
  // once a second (the late links are counted live).
  const programWarmTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (programWarmTimer.current) clearInterval(programWarmTimer.current); }, []);
  const handleProgramWarm = useCallback((report: KitProgramWarmReport) => {
    const write = () => {
      const st = (window as unknown as { __STUDIO_GPU_MS__?: FrameGpuStats }).__STUDIO_GPU_MS__;
      if (!st) return;
      const late = report.linkedAfter();
      st.programsWarmed = report.programsWarmed;
      st.programsLinkedAfterWarm = late.length;
      if (STUDIO_TOOLS) st.programsLinkedAfterWarmKeys = late;
    };
    if (programWarmTimer.current) clearInterval(programWarmTimer.current);
    write();
    programWarmTimer.current = setInterval(write, 1000);
  }, []);
  const waterSurfaceFocus = useCallback((): Vec3 | null => {
    const position = player.current?.body?.translation();
    return position ? { x: position.x, y: position.y / verticalScaleRef.current, z: position.z } : null;
  }, []);
  useEffect(() => {
    let alive = true;
    sharedWaterAssets(base)
      .then((a) => {
        if (!alive) return;
        waterWorldRef.current = a.world;
        world.setWaterWorld(a.world);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [base, world]);
  useEffect(() => {
    setWaterGroundHeight((x, z) => {
      const g = world.groundHeight(x, z);
      return g === null ? null : g / verticalScaleRef.current;
    });
    return () => setWaterGroundHeight(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world]);
  /** Buoyancy demo (💧 crates button): spawn origin for three test crates. */
  const [crateOrigin, setCrateOrigin] = useState<Vec3 | null>(null);
  const waterContact = useRef(new WaterContactEmitter("actor.player", CHARACTER_CAPSULE_RADIUS));
  useEffect(() => () => waterContact.current.dispose(), []);
  useEffect(() => {
    const reset = () => waterContact.current.reset();
    document.addEventListener('visibilitychange', reset);
    return () => document.removeEventListener('visibilitychange', reset);
  }, []);
  const onWaterContact = useCallback((x: number, y: number, z: number, vy: number, dt: number) => {
    const ww = waterWorldRef.current;
    if (!ww || document.hidden) return;
    const scale = verticalScaleRef.current;
    let radius = CHARACTER_CAPSULE_RADIUS, halfHeight = CHARACTER_CAPSULE_HALF_HEIGHT;
    let bottom = y - halfHeight - radius;
    const body = player.current?.body;
    if (body) for (let i = 0; i < body.numColliders(); i++) {
      const collider = body.collider(i);
      if (collider.shape.type !== ShapeType.Capsule) continue;
      radius = collider.radius(); halfHeight = collider.halfHeight();
      const centre = collider.translation();
      x = centre.x; z = centre.z;
      bottom = centre.y - radius - halfHeight;
      break;
    }
    const volume = (Math.PI * radius ** 2 * 2 * halfHeight + 4 / 3 * Math.PI * radius ** 3) / scale;
    waterContact.current.update(ww, worldClock.epochMinutes(), { x, y: bottom / scale, z },
      vy / scale, dt, undefined, 2 * (halfHeight + radius) / scale, volume);
  }, []);
  // Physics stays paused until the collider ring around the spawn is mounted;
  // otherwise the capsule falls through where the terrain hasn't landed yet.
  const [collidersReady, setCollidersReady] = useState(false);
  // …and until the render path is warm (RenderWarmGate: per-frame work stable,
  // frames counted): load stalls make the capsule's hover-spring oscillate
  // (owner 2026-08-25), and V8 tier-up bursts made the first seconds after
  // ready 13-17 ms frames (perf10 C5). The "Loading" line shows until then.
  const [renderWarm, setRenderWarm] = useState(false);
  const verticalScaleRef = useRef(verticalScale);
  verticalScaleRef.current = verticalScale;

  // Re-scale in place: keep the world query, colliders and meshes in lockstep,
  // and re-seat the character on the re-scaled ground where it stands.
  const scaleInitialised = useRef(false);
  useEffect(() => {
    if (!scaleInitialised.current) { scaleInitialised.current = true; return; }
    if (!manifest) return;
    waterContact.current.reset();
    world.setVerticalScale(verticalScale);
    const { x, z } = focusRef.current;
    const ground = world.groundHeight(x, z) ?? 50;
    supportYRef.current = ground;
    setCollidersReady(false);
    setSpawn({ x, y: Math.max(ground, 0) + CHARACTER_BODY_CENTER_HEIGHT + 0.4, z });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verticalScale]);

  const race: RaceId = (RACE_IDS as readonly string[]).includes(raceId ?? "")
    ? (raceId as RaceId)
    : "argonian";
  const profile = resolveCapabilityProfile(profileId);
  const loadout = useEquippedLoadout();
  const armour = useWornArmour();
  const locomotion = useMemo(() => new ExplorerLocomotion(), []);
  const animationCommandRef = useRef(locomotion.animationCommand);
  const animationTimeRef = useRef(0);
  const speedMultiplierRef = useRef(1);
  // Live terrain height under the actor — the grounding solve's support plane.
  // Feeding a stale/static plane makes floor-contact clip phases (landings,
  // parts of locomotion) snap the model to it and vanish underground.
  const supportYRef = useRef(0);

  useEffect(() => {
    const query = window.matchMedia("(pointer: coarse)");
    const update = () => setTouch(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const m = await store.manifest();
        await world.init(matSet ?? "bmv-v1", verticalScaleRef.current);
        // Never spawn on or beyond the boundary wall (16d): a URL can name
        // any coordinate, and two metres inside the extent is ground.
        const extent = m.terrainSupportExtentM ?? TERRAIN_SUPPORT_EXTENT_M;
        const inside = (v: number) => Math.max(2, Math.min(extent - 2, v));
        const x = inside(spawnKm.x * 1000);
        const z = inside(spawnKm.z * 1000);
        const [cx, cy] = world.chunkCellAt(x, z);
        const ring: Promise<unknown>[] = [];
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (store.chunkAt(cx + dx, cy + dy)) ring.push(store.load(cx + dx, cy + dy, "1"));
          }
        }
        await Promise.all(ring);
        prefetchChunks(store, m, x, z);   // the rest of the province, without waiting for the textures
        if (cancelled) return;
        const ground = world.groundHeight(x, z) ?? 50;
        supportYRef.current = ground;
        setSpawn({ x, y: spawnBodyY(ground), z });
        focusRef.current = { x, z };
        setManifest(m);
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => { cancelled = true; };
    // Deliberately spawn-once: later movement streams chunks via the focusRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, world]);

  // Bridge between the renderer (which knows where every plant ended up) and
  // the physics ring (which makes the near ones solid). A ref, not state: the
  // list changes on every vegetation rebuild and must not re-render the scene.
  const floraSolidsRef = useRef<SolidInstance[]>([]);
  /** Collider shapes per species, published by `Vegetation` once its kit is
   * loaded: rocks collide as their own triangles, which needs the kit
   * geometry the renderer already holds. */
  const floraShapesRef = useRef<Map<string, FloraCollider[]> | null>(null);
  const [floraColliderCount, setFloraColliderCount] = useState(0);
  const handleSolids = useCallback((solids: SolidInstance[]) => {
    floraSolidsRef.current = solids;
  }, []);

  const authoredExtentM = manifest?.authoredUvExtentM ?? PROVINCE_EXTENT_M;

  if (error) {
    return (
      <div data-es-view="character-error" style={{ position: "fixed", inset: 0, zIndex: 6, background: "#10141a", color: "#e6ecf5", display: "grid", placeItems: "center" }}>
        <div>
          <p>Character mode failed to load: {error}</p>
          <button onClick={onExit}>← Back to map</button>
        </div>
      </div>
    );
  }

  return (
    <div data-es-view="character" style={{ position: "fixed", inset: 0, zIndex: 6, background: "#10141a" }}>
      {canvasError && <CanvasErrorBanner message={canvasError} />}
      {manifest && spawn ? (
        <Canvas
          camera={{ fov: FOLLOW_CAMERA.fieldOfView, near: 0.3, far: 60000, up: [0, 1, 0] }}
          // Cap pixel density — see Fly3D (8b round 2 perf); the quality
          // preset tightens it further on foot (fill rate is the retina tax).
          dpr={dprOverride === null ? [1, quality.dprMax] : [dprOverride, dprOverride]}
          gl={{ antialias: canvasAa }}
          // "percentage" = PCFShadowMap, matching Fly3D: "soft" is deprecated
          // in three r184 and r3f re-applies it on every Canvas render, forcing
          // a shadow re-render each frame (WaterPipeline.tsx explains).
          shadows="percentage"
          style={{ width: "100%", height: "100%" }}
          onCreated={({ gl }) => { glRef.current = gl.domElement; gl.debug.checkShaderErrors = shaderCheckEnabled(); }}
          onPointerDown={() => { if (!touch) glRef.current?.requestPointerLock(); }}
        >
          <CanvasErrorBoundary onError={setCanvasError}>
          {/* Every renderer marks its segment on this one timer (0084). */}
          <FrameSegmentsContext.Provider value={frameSegments}>
          {/* Walking-stutter fix (owner 2026-09-20): the per-crossing rebuilds
              below run as budgeted generator jobs on this queue. */}
          <FrameWorkProvider>
          {/* The HUD's frame rate is sampled HERE, inside the canvas, so
              `?veg=0` (no vegetation renderer mounted) still has one. */}
          <FrameRateProbe ownsRender={!waterPipelineEnabled || hiddenLayers.has("water")} />
          {/* Natural light and sky (Phase 8a): terrain, character and sea are
              lit by the same sun/moon/sky rig, shadows and exposure as the
              flyover — WorldSky replaces the old per-mode light sets. */}
          <WorldSky mode="character" shadowMapSize={quality.shadowMapSize} extentM={authoredExtentM} verticalScale={verticalScale} hidden={insideInterior}>
          <group visible={!insideInterior}>
          <Suspense fallback={null}>
            <ApronTerrain
              store={store}
              manifest={manifest}
              apron={apronManifest}
              focusRef={focusRef}
              matSet={matSet}
              tintStrength={tintStrength}
              verticalScale={verticalScale}
            />
            {/* Phase 10 vegetation — the SAME component and bundles as the
                flyover, following the walking character's focusRef. Omitting
                it here was the "plants appear in fly mode but not on foot"
                defect (owner, Phase 10 round 2). */}
            {!hiddenLayers.has("vegetation") && (
              <>
                {VEGETATION_ENABLED && (
                  <Vegetation
                    focusRef={focusRef}
                    baseUrl={import.meta.env.BASE_URL}
                    verticalScale={verticalScale}
                    quality={quality}
                    onSolids={handleSolids}
                    shapesRef={floraShapesRef}
                  />
                )}
                {/* T3 groundcover ring around the walking character — same
                    component and constants as the flyover. */}
                {GROUNDCOVER_ENABLED && (
                  <Groundcover
                    focusRef={focusRef}
                    baseUrl={import.meta.env.BASE_URL}
                    verticalScale={verticalScale}
                    quality={quality}
                    settlementsVisible={!hiddenLayers.has("settlements")}
                  />
                )}
              </>
            )}
            {!hiddenLayers.has("settlements") && (
              <SettlementLayer
                baseUrl={base}
                focusRef={focusRef}
                groundAt={settlementGroundAt}
                groundArrivals={groundArrivals}
                quality={quality}
                environment={settlementEnvironment}
                onSolids={handleSettlementSolids}
                onProgramWarm={handleProgramWarm}
                rebuildRef={settlementRebuildRef}
                onDoors={setDoors}
                kitCache={kitCache}
                onError={setSettlementError}
                ringPendingRef={ringPendingRef}
                localSurfaces={sharedLocalSurfaces(import.meta.env.BASE_URL)}
              />
            )}
          </Suspense>
          {/* Phase 8b water: the compiled province surface + shared pipeline;
              the wading player feeds a churn ring for contact foam. */}
          {!hiddenLayers.has("water") && waterPipelineEnabled && (
            <StudioWater
              base={import.meta.env.BASE_URL}
              verticalScale={verticalScale}
              farExtentM={12000}
              surfaceFocus={waterSurfaceFocus}
              bloom={bloom}
              debugMode={waterDebugMode}
            />
          )}
          {showMarkers && <CityMarkers groundAt={markerGroundAt} />}
          </group>
          {/* outside the exterior group: it draws the shown cell's sockets while the exterior is hidden */}
          {showSockets && <SocketMarkers baseUrl={base} groundAt={markerGroundAt}
            startAt={focusRef.current} shown={shownCell} />}
          <RenderWarmGate armed={collidersReady} ringPendingRef={ringPendingRef} onOpen={() => setRenderWarm(true)} onProgress={publishWarm} />
          {/* Own Suspense boundary: rapier's WASM init and collider loads
              suspend, and without a boundary HERE each suspension unmounts and
              remounts the whole canvas tree — WorldSky included, leaking one
              CSM light set per remount (owner gate defect 2026-08-25). */}
          <Suspense fallback={null}>
          {/* ALWAYS paused: stepping is manual and bounded (CharacterDriver).
              r3f-rapier's built-in loop runs an UNCAPPED catch-up
              (`while (accumulator >= timeStep)`, dt clamp 0.5 s): on a
              machine that stalls during load, one 500 ms frame bursts 30
              physics steps, which stalls the next frame — the load-time
              death spiral, hover-spring snapping and skyfall loop (owner
              round 3). The combat sandbox at 60 fps never grows the
              accumulator, which is why it never showed there.

              `paused` also switches the library's mesh sync to
              `interpolationAlpha = 1`; with `paused` set, the library's own
              frame stepper is a no-op, so that sync only ever runs inside
              the driver's own `rapier.step` call — meaning the body it draws
              is the raw pose left by the PREVIOUS frame's steps. At
              ~57 fps the 1/60 step beats against the frame (one step most
              frames, two every ~20th) and the un-smoothed body shows the
              beat. So the driver interpolates itself: it brackets each
              `rapier.step` with prev/curr pose, and after the step loop
              draws prev→curr at `alpha = stepAccum / (1/60)`, writing that
              pose onto the same Object3D the library syncs (later write in
              the frame wins; the library overwrites next frame and we
              override again). The camera follow and the foot-IK support
              plane read that same visual pose, so they cannot disagree with
              what is drawn.

              `interpolate={false}` (perf10): with it on, the library
              snapshots translation() and rotation() of EVERY body before each
              step, the ~1400 fixed flora bodies included, only to lerp at
              alpha 1 (paused): 1.14 ms per step against a 0.15 ms step in a
              1400-body node harness. Off, nothing drawn changes.
              physicsMount.test.ts holds it. */}
          <Physics key={verticalScale} gravity={GRAVITY} timeStep={1 / 60} paused interpolate={false}>
            {crateOrigin && (
              <FloatTestCrates origin={crateOrigin} waterWorld={() => waterWorldRef.current} verticalScale={verticalScale} />
            )}
            <ChunkColliders store={store} manifest={manifest} focusRef={focusRef}
              verticalScale={verticalScale} onReady={() => setCollidersReady(true)} />
            {/* Solidity (Phase 10 round 5): trunks, boulders and root arches
                stop the player; reeds and ferns do not. The kit has shipped
                collision proxies since round 1 with nothing consuming them. */}
            {!hiddenLayers.has("vegetation") && (
              <VegetationColliders
                solidsRef={floraSolidsRef}
                shapesRef={floraShapesRef}
                focusRef={focusRef}
                onCount={setFloraColliderCount}
              />
            )}
            <SettlementColliders solidsRef={settlementSolidsRef} focusRef={focusRef} />
            <InteriorDoors
              baseUrl={base}
              controller={travelAdapter}
              doors={doors}
              groundAt={settlementGroundAt}
              bodyCentreHeightM={CHARACTER_BODY_CENTER_HEIGHT}
              directCellId={directInterior}
              onInside={setInsideInterior}
              onShown={setShownCell}
              interaction={interaction}
              kitCache={kitCache}
              overlay={doorOverlay}
              probeRef={interiorProbeRef}
              sounds={sounds}
            />
            {/* 16e: operator sockets, the talk prompt and the travel menu.
                16g: `travel_services` is the stage that sites them, so they
                are not mounted while the ladder hides the services layer —
                sockets from an older run stand where nothing was solved.
                Walk 4: only with the sockets overlay on (`travelSocketsShown`). */}
            {travelSocketsShown(showSockets, hiddenLayers) && <TravelSockets
              positionRef={focusRef}
              groundAt={settlementGroundAt}
              teleportTo={teleportTo}
              baseUrl={base}
              interaction={interaction}
              offering={!insideInterior}
              overlay={screenOverlay}
            />}
            {/* The edge of the world (16d): four invisible walls on the border
                of the built ground, and the one line the player gets there. */}
            <BoundaryWalls extentM={terrainExtentM} verticalScale={verticalScale} />
            <BoundaryMessage positionRef={focusRef} extentM={terrainExtentM} onMessage={setEdgeMessage} />
            <PlayerBody handleRef={player} position={[spawn.x, spawn.y, spawn.z]} rotationY={Math.PI}>
              {/* The camera fades this group out when its arm is short
                  (16h check-in 2 item 3); per-mesh hiding stays armour's. */}
              <group ref={playerModelRef}>
              <Suspense fallback={null}>
                <SkyrimFighter
                  animationCommandRef={animationCommandRef}
                  animationTimeRef={animationTimeRef}
                  speedMultiplierRef={speedMultiplierRef}
                  weaponProfile={loadout.mainHand.visual}
                  offHandProfile={loadout.offHand?.visual ?? null}
                  // Character mode explores; it does not fight. The core pack
                  // carries every clip it can reach (locomotion, crouch, jump,
                  // landings), so a weapon moveset is not downloaded to walk
                  // around the province.
                  animationPacks={[]}
                  armour={armour}
                  buildId={resolveBuild(race, DEFAULT_SEX).id}
                  modelOffsetY={CHARACTER_MODEL_OFFSET}
                  equipped={false}
                  visualSupportYRef={supportYRef}
                />
              </Suspense>
              </group>
            </PlayerBody>
            <CharacterDriver
              bloom={bloom}
              handleRef={player}
              world={world}
              active={collidersReady && renderWarm}
              spawn={spawn}
              locomotion={locomotion}
              animationTimeRef={animationTimeRef}
              speedMultiplierRef={speedMultiplierRef}
              supportYRef={supportYRef}
              focusRef={focusRef}
              extentM={terrainExtentM}
              onHud={hudChannel.publish}
              onWaterContact={onWaterContact}
              onPositionKm={onPositionKm}
              playerModelRef={playerModelRef}
              settlementRebuildRef={settlementRebuildRef}
              interaction={interaction}
              interiorProbeRef={interiorProbeRef}
            />
          </Physics>
          </Suspense>
          </WorldSky>
          </FrameWorkProvider>
          </FrameSegmentsContext.Provider>
          </CanvasErrorBoundary>
        </Canvas>
      ) : (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#e6ecf5" }}>
          Loading terrain around the spawn…
        </div>
      )}
      {/* Only over the canvas: a direct `?interior=` starts black, which must not hide the loading line. */}
      {manifest && spawn && <ScreenOverlay channel={screenOverlay} />}
      {manifest && spawn && <DoorOverlay channel={doorOverlay} />}
      <div style={{
        // Stop short of the fixed time panel (top-right) — it was covering
        // the tail of this bar (compass unreadable, owner round 6).
        position: "absolute", top: 10, left: 10, right: 360, display: "flex", gap: 10, alignItems: "center",
        background: "rgba(10,14,20,0.8)", padding: "8px 12px", borderRadius: 8, flexWrap: "wrap",
        color: "#e6ecf5", font: "13px system-ui",
      }}>
        <SettlementErrorLine error={settlementError} style={{ flexBasis: "100%" }} />
        {manifest && spawn && !renderWarm && <span style={{ flexBasis: "100%" }}>Loading: warming the renderer…</span>}
        <button onClick={onExit} style={{ padding: "4px 10px", cursor: "pointer" }}>← Map</button>
        <button onClick={() => {
          const hud = hudChannel.latest;
          if (hud) onFlyHere(hud.xKm, hud.zKm);
        }} style={{ padding: "4px 10px", cursor: "pointer" }}>✈ Fly here</button>
        <button
          onClick={() => {
            const hud = hudChannel.latest;
            if (hud) setCrateOrigin({ x: hud.xKm * 1000, y: hud.altM, z: hud.zKm * 1000 });
          }}
          title="Drop three floating crates ahead of you (Phase 8b buoyancy test)"
          style={{ padding: "4px 10px", cursor: "pointer" }}
        >💧 crates</button>
        {onExaggeration && (
          <label>vertical ×{verticalScale}{" "}
            <input type="range" min={1} max={6} step={0.5} value={verticalScale}
              onChange={(e) => onExaggeration(Number(e.target.value))} />
          </label>
        )}
        <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <input type="checkbox" checked={showMarkers} onChange={(e) => setShowMarkers(e.target.checked)} />
          markers
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 4 }}
          title="Place sockets as labelled posts (where people, containers and idle spots stand)">
          <input type="checkbox" checked={showSockets} onChange={(e) => setShowSockets(e.target.checked)} />
          sockets
        </label>
        <label title="Render quality on foot: draw distances, plant density, pixel density">
          quality{" "}
          <select
            value={quality.name}
            onChange={(e) => setQuality(QUALITY_PRESETS[e.target.value as QualitySettings["name"]])}
          >
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        </label>
        <span>race {race} · profile {profile.id}</span>
        <span title="Solid plants and rocks around you (trunks and boulders are solid; reeds and ferns are not)">
          solid {floraColliderCount}
        </span>
        <CharacterHud channel={hudChannel} segments={frameSegments} postOn={postEnabled} />
      </div>
      <div style={{
        position: "absolute", bottom: 10, left: "50%", transform: "translateX(-50%)",
        background: "rgba(10,14,20,0.75)", padding: "6px 12px", borderRadius: 8,
        font: "13px system-ui", color: "#e6ecf5", whiteSpace: "nowrap",
      }}>
        {touch
          ? "Left stick to move · drag right side to look · buttons to sprint/jump"
          : "Click to capture the mouse (Esc releases) · WASD move · hold Space to sprint · J jumps · gamepad supported"}
      </div>
      {edgeMessage && (
        <div role="status" data-edge-message style={{
          position: "absolute", top: "38%", left: "50%", transform: "translate(-50%, -50%)",
          background: "rgba(10,14,20,0.8)", padding: "14px 26px", borderRadius: 10,
          font: "22px system-ui", color: "#ffd9a0", whiteSpace: "nowrap", pointerEvents: "none",
        }}>
          {edgeMessage}
        </div>
      )}
      {mapCanvas && mapMeta && (
        <CharacterHudMinimap
          channel={hudChannel}
          mapCanvas={mapCanvas}
          meta={mapMeta}
          bottomPx={touch ? 210 : 12}
          overlay={minimapOverlay}
        />
      )}
      {touch && <TouchControls />}
    </div>
  );
}

/** The readout — the only thing that re-renders on a HUD tick. Identical
 * text to the version that lived in the parent; only the ownership moved. */
function CharacterHud({ channel, segments, postOn }: {
  channel: HudChannel;
  segments: FrameSegments;
  postOn: boolean;
}) {
  const hud = useHud(channel);
  if (!hud) return null;
  return (
    <span style={{ opacity: 0.9 }}>
      {hud.xKm.toFixed(2)} km E · {hud.zKm.toFixed(2)} km S · alt {hud.altM.toFixed(1)} m
      {" · "}chunk {hud.chunk[0]},{hud.chunk[1]}
      {hud.groundMaterial ? ` · ${hud.groundMaterial}` : ""}
      {hud.region && hud.region !== "unknown" ? ` · ${hud.region}` : ""}
      {hud.waterDepth !== undefined ? ` · ${hud.waterBody ?? "water"} ${hud.waterDepth.toFixed(1)} m deep` : ""}
      {hud.dayPhase ? ` · ${hud.dayPhase}` : ""}
      {hud.visibilityM !== undefined ? ` · vis ~${hud.visibilityM} m` : ""}
      {" · "}{["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(hud.headingDeg / 45) % 8]} {Math.round(hud.headingDeg)}°
      {" · "}{hud.grounded ? `${hud.speed.toFixed(1)} m/s` : "airborne"}
      <PerfHudSection>
        <VegetationHudLine />
        <GroundcoverHudLine />
        <TriangleAttributionLine />
        <FrameSegmentLines segments={segments} />
        <PostHudLine segments={segments} on={postOn} />
      </PerfHudSection>
    </span>
  );
}

/** Where the open/closed state of the measurement section survives a reload. */
const PERF_OPEN_KEY = "es.hud.perfOpen";

/**
 * The five measurement lines, collapsed behind a one-line header (owner
 * 2026-09-22): they cluttered the character view. Header shows the frame rate
 * alone; click it or press F3 to toggle. Collapsed is the default, and when
 * collapsed none of the five lines are in the DOM.
 *
 * The header word `perf` and the `▸`/`▾` arrows are debug UI and stay literals
 * here: CLAUDE.md's player-facing-text rule is carried by engineering standard
 * 4, whose own statement exempts debug and developer UI
 * (packages/text-catalogue/src/catalogue.ts header), which is also why the
 * five lines below it were never catalogued.
 */
/** Flips `open`, persisting the new value under `PERF_OPEN_KEY`. The one copy
 * of this read-modify-write used by both the F3 handler and the click
 * handler, so the two input paths can never desync. */
function flipPerfOpen(was: boolean): boolean {
  const next = !was;
  try { window.localStorage.setItem(PERF_OPEN_KEY, next ? "1" : "0"); } catch { /* private mode */ }
  window.dispatchEvent(new CustomEvent<boolean>(PERF_OPEN_EVENT, { detail: next }));
  return next;
}

/** Fired with the new open state on every flip: the in-canvas probe installs
 * its per-draw triangle attribution only while the section is open. */
const PERF_OPEN_EVENT = "es-perf-hud-open";
/** The per-draw bucket wrapper runs on one frame in this many (perf-diag23 Q1). */
const BUCKET_SAMPLE_EVERY = 30;

function readPerfOpen(): boolean {
  try { return window.localStorage.getItem(PERF_OPEN_KEY) === "1"; } catch { return false; }
}

function PerfHudSection({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(readPerfOpen);
  const fps = useHudPoll(() => (window as unknown as { __STUDIO_FPS__?: number }).__STUDIO_FPS__ ?? 0, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Held keys auto-repeat `keydown`; without this guard, holding F3 for
      // a second flips the section dozens of times and hammers localStorage.
      if (e.key !== "F3" || e.repeat) return;
      e.preventDefault();
      setOpen(flipPerfOpen);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // Once the canvas has pointer lock (normal play — mouse-look is live), a
  // click anywhere targets the locked canvas, never this span, so the click
  // affordance below is dead while playing; F3 is the only control that
  // works locked or not. Track lock state so the header stops claiming to
  // be clickable when it can't be.
  const [locked, setLocked] = useState(() => Boolean(document.pointerLockElement));
  useEffect(() => {
    const onLockChange = () => setLocked(Boolean(document.pointerLockElement));
    document.addEventListener("pointerlockchange", onLockChange);
    return () => document.removeEventListener("pointerlockchange", onLockChange);
  }, []);
  const toggle = () => setOpen(flipPerfOpen);
  return (
    <>
      <span
        role={locked ? undefined : "button"}
        tabIndex={locked ? undefined : 0}
        onClick={locked ? undefined : toggle}
        title="F3 to toggle"
        style={{
          display: "block", opacity: 0.75, userSelect: "none",
          cursor: locked ? "default" : "pointer",
        }}
      >
        {`perf ${open ? "▾" : "▸"} ${fps} fps`}
      </span>
      {open ? children : null}
    </>
  );
}

/** Frame order for the two attribution lines (decision 0084 round 10): the
 * labels read in the order the frame runs them, never by size, so two walks
 * can be compared column by column. A label the frame never marked is left
 * out of the line. */
const GPU_SEGMENT_ORDER = [
  "pre", "sky", "shadow", "scene", "blit", "water", "precip", "overlay",
  "ripple", "foam", "bloom", "post",
];
const CPU_SEGMENT_ORDER = [
  "pre", "veg", "gc", "sky", "char", "ripple", "foam", "shadow", "scene",
  "blit", "water", "precip", "overlay", "bloom", "post",
];

function segmentText(rows: SegmentStat[], order: string[]): string {
  const by = new Map(rows.map((r) => [r.label, r]));
  const present = order.filter((label) => by.has(label));
  // Only the worst spike is worth a second figure; the rest read as averages.
  let peak: string | null = null;
  let peakMs = -1;
  for (const label of present) {
    const max = by.get(label)!.max;
    if (max > peakMs) { peakMs = max; peak = label; }
  }
  return present.map((label) => {
    const row = by.get(label)!;
    const avg = row.avg.toFixed(1);
    return label === peak ? `${label} ${avg} (max ${row.max.toFixed(1)})` : `${label} ${avg}`;
  }).join(" · ");
}

/** HUD lines 4 and 5 (DEV, decision 0084 round 10): where the frame's GPU and
 * main-thread milliseconds went, pass by pass and stage by stage. Polled once
 * a second like the lines above it. */
function FrameSegmentLines({ segments }: { segments: FrameSegments }) {
  const stats = useHudPoll<FrameSegmentStats | null>(() => segments.stats(), [segments]);
  if (!stats) return null;
  return (
    <>
      <span style={{ display: "block", opacity: 0.75 }}>
        {`${stats.gpuWallTimeOnly ? "gpu(wall, not work on Metal)" : "gpu by pass"}: ${
          stats.gpuSupported
            ? segmentText(stats.gpu, GPU_SEGMENT_ORDER) || "—"
            : "n/a"}`}
      </span>
      <span style={{ display: "block", opacity: 0.75 }}>
        {`cpu by stage: ${segmentText(stats.cpu, CPU_SEGMENT_ORDER) || "—"}`}
      </span>
    </>
  );
}

/** DEV HUD line: post on/off and the glow pass's GPU and CPU ms (segment
 * `bloom`), so `?post=0` can be A/B'd on a device. */
function PostHudLine({ segments, on }: { segments: FrameSegments; on: boolean }) {
  const text = useHudPoll(() => {
    if (!on) return "post off (?post=0)";
    const s = segments.stats();
    const gpu = s.gpu.find((r) => r.label === "bloom");
    const cpu = s.cpu.find((r) => r.label === "bloom");
    return `post on · bloom gpu ${s.gpuSupported && gpu ? gpu.avg.toFixed(2) : "n/a"} ms · cpu ${cpu ? cpu.avg.toFixed(2) : "—"} ms`;
  }, [segments, on]);
  return <span style={{ display: "block", opacity: 0.75 }}>{text}</span>;
}

/** A 60-frame rolling frame rate for the HUD line, published from inside the
 * canvas because the HUD is DOM and `useFrame` is not available to it.
 *
 * It also carries the DEV GPU frame timer: `EXT_disjoint_timer_query_webgl2`
 * measures how long the GPU spent on a frame, which is the number that tells
 * a shadow/overdraw cost from a CPU cost. A query cannot be begun and ended
 * inside one r3f callback (the render happens after every `useFrame`), so a
 * query begun in this low-priority callback is ENDED at the start of the next
 * frame: it spans exactly one frame of GPU work. Results are polled
 * asynchronously and discarded when the driver reports a disjoint.
 */
interface FrameGpuStats {
  avg: number;
  max: number;
  supported: boolean;
  /** True where the GPU timer reports wall time, not work (Apple/Metal). */
  wall?: boolean;
  /** Triangles and draw calls the WHOLE frame issued, averaged over the same
   * 60-frame window as `avg` (every pass, see the manual `info.reset`). */
  tris: number;
  calls: number;
  /** Main-thread time a frame costs, ms: from the earliest `useFrame`
   * callback (the one that opens the timer query, priority -100) to the end
   * of the frame's last render (priority 1000, after the water pipeline).
   * Averaged/peaked over the same 60/120-frame windows as `avg`/`max`, so a
   * CPU-bound frame can be told from a GPU-bound one. */
  cpu: number;
  cpuMax: number;
  /** The LAST frame's triangle total, unaveraged — the number another DEV
   * readout wants when it needs this frame rather than the window. */
  lastTris: number;
  /** Triangles attributed by source and pass, same 60-frame window as `tris`:
   * `[main veg, main terrain, main gc, main other, shadow …]` (HUD line 3). */
  buckets: number[];
  /** Draw units the terrain-occlusion test is currently hiding (decision
   * 0084): whole chunks at LOD 4/8, and apron ring sectors. Written in place
   * by the occlusion passes, which own the numbers; undefined until they run. */
  hiddenChunks?: number;
  hiddenSectors?: number;
  /** Programs the settlement layer's boot warm linked (kitProgramWarm.ts),
   * and programs first linked after it finished; the GPU lane reads both.
   * The late programs' cache keys are listed in dev builds only. */
  programsWarmed?: number;
  programsLinkedAfterWarm?: number;
  programsLinkedAfterWarmKeys?: string[];
}

/** Mean of a bounded sample ring; 0 when it is empty. */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/** Per-slot mean of a ring of bucket rows, written into `out` (all slots zero when empty). */
function meanBuckets(rows: number[][], out: number[]): number[] {
  out.fill(0);
  if (rows.length === 0) return out;
  for (const row of rows) for (let i = 0; i < out.length; i++) out[i] += row[i] ?? 0;
  for (let i = 0; i < out.length; i++) out[i] /= rows.length;
  return out;
}

/** Largest value of a bounded ring, 0 when empty or all negative (no spread: one frame, no garbage). */
function maxOf(values: number[]): number {
  let max = 0;
  for (const v of values) if (v > max) max = v;
  return max;
}

/** Millions, one decimal — the only scale these counts are read at. */
function millions(n: number): string {
  return `${(n / 1e6).toFixed(1)}M`;
}

function FrameRateProbe({ ownsRender }: { ownsRender: boolean }) {
  const acc = useRef({ sum: 0, count: 0 });
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  /** Frames rendered by this hook, for the every-other-frame shadow update
   * the water pipeline normally owns. */
  const ownFrames = useRef(0);
  // The segmented timer (decision 0084 round 10) owns BOTH clocks now: the
  // whole-frame `gpu` figure below is the sum of its segment averages, and
  // the old single whole-frame query is gone (only one TIME_ELAPSED query
  // can be active at a time, so two timers cannot coexist).
  const segments = useFrameSegments();
  /** Whether the shadow-map pass is running, read by the per-draw wrapper. */
  const shadowPass = useRef<() => boolean>(() => false);
  const gpu = useRef<{
    triSamples: number[];
    callSamples: number[];
    /** This frame's per-bucket counters, written by the `renderBufferDirect`
     * wrapper and drained (then zeroed) once per frame. */
    frameBuckets: number[];
    bucketSamples: number[][];
    /** `performance.now()` stamped by the priority -100 callback, closed by
     * the priority 1000 one: the frame's main-thread span. */
    cpuStart: number;
    cpuSamples: number[];
    cpuMaxWindow: number[];
    /** The one published stats object, rewritten in place every frame. */
    stats: FrameGpuStats;
    /** The segment timer's whole-frame numbers, read into this every frame. */
    segSummary: FrameGpuSummary;
  }>({
    triSamples: [], callSamples: [],
    frameBuckets: emptyBuckets(), bucketSamples: [],
    cpuStart: 0, cpuSamples: [], cpuMaxWindow: [],
    stats: {
      avg: 0, max: 0, supported: false,
      tris: 0, calls: 0, cpu: 0, cpuMax: 0, lastTris: 0, buckets: emptyBuckets(),
    },
    segSummary: { gpuSumAvg: 0, gpuSumMax: 0, gpuSupported: false, gpuWallTimeOnly: false },
  });

  useEffect(() => {
    const host = window as unknown as {
      __STUDIO_GPU_MS__?: FrameGpuStats;
    };
    segments?.attach(gl);
    // The frame is several `renderer.render` calls (the water pipeline's scene
    // pass, the blit, water, precipitation, the overlay) and three.js clears
    // `info` at the start of every one of them. Reading after the frame would
    // therefore report the LAST pass alone. Take the reset over manually: it
    // happens once per frame below, so `info.render` accumulates every pass.
    gl.info.autoReset = false;
    host.__STUDIO_GPU_MS__ = Object.assign(gpu.current.stats, {
      avg: 0, max: 0, supported: Boolean(segments?.gpuSupported), wall: undefined,
      tris: 0, calls: 0, cpu: 0, cpuMax: 0, lastTris: 0,
      hiddenChunks: undefined, hiddenSectors: undefined,
    });
    gpu.current.stats.buckets.fill(0);
    // Attribution (HUD line 3). `info.render.triangles` is the only count
    // three.js keeps, so the per-draw delta around the one call every draw
    // goes through (the wrapper below) attributes the frame; the shadow-map
    // pass is recognised by wrapping the call that runs it.
    let inShadow = false;
    const shadowMap = gl.shadowMap;
    const shadowRender = shadowMap.render;
    shadowMap.render = function wrapped(this: unknown, ...args: unknown[]) {
      inShadow = true;
      // The cascades run INSIDE the water pipeline's scene pass, so the
      // shadow segment opens here and the scene segment resumes after it
      // (decision 0084 round 10).
      segments?.gpuMark("shadow");
      segments?.cpuMark("shadow");
      try {
        return (shadowRender as (...a: unknown[]) => unknown).apply(shadowMap, args);
      } finally {
        inShadow = false;
        segments?.gpuMark("scene");
        segments?.cpuMark("scene");
      }
    } as typeof shadowMap.render;
    shadowPass.current = () => inShadow;
    return () => {
      shadowMap.render = shadowRender;
      shadowPass.current = () => false;
      segments?.dispose();
      gl.info.autoReset = true;
      delete host.__STUDIO_GPU_MS__;
    };
  }, [gl, segments]);

  // The per-draw triangle attribution (HUD line 3) wraps the call every draw
  // goes through: installed only while the perf section is open (perf10 O7),
  // and then on one sampled frame in BUCKET_SAMPLE_EVERY, the HUD holding the
  // mean of the sampled rows between samples.
  const [bucketsOn, setBucketsOn] = useState(readPerfOpen);
  const bucketHook = useRef<{ direct: typeof gl.renderBufferDirect; wrapped: typeof gl.renderBufferDirect;
    n: number; sampled: boolean } | null>(null);
  useEffect(() => {
    const onFlip = (e: Event) => setBucketsOn((e as CustomEvent<boolean>).detail);
    window.addEventListener(PERF_OPEN_EVENT, onFlip);
    return () => window.removeEventListener(PERF_OPEN_EVENT, onFlip);
  }, []);
  useEffect(() => {
    if (!bucketsOn) return undefined;
    const frame = gpu.current.frameBuckets;
    const renderBufferDirect = gl.renderBufferDirect;
    // Named parameters, not a rest array: this runs once per DRAW, and a
    // `...args` array per draw was hundreds of arrays a frame.
    const direct = renderBufferDirect as (a: unknown, b: unknown, c: unknown, d: unknown, e: unknown, f: unknown) => unknown;
    const wrapped = function wrapped(this: unknown, camera: unknown, scene: unknown, geometry: unknown,
      material: unknown, object: unknown, group: unknown) {
      const before = gl.info.render.triangles;
      const out = direct.call(gl, camera, scene, geometry, material, object, group);
      frame[bucketSlot(shadowPass.current(), bucketIndexOf(object))] +=
        gl.info.render.triangles - before;
      return out;
    } as typeof gl.renderBufferDirect;
    // Installed on one frame in BUCKET_SAMPLE_EVERY by the -100 hook (perf-diag23
    // Q1: wrapped on every draw it held 10.8 of 21.4 s of a walk profile).
    bucketHook.current = { direct: renderBufferDirect, wrapped, n: 0, sampled: false };
    return () => { gl.renderBufferDirect = renderBufferDirect; bucketHook.current = null; };
  }, [gl, bucketsOn]);

  useFrame((_, delta) => {
    // The frame starts here: the first segment of both clocks opens before
    // any other hook runs (decision 0084 round 10).
    segments?.cpuMark("pre");
    segments?.gpuMark("pre");
    const a = acc.current;
    a.sum += delta; a.count++;
    if (a.count >= 60) {
      (window as unknown as { __STUDIO_FPS__?: number }).__STUDIO_FPS__ =
        Math.round(a.count / Math.max(a.sum, 1e-3));
      a.sum = 0; a.count = 0;
    }

    const g = gpu.current;
    g.cpuStart = performance.now();
    // Whole-frame geometry: every pass of the frame just ended, because the
    // reset below is manual. Averaged over the same 60-frame window as `gpu`.
    const tris = gl.info.render.triangles;
    const calls = gl.info.render.calls;
    if (tris > 0) {
      g.triSamples.push(tris); if (g.triSamples.length > 60) g.triSamples.shift();
      g.callSamples.push(calls); if (g.callSamples.length > 60) g.callSamples.shift();
    }
    // Bucket rows come from sampled frames only (the wrapper ran on them).
    const hook = bucketHook.current;
    if (tris > 0 && hook?.sampled) {
      // Recycle the row that leaves the window: no per-frame array.
      const row = g.bucketSamples.length >= 60 ? g.bucketSamples.shift()! : new Array<number>(g.frameBuckets.length);
      for (let i = 0; i < g.frameBuckets.length; i++) row[i] = g.frameBuckets[i];
      g.bucketSamples.push(row);
    }
    g.frameBuckets.fill(0);
    if (hook) {
      hook.n += 1;
      hook.sampled = hook.n % BUCKET_SAMPLE_EVERY === 0;
      gl.renderBufferDirect = hook.sampled ? hook.wrapped : hook.direct;
    }
    gl.info.reset();

    const seg = segments?.gpuSummary(g.segSummary);
    // One object rewritten in place (walk 5 perf audit item 11). The
    // occlusion passes write hiddenChunks/hiddenSectors into it themselves,
    // so they persist between their evaluations without a copy.
    const st = g.stats;
    st.avg = Math.round((seg?.gpuSumAvg ?? 0) * 10) / 10;
    st.max = Math.round((seg?.gpuSumMax ?? 0) * 10) / 10;
    st.supported = Boolean(seg?.gpuSupported);
    // Marked, not corrected: on Apple/Metal the timer query reports wall
    // time, so the figure is an upper bound, not the pass's work (0084 r11).
    st.wall = Boolean(seg?.gpuWallTimeOnly);
    st.tris = mean(g.triSamples);
    st.calls = Math.round(mean(g.callSamples));
    st.cpu = Math.round(mean(g.cpuSamples) * 10) / 10;
    st.cpuMax = Math.round(maxOf(g.cpuMaxWindow) * 10) / 10;
    st.lastTris = g.triSamples[g.triSamples.length - 1] ?? 0;
    meanBuckets(g.bucketSamples, st.buckets);
    (window as unknown as { __STUDIO_GPU_MS__?: FrameGpuStats }).__STUDIO_GPU_MS__ = st;
  }, -100);

  // The frame's last hook: every render of the frame (the water pipeline
  // renders at priority 1) has happened, so this closes the main-thread span
  // the -100 callback opened and the last segment of both clocks with it.
  useFrame(() => {
    if (ownsRender) {
      // r3f skips its own render whenever any priority > 0 hook exists, so
      // with `&water=0` (no pipeline) this hook is the frame's render.
      // Shadow cadence mirrors the pipeline's: cascades every OTHER frame.
      gl.shadowMap.autoUpdate = false;
      if ((ownFrames.current & 1) === 0) gl.shadowMap.needsUpdate = true;
      ownFrames.current += 1;
      segments?.cpuMark("scene");
      segments?.gpuMark("scene");
      gl.render(scene, camera);
    }
    segments?.cpuEnd();
    segments?.gpuEnd();
    segments?.collect();
    const g = gpu.current;
    if (g.cpuStart <= 0) return;
    const ms = performance.now() - g.cpuStart;
    g.cpuSamples.push(ms);
    if (g.cpuSamples.length > 60) g.cpuSamples.shift();
    g.cpuMaxWindow.push(ms);
    if (g.cpuMaxWindow.length > 120) g.cpuMaxWindow.shift();
  }, 1000);
  return null;
}

/**
 * DEV stutter line (decision 0082 round 2): the vegetation renderer's own
 * per-frame costs and visibility churn, polled from the debug object once a
 * second so the HUD never re-renders at frame rate. With `?veg=0` the
 * renderer is not mounted and the line carries the frame rate alone, which is
 * the A/B the owner reads. One line, DEV only.
 */
function VegetationHudLine() {
  const sample = useHudPoll<{ veg: VegetationStats | null; fps: number; gpu: FrameGpuStats | null }>(() => {
    const host = window as unknown as {
      __STUDIO_VEGETATION_DEBUG__?: VegetationStats;
      __STUDIO_FPS__?: number;
      __STUDIO_GPU_MS__?: FrameGpuStats;
    };
    return {
      veg: host.__STUDIO_VEGETATION_DEBUG__ ?? null,
      fps: host.__STUDIO_FPS__ ?? 0,
      gpu: host.__STUDIO_GPU_MS__ ?? null,
    };
  }, []);
  const { veg, fps, gpu } = sample;
  const gpuText = gpu
    ? `${gpu.supported ? `gpu ${gpu.wall ? "~" : ""}${gpu.avg}/${gpu.max} ms` : "gpu n/a"}`
      + ` · cpu ${gpu.cpu}/${gpu.cpuMax} ms · calls ${gpu.calls}`
    : "gpu n/a";
  if (!VEGETATION_ENABLED || !veg) {
    return (
      <span style={{ display: "block", opacity: 0.75 }}>
        {`veg: off · ${fps} fps · ${gpuText}`}
      </span>
    );
  }
  return (
    <span style={{ display: "block", opacity: 0.75 }}>
      {`veg: ${fps} fps · ${gpuText} · gate ${veg.gatingMs}/${veg.gatingMaxMs} ms`}
      {` · flip ${veg.flipMs}/${veg.flipMaxMs} ms (${veg.flipInstances})`}
      {` · pending ${veg.pendingBatches}`}
      {` · queue ${veg.queueMs}/${veg.queueMaxMs} ms ${veg.queueTop}`}
      {` · draws ${veg.draws} (ranges ${veg.instancedRanges})`}
    </span>
  );
}

/** The same DEV line for the groundcover ring, polled once a second. */
function GroundcoverHudLine() {
  const gc = useHudPoll<GroundcoverPerf | null>(() => (window as unknown as {
    __STUDIO_GROUNDCOVER_DEBUG__?: { perf?: GroundcoverPerf };
  }).__STUDIO_GROUNDCOVER_DEBUG__?.perf ?? null, []);
  if (!gc) return null;
  return (
    <span style={{ display: "block", opacity: 0.75 }}>
      {`gc: rebuilds ${gc.rebuildsPerSec}/s`}
      {` · gen ${gc.generateMs}/${gc.generateMaxMs} ms`}
      {` · tile ${gc.tileMs}/${gc.tileMaxMs} ms`}
      {` · phases grid ${gc.phaseGridMaxMs.toFixed(1)}`
        + ` · mask ${gc.phaseMaskMaxMs.toFixed(1)}`
        + ` · cand ${gc.phaseCandMaxMs.toFixed(1)} (${gc.phaseExact} exact)`
        + ` · compose ${gc.phaseComposeMaxMs.toFixed(1)}`}
      {` · fill ${gc.fillMs}/${gc.fillMaxMs} ms (${gc.fillInstances})`}
      {` · tiles ${gc.tilesLive}/${gc.tilesPending}`}
      {` · built ${gc.tilesBuilt} staled ${gc.cacheStaled} retiled ${gc.tilesRetiled}`}
      {` · mesh ${(gc.nearMeshTriangles / 1e6).toFixed(2)}M`}
    </span>
  );
}

/**
 * HUD line 3 (DEV): where the frame's triangles came from. Per source bucket
 * `main+shadow`, averaged over the same 60-frame window as the totals, so the
 * four pairs sum to the `tris` figure that opens the line. Independent of the
 * vegetation renderer: it is shown with `?veg=0` too, which is what makes the
 * A/B readable.
 */
function TriangleAttributionLine() {
  // useHudPoll snapshots: the published objects are rewritten in place
  const { gpu, veg, warm } = useHudPoll<{
    gpu: FrameGpuStats | null; veg: VegetationStats | null; warm: WarmGateState | null;
  }>(() => {
    const host = window as unknown as {
      __STUDIO_GPU_MS__?: FrameGpuStats;
      __STUDIO_VEGETATION_DEBUG__?: VegetationStats;
      __STUDIO_WARM__?: WarmGateState;
    };
    return { gpu: host.__STUDIO_GPU_MS__ ?? null, veg: host.__STUDIO_VEGETATION_DEBUG__ ?? null,
      warm: host.__STUDIO_WARM__ ?? null };
  }, []);
  if (!gpu) return null;
  const rung = veg?.trianglesByRung;
  const parts = TRI_BUCKETS.map((name, i) => {
    const main = gpu.buckets[bucketSlot(false, i)] ?? 0;
    const shadow = gpu.buckets[bucketSlot(true, i)] ?? 0;
    const text = `${name} ${millions(main)}+${millions(shadow)}`;
    // The rung split comes from the vegetation GATE, not from the draw calls
    // this line measures, so its four figures will not add up to `main`
    // exactly (`VegetationStats.trianglesByRung`).
    if (name !== "veg" || !rung) return text;
    return `${text} (near ${millions(rung.near)} · mid ${millions(rung.mid)}`
      + ` · far ${millions(rung.far)} · card ${millions(rung.card)})`;
  });
  const hidden = gpu.hiddenChunks !== undefined || gpu.hiddenSectors !== undefined
    ? ` · hidden ${gpu.hiddenChunks ?? 0}c/${gpu.hiddenSectors ?? 0}s` : "";
  return (
    <span style={{ display: "block", opacity: 0.75 }}>
      {`tris ${millions(gpu.tris)} / budget ${millions(FRAME_TRIANGLE_BUDGET)}:`
        + ` ${parts.join(" · ")}${hidden}${warm ? ` · warm ${warm.frames} ${warm.reason}` : ""}`}
    </span>
  );
}

/** The minimap subscribes for itself, for the same reason. */
function CharacterHudMinimap({ channel, mapCanvas, meta, bottomPx, overlay }: {
  channel: HudChannel;
  mapCanvas: HTMLCanvasElement;
  meta: MapMeta;
  bottomPx: number;
  overlay?: MinimapOverlay | null;
}) {
  const hud = useHud(channel);
  if (!hud) return null;
  return (
    <Minimap
      mapCanvas={mapCanvas}
      meta={meta}
      xKm={hud.xKm}
      zKm={hud.zKm}
      headingDeg={hud.headingDeg}
      bottomPx={bottomPx}
      overlay={overlay}
    />
  );
}

/** Dev stats: the warm gate's frame count and why it opened (HUD tris line, `__STUDIO_WARM__`). */
function publishWarm(state: WarmGateState) {
  if (STUDIO_TOOLS) (window as unknown as { __STUDIO_WARM__?: WarmGateState }).__STUDIO_WARM__ = { ...state };
}

/** The per-frame driver: input → locomotion → camera → HUD. Lives inside
 * <Physics> so its useFrame runs with the physics-stepped world. */
declare global {
  interface Window {
    __STUDIO_CHARACTER_DEBUG__?: {
      /** Sets the follow camera's yaw (radians; it looks along -sin, -cos). */
      aimCamera: (yaw: number, pitch?: number) => void;
      /** Turns the glow pass on/off in place (A/B probes; no-op under `?post=0`). */
      post: (on: boolean, tune?: { threshold?: number; knee?: number; strength?: number; skyMask?: number;
        skyThreshold?: number; skyKnee?: number }) => number;
      /** The glow pass's sky census (BloomPass `lastSkyCensus`); `request`
       * clears it and asks for the next frame's (probe-bloom-sky.mjs polls). */
      postSkyCensus: (request?: boolean) => SkyCensus | null;
      playerY: () => number | null;
      grounded: () => boolean;
      frames: () => number;
      movement: () => string;
      groundAt: (x: number, z: number) => number | null;
      rayDown: (x: number, z: number) => number | null;
      colliders: () => {
        shape: string; x: number; y: number; z: number; groups: number; fixed: boolean;
      }[];
      /** Follow-camera arm this frame (m) and its obstruction query (16h
       * check-in 2 item 3): the flash/camera probe reads both. */
      cameraArm: () => number;
      cameraCast: (from: [number, number, number], to: [number, number, number]) => number | null;
      /** Force one settlement rebuild (flash probe). */
      settlementRebuild: () => boolean;
      /** Drawn camera position and the body's position this frame (interior probe). */
      camera: () => [number, number, number];
      player: () => [number, number, number] | null;
      /** The door transition and the shown cell (InteriorDoors probe state). */
      interior: () => InteriorDoorsProbe | null;
      /** Visible drawables that write depth (probe-bloom-sky HUNT). */
      depthWriters: () => { uuid: string; path: string; type: string; mat: string; transparent: boolean }[];
      setVisible: (uuids: string[], on: boolean) => void;
    } & ReturnType<typeof walkHarnessHooks>;
  }
}

/** The boundary line, raised inside the canvas (it needs the frame loop) and
 * shown on the HUD line outside it. The game routes the same catalogue key
 * through its own system-message surface. */
function BoundaryMessage({ positionRef, extentM, onMessage }: {
  positionRef: React.MutableRefObject<{ x: number; z: number }>;
  extentM: number;
  onMessage: (message: string | null) => void;
}) {
  const message = useBoundaryMessage(positionRef, extentM);
  useEffect(() => { onMessage(message); }, [message, onMessage]);
  return null;
}

function CharacterDriver({ handleRef, world, active, spawn, locomotion, animationTimeRef, speedMultiplierRef, supportYRef, focusRef, extentM, onHud, onPositionKm, onWaterContact, playerModelRef, settlementRebuildRef, interaction, interiorProbeRef, bloom }: {
  handleRef: React.RefObject<EcctrlHandle | null>;
  /** The glow pass, toggled in place by the debug hook's `post` (A/B probes). */
  bloom: BloomPass | null;
  world: ChunkWorld;
  /** Colliders mounted AND rendering warm — physics steps only when true. */
  active: boolean;
  spawn: Vec3;
  locomotion: ExplorerLocomotion;
  animationTimeRef: React.MutableRefObject<number>;
  speedMultiplierRef: React.MutableRefObject<number>;
  supportYRef: React.MutableRefObject<number>;
  focusRef: React.MutableRefObject<{ x: number; z: number }>;
  /** The square of built ground; the safety net never sets the player outside it. */
  extentM: number;
  onHud: (state: CharacterHudState) => void;
  onPositionKm: (xKm: number, zKm: number) => void;
  /** Live water contact for churn foam + splash events (Phase 8b). */
  onWaterContact?: (x: number, y: number, z: number, verticalVel: number, delta: number) => void;
  /** The drawn player model, faded when the camera arm is short. */
  playerModelRef?: React.RefObject<THREE.Group | null>;
  /** The settlement layer's probe rebuild handle, exposed on the debug hook. */
  settlementRebuildRef?: React.MutableRefObject<(() => void) | null>;
  /** Resolved once per frame after the input update (interaction/arbiter.ts). */
  interaction: InteractionArbiter;
  /** The interior doors' probe state, exposed on the debug hook. */
  interiorProbeRef?: { current: (() => InteriorDoorsProbe) | null };
}) {
  const rapier = useRapier();
  // depend on the map, not the context: a new adapter re-arms the spawn teleport (owner 2026-09-22: reset every 3 s)
  const adapter: PlayerMovementController = useMemo(
    () => new EcctrlAdapter(handleRef, rapier.rigidBodyStates),
    [handleRef, rapier.rigidBodyStates],
  );
  const segments = useFrameSegments();
  // the glow pass's sun disc follows the light rig's sun (BloomPass sunHaloDeg)
  useFrame(() => {
    // the rig the sky drew this frame (its latitude), never a default rebuild
    const rig = bloom ? drawnLightRigOf(scene) : null;
    if (!bloom || !rig) return;
    const d = rig.sun.direction;
    bloom.sunDirection.set(d.x, d.y, d.z);
  });
  // Sky look-up is the shared default (owner 2026-08-25) — no override needed.
  const camera3P = useMemo(() => new FollowCamera(), []);
  // The arm collides with settlement and terrain colliders (16h check-in 2
  // item 3): one ball cast through the shared physics world, injected.
  const cameraCast = useMemo(() => rapierCameraObstruction(rapier), [rapier]);
  useEffect(() => {
    camera3P.setObstruction(cameraCast);
    return () => camera3P.setObstruction(null);
  }, [camera3P, cameraCast]);
  const { camera, scene, gl } = useThree();
  // Both fade programs of every player material linked ahead of the first
  // fade (playerFade.ts warmPlayerFadePrograms), the player held hidden until
  // the first set links (gatePlayerFirstShow); checked every frame after
  // that, so equipment attached later stays hidden until its programs link.
  const fadeLinker = useMemo(() => new DrawTargetLinker(gl, scene), [gl, scene]);
  useEffect(() => { fadeLinker.attach(); return () => fadeLinker.detach(); }, [fadeLinker]);
  const fadePinCompile = useMemo(() => (object: THREE.Object3D) =>
    fadeLinker.compileAsync(object, camera).catch(() => undefined), [fadeLinker, camera]);
  const position = useMemo(() => new THREE.Vector3(), []);
  const lastPosition = useRef(new THREE.Vector3());
  const stepAccum = useRef(0);
  // Fixed-step interpolation state for the DRAWN body (see the <Physics>
  // comment). `prev`/`curr` bracket the last physics step; `visual*` is the
  // pose at `alpha` between them and is what the camera, the foot-IK support
  // plane and the character's Object3D all use. Allocated once.
  const prevPos = useMemo(() => new THREE.Vector3(), []);
  const currPos = useMemo(() => new THREE.Vector3(), []);
  const prevQuat = useMemo(() => new THREE.Quaternion(), []);
  const currQuat = useMemo(() => new THREE.Quaternion(), []);
  const visualPos = useMemo(() => new THREE.Vector3(), []);
  const visualQuat = useMemo(() => new THREE.Quaternion(), []);
  const poseSeeded = useRef(false);
  const netTimer = useRef(0);
  const cameraDir = useMemo(() => new THREE.Vector3(), []);
  const initialised = useRef(false);
  const hudTimer = useRef(0);
  const urlTimer = useRef(0);
  const frameCount = useRef(0);
  // The walk harness hides the drawn body for its static judged shots (walkHarnessHooks hidePlayer).
  const playerHiddenRef = useRef(false);

  // Validation hook for headless probes: compare the live physics world
  // against the CPU-side environment query.
  useEffect(() => {
    window.__STUDIO_CHARACTER_DEBUG__ = {
      frames: () => frameCount.current,
      movement: () => JSON.stringify(input.movement),
      playerY: () => (adapter.ready ? adapter.position(position).y : null),
      grounded: () => adapter.isGrounded(),
      groundAt: (x, z) => world.groundHeight(x, z),
      rayDown: (x, z) => {
        const ray = new rapier.rapier.Ray({ x, y: 2000, z }, { x: 0, y: -1, z: 0 });
        const hit = rapier.world.castRay(ray, 4000, true);
        return hit ? 2000 - hit.timeOfImpact : null;
      },
      colliders: () => {
        const out: {
          shape: string; x: number; y: number; z: number; groups: number; fixed: boolean;
        }[] = [];
        rapier.world.forEachCollider((c) => {
          const t = c.translation();
          out.push({ shape: String(c.shape.type), x: t.x, y: t.y, z: t.z,
            groups: c.collisionGroups() >>> 0, fixed: c.parent()?.isFixed() ?? false });
        });
        return out;
      },
      cameraArm: () => camera3P.arm,
      aimCamera: (yaw, pitch) => {
        camera3P.yaw = yaw;
        if (pitch !== undefined) camera3P.pitch = Math.min(FOLLOW_CAMERA.maxPitch, Math.max(FOLLOW_CAMERA.minPitch, pitch));
      },
      post: (on, tune) => {
        if (!bloom) return 0;
        bloom.enabled = on;
        if (tune?.threshold !== undefined) bloom.threshold.value = tune.threshold;
        if (tune?.knee !== undefined) bloom.knee.value = tune.knee;
        if (tune?.strength !== undefined) bloom.strength.value = tune.strength;
        if (tune?.skyMask !== undefined) bloom.skyMask.value = tune.skyMask;
        if (tune?.skyThreshold !== undefined) bloom.skyThreshold.value = tune.skyThreshold;
        if (tune?.skyKnee !== undefined) bloom.skyKnee.value = tune.skyKnee;
        return bloom.lastExposure;
      },
      postSkyCensus: (request) => {
        if (!bloom) return null;
        if (request) bloom.requestSkyCensus();
        return bloom.lastSkyCensus;
      },
      cameraCast: (from, to) => cameraCast(
        new THREE.Vector3(...from), new THREE.Vector3(...to), FOLLOW_CAMERA.collisionRadius,
        FOLLOW_CAMERA.pivotRadius),
      settlementRebuild: () => {
        const rebuild = settlementRebuildRef?.current;
        rebuild?.();
        return Boolean(rebuild);
      },
      camera: () => [camera.position.x, camera.position.y, camera.position.z],
      player: () => {
        if (!adapter.ready) return null;
        const p = adapter.position(new THREE.Vector3());
        return [p.x, p.y, p.z];
      },
      interior: () => interiorProbeRef?.current?.() ?? null,
      // Probe-only: visible drawables that write depth (the sun-texel depth
      // hunt), and a toggle by uuid so a probe can bisect which covers a pixel.
      depthWriters: () => {
        const out: { uuid: string; path: string; type: string; mat: string; transparent: boolean }[] = [];
        scene.traverseVisible((o) => {
          const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
          if (!m) return;
          const mats = Array.isArray(m) ? m : [m];
          if (!mats.some((x) => x.depthWrite && x.visible)) return;
          let path = "";
          for (let q: THREE.Object3D | null = o; q; q = q.parent) path = `${q.name || q.type}/${path}`;
          out.push({ uuid: o.uuid, path, type: o.type, mat: mats.map((x) => x.type).join(","), transparent: mats.some((x) => x.transparent) });
        });
        return out;
      },
      setVisible: (uuids: string[], on: boolean) => {
        for (const u of uuids) { const o = scene.getObjectByProperty("uuid", u); if (o) o.visible = on; }
      },
      ...walkHarnessHooks({ teleportBody: (p) => (adapter as EcctrlAdapter).teleport(p), groundAt: (x, z) => world.groundHeight(x, z),
        bodyCentreHeight: CHARACTER_BODY_CENTER_HEIGHT, focusRef, camera: camera3P,
        cameraPos: () => [camera.position.x, camera.position.y, camera.position.z],
        player: () => (adapter.ready ? (adapter.position(new THREE.Vector3()).toArray() as [number, number, number]) : null),
        interior: () => interiorProbeRef?.current?.() ?? null, interaction, playerHidden: playerHiddenRef }),
    };
    return () => { delete window.__STUDIO_CHARACTER_DEBUG__; };
  }, [adapter, world, rapier, position, camera3P, cameraCast, settlementRebuildRef, camera, interiorProbeRef, bloom, scene, focusRef, interaction]);

  useEffect(() => {
    const detach = input.attach();
    const unregister = actorRegistry.register({
      id: "studio-player",
      kind: "player",
      position: (out) => {
        adapter.position(position);
        out.x = position.x; out.y = position.y; out.z = position.z;
        return out;
      },
      targetable: () => true,
      alive: () => true,
    });
    return () => { detach(); unregister(); };
  }, [adapter, position]);

  // Character + physics stage of the frame (decision 0084 round 10). The HUD
  // splits it: "physics" is the fixed-step rapier loop, "char" the driver
  // around it; "combat", "actors" and "surface" claim their own hooks and
  // "other" is what no hook claims, all of which the "char" row used to
  // absorb (walk 5 perf).
  useMarkedFrame("char", (_, rawDelta) => driveCharacter(rawDelta));
  const driveCharacter = (rawDelta: number) => {
    frameCount.current += 1;
    const delta = Math.min(rawDelta, 1 / 30);
    // Bounded fixed-step physics (Physics is mounted `paused`): at most 3
    // steps of 1/60 s per rendered frame, EXCESS TIME DROPPED — a slow frame
    // makes the world run briefly slow, never burst-step. See the <Physics>
    // comment for why the library's own loop cannot be used here.
    const DT = 1 / 60;
    if (adapter.ready && !poseSeeded.current) {
      adapter.readPose(currPos, currQuat);
      prevPos.copy(currPos);
      prevQuat.copy(currQuat);
      poseSeeded.current = true;
    }
    if (!active) {
      // Nothing steps, so there is nothing to interpolate: track the body
      // exactly. Without this the seeded pose would be stamped on every frame
      // and the spawn teleport (a useEffect, outside the step loop) would
      // never reach the drawn character.
      adapter.readPose(currPos, currQuat);
      prevPos.copy(currPos);
      prevQuat.copy(currQuat);
    } else {
      segments?.cpuMark("physics");
      stepAccum.current = Math.min(stepAccum.current + rawDelta, 3 * DT);
      while (stepAccum.current >= DT) {
        prevPos.copy(currPos);
        prevQuat.copy(currQuat);
        rapier.step(DT);
        adapter.readPose(currPos, currQuat);
        // A teleport (respawn, `?x=&z=` load, the safety net) is not motion:
        // interpolating across it would drag the body through the province.
        if (prevPos.distanceToSquared(currPos) > 25) {
          prevPos.copy(currPos);
          prevQuat.copy(currQuat);
        }
        stepAccum.current -= DT;
        // Contacts follow simulated time and actual substeps. Discarded
        // wall time must neither dilute current-relative speed nor turn
        // a low-FPS frame into a false teleport/suspended contact.
        if (adapter.ready) {
          adapter.position(position);
          onWaterContact?.(position.x, position.y, position.z, adapter.verticalVelocity(), DT);
        }
      }
      segments?.cpuMark("char");
    }
    input.update();
    const intent = inputToIntent(input);
    if (!adapter.ready) return;
    adapter.position(position);
    interaction.resolve({ x: position.x, z: position.z }, input.pressed("activate"));
    // `activate` shares the pad's bottom face button with dodge (io/input.ts):
    // a press that used something is swallowed until released, so it never
    // becomes a sprint or a roll.
    if (interaction.activated) input.suppressHeld();
    // The drawn pose for THIS frame: `prev`→`curr` at the leftover fraction of
    // a fixed step. Written straight onto the Object3D @react-three/rapier
    // syncs from the body, AFTER its own (stale, un-interpolated) write and
    // after ecctrl's — later write in the frame wins, and r3r overwrites it
    // again next frame, where we override again.
    const alpha = Math.min(1, Math.max(0, stepAccum.current / DT));
    visualPos.copy(prevPos).lerp(currPos, alpha);
    visualQuat.copy(prevQuat).slerp(currQuat, alpha);
    adapter.applyVisualPose(visualPos, visualQuat);
    animationTimeRef.current += delta;
    // Blow-up recovery: a physics excursion (NaN or a >40 m single-frame
    // jump) must never leave the camera lerping across the province — reseat
    // the body on the ground and hard-reset the camera behind it.
    if (!Number.isFinite(position.x + position.y + position.z)) {
      const f = focusRef.current;
      const ground = world.groundHeight(f.x, f.z) ?? 100;
      adapter.teleport({ x: f.x, y: ground + CHARACTER_BODY_CENTER_HEIGHT + 0.15, z: f.z });
      initialised.current = false;
      return;
    }
    if (!initialised.current) {
      initialised.current = true;
      lastPosition.current.copy(position);
      camera3P.reset(visualPos, Math.PI);
      camera3P.applyTo(camera);
      return;
    }
    if (position.distanceToSquared(lastPosition.current) > 1600) {
      // A teleport (a door, `?interior=`, the safety net) that landed after
      // this frame's steps: the interpolated pose still holds the old place,
      // kilometres away (walk 2 D2). Reseat the drawn pose on the body and
      // put the camera behind the player, looking the way it now faces.
      adapter.readPose(currPos, currQuat);
      prevPos.copy(currPos);
      prevQuat.copy(currQuat);
      visualPos.copy(currPos);
      visualQuat.copy(currQuat);
      adapter.applyVisualPose(visualPos, visualQuat);
      camera3P.reset(visualPos, yawOf(currQuat));
    }
    lastPosition.current.copy(position);
    locomotion.update(adapter, intent, camera3P.yaw, delta);
    speedMultiplierRef.current = locomotion.animationSpeed;
    // Keep the grounding solve's support plane on whatever the actor STANDS
    // ON (rock, quay, floor), falling back to the terrain. See visualSupport.ts
    // for the landing-into-a-boulder defect the terrain-only plane caused.
    supportYRef.current = visualSupportY(
      adapter.supportHeight(), world.groundHeight(visualPos.x, visualPos.z), visualPos.y);
    camera3P.update(intent.camera, visualPos, delta);
    // Fallback outside the terrain collider ring: the CPU height clamp.
    const cameraGround = world.groundHeight(camera3P.position.x, camera3P.position.z);
    if (cameraGround !== null && camera3P.position.y < cameraGround + 0.6) {
      camera3P.position.y = cameraGround + 0.6;
    }
    camera3P.applyTo(camera);
    if (playerModelRef?.current && gatePlayerFirstShow(playerModelRef.current, fadeLinker.observed, fadePinCompile)) {
      warmPlayerFadePrograms(playerModelRef.current, fadePinCompile);
      fadePlayerModel(playerModelRef.current, playerHiddenRef.current ? 0 : playerOpacityForArm(camera3P.arm));
    }
    focusRef.current = { x: position.x, z: position.z };

    // Streaming safety net: anything that truly slips under the terrain is
    // set back on the surface. The CPU height alone must NOT trigger it —
    // on slopes/streaming edges it can disagree with the colliders, and
    // teleporting onto a CPU height with no collider under it loops the
    // character through the sky (owner round 4). Require the PHYSICS world
    // to agree there is no floor below, and rate-limit.
    netTimer.current -= rawDelta;
    const groundBelow = world.groundHeight(position.x, position.z);
    const cpuSaysUnder =
      (groundBelow !== null && position.y < groundBelow - 60) || position.y < -600;
    if (cpuSaysUnder && netTimer.current <= 0) {
      const ray = new rapier.rapier.Ray(
        { x: position.x, y: position.y - CHARACTER_BODY_CENTER_HEIGHT - 0.2, z: position.z },
        { x: 0, y: -1, z: 0 },
      );
      const support = rapier.world.castRay(ray, 150, true);
      if (!support || position.y < -600) {
        netTimer.current = 1.5;
        // Set back onto BUILT ground: past the boundary wall there is only
        // apron scenery with no collider under it (16d).
        const inside = (v: number) => Math.max(2, Math.min(extentM - 2, v));
        adapter.teleport({ x: inside(position.x), y: (groundBelow ?? 100) + CHARACTER_BODY_CENTER_HEIGHT + 1, z: inside(position.z) });
      }
    }

    // Wall-clock timers (rawDelta): the HUD must stay live even when the
    // render loop runs slower than the physics clamp.
    hudTimer.current -= rawDelta;
    if (hudTimer.current <= 0) {
      hudTimer.current = 0.15;
      camera.getWorldDirection(cameraDir);
      const contact = world.queryEnvironment({ x: position.x, y: position.y, z: position.z });
      onHud({
        xKm: position.x / 1000,
        zKm: position.z / 1000,
        altM: position.y,
        chunk: world.chunkCellAt(position.x, position.z),
        groundMaterial: contact.groundMaterial,
        region: contact.regionId,
        waterDepth: contact.water?.depth,
        waterBody: contact.water?.waterBodyId ?? undefined,
        dayPhase: contact.light?.dayPhase,
        visibilityM: contact.light?.visibilityM,
        headingDeg: headingOf(cameraDir.x, cameraDir.z).deg,
        speed: adapter.moveSpeed(),
        grounded: adapter.isGrounded(),
      });
    }
    urlTimer.current -= rawDelta;
    if (urlTimer.current <= 0) {
      urlTimer.current = 3;
      onPositionKm(position.x / 1000, position.z / 1000);
    }
  };

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!adapter.ready) return;
      adapter.teleport(spawn);
      window.clearInterval(timer);
    }, 50);
    return () => window.clearInterval(timer);
  }, [adapter, spawn]);

  return null;
}

/** Heading of a body's +z axis about world up, radians (the FollowCamera `reset` convention). */
function yawOf(q: THREE.Quaternion): number {
  const z = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  return Math.atan2(z.x, z.z);
}
