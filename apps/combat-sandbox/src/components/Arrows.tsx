import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { CuboidCollider, RigidBody, useRapier, type RapierRigidBody } from "@react-three/rapier";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import {
  ARROW_LIFETIME_SECONDS,
  ARROW_SHAFT_LENGTH_METERS,
  aerodynamicDrag,
  arrowMassSplit,
  dragLeverMeters,
  impactObliquity,
} from "../game/combat/arrowFlight";
import { useArrowStore, type LiveArrow } from "../game/combat/arrowStore";
import type { ArrowDefinition } from "../game/equipment/arrows";

/**
 * Arrows in flight.
 *
 * Rapier owns the flight. Each arrow is an ordinary dynamic body under gravity
 * with its mass carried by a collider set *forward* of the body origin — that
 * offset is the arrow's centre of mass, and it is what makes the drag force,
 * applied behind it, turn the shaft onto its path instead of letting it tumble.
 * The only thing this component adds per tick is that one force; everything
 * else — collision, CCD, interpolation — is the solver's job.
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
  const forceTmp = useRef(new THREE.Vector3());
  const pointTmp = useRef(new THREE.Vector3());
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
    const rigid = body.current;
    if (!rigid || spent.current) return;
    age.current += delta;
    if (age.current > ARROW_LIFETIME_SECONDS) {
      spent.current = true;
      retire(live.id);
      return;
    }

    const velocity = rigid.linvel();
    velocityTmp.current.set(velocity.x, velocity.y, velocity.z);
    const drag = aerodynamicDrag(velocity, live.arrow.physics);
    forceTmp.current.set(drag.x, drag.y, drag.z);

    // Applied a lever's length behind the centre of mass, which is where the
    // fletching is. That offset is the whole stabilisation.
    const translation = rigid.translation();
    const rotation = rigid.rotation();
    quaternionTmp.current.set(rotation.x, rotation.y, rotation.z, rotation.w);
    forwardTmp.current.set(0, 0, 1).applyQuaternion(quaternionTmp.current);
    const lever = dragLeverMeters(live.arrow.physics, ARROW_SHAFT_LENGTH_METERS);
    pointTmp.current
      .set(translation.x, translation.y, translation.z)
      .addScaledVector(forwardTmp.current, -lever);
    rigid.addForceAtPoint(forceTmp.current, pointTmp.current, true);
  });

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
        const centre = other.rigidBody?.translation();
        strike(
          other.rigidBodyObject?.name ?? null,
          contactPoint(),
          new THREE.Vector3(centre?.x ?? 0, centre?.y ?? 0, centre?.z ?? 0),
        );
      }}
      /*
        No handler for world contact on purpose: an arrow that misses should lie
        where it falls until its lifetime runs out, not vanish the instant it
        touches the floor. Only a body takes a shaft out of the air.
      */
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
