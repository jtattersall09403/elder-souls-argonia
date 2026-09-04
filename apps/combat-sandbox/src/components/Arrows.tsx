import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import {
  CuboidCollider,
  RigidBody,
  useBeforePhysicsStep,
  useRapier,
  type RapierRigidBody,
} from "@react-three/rapier";
import { useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import {
  ARROW_LIFETIME_SECONDS,
  arrowMassSplit,
  flightAttitude,
  impactObliquity,
} from "@elder-souls/game-core/combat/arrowFlight";
import { useArrowStore, type LiveArrow } from "@elder-souls/game-core/combat/arrowStore";
import { isActorCapsuleName, isActorHurtboxName } from "@elder-souls/game-core/combat/stuckArrows";
import type { ArrowDefinition } from "@elder-souls/game-core/equipment/arrows";

/**
 * Arrows in flight.
 *
 * Rapier owns the flight: each arrow is an ordinary dynamic body under gravity
 * and nothing else. Its rotation is locked, and every physics step the shaft
 * is pointed along its own velocity (`flightAttitude`), so it flies head-first
 * round a smooth arc with the tail tracing the path behind it. Collision, CCD
 * and interpolation are the solver's job.
 */

export type ArrowHit = {
  /** Rigid-body name of what was struck, or null for the world. */
  target: string | null;
  arrow: ArrowDefinition;
  /** Speed at the moment of contact, m/s. */
  speed: number;
  /** Angle between the arrow's path and the surface, radians. */
  obliquityRad: number;
  point: THREE.Vector3;
  /** World orientation at contact, so a shaft is left standing along its path. */
  quaternion: THREE.Quaternion;
  /**
   * The arrow's own mesh, handed over and already detached.
   *
   * The projectile stops existing the moment it lands; whoever it landed in
   * takes ownership of the shaft. Passing the object rather than an id is what
   * lets it be parented to a bone with no second load and no second cache.
   */
  object: THREE.Object3D | null;
};

export function Arrows({ onHit }: { onHit: (hit: ArrowHit) => void }) {
  const arrows = useArrowStore((state) => state.arrows);
  return (
    <>
      {arrows.map((live) => <Arrow key={live.id} live={live} onHit={onHit} />)}
    </>
  );
}

function Arrow({ live, onHit }: { live: LiveArrow; onHit: (hit: ArrowHit) => void }) {
  const retire = useArrowStore((state) => state.retire);
  const { rapier } = useRapier();
  const body = useRef<RapierRigidBody>(null);
  const gltf = useGLTF(`${import.meta.env.BASE_URL}${live.arrow.asset}`);
  const model = useMemo(() => {
    const instance = gltf.scene.clone(true);
    instance.traverse((object) => {
      if (object instanceof THREE.Mesh) object.castShadow = true;
    });
    // The built shaft lies along Z with its *head* at the high-Z end and the
    // fletching at the low-Z end — measured on every arrow in the set (the
    // flat broadhead vertices cluster near z = 0, the three vanes at
    // z = -0.75). The body flies along +Z, so the model needs no turn, only
    // centring on the body origin.
    const bounds = new THREE.Box3().setFromObject(instance);
    const group = new THREE.Group();
    group.add(instance);
    instance.position.z = -(bounds.min.z + bounds.max.z) / 2;
    return group;
  }, [gltf.scene]);

  const mass = useMemo(() => arrowMassSplit(live.arrow.physics), [live.arrow.physics]);

  const age = useRef(0);
  const spent = useRef(false);
  /**
   * The shaft has come to rest in the world.
   *
   * A landed arrow stops being a projectile. Left as a live dynamic body it is
   * a 50 g object lying on the floor that the player's own capsule and hurtbox
   * sweep through — which is exactly the reported "arrows fly up into the air
   * after landing, or come back at you". Freezing it and switching its
   * colliders to sensors leaves the shaft visible and inert until its lifetime
   * expires, and costs the solver nothing.
   */
  const landed = useRef(false);
  const forwardTmp = useRef(new THREE.Vector3());
  const quaternionTmp = useRef(new THREE.Quaternion());

  // Point the shaft along its launch direction and give it its speed. Done on
  // mount rather than through props so the body starts its first physics step
  // already moving, with no frame of a stationary arrow hanging in the air.
  useEffect(() => {
    const rigid = body.current;
    if (!rigid) return;
    const [vx, vy, vz] = live.velocity;
    rigid.setLinvel({ x: vx, y: vy, z: vz }, true);
    const direction = new THREE.Vector3(vx, vy, vz).normalize();
    const rotation = new THREE.Quaternion()
      .setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
    rigid.setRotation(rotation, true);
  }, [live.velocity]);

  useFrame((_, delta) => {
    if (spent.current) return;
    age.current += delta;
    if (age.current > ARROW_LIFETIME_SECONDS) {
      spent.current = true;
      retire(live.id);
    }
  });

  /**
   * Point the shaft along its path, once per *physics* step.
   *
   * Done with the solver rather than per rendered frame so the attitude and
   * the velocity it follows are always from the same step. Rotation is locked
   * on the body, so this is the only thing that ever turns an arrow.
   */
  useBeforePhysicsStep(() => {
    const rigid = body.current;
    if (!rigid || spent.current || landed.current) return;
    const attitude = flightAttitude(rigid.linvel());
    if (!attitude) return;
    forwardTmp.current.set(attitude.x, attitude.y, attitude.z);
    quaternionTmp.current.setFromUnitVectors(FORWARD, forwardTmp.current);
    rigid.setRotation(quaternionTmp.current, true);
  });

  /**
   * Come to rest where it hit the world.
   *
   * Frozen to a fixed body rather than left dynamic. A landed arrow is scenery:
   * something for the player to see they missed by. Keeping it dynamic made it
   * a lightweight object lying underfoot, which the player's own kinematic
   * hurtbox capsules and navigation capsule punted the moment they walked over
   * it — the shaft launching skyward, or skittering back toward the archer.
   */
  const land = useCallback(() => {
    const rigid = body.current;
    if (!rigid || spent.current || landed.current) return;
    landed.current = true;
    rigid.setLinvel({ x: 0, y: 0, z: 0 }, true);
    rigid.setAngvel({ x: 0, y: 0, z: 0 }, true);
    // Fixed, then intangible: fixed stops it being pushed, and sensor colliders
    // stop it pushing anything else. A shaft sticking out of the floor should
    // not be a step the player trips on.
    rigid.setBodyType(1, true);
    for (let i = 0; i < rigid.numColliders(); i += 1) rigid.collider(i).setSensor(true);
  }, [spent, landed]);

  const strike = (target: string | null, contact: THREE.Vector3, centre: THREE.Vector3) => {
    const rigid = body.current;
    if (!rigid || spent.current) return;
    if (target === live.shooter) return;
    spent.current = true;
    const velocity = rigid.linvel();
    const rotation = rigid.rotation();
    // Hand the mesh over *before* this component unmounts, or it goes with it.
    const shaft = model;
    shaft.removeFromParent();
    onHit({
      target,
      arrow: live.arrow,
      speed: Math.hypot(velocity.x, velocity.y, velocity.z),
      obliquityRad: impactObliquity(velocity, contact, centre),
      point: contact.clone(),
      quaternion: new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w),
      object: shaft,
    });
    retire(live.id);
  };

  /** Where the arrow is now. Close enough to where it struck, at this speed. */
  const contactPoint = () => {
    const translation = body.current?.translation();
    return new THREE.Vector3(translation?.x ?? 0, translation?.y ?? 0, translation?.z ?? 0);
  };

  return (
    <RigidBody
      ref={body}
      colliders={false}
      position={live.origin as unknown as [number, number, number]}
      // An arrow crosses several metres per physics step. Without continuous
      // detection it tunnels straight through a body at full draw, which reads
      // as the shot simply not working.
      ccd
      canSleep={false}
      // Attitude is set from the velocity each step; the solver must not add
      // its own spin on top of it.
      lockRotations
      name="arrow"
      onIntersectionEnter={({ other }) => {
        // Only a body's hurtbox takes an arrow out of the air. Weapon hitboxes
        // and parry volumes are sensors too, and striking those had arrows
        // dying against the archer's own bow volume on the spawn frame.
        const name = other.rigidBodyObject?.name ?? null;
        if (!isActorHurtboxName(name)) return;
        const centre = other.rigidBody?.translation();
        strike(
          name,
          contactPoint(),
          new THREE.Vector3(centre?.x ?? 0, centre?.y ?? 0, centre?.z ?? 0),
        );
      }}
      /*
        World contact does not retire the arrow — a shaft that misses should lie
        where it falls until its lifetime runs out, not vanish the instant it
        touches the floor. Only a body takes one out of the air. What contact
        does do is end its flight: see `land`.
      */
      onCollisionEnter={({ other }) => {
        // Only the world stops an arrow. An actor's navigation capsule must
        // not: the skeleton-fitted hurtbox beside it is the combat volume, it
        // reports through the sensor path a step later, and freezing the shaft
        // against the capsule first would leave it hanging in front of a body
        // it was about to hit.
        if (isActorCapsuleName(other.rigidBodyObject?.name)) return;
        land();
      }}
    >
      {/*
        Two colliders: the shaft, and the point it strikes with. The mass
        split keeps the arrow's real weight with a head-heavy centre.
      */}
      <CuboidCollider
        args={[0.005, 0.005, mass.shaftHalfLengthMeters]}
        mass={mass.shaftMassKg}
        activeCollisionTypes={rapier.ActiveCollisionTypes.ALL}
      />
      <CuboidCollider
        args={[0.009, 0.009, 0.025]}
        position={[0, 0, mass.headOffsetMeters]}
        mass={mass.headMassKg}
        activeCollisionTypes={rapier.ActiveCollisionTypes.ALL}
      />
      {/* The shaft lies down the body's +Z, head forward — see `model`. */}
      <primitive object={model} dispose={null} />
    </RigidBody>
  );
}

const FORWARD = new THREE.Vector3(0, 0, 1);
