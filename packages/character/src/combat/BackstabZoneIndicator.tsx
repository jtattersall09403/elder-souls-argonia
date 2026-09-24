import { useFrame } from "@react-three/fiber";
import type { EcctrlHandle } from "ecctrl";
import { type RefObject, useEffect, useMemo, useRef } from "react";
import { CHARACTER_BODY_CENTER_HEIGHT } from "@elder-souls/game-core/physics/characterPhysics";
import { BACKSTAB_FACING_DOT, BACKSTAB_MAX_DISTANCE, BACKSTAB_MIN_DISTANCE, isBackstabPosition } from "@elder-souls/game-core/combat/weapon";
import { canBackstabState } from "@elder-souls/game-core/combat/backstab";
import * as THREE from "three";
import { EnemyRuntime } from "./enemyRuntime";

/**
 * Debug-only ground sector showing where a backstab can be initiated from:
 * the annular rear cone `isBackstabPosition` tests, drawn from the same
 * exported constants. Green while standing in it against an eligible enemy.
 */
export function BackstabZoneIndicator({ runtime, player }: { runtime: EnemyRuntime; player: RefObject<EcctrlHandle | null> }) {
  const mesh = useRef<THREE.Mesh>(null);
  const geometry = useMemo(() => {
    const halfAngle = Math.acos(-BACKSTAB_FACING_DOT);
    const sector = new THREE.RingGeometry(
      BACKSTAB_MIN_DISTANCE,
      BACKSTAB_MAX_DISTANCE,
      40,
      1,
      -halfAngle,
      halfAngle * 2,
    );
    sector.rotateX(-Math.PI / 2);
    return sector;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    const f = runtime.fighter;
    m.visible = f.health > 0;
    if (!m.visible) return;
    m.position.set(
      runtime.position.x,
      runtime.position.y - CHARACTER_BODY_CENTER_HEIGHT + 0.04,
      runtime.position.z,
    );
    // The sector is authored around local +X; +X world-aims down the enemy's
    // rear axis at yaw + π/2.
    m.rotation.y = f.yaw + Math.PI / 2;
    const handle = player.current;
    const material = m.material as THREE.MeshBasicMaterial;
    const offset = handle
      ? { x: handle.currPos.x - runtime.position.x, z: handle.currPos.z - runtime.position.z }
      : null;
    const inZone = Boolean(offset)
      && canBackstabState(f.state)
      && isBackstabPosition(
        { x: Math.sin(f.yaw), z: Math.cos(f.yaw) },
        offset!,
        Math.hypot(offset!.x, offset!.z),
      );
    material.color.set(inZone ? "#3dff7a" : "#ffb347");
    material.opacity = inZone ? 0.5 : 0.25;
  });
  return (
    <mesh ref={mesh} geometry={geometry} renderOrder={2}>
      <meshBasicMaterial transparent depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}
