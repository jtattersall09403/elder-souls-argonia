import { DEFAULT_ARROW_GRAVITY_SCALE } from "@elder-souls/game-core/combat/arrowFlight";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { BallCollider, RigidBody, useBeforePhysicsStep, useRapier, type RapierRigidBody } from "@react-three/rapier";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { assetUrl } from "./assetBase";
import { ARROW_LIFETIME_SECONDS, ARROW_SHAFT_LENGTH_METERS, advanceArrowVelocity, aerodynamicDrag, flightAttitude } from "@elder-souls/game-core/combat/arrowFlight";
import type { LiveArrow } from "@elder-souls/game-core/combat/arrowStore";
import type { ArrowDefinition } from "@elder-souls/game-core/equipment/arrows";
import type { ArrowSurfaceHit } from "@elder-souls/game-core/combat/arrowSurface";
import { isActorCapsuleName } from "@elder-souls/game-core/combat/stuckArrows";

export type ArrowHit = {
  target: string | null;
  arrow: ArrowDefinition;
  speed: number;
  obliquityRad: number;
  point: THREE.Vector3;
  quaternion: THREE.Quaternion;
  object: THREE.Object3D | null;
  bone: THREE.Object3D;
};
export type ArrowTrace = (origin: THREE.Vector3, direction: THREE.Vector3, distance: number,
  shooter: string) => (ArrowSurfaceHit & { target: string }) | null;
export type FlightSample = { t: number; wallTime: number; y: number; vx: number; vy: number; vz: number;
  massKg: number; gravityScale: number; linearDamping: number; dragY: number };

/** Shared runtime: ballistics advances velocity, Rapier moves it, and swept tips resolve contacts.
 * Sensor-only bodies cannot bounce on the shooter's capsule or other arrows.
 * A centred mass also prevents an imposed attitude moving an offset COM at apex.
 */
export function Arrows({ arrows, retire, onHit, traceActor, gravityScale = DEFAULT_ARROW_GRAVITY_SCALE, onSample }: {
  arrows: readonly LiveArrow[];
  retire: (id: number) => void;
  onHit: (hit: ArrowHit) => void;
  traceActor: ArrowTrace;
  gravityScale?: number;
  onSample?: (sample: FlightSample) => void;
}) {
  return <>{arrows.map(live => <Arrow key={live.id} {...{ live, retire, onHit, traceActor, gravityScale, onSample }} />)}</>;
}

function Arrow({ live, retire, onHit, traceActor, gravityScale, onSample }: {
  live: LiveArrow; retire: (id: number) => void; onHit: (hit: ArrowHit) => void;
  traceActor: ArrowTrace; gravityScale: number; onSample?: (sample: FlightSample) => void;
}) {
  const { world, rapier, rigidBodyStates } = useRapier();
  const body = useRef<RapierRigidBody>(null);
  const gltf = useGLTF(assetUrl(live.arrow.asset));
  const model = useMemo(() => {
    const instance = gltf.scene.clone(true);
    const bounds = new THREE.Box3().setFromObject(instance);
    const group = new THREE.Group();
    group.add(instance);
    instance.position.z = -(bounds.min.z + bounds.max.z) / 2;
    return group;
  }, [gltf.scene]);
  const age = useRef(0);
  const flightTime = useRef(0);
  const spent = useRef(false);
  const landed = useRef(false);
  const previousTip = useRef<THREE.Vector3 | null>(null);
  const scratch = useMemo(() => ({ direction: new THREE.Vector3(), position: new THREE.Vector3(),
    tip: new THREE.Vector3(), rotation: new THREE.Quaternion(), forward: new THREE.Vector3(0, 0, 1) }), []);

  useEffect(() => {
    const rigid = body.current;
    if (!rigid) return;
    const direction = scratch.direction.fromArray(live.velocity).normalize();
    scratch.rotation.setFromUnitVectors(scratch.forward, direction);
    rigid.setRotation(scratch.rotation, true);
    rigid.setLinvel({ x: live.velocity[0], y: live.velocity[1], z: live.velocity[2] }, true);
    previousTip.current = new THREE.Vector3().fromArray(live.origin).addScaledVector(direction, ARROW_SHAFT_LENGTH_METERS / 2);
  }, [live, scratch]);

  useFrame((_, delta) => {
    if (spent.current) return;
    age.current += delta;
    if (age.current > ARROW_LIFETIME_SECONDS) { spent.current = true; retire(live.id); }
  });

  useBeforePhysicsStep(() => {
    const rigid = body.current;
    if (!rigid || spent.current || landed.current) return;
    const velocity = rigid.linvel();
    const position = rigid.translation();
    const drag = aerodynamicDrag(velocity, live.arrow.physics);
    const dt = world.timestep;
    flightTime.current += dt;
    if (live.shooter === "probe") onSample?.({ t: flightTime.current, wallTime: performance.now() / 1000, y: position.y,
      vx: velocity.x, vy: velocity.y, vz: velocity.z, massKg: rigid.mass(),
      gravityScale, linearDamping: rigid.linearDamping(), dragY: drag.y });
    const attitude = flightAttitude(velocity);
    if (attitude) {
      scratch.direction.set(attitude.x, attitude.y, attitude.z);
      scratch.rotation.setFromUnitVectors(scratch.forward, scratch.direction);
      rigid.setRotation(scratch.rotation, true);
    }
    scratch.position.set(position.x, position.y, position.z);
    scratch.tip.copy(scratch.position).addScaledVector(scratch.direction, ARROW_SHAFT_LENGTH_METERS / 2);
    const from = previousTip.current;
    if (from) {
      const rayDirection = scratch.tip.clone().sub(from);
      const distance = rayDirection.length();
      if (distance > 1e-6) {
        rayDirection.divideScalar(distance);
        const worldHit = world.castRay(new rapier.Ray(from, rayDirection), distance, true,
          undefined, undefined, undefined, undefined,
          collider => !collider.isSensor()
            && !isActorCapsuleName(rigidBodyStates.get(collider.parent()?.handle ?? -1)?.object.name)
            && collider.parent()?.handle !== rigid.handle);
        const skinHit = traceActor(from, rayDirection, distance, live.shooter);
        if (skinHit && (!worldHit || skinHit.distance <= worldHit.timeOfImpact)) {
          spent.current = true;
          model.removeFromParent();
          onHit({ target: skinHit.target, arrow: live.arrow,
            speed: Math.hypot(velocity.x, velocity.y, velocity.z), obliquityRad: skinHit.obliquityRad,
            point: skinHit.point, quaternion: scratch.rotation.clone(), object: model, bone: skinHit.bone });
          retire(live.id);
          return;
        }
        if (worldHit) {
          landed.current = true;
          const point = from.clone().addScaledVector(rayDirection, worldHit.timeOfImpact)
            .addScaledVector(scratch.direction, -ARROW_SHAFT_LENGTH_METERS / 2 + 0.04);
          rigid.setTranslation(point, true);
          rigid.setLinvel({ x: 0, y: 0, z: 0 }, true);
          rigid.resetForces(true);
          rigid.setBodyType(rapier.RigidBodyType.Fixed, true);
          return;
        }
      }
    }
    previousTip.current = scratch.tip.clone();
    // Flight acceleration is owned by the shared ballistics step. Rapier moves
    // the body and resolves collision, but its world-gravity flag stays off so
    // gravity cannot be lost, duplicated, or coupled to another force path.
    rigid.setLinvel(advanceArrowVelocity(velocity, live.arrow.physics, gravityScale, dt), true);
  });

  return <RigidBody ref={body} colliders={false} position={live.origin as [number, number, number]}
    gravityScale={0} lockRotations canSleep={false} name="arrow">
    <BallCollider args={[0.005]} mass={live.arrow.physics.massKg} sensor />
    <primitive object={model} dispose={null} />
  </RigidBody>;
}
