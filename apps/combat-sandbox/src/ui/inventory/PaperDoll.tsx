import { Canvas } from "@react-three/fiber";
import { Suspense, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { createAnimationCommand } from "@elder-souls/game-core/anim/animationCommand";
import { CHARACTER_MODEL_OFFSET } from "@elder-souls/game-core/physics/characterPhysics";
import { SkyrimFighter } from "@elder-souls/character";
import { loadoutAnimationPacks } from "@elder-souls/game-core/equipment/animationPacks";
import { useEquippedLoadout, useWornArmour } from "@elder-souls/game-core/inventory/store";
import { usePlayerRace } from "@elder-souls/game-core/actors/raceStore";

/**
 * The character panel: the real production actor, holding what is actually
 * equipped.
 *
 * Deliberately the same `SkyrimFighter` the game fights with rather than a
 * separate preview path — a doll that renders its own way is a doll that can
 * silently disagree with the game about what you are wearing.
 */
function Doll() {
  const loadout = useEquippedLoadout();
  const armour = useWornArmour();
  const raceId = usePlayerRace();
  const command = useRef(createAnimationCommand(loadout.mainHand.animations.combatIdle));
  const time = useRef(0);
  const equipped = useRef(true);
  // The doll needs the same packs the fighter would download for this loadout.
  //
  // Without them it was handed no packs at all, so it had the core set and not
  // the weapon set — and a mixer asked for an action it does not have does not
  // error, it simply leaves the previous one playing. The doll therefore stood
  // in the neutral bind pose instead of the weapon's combat idle, which is what
  // "always a neutral stand" was. The same omission is why nothing was ever in
  // the off hand: the shield was not passed either.
  const packs = useMemo(() => loadoutAnimationPacks(loadout), [loadout]);

  // Keep the pose honest when the weapon changes: a greatsword idle is not a
  // sword idle, and the doll is meant to show what you would actually stand in.
  useLayoutEffect(() => {
    command.current = createAnimationCommand(loadout.mainHand.animations.combatIdle);
    time.current = 0;
  }, [loadout]);

  // The actor faces its own +Z and the camera looks down -Z from in front of
  // it, so no rotation is needed to meet the viewer's eye. The support plane
  // is where the model offset puts the soles, so the grounding solve leaves a
  // correctly standing figure alone instead of hunting for a floor.
  return (
    <SkyrimFighter
      animationCommandRef={command}
      animationTimeRef={time}
      weaponProfile={loadout.mainHand.visual}
      offHandProfile={loadout.offHand?.visual ?? null}
      animationPacks={packs}
      armour={armour}
      raceId={raceId}
      modelOffsetY={CHARACTER_MODEL_OFFSET}
      equipped
      equippedRef={equipped}
      visualSupportY={CHARACTER_MODEL_OFFSET}
    />
  );
}

export function PaperDoll({ loadoutKey }: { loadoutKey: string }) {
  // Framed to hold a 1.85 m figure whose soles sit at the model offset, with a
  // little headroom either end.
  const camera = useMemo(() => ({ fov: 32, position: [0, 0.02, 4.3] as [number, number, number] }), []);
  return (
    <Canvas
      key={loadoutKey}
      className="inv-doll-canvas"
      dpr={[1, 1.5]}
      camera={camera}
      gl={{ alpha: true, antialias: true }}
      onCreated={({ gl }) => { gl.outputColorSpace = THREE.SRGBColorSpace; }}
    >
      <ambientLight intensity={1.1} />
      <hemisphereLight intensity={0.9} color="#fff3d8" groundColor="#2a2418" />
      <directionalLight position={[2.4, 3.2, 3]} intensity={2.4} color="#fff6e2" />
      <directionalLight position={[-2.6, 1.4, -1.6]} intensity={0.9} color="#8ea6d8" />
      <Suspense fallback={null}>
        <Doll />
      </Suspense>
    </Canvas>
  );
}
