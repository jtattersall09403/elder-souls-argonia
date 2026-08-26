import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Physics, useRapier } from "@react-three/rapier";
import * as THREE from "three";
import type { EcctrlHandle } from "ecctrl";
import type { Vec3 } from "@elder-souls/contracts";
import { EcctrlAdapter, PlayerBody, SkyrimFighter } from "@elder-souls/character";
import { FollowCamera, FOLLOW_CAMERA } from "@elder-souls/game-core/camera/followCamera";
import { ExplorerLocomotion } from "@elder-souls/game-core/locomotion/explorerLocomotion";
import { input } from "@elder-souls/game-core/io/input";
import { inputToIntent } from "@elder-souls/game-core/combat/intent";
import { actorRegistry } from "@elder-souls/game-core/combat/actorRegistry";
import {
  CHARACTER_BODY_CENTER_HEIGHT,
  CHARACTER_MODEL_OFFSET,
} from "@elder-souls/game-core/physics/characterPhysics";
import { resolveCapabilityProfile } from "@elder-souls/game-core/physics/capabilityProfiles";
import { useEquippedLoadout, useWornArmour } from "@elder-souls/game-core/inventory/store";
import { RACE_IDS, type RaceId } from "@elder-souls/game-core/actors/races";
import { sharedChunkStore, type ChunksManifest } from "./chunkStore";
import { ChunkWorld } from "./chunkWorld";
import { ChunkTerrain } from "./ChunkTerrain";
import { ChunkColliders } from "./ChunkColliders";
import { TouchControls } from "./TouchControls";
import { WorldSky } from "../sky/WorldSky";
import { SeaPlane } from "../sky/SeaPlane";
import { DistantLands } from "../sky/DistantLands";
import { headingOf } from "../compass";

/**
 * Physical-character mode (master plan §66 "Physical character", Phase 7):
 * the combat sandbox's character walking the real province — Rapier
 * heightfield collision from the chunk compiler's LOD-1 grids, the sandbox's
 * grounded ecctrl movement behind `PlayerMovementController`, its follow
 * camera, and desktop/touch/gamepad input parity. The HUD doubles as the
 * environment-query probe: position, chunk, ground material, region, water.
 */

export interface CharacterHudState {
  xKm: number;
  zKm: number;
  altM: number;
  chunk: [number, number];
  groundMaterial?: string;
  region?: string;
  waterDepth?: number;
  /** From the environment query's TimeLightSample (module 55 §94). */
  dayPhase?: string;
  visibilityM?: number;
  /** Camera compass heading (world north = −Z), degrees clockwise from N. */
  headingDeg: number;
  speed: number;
  grounded: boolean;
}

export function CharacterMode({ spawnKm, raceId, profileId, matSet, tintStrength, exaggeration, onExaggeration, lookupRegion, onPositionKm, onExit, onFlyHere }: {
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
  const [hud, setHud] = useState<CharacterHudState | null>(null);
  const player = useRef<EcctrlHandle | null>(null);
  const focusRef = useRef({ x: spawnKm.x * 1000, z: spawnKm.z * 1000 });
  const glRef = useRef<HTMLCanvasElement | null>(null);
  const [touch, setTouch] = useState(false);
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
        const x = spawnKm.x * 1000;
        const z = spawnKm.z * 1000;
        const [cx, cy] = world.chunkCellAt(x, z);
        const ring: Promise<unknown>[] = [];
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (store.chunkAt(cx + dx, cy + dy)) ring.push(store.load(cx + dx, cy + dy, "1"));
          }
        }
        await Promise.all(ring);
        if (cancelled) return;
        const ground = world.groundHeight(x, z) ?? 50;
        supportYRef.current = ground;
        setSpawn({ x, y: Math.max(ground, 0) + CHARACTER_BODY_CENTER_HEIGHT + 0.4, z });
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

  const extentM = manifest ? manifest.grid[0] * manifest.chunkMetres : 22460;

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
      {manifest && spawn ? (
        <Canvas
          camera={{ fov: FOLLOW_CAMERA.fieldOfView, near: 0.3, far: 60000, up: [0, 1, 0] }}
          shadows="soft"
          style={{ width: "100%", height: "100%" }}
          onCreated={({ gl }) => { glRef.current = gl.domElement; }}
          onPointerDown={() => { if (!touch) glRef.current?.requestPointerLock(); }}
        >
          {/* Natural light and sky (Phase 8a): terrain, character and sea are
              lit by the same sun/moon/sky rig, shadows and exposure as the
              flyover — WorldSky replaces the old per-mode light sets. */}
          <WorldSky mode="character" extentM={extentM}>
          <Suspense fallback={null}>
            <ChunkTerrain
              store={store}
              manifest={manifest}
              focusRef={focusRef}
              matSet={matSet}
              tintStrength={tintStrength}
              verticalScale={verticalScale}
            />
          </Suspense>
          {/* sea */}
          <SeaPlane extentM={extentM} levelM={0} />
          <DistantLands extentM={extentM} verticalScale={verticalScale} />
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
            <ChunkColliders store={store} manifest={manifest} focusRef={focusRef}
              verticalScale={verticalScale} onReady={() => setCollidersReady(true)} />
            <PlayerBody handleRef={player} position={[spawn.x, spawn.y, spawn.z]} rotationY={Math.PI}>
              <Suspense fallback={null}>
                <SkyrimFighter
                  animationCommandRef={animationCommandRef}
                  animationTimeRef={animationTimeRef}
                  speedMultiplierRef={speedMultiplierRef}
                  weaponProfile={loadout.mainHand.visual}
                  offHandProfile={loadout.offHand?.visual ?? null}
                  armour={armour}
                  raceId={race}
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
              onHud={setHud}
              onPositionKm={onPositionKm}
            />
          </Physics>
          </Suspense>
          </WorldSky>
        </Canvas>
      ) : (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#e6ecf5" }}>
          Loading terrain around the spawn…
        </div>
      )}
      <div style={{
        position: "absolute", top: 10, left: 10, display: "flex", gap: 10, alignItems: "center",
        background: "rgba(10,14,20,0.8)", padding: "8px 12px", borderRadius: 8, flexWrap: "wrap",
        color: "#e6ecf5", font: "13px system-ui",
      }}>
        <button onClick={onExit} style={{ padding: "4px 10px", cursor: "pointer" }}>← Map</button>
        <button onClick={() => hud && onFlyHere(hud.xKm, hud.zKm)} style={{ padding: "4px 10px", cursor: "pointer" }}>✈ Fly here</button>
        {onExaggeration && (
          <label>vertical ×{verticalScale}{" "}
            <input type="range" min={1} max={6} step={0.5} value={verticalScale}
              onChange={(e) => onExaggeration(Number(e.target.value))} />
          </label>
        )}
        <span>race {race} · profile {profile.id}</span>
        {hud && (
          <span style={{ opacity: 0.9 }}>
            {hud.xKm.toFixed(2)} km E · {hud.zKm.toFixed(2)} km S · alt {hud.altM.toFixed(1)} m
            {" · "}chunk {hud.chunk[0]},{hud.chunk[1]}
            {hud.groundMaterial ? ` · ${hud.groundMaterial}` : ""}
            {hud.region && hud.region !== "unknown" ? ` · ${hud.region}` : ""}
            {hud.waterDepth !== undefined ? ` · water ${hud.waterDepth.toFixed(1)} m deep` : ""}
            {hud.dayPhase ? ` · ${hud.dayPhase}` : ""}
            {hud.visibilityM !== undefined ? ` · vis ~${hud.visibilityM} m` : ""}
            {" · "}{["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(hud.headingDeg / 45) % 8]} {Math.round(hud.headingDeg)}°
            {" · "}{hud.grounded ? `${hud.speed.toFixed(1)} m/s` : "airborne"}
          </span>
        )}
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
      {touch && <TouchControls />}
    </div>
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

function CharacterDriver({ handleRef, world, active, spawn, locomotion, animationTimeRef, speedMultiplierRef, supportYRef, focusRef, onHud, onPositionKm }: {
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
  onHud: (state: CharacterHudState) => void;
  onPositionKm: (xKm: number, zKm: number) => void;
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
    // Keep the grounding solve's support plane on the terrain under the actor.
    supportYRef.current = world.groundHeight(position.x, position.z)
      ?? position.y - CHARACTER_BODY_CENTER_HEIGHT;
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
        adapter.teleport({ x: position.x, y: (groundBelow ?? 100) + CHARACTER_BODY_CENTER_HEIGHT + 1, z: position.z });
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
