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
  ARROW_SHAFT_LENGTH_METERS,
  aerodynamicDrag,
  aerodynamicPitchDamping,
  aerodynamicRestoringTorque,
  arrowMassSplit,
  impactObliquity,
} from "@elder-souls/game-core/combat/arrowFlight";
import { useArrowStore, type LiveArrow } from "@elder-souls/game-core/combat/arrowStore";
import { isActorCapsuleName, isActorHurtboxName } from "@elder-souls/game-core/combat/stuckArrows";
import type { ArrowDefinition } from "@elder-souls/game-core/equipment/arrows";

/**
 * Arrows in flight.
 *
 * Rapier owns the flight. Each arrow is an ordinary dynamic body under gravity
 * with its mass carried by a collider set *forward* of the body origin, which
 * is the forward centre of mass a real arrow has. The component adds three
 * things per tick, all from `combat/arrowFlight`: drag, the torque that turns a
 * yawed shaft back onto its path, and the torque that damps that turn so it
 * settles rather than rings. Everything else — collision, CCD, interpolation —
 * is the solver's job.
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
    // The body's origin is its centre of mass, and its +Z is the direction of
    // flight. Measure where the built shaft actually lies and move it to match,
    // rather than assuming: the pipeline lays items out along one axis but does
    // not promise which end of it the point is on.
    const bounds = new THREE.Box3().setFromObject(instance);
    const group = new THREE.Group();
    group.add(instance);
    group.rotation.y = Math.PI;
    group.position.z = (bounds.min.z + bounds.max.z) / 2;
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
  const forceTmp = useRef(new THREE.Vector3());
  const forwardTmp = useRef(new THREE.Vector3());
  const quaternionTmp = useRef(new THREE.Quaternion());
  const velocityTmp = useRef(new THREE.Vector3());

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
   * Air, applied once per *physics* step rather than once per rendered frame.
   *
   * Rapier accumulates applied forces and clears them when it steps, so a force
   * added from the render loop is applied as many times as frames happened to
   * fall between two steps. On a 144 Hz display against a 60 Hz solver that is
   * roughly two and a half times the intended drag *and* two and a half times
   * the stabilising torque, and on a slow frame it is none — which is why a
   * shot's trajectory and its point-first flight both varied with frame rate
   * instead of with the bow. Stepping the force with the solver makes the
   * flight the ballistics model's flight on every machine.
   */
  useBeforePhysicsStep(() => {
    const rigid = body.current;
    if (!rigid || spent.current || landed.current) return;

    const velocity = rigid.linvel();
    velocityTmp.current.set(velocity.x, velocity.y, velocity.z);
    const drag = aerodynamicDrag(velocity, live.arrow.physics);
    forceTmp.current.set(drag.x, drag.y, drag.z);

    // Drag is a pure force on the centre of mass. Attitude is handled by two
    // explicit torques below rather than by applying this one off-centre: that
    // shortcut is what made the shaft's stabilisation an order of magnitude too
    // weak to follow its own arc. Each term is now separately meaningful.
    rigid.addForce(forceTmp.current, true);

    const rotation = rigid.rotation();
    quaternionTmp.current.set(rotation.x, rotation.y, rotation.z, rotation.w);
    forwardTmp.current.set(0, 0, 1).applyQuaternion(quaternionTmp.current);

    // Weathercocking: the air turning a yawed shaft back onto its path.
    rigid.addTorque(
      aerodynamicRestoringTorque(velocity, forwardTmp.current, live.arrow.physics, ARROW_SHAFT_LENGTH_METERS),
      true,
    );
    // And the air resisting that rotation. Without it the term above is an
    // undamped spring and the arrow rings about its path instead of settling.
    rigid.addTorque(
      aerodynamicPitchDamping(
        rigid.angvel(),
        velocity,
        forwardTmp.current,
        live.arrow.physics,
        ARROW_SHAFT_LENGTH_METERS,
      ),
      true,
    );
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
        Two colliders, because an arrow is a light shaft with a heavy point on
        the end of it. Together they give the body both the forward centre of
        mass that makes it fly point-first and the spread-out inertia that stops
        the aerodynamic torque from tumbling it.
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
      {/* The pipeline builds every item along +Z, so the shaft already lies
          down the body's forward axis. */}
      <primitive object={model} dispose={null} />
    </RigidBody>
  );
}
