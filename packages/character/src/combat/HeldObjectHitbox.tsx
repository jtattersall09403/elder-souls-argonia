import { useFrame } from "@react-three/fiber";
import { CapsuleCollider, RigidBody, type RapierRigidBody, useRapier } from "@react-three/rapier";
import type { EcctrlHandle } from "ecctrl";
import { type MutableRefObject, type RefObject, useMemo, useRef, useState } from "react";
import { CHARACTER_TARGET_HEIGHT } from "@elder-souls/game-core/anim/animationManifest";
import { CHARACTER_COMBAT_HURTBOX_RADIUS, combatHurtboxCenterOffset, combatHurtboxHalfHeight } from "@elder-souls/game-core/physics/characterPhysics";
import { hitCapsuleFor, measureHeldObject, type HitCapsule } from "@elder-souls/game-core/combat/hitVolume";
import { OverlapCounter } from "@elder-souls/game-core/combat/overlaps";
import * as THREE from "three";

/**
 * A sensor shaped like, and riding on, a held object.
 *
 * Used for both jobs a held object does in combat: the volume a swing cuts
 * with, and the volume a parry catches with. Both are the same question — where
 * is this thing right now, and how big is it — and answering it once means a
 * greatsword's hitbox is a greatsword and a dagger's is a dagger, from the
 * pipeline's own measurement of the mesh rather than from a constant.
 *
 * The optional `outline` is what the debug panel's weapon-hitbox switch draws.
 * It is deliberately its own view rather than Rapier's global collider debug,
 * because that one renders *every* collider in the world and the whole point of
 * the switch is to watch the blade with everything else turned off.
 */
export function HeldObjectHitbox({
  object,
  margin,
  overlaps,
  name,
  active,
  outline,
  outlineColor,
  measureKey = "",
}: {
  object: RefObject<THREE.Object3D | null>;
  /** Grown by this much all round. Zero for a swing, wider for a parry. */
  margin: number;
  /**
   * Changes whenever the held item's geometry changes (the item id). The
   * mount object survives an inventory swap, so without this a dagger kept
   * the sword's measured volume it replaced — the reported "dagger volume
   * looks sword length".
   */
  measureKey?: string;
  overlaps: MutableRefObject<OverlapCounter>;
  name: string;
  active: RefObject<boolean>;
  outline: boolean;
  outlineColor: string;
}) {
  const body = useRef<RapierRigidBody>(null);
  const marker = useRef<THREE.Group>(null);
  const { rapier } = useRapier();
  const center = useMemo(() => new THREE.Vector3(), []);
  const rotation = useMemo(() => new THREE.Quaternion(), []);
  // Measured from the mesh actually mounted, not from the item manifest.
  //
  // The manifest reports extents, and extents are not enough: a weapon's origin
  // is its grip, so its box starts at zero, but a shield's origin is its boss
  // and its box straddles it. Sizing from extents alone parks a shield's volume
  // a third of a metre off the shield. The mounted object knows the truth, and
  // asking it costs one traversal per equip.
  const measured = useRef<{ object: THREE.Object3D; key: string } | null>(null);
  const [capsule, setCapsule] = useState<HitCapsule>(() => hitCapsuleFor(
    { width: 0.1, height: 0.1, length: 0.9, minZ: 0 },
    margin,
  ));

  useFrame(() => {
    if (!body.current || !object.current || !active.current) {
      overlaps.current.clear();
      body.current?.setNextKinematicTranslation({ x: 0, y: -100, z: 0 });
      if (marker.current) marker.current.visible = false;
      return;
    }
    object.current.updateWorldMatrix(true, false);
    if (measured.current?.object !== object.current || measured.current.key !== measureKey) {
      const box = measureHeldObject(object.current);
      // An item whose meshes have not streamed in yet measures empty; try
      // again next frame rather than remembering a zero-length volume.
      if (box.length > 0) {
        measured.current = { object: object.current, key: measureKey };
        setCapsule(hitCapsuleFor(box, margin));
      }
    }
    // The object runs along its own frame's +Z from the grip at the origin.
    center.set(0, 0, capsule.centerOffset).applyMatrix4(object.current.matrixWorld);
    object.current.getWorldQuaternion(rotation);
    body.current.setNextKinematicTranslation(center);
    body.current.setNextKinematicRotation(rotation);
    if (marker.current) {
      marker.current.visible = outline;
      marker.current.position.copy(center);
      marker.current.quaternion.copy(rotation);
    }
  });

  const updateOverlap = (isActive: boolean, target?: string) => {
    if (!target) return;
    if (isActive) overlaps.current.add(target);
    else overlaps.current.delete(target);
  };

  return (
    <>
      <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[0, -100, 0]} name={name}>
        <CapsuleCollider
          args={[capsule.halfLength, capsule.radius]}
          rotation={[Math.PI / 2, 0, 0]}
          sensor
          activeCollisionTypes={rapier.ActiveCollisionTypes.ALL}
          onIntersectionEnter={({ other }) => updateOverlap(true, other.rigidBodyObject?.name)}
          onIntersectionExit={({ other }) => updateOverlap(false, other.rigidBodyObject?.name)}
        />
      </RigidBody>
      {/* Drawn in world space, not parented to the sensor body, so it is not
          subject to the physics interpolation the collider is. */}
      <group ref={marker} visible={false}>
        {/* THREE builds a capsule along +Y; the collider is turned onto +Z to
            lie down the object, and this has to make the same turn. */}
        <mesh rotation={[Math.PI / 2, 0, 0]} renderOrder={999}>
          <capsuleGeometry args={[capsule.radius, capsule.halfLength * 2, 4, 12]} />
          <meshBasicMaterial color={outlineColor} wireframe transparent opacity={0.85} depthTest={false} />
        </mesh>
      </group>
    </>
  );
}

/**
 * Fallback combat volume for a character with no pipeline-fitted hurtbox: one
 * sensor capsule covering the actor's full height. The Ecctrl capsule remains
 * a navigation/suspension shape; tying sword contact to that shorter capsule
 * makes visibly intersecting shoulder and upper-torso attacks miss.
 */
export function CapsuleHurtbox({
  controller,
  name,
}: {
  controller: RefObject<EcctrlHandle | null>;
  name: string;
}) {
  const body = useRef<RapierRigidBody>(null);
  const { rapier } = useRapier();
  const center = useMemo(() => new THREE.Vector3(), []);
  const centerOffset = combatHurtboxCenterOffset(CHARACTER_TARGET_HEIGHT);
  const halfHeight = combatHurtboxHalfHeight(CHARACTER_TARGET_HEIGHT);

  useFrame(() => {
    const handle = controller.current;
    if (!body.current || !handle) {
      body.current?.setNextKinematicTranslation({ x: 0, y: -100, z: 0 });
      return;
    }
    center.copy(handle.currPos);
    center.y += centerOffset;
    body.current.setNextKinematicTranslation(center);
  });

  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[0, -100, 0]} name={name}>
      <CapsuleCollider
        args={[halfHeight, CHARACTER_COMBAT_HURTBOX_RADIUS]}
        sensor
        activeCollisionTypes={rapier.ActiveCollisionTypes.ALL}
      />
    </RigidBody>
  );
}
