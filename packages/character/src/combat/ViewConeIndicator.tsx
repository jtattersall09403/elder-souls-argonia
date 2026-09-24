import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { CHARACTER_BODY_CENTER_HEIGHT } from "@elder-souls/game-core/physics/characterPhysics";
import type { Awareness } from "@elder-souls/game-core/perception/detection";
import * as THREE from "three";
import type { EnemyRuntime } from "./enemyRuntime";

/** Drawn radius cap, metres: the full view range would cover the arena. */
const DRAWN_RADIUS_CAP = 8;
const AWARENESS_COLOUR: Readonly<Record<Awareness, string>> = {
  unaware: "#9a9a9a",
  suspicious: "#ffb347",
  engaged: "#ff4a3d",
};

/**
 * Debug-only ground sector showing an enemy's view cone (decision 0092): the
 * archetype's half-angle, radius min(view range, 8 m), coloured by awareness
 * (grey unaware, amber suspicious, red engaged). Drawn with the weapon-volume
 * switch, like the other combat measuring kit.
 */
export function ViewConeIndicator({ runtime }: { runtime: EnemyRuntime }) {
  const mesh = useRef<THREE.Mesh>(null);
  const view = runtime.archetype.perception;
  const geometry = useMemo(() => {
    const halfAngle = THREE.MathUtils.degToRad(view.viewHalfAngleDegrees);
    const sector = new THREE.RingGeometry(0.3, Math.min(view.viewRangeMetres, DRAWN_RADIUS_CAP), 40, 1, -halfAngle, halfAngle * 2);
    sector.rotateX(-Math.PI / 2);
    return sector;
  }, [view.viewHalfAngleDegrees, view.viewRangeMetres]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    const f = runtime.fighter;
    m.visible = f.health > 0;
    if (!m.visible) return;
    m.position.set(runtime.position.x, runtime.position.y - CHARACTER_BODY_CENTER_HEIGHT + 0.03, runtime.position.z);
    // The sector is authored around local +X; after the ground rotation +X
    // world-aims down the enemy's facing at yaw − π/2.
    m.rotation.y = f.yaw - Math.PI / 2;
    (m.material as THREE.MeshBasicMaterial).color.set(AWARENESS_COLOUR[runtime.awareness.awareness]);
  });
  return (
    <mesh ref={mesh} geometry={geometry} renderOrder={1}>
      <meshBasicMaterial transparent opacity={0.22} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}
