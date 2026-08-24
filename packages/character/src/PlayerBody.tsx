import { Ecctrl, type EcctrlHandle } from "ecctrl";
import type { ReactNode, RefObject } from "react";
import {
  CHARACTER_CAPSULE_HALF_HEIGHT,
  CHARACTER_CAPSULE_RADIUS,
  CHARACTER_DAMPING_C,
  CHARACTER_FLOAT_HEIGHT,
  CHARACTER_RAY_HIT_FORGIVENESS,
  CHARACTER_RAY_RADIUS,
  CHARACTER_SPRING_K,
  FALLING_GRAVITY_SCALE,
  JUMP_GRAVITY_SCALE,
  JUMP_IMPULSE_DURATION,
  JUMP_VELOCITY,
} from "@elder-souls/game-core/physics/characterPhysics";
import {
  PLAYER_SPRINT_SPEED,
  PLAYER_WALK_SPEED,
} from "@elder-souls/game-core/io/input";

/**
 * The one canonical player controller body. Both the combat sandbox and the
 * world studio mount the player through this component, so capsule dimensions,
 * suspension, jump arc and speeds cannot drift between apps — these values are
 * the calibration data behind the capability profiles (master plan §52).
 *
 * Direct `EcctrlHandle` access stays legal only in the combat sandbox's scene
 * (its declared migration debt); new consumers must drive movement through
 * `EcctrlAdapter`'s `PlayerMovementController` boundary.
 */
export function PlayerBody({
  handleRef,
  position,
  rotationY = 0,
  name = "player",
  children,
}: {
  handleRef: RefObject<EcctrlHandle | null>;
  position: [number, number, number] | { x: number; y: number; z: number };
  rotationY?: number;
  name?: string;
  children?: ReactNode;
}) {
  const start: [number, number, number] = Array.isArray(position)
    ? position
    : [position.x, position.y, position.z];
  return (
    <Ecctrl
      ref={handleRef}
      position={start}
      rotation={[0, rotationY, 0]}
      maxWalkVel={PLAYER_WALK_SPEED}
      maxRunVel={PLAYER_SPRINT_SPEED}
      accDeltaTime={0.16}
      decDeltaTime={0.13}
      rejectVelFactor={0.92}
      airDragFactor={0.06}
      gravityScale={JUMP_GRAVITY_SCALE}
      fallingGravityScale={FALLING_GRAVITY_SCALE}
      enableToggleRun={false}
      capsuleHalfHeight={CHARACTER_CAPSULE_HALF_HEIGHT}
      capsuleRadius={CHARACTER_CAPSULE_RADIUS}
      floatHeight={CHARACTER_FLOAT_HEIGHT}
      rayRadius={CHARACTER_RAY_RADIUS}
      rayHitForgiveness={CHARACTER_RAY_HIT_FORGIVENESS}
      springK={CHARACTER_SPRING_K}
      dampingC={CHARACTER_DAMPING_C}
      jumpVel={JUMP_VELOCITY}
      jumpDuration={JUMP_IMPULSE_DURATION}
      colliders={false}
      useCustomForward
      autoBalance={false}
      enabledRotations={[false, true, false]}
      name={name}
    >
      {children}
    </Ecctrl>
  );
}
