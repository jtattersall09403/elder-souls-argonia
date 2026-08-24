import { useFrame } from "@react-three/fiber";
import { CapsuleCollider, RigidBody, useRapier, type RapierRigidBody } from "@react-three/rapier";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { HURTBOX_SEGMENTS } from "@elder-souls/game-core/anim/animationManifest";
import { VISUAL_FRAME_PHASE_PRIORITY } from "@elder-souls/game-core/validation/visualFrameMarker";
import type { HurtboxRigRef } from "@elder-souls/game-core/combat/hurtbox";

export type { HurtboxBone, HurtboxRigRef } from "@elder-souls/game-core/combat/hurtbox";

const PARKED = { x: 0, y: -1000, z: 0 };
const CAPSULE_AXIS = new THREE.Vector3(0, 1, 0);

/**
 * Combat volume that follows the actor's actual skeleton.
 *
 * One kinematic sensor capsule per fitted body part, driven from the live
 * animated bones. Every capsule reports the same rigid-body `name`, so combat
 * still asks "did the blade touch this actor" and never has to know how many
 * pieces the body is made of — overlap bookkeeping counts contacts rather than
 * flagging them (see `OverlapCounter`).
 *
 * The segment list, radii and lengths are measured from the character's own
 * skin by the asset pipeline, so a new race, creature or silhouette needs no
 * game-code change and no hand-placed volumes. When a character ships without
 * a fitted hurtbox the caller falls back to its navigation capsule.
 */
export function SkeletalHurtbox({
  rig,
  name,
  probe = false,
}: {
  rig: HurtboxRigRef;
  name: string;
  /** Register on the validation frame phase so probes see the posed volume. */
  probe?: boolean;
}) {
  const { rapier } = useRapier();
  const bodies = useRef<(RapierRigidBody | null)[]>([]);
  const from = useMemo(() => new THREE.Vector3(), []);
  const to = useMemo(() => new THREE.Vector3(), []);
  const centre = useMemo(() => new THREE.Vector3(), []);
  const axis = useMemo(() => new THREE.Vector3(), []);
  const rotation = useMemo(() => new THREE.Quaternion(), []);

  useFrame(() => {
    const segments = rig.current;
    for (let index = 0; index < HURTBOX_SEGMENTS.length; index += 1) {
      const body = bodies.current[index];
      if (!body) continue;
      const segment = segments?.[index];
      if (!segment) {
        body.setNextKinematicTranslation(PARKED);
        continue;
      }
      segment.bone.updateWorldMatrix(true, false);
      from.copy(segment.from).applyMatrix4(segment.bone.matrixWorld);
      to.copy(segment.to).applyMatrix4(segment.bone.matrixWorld);
      centre.addVectors(from, to).multiplyScalar(0.5);
      axis.subVectors(to, from);
      // A zero-length segment is a sphere; any orientation is correct for it.
      if (axis.lengthSq() > 1e-10) {
        rotation.setFromUnitVectors(CAPSULE_AXIS, axis.normalize());
      }
      body.setNextKinematicTranslation(centre);
      body.setNextKinematicRotation(rotation);
    }
  }, probe ? VISUAL_FRAME_PHASE_PRIORITY.telemetryAndMarker : 0);

  return (
    <>
      {HURTBOX_SEGMENTS.map((segment, index) => (
        <RigidBody
          key={segment.bone}
          ref={(body) => { bodies.current[index] = body; }}
          type="kinematicPosition"
          colliders={false}
          position={[PARKED.x, PARKED.y, PARKED.z]}
          name={name}
        >
          <CapsuleCollider
            args={[segment.halfLength, segment.radius]}
            sensor
            activeCollisionTypes={rapier.ActiveCollisionTypes.ALL}
          />
        </RigidBody>
      ))}
    </>
  );
}

/** True when the loaded character ships a pipeline-fitted hurtbox. */
export const HAS_SKELETAL_HURTBOX = HURTBOX_SEGMENTS.length > 0;
