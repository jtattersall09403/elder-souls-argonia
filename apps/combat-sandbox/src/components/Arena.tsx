import { Instances, Instance, Sparkles } from "@react-three/drei";
import { CuboidCollider, RigidBody } from "@react-three/rapier";
import { useMemo } from "react";
import * as THREE from "three";
import { SANDBOX_POOL, SANDBOX_POOL_DECK, SANDBOX_POOL_WAY_OUT } from "@elder-souls/game-core/validation/sandboxPool";

/** Wall thickness around the pool, metres. */
const POOL_WALL = 0.3;
/** The arena slab is 0.3 m thick; the pool's east wall runs up to its underside. */
const ARENA_SLAB_BOTTOM = -0.3;

/**
 * The swimming pool west of the arena (decision 0093): basin, way out, deck
 * and a flat translucent water plane. `SANDBOX_POOL` is the one record of its
 * shape; the scene's water sampler reads the same record.
 */
function Pool() {
  const { minX, maxX, minZ, maxZ, surfaceY, floorY } = SANDBOX_POOL;
  const width = maxX - minX;
  const depth = maxZ - minZ;
  const centreX = (minX + maxX) / 2;
  const wallHeight = -floorY;
  const slabThickness = 0.2;
  // Each piece of the way out is a slab whose top face runs from (fromX, fromY)
  // to (toX, toY); the box centre sits half a thickness under the face's
  // midpoint, along its normal.
  const wayOut = SANDBOX_POOL_WAY_OUT.map(({ fromX, toX, fromY, toY }) => {
    const run = fromX - toX;
    const rise = toY - fromY;
    const angle = Math.atan2(rise, run);
    const centre: [number, number, number] = [
      (fromX + toX) / 2 - (slabThickness / 2) * Math.sin(angle),
      (fromY + toY) / 2 - (slabThickness / 2) * Math.cos(angle),
      0,
    ];
    return { key: fromX, length: Math.hypot(run, rise), angle, centre };
  });
  const deckWidth = SANDBOX_POOL_DECK.maxX - SANDBOX_POOL_DECK.minX;
  const deckCentreX = (SANDBOX_POOL_DECK.minX + SANDBOX_POOL_DECK.maxX) / 2;
  const sideWalls: [number, number, number][] = [
    [centreX, floorY / 2, maxZ + POOL_WALL / 2],
    [centreX, floorY / 2, minZ - POOL_WALL / 2],
  ];
  const eastWallHeight = ARENA_SLAB_BOTTOM - floorY;
  const eastWall: [number, number, number] = [maxX + POOL_WALL / 2, floorY + eastWallHeight / 2, 0];
  return (
    <group>
      <RigidBody type="fixed" colliders={false} friction={1}>
        <CuboidCollider args={[width / 2, 0.1, depth / 2]} position={[centreX, floorY - 0.1, 0]} />
        {sideWalls.map((position) => (
          <CuboidCollider key={position[2]} args={[width / 2, wallHeight / 2, POOL_WALL / 2]} position={position} />
        ))}
        <CuboidCollider args={[POOL_WALL / 2, eastWallHeight / 2, depth / 2]} position={eastWall} />
        {wayOut.map(({ key, length, angle, centre }) => (
          <CuboidCollider
            key={key}
            args={[length / 2, slabThickness / 2, depth / 2]}
            position={centre}
            rotation={[0, 0, -angle]}
          />
        ))}
        <CuboidCollider args={[deckWidth / 2, 0.15, depth / 2 + POOL_WALL]} position={[deckCentreX, -0.15, 0]} />
      </RigidBody>
      <mesh position={[centreX, floorY - 0.1, 0]} receiveShadow>
        <boxGeometry args={[width, 0.2, depth]} />
        <meshStandardMaterial color="#9fb0b2" roughness={0.95} />
      </mesh>
      {sideWalls.map((position) => (
        <mesh key={position[2]} position={position} receiveShadow castShadow>
          <boxGeometry args={[width, wallHeight, POOL_WALL]} />
          <meshStandardMaterial color="#b8c2c4" roughness={0.95} />
        </mesh>
      ))}
      <mesh position={eastWall} receiveShadow>
        <boxGeometry args={[POOL_WALL, eastWallHeight, depth]} />
        <meshStandardMaterial color="#b8c2c4" roughness={0.95} />
      </mesh>
      {/* The arena's round floor stops short of its square edge at the pool's corners; a lip fills it. */}
      <mesh position={[maxX + 0.4, -0.148, 0]} receiveShadow>
        <boxGeometry args={[0.8, 0.3, depth + 2 * POOL_WALL]} />
        <meshStandardMaterial color="#e8eceb" roughness={0.9} metalness={0.01} />
      </mesh>
      {wayOut.map(({ key, length, angle, centre }) => (
        <mesh key={key} position={centre} rotation={[0, 0, -angle]} receiveShadow castShadow>
          <boxGeometry args={[length, slabThickness, depth]} />
          <meshStandardMaterial color="#aab6b8" roughness={0.95} />
        </mesh>
      ))}
      <mesh position={[deckCentreX, -0.15, 0]} receiveShadow>
        <boxGeometry args={[deckWidth, 0.3, depth + 2 * POOL_WALL]} />
        <meshStandardMaterial color="#e8eceb" roughness={0.9} metalness={0.01} />
      </mesh>
      <mesh position={[centreX, surfaceY, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color="#4f8fa0" roughness={0.15} transparent opacity={0.55} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** The distant ground plane, with the pool's footprint cut out so the basin shows. */
function Backdrop() {
  const shape = useMemo(() => {
    const ground = new THREE.Shape();
    ground.absarc(0, 0, 40, 0, Math.PI * 2, false);
    // The plane is laid flat by a -90 degree turn about x: local y is world -z.
    const { minX, maxX, minZ, maxZ } = SANDBOX_POOL;
    const hole = new THREE.Path();
    hole.moveTo(minX, -(maxZ + POOL_WALL));
    hole.lineTo(maxX, -(maxZ + POOL_WALL));
    hole.lineTo(maxX, -(minZ - POOL_WALL));
    hole.lineTo(minX, -(minZ - POOL_WALL));
    hole.closePath();
    ground.holes.push(hole);
    return ground;
  }, []);
  return (
    <mesh position={[0, -0.35, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <shapeGeometry args={[shape, 64]} />
      <meshBasicMaterial color={new THREE.Color("#dce9ec")} />
    </mesh>
  );
}

function RingMarkings() {
  const rings = [3.4, 6.8, 10.2];
  return (
    <group position={[0, 0.025, 0]}>
      {rings.map((radius) => (
        <mesh key={radius} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <ringGeometry args={[radius - 0.035, radius + 0.035, 96]} />
          <meshStandardMaterial color="#aeb8bb" roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

export function Arena() {
  const pillarPositions: [number, number, number][] = [];
  for (let index = 0; index < 12; index += 1) {
    const angle = (index / 12) * Math.PI * 2;
    pillarPositions.push([Math.sin(angle) * 12.5, 1.55, Math.cos(angle) * 12.5]);
  }
  return (
    <group>
      <RigidBody type="fixed" colliders={false} friction={1}>
        <CuboidCollider args={[15, 0.15, 15]} position={[0, -0.15, 0]} />
        <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[15, 96]} />
          <meshStandardMaterial color="#e8eceb" roughness={0.9} metalness={0.01} />
        </mesh>
      </RigidBody>
      <RingMarkings />
      <Instances limit={12} castShadow receiveShadow>
        <cylinderGeometry args={[0.52, 0.66, 3.1, 10]} />
        <meshStandardMaterial color="#c9d0d1" roughness={0.9} />
        {pillarPositions.map((position, index) => (
          <Instance key={index} position={position} rotation={[0, (index * 0.71) % Math.PI, index % 3 === 0 ? 0.04 : 0]} />
        ))}
      </Instances>
      <Instances limit={12} castShadow receiveShadow>
        <boxGeometry args={[1.25, 0.22, 1.25]} />
        <meshStandardMaterial color="#b8c2c4" roughness={0.95} />
        {pillarPositions.map(([x, , z], index) => (
          <Instance key={index} position={[x, 3.11, z]} rotation={[0, index * 0.22, 0]} />
        ))}
      </Instances>
      <Sparkles count={28} scale={[25, 5, 25]} position={[0, 2, 0]} size={0.9} speed={0.06} opacity={0.16} color="#ffffff" />
      <Backdrop />
      <Pool />
    </group>
  );
}
