import { Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Physics, useRapier } from "@react-three/rapier";
import { ShapeType } from '@dimforge/rapier3d-compat';
import * as THREE from "three";
import type { EcctrlHandle } from "ecctrl";
import { CanvasErrorBoundary, CanvasErrorBanner } from "../CanvasErrorBoundary";
import type { Vec3 } from "@elder-souls/contracts";
import { EcctrlAdapter, PlayerBody, SkyrimFighter } from "@elder-souls/character";
import { FollowCamera, FOLLOW_CAMERA } from "@elder-souls/game-core/camera/followCamera";
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
import { setWaterGroundHeight, sharedWaterAssets } from "../water/waterAssets";
import type { WaterWorld } from "@elder-souls/game-core/water/index";
import { WaterContactEmitter } from "@elder-souls/game-core/water/contactEmitter";
import { worldClock } from "../sky/timeState";
import { CityMarkers } from "../CityMarkers";
import { Vegetation, VEGETATION_ENABLED } from "../vegetation/Vegetation";
import { Groundcover } from "../vegetation/Groundcover";
import { SettlementLayer } from "@elder-souls/game-core/settlement/SettlementLayer";
import { useHiddenLayers } from "../ladder";
import { useApronManifest } from "../apronMaterials";
import { BoundaryWalls } from "@elder-souls/game-core/boundary/BoundaryWalls";
import { useBoundaryMessage } from "@elder-souls/game-core/boundary/useBoundaryMessage";
import { PROVINCE_EXTENT_M, TERRAIN_SUPPORT_EXTENT_M } from "../provinceScale";
import type { SettlementSolid } from "@elder-souls/game-core/settlement/types";
import { SettlementColliders } from "./SettlementColliders";
import { FrameWorkProvider } from "./FrameWorkProvider";
import { lastWeatherSample } from "../weather/weatherState";
import { headingOf } from "../compass";
import { Minimap } from "./Minimap";
import { TravelSockets } from "../travel/TravelSockets";
import type { MinimapOverlay } from "./minimapOverlay";
import { parseQuality, QUALITY_PRESETS, type QualitySettings } from "@elder-souls/game-core/core/quality";
import type { MapMeta } from "@elder-souls/game-core/hud/minimap";

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
  const [error, setError] = useState<string | null>(null);
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
  // cuts, and the fly modes keep their own full distances. `?q=` seeds it.
  const [quality, setQuality] = useState<QualitySettings>(() =>
    parseQuality(new URLSearchParams(window.location.search).get("q"), "medium"));
  // Settlement beacons in walk mode (owner round 6): on by default.
  const [showMarkers, setShowMarkers] = useState(true);
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
    return sample ? { rainIntensity: sample.rainIntensity, minuteOfDay: worldClock.now().minuteOfDay } : null;
  }, []);
  const handleSettlementSolids = useCallback((solids: SettlementSolid[]) => {
    settlementSolidsRef.current = solids;
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
  // …and until rendering is smooth: during load, shader compiles stall frames
  // for 100s of ms, and integrating the capsule through those stalls makes its
  // hover-spring oscillate visibly (the settle "jerking", owner 2026-08-25).
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
      <div style={{ position: "fixed", inset: 0, zIndex: 6, background: "#10141a", color: "#e6ecf5", display: "grid", placeItems: "center" }}>
        <div>
          <p>Character mode failed to load: {error}</p>
          <button onClick={onExit}>← Back to map</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 6, background: "#10141a" }}>
      {canvasError && <CanvasErrorBanner message={canvasError} />}
      {manifest && spawn ? (
        <Canvas
          camera={{ fov: FOLLOW_CAMERA.fieldOfView, near: 0.3, far: 60000, up: [0, 1, 0] }}
          // Cap pixel density — see Fly3D (8b round 2 perf); the quality
          // preset tightens it further on foot (fill rate is the retina tax).
          dpr={[1, quality.dprMax]}
          // "percentage" = PCFShadowMap, matching Fly3D: "soft" is deprecated
          // in three r184 and r3f re-applies it on every Canvas render, forcing
          // a shadow re-render each frame (WaterPipeline.tsx explains).
          shadows="percentage"
          style={{ width: "100%", height: "100%" }}
          onCreated={({ gl }) => { glRef.current = gl.domElement; }}
          onPointerDown={() => { if (!touch) glRef.current?.requestPointerLock(); }}
        >
          <CanvasErrorBoundary onError={setCanvasError}>
          {/* Walking-stutter fix (owner 2026-09-20): the per-crossing rebuilds
              below run as budgeted generator jobs on this queue. */}
          <FrameWorkProvider>
          {/* The HUD's frame rate is sampled HERE, inside the canvas, so
              `?veg=0` (no vegetation renderer mounted) still has one. */}
          <FrameRateProbe />
          {/* Natural light and sky (Phase 8a): terrain, character and sea are
              lit by the same sun/moon/sky rig, shadows and exposure as the
              flyover — WorldSky replaces the old per-mode light sets. */}
          <WorldSky mode="character" extentM={authoredExtentM} verticalScale={verticalScale}>
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
                <Groundcover
                  focusRef={focusRef}
                  baseUrl={import.meta.env.BASE_URL}
                  verticalScale={verticalScale}
                  quality={quality}
                  settlementsVisible={!hiddenLayers.has("settlements")}
                />
              </>
            )}
            {!hiddenLayers.has("settlements") && (
              <SettlementLayer
                baseUrl={base}
                focusRef={focusRef}
                groundAt={settlementGroundAt}
                quality={quality}
                environment={settlementEnvironment}
                onSolids={handleSettlementSolids}
              />
            )}
          </Suspense>
          {/* Phase 8b water: the compiled province surface + shared pipeline;
              the wading player feeds a churn ring for contact foam. */}
          {!hiddenLayers.has("water") && (
            <StudioWater
              base={import.meta.env.BASE_URL}
              verticalScale={verticalScale}
              farExtentM={12000}
              surfaceFocus={waterSurfaceFocus}
            />
          )}
          {showMarkers && <CityMarkers groundAt={markerGroundAt} />}
          <RenderWarmup armed={collidersReady} onWarm={() => setRenderWarm(true)} />
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
              accumulator, which is why it never showed there. */}
          <Physics key={verticalScale} gravity={[0, -9.81, 0]} timeStep={1 / 60} paused>
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
            {/* 16e: operator sockets, the talk prompt and the travel menu.
                16g: `travel_services` is the stage that sites them, so they
                are not mounted while the ladder hides the services layer —
                sockets from an older run stand where nothing was solved. */}
            {!hiddenLayers.has("services") && <TravelSockets
              positionRef={focusRef}
              groundAt={settlementGroundAt}
              teleportTo={teleportTo}
              baseUrl={base}
            />}
            {/* The edge of the world (16d): four invisible walls on the border
                of the built ground, and the one line the player gets there. */}
            <BoundaryWalls extentM={terrainExtentM} verticalScale={verticalScale} />
            <BoundaryMessage positionRef={focusRef} extentM={terrainExtentM} onMessage={setEdgeMessage} />
            <PlayerBody handleRef={player} position={[spawn.x, spawn.y, spawn.z]} rotationY={Math.PI}>
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
            </PlayerBody>
            <CharacterDriver
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
            />
          </Physics>
          </Suspense>
          </WorldSky>
          </FrameWorkProvider>
          </CanvasErrorBoundary>
        </Canvas>
      ) : (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#e6ecf5" }}>
          Loading terrain around the spawn…
        </div>
      )}
      <div style={{
        // Stop short of the fixed time panel (top-right) — it was covering
        // the tail of this bar (compass unreadable, owner round 6).
        position: "absolute", top: 10, left: 10, right: 360, display: "flex", gap: 10, alignItems: "center",
        background: "rgba(10,14,20,0.8)", padding: "8px 12px", borderRadius: 8, flexWrap: "wrap",
        color: "#e6ecf5", font: "13px system-ui",
      }}>
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
        <CharacterHud channel={hudChannel} />
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
function CharacterHud({ channel }: { channel: HudChannel }) {
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
      <VegetationHudLine />
      <GroundcoverHudLine />
    </span>
  );
}

/** A 60-frame rolling frame rate for the HUD line, published from inside the
 * canvas because the HUD is DOM and `useFrame` is not available to it. */
function FrameRateProbe() {
  const acc = useRef({ sum: 0, count: 0 });
  useFrame((_, delta) => {
    if (!import.meta.env.DEV) return;
    const a = acc.current;
    a.sum += delta; a.count++;
    if (a.count < 60) return;
    (window as unknown as { __STUDIO_FPS__?: number }).__STUDIO_FPS__ =
      Math.round(a.count / Math.max(a.sum, 1e-3));
    a.sum = 0; a.count = 0;
  });
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
  const [sample, setSample] = useState<
    { veg: VegetationStats | null; fps: number } | null>(null);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const host = window as unknown as {
      __STUDIO_VEGETATION_DEBUG__?: VegetationStats;
      __STUDIO_FPS__?: number;
    };
    const read = () => setSample({
      veg: host.__STUDIO_VEGETATION_DEBUG__ ?? null,
      fps: host.__STUDIO_FPS__ ?? 0,
    });
    read();
    const timer = window.setInterval(read, 1000);
    return () => window.clearInterval(timer);
  }, []);
  if (!sample) return null;
  const { veg, fps } = sample;
  if (!VEGETATION_ENABLED || !veg) {
    return (
      <span style={{ display: "block", opacity: 0.75 }}>
        {`veg: off · ${fps} fps`}
      </span>
    );
  }
  return (
    <span style={{ display: "block", opacity: 0.75 }}>
      {`veg: ${fps} fps · gate ${veg.gatingMs}/${veg.gatingMaxMs} ms`}
      {` · flip ${veg.flipMs}/${veg.flipMaxMs} ms (${veg.flipInstances})`}
      {` · pending ${veg.pendingBatches}`}
      {` · queue ${veg.queueMs}/${veg.queueMaxMs} ms ${veg.queueTop}`}
      {` · draws ${veg.draws}`}
    </span>
  );
}

/** The same DEV line for the groundcover ring, polled once a second. */
function GroundcoverHudLine() {
  const [gc, setGc] = useState<GroundcoverPerf | null>(null);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const host = window as unknown as {
      __STUDIO_GROUNDCOVER_DEBUG__?: { perf?: GroundcoverPerf };
    };
    const read = () => setGc(host.__STUDIO_GROUNDCOVER_DEBUG__?.perf ?? null);
    read();
    const timer = window.setInterval(read, 1000);
    return () => window.clearInterval(timer);
  }, []);
  if (!gc) return null;
  return (
    <span style={{ display: "block", opacity: 0.75 }}>
      {`gc: rebuilds ${gc.rebuildsPerSec}/s`}
      {` · gen ${gc.generateMs}/${gc.generateMaxMs} ms`}
      {` · fill ${gc.fillMs}/${gc.fillMaxMs} ms (${gc.fillInstances})`}
      {` · tiles ${gc.tilesLive}/${gc.tilesPending}`}
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

/** Unpauses physics only once frames flow smoothly: `armed` (colliders ready)
 * plus a run of consecutive sub-100 ms frames. A hard 3 s cap guarantees the
 * gate opens even on very slow devices. */
function RenderWarmup({ armed, onWarm }: { armed: boolean; onWarm: () => void }) {
  const smooth = useRef(0);
  const waited = useRef(0);
  const done = useRef(false);
  useFrame((_, delta) => {
    if (done.current || !armed) return;
    waited.current += delta;
    smooth.current = delta < 0.1 ? smooth.current + 1 : 0;
    if (smooth.current >= 5 || waited.current > 3) {
      done.current = true;
      onWarm();
    }
  });
  return null;
}

/** The per-frame driver: input → locomotion → camera → HUD. Lives inside
 * <Physics> so its useFrame runs with the physics-stepped world. */
declare global {
  interface Window {
    __STUDIO_CHARACTER_DEBUG__?: {
      playerY: () => number | null;
      grounded: () => boolean;
      frames: () => number;
      movement: () => string;
      groundAt: (x: number, z: number) => number | null;
      rayDown: (x: number, z: number) => number | null;
      colliders: () => { shape: string; x: number; y: number; z: number }[];
    };
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

function CharacterDriver({ handleRef, world, active, spawn, locomotion, animationTimeRef, speedMultiplierRef, supportYRef, focusRef, extentM, onHud, onPositionKm, onWaterContact }: {
  handleRef: React.RefObject<EcctrlHandle | null>;
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
}) {
  const adapter = useMemo(() => new EcctrlAdapter(handleRef), [handleRef]);
  // Sky look-up is the shared default (owner 2026-08-25) — no override needed.
  const camera3P = useMemo(() => new FollowCamera(), []);
  const { camera } = useThree();
  const rapier = useRapier();
  const position = useMemo(() => new THREE.Vector3(), []);
  const lastPosition = useRef(new THREE.Vector3());
  const stepAccum = useRef(0);
  const netTimer = useRef(0);
  const cameraDir = useMemo(() => new THREE.Vector3(), []);
  const initialised = useRef(false);
  const hudTimer = useRef(0);
  const urlTimer = useRef(0);
  const frameCount = useRef(0);

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
        const out: { shape: string; x: number; y: number; z: number }[] = [];
        rapier.world.forEachCollider((c) => {
          const t = c.translation();
          out.push({ shape: String(c.shape.type), x: t.x, y: t.y, z: t.z });
        });
        return out;
      },
    };
    return () => { delete window.__STUDIO_CHARACTER_DEBUG__; };
  }, [adapter, world, rapier, position]);

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

  useFrame((_, rawDelta) => {
    frameCount.current += 1;
    const delta = Math.min(rawDelta, 1 / 30);
    // Bounded fixed-step physics (Physics is mounted `paused`): at most 3
    // steps of 1/60 s per rendered frame, EXCESS TIME DROPPED — a slow frame
    // makes the world run briefly slow, never burst-step. See the <Physics>
    // comment for why the library's own loop cannot be used here.
    if (active) {
      const DT = 1 / 60;
      stepAccum.current = Math.min(stepAccum.current + rawDelta, 3 * DT);
      while (stepAccum.current >= DT) {
        rapier.step(DT);
        stepAccum.current -= DT;
        // Contacts follow simulated time and actual substeps. Discarded
        // wall time must neither dilute current-relative speed nor turn
        // a low-FPS frame into a false teleport/suspended contact.
        if (adapter.ready) {
          adapter.position(position);
          onWaterContact?.(position.x, position.y, position.z, adapter.verticalVelocity(), DT);
        }
      }
    }
    input.update();
    const intent = inputToIntent(input);
    if (!adapter.ready) return;
    adapter.position(position);
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
      camera3P.reset(position, Math.PI);
      camera3P.applyTo(camera);
      return;
    }
    if (position.distanceToSquared(lastPosition.current) > 1600) {
      camera3P.reset(position, camera3P.yaw - Math.PI);
    }
    lastPosition.current.copy(position);
    locomotion.update(adapter, intent, camera3P.yaw, delta);
    speedMultiplierRef.current = locomotion.animationSpeed;
    // Keep the grounding solve's support plane on whatever the actor STANDS
    // ON (rock, quay, floor), falling back to the terrain. See visualSupport.ts
    // for the landing-into-a-boulder defect the terrain-only plane caused.
    supportYRef.current = visualSupportY(
      adapter.supportHeight(), world.groundHeight(position.x, position.z), position.y);
    camera3P.update(intent.camera, position, delta);
    const cameraGround = world.groundHeight(camera3P.position.x, camera3P.position.z);
    if (cameraGround !== null && camera3P.position.y < cameraGround + 0.6) {
      camera3P.position.y = cameraGround + 0.6;
    }
    camera3P.applyTo(camera);
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
  });

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
