import { assetUrl } from "./assetBase";
import { useGLTF } from "@react-three/drei";
import { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";

import { RIG_SOCKET_ROTATION } from "@elder-souls/game-core/anim/animationManifest";
import type { WeaponSocketTransform, WeaponVisualProfile } from "@elder-souls/game-core/core/types";

/**
 * Whatever is in the off hand: a shield, today.
 *
 * Its own component, and its own Suspense boundary, for the same reason the
 * nocked arrow has one — swapping a shield should not blink the fighter holding
 * it. Mounted exactly as the main-hand weapon is, through the rig's socket
 * convention, so a shield needs no hand-tuned rotation of its own.
 */
export function OffHandItem({
  model: actor,
  profile,
  sheathed,
}: {
  /** The actor's body, whose socket bones this mounts onto. */
  model: THREE.Object3D;
  profile: WeaponVisualProfile;
  /** True while the actor's weapon is stowed. */
  sheathed: boolean;
}) {
  const gltf = useGLTF(assetUrl(profile.asset));
  const mount = useMemo(() => {
    const group = new THREE.Group();
    const instance = gltf.scene.clone(true);
    instance.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    group.add(instance);
    return group;
  }, [gltf.scene]);

  const transform: WeaponSocketTransform = sheathed ? profile.sheathed : profile.held;

  useLayoutEffect(() => {
    const socket = actor.getObjectByName(transform.socket);
    if (!socket) return undefined;
    actor.updateWorldMatrix(true, true);
    const worldScale = socket.getWorldScale(new THREE.Vector3()).x || 1;
    mount.scale.setScalar(transform.localScale / worldScale);
    mount.position.fromArray(transform.localPosition);
    mount.quaternion
      .fromArray(RIG_SOCKET_ROTATION as unknown as number[])
      .normalize()
      .multiply(new THREE.Quaternion().fromArray(transform.localRotation).normalize())
      .normalize();
    socket.add(mount);
    return () => { socket.remove(mount); };
  }, [actor, mount, transform]);

  return null;
}
