import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { useRapier } from "@react-three/rapier";
import type { RigidBody } from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { CATALOGUE, text } from "@elder-souls/text-catalogue";
import type { PlayerMovementController } from "@elder-souls/game-core/physics/PlayerMovementController";
import type { SettlementDoor } from "@elder-souls/game-core/settlement/types";
import { buildArchitectureKit } from "@elder-souls/game-core/settlement/kit";
import { createKitLoader } from "@elder-souls/game-core/assets/kitLoader";
import { useKitDecoders } from "@elder-souls/game-core/assets/useKitDecoders";
import { CAMERA_BLOCKING_GROUPS } from "@elder-souls/game-core/camera/cameraCollision";
import { bodySetAlive, captureBodySet } from "@elder-souls/game-core/physics/rapierWorldAlive";
import { InteriorLoader, solidsAt, type LoadedInterior } from "@elder-souls/game-core/interior/interiorLoader";
import { DoorTransition, type DoorPrompt } from "@elder-souls/game-core/interior/doorTransition";
import { InteriorEnvironment } from "@elder-souls/game-core/interior/interiorEnvironment";
import type { Vec3 } from "@elder-souls/game-core/interior/bundle";
import type { InteractionArbiter } from "@elder-souls/game-core/interaction/arbiter";
import type { KitCache } from "@elder-souls/game-core/settlement/kitCache";
import { input } from "@elder-souls/game-core/io/input";
import { settlementColliderDesc } from "./SettlementColliders";

type Shown = { interior: LoadedInterior; originM: Vec3 };

/**
 * Studio wiring for the interior runtime (0103 decision 4): the door
 * prompt (offered to the interaction arbiter, shown only when it is the
 * focus, tappable as the touch button), the fade, the cell's draw and colliders, and
 * `?interior=<cellId>` opening a cell directly. Everything that decides
 * lives in `game-core/interior`; this only mounts it. Inside <Physics>.
 */
export function InteriorDoors({
  baseUrl, controller, doors, groundAt, bodyCentreHeightM, directCellId, onInside, interaction, kitCache,
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
}) {
  const decoders = useKitDecoders(baseUrl);
  const { world, rapier } = useRapier();
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const [shown, setShown] = useState<Shown | null>(null);
  const [prompt, setPrompt] = useState<DoorPrompt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fadeEl = useRef<HTMLDivElement>(null);
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
      const p = controller.position(new THREE.Vector3());
      transition.openDirect(directCellId, { x: p.x, y: p.y, z: p.z });
    }
    transition.update(Math.min(delta, 0.1), (doorId) => interaction.answers(doorId));
    if (transition.candidate) interaction.offer(transition.candidate);
    environment.current?.frame();
    if (fadeEl.current) {
      fadeEl.current.style.opacity = String(directCellId && !opened.current ? 1 : transition.fade);
    }
    const next = transition.prompt && interaction.isFocused(transition.prompt.doorId) ? transition.prompt : null;
    if (next?.textId !== prompt?.textId || next?.doorId !== prompt?.doorId) setPrompt(next);
    const failed = transition.lastError?.message ?? null;
    if (failed !== error) setError(failed);
  });

  return (
    <>
      {shown && <primitive object={shown.interior.group} position={shown.originM} />}
      <Html fullscreen zIndexRange={[30, 20]} style={{ pointerEvents: "none" }}>
        <div ref={fadeEl} style={{ position: "absolute", inset: 0, background: "#000",
          opacity: directCellId ? 1 : 0 }} />
        {prompt && (
          <div data-door-prompt={prompt.kind} data-ui-capture
            // The prompt is the touch button: pressing it is `activate`.
            onPointerDown={(e) => { e.preventDefault(); input.setVirtual("activate", true); }}
            onPointerUp={() => input.setVirtual("activate", false)}
            onPointerCancel={() => input.setVirtual("activate", false)}
            onPointerLeave={() => input.setVirtual("activate", false)}
            style={{
              position: "absolute", bottom: "22%", left: "50%", transform: "translateX(-50%)",
              background: "rgba(10,14,20,0.8)", padding: "8px 18px", borderRadius: 8,
              font: "18px system-ui", color: "#ffd9a0", whiteSpace: "nowrap",
              pointerEvents: "auto", touchAction: "none", cursor: "pointer",
            }}>
            {text(CATALOGUE, prompt.textId)}
            {prompt.kind !== "closed" && <span style={{ opacity: 0.7 }}> [E]</span>}
          </div>
        )}
        {error && (
          <div style={{ position: "absolute", top: 140, left: 12, color: "#ff9a9a", font: "12px system-ui" }}>
            interior: {error}
          </div>
        )}
      </Html>
    </>
  );
}
