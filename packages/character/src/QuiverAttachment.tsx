import { assetUrl } from "./assetBase";
import { useGLTF } from "@react-three/drei";
import { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";

import { RIG_SOCKET_ROTATION } from "@elder-souls/game-core/anim/animationManifest";

/**
 * The quiver on an archer's back.
 *
 * Skyrim ships the worn quiver as its own mesh beside the projectile — one per
 * arrow material — and hangs it on the skeleton's `Quiver` node. The arrow
 * catalogue carries both, so equipping arrows puts the right quiver on the
 * right node with nothing hand-placed here: the socket name comes from the
 * arrow, the orientation from the rig's one socket convention.
 *
 * Its own component, and its own Suspense boundary, so switching arrow type
 * does not blink the fighter wearing them.
 */
export function QuiverAttachment({
  model: actor,
  asset,
  socket: socketName,
  visible = true,
}: {
  /** The actor's body, whose socket bones this mounts onto. */
  model: THREE.Object3D;
  /** Quiver GLB, relative to the deployment base URL. */
  asset: string;
  /** Rig node the quiver hangs on, from the arrow definition. */
  socket: string;
  /**
   * Hidden in first person: the camera sits inside the wearer's chest and the
   * quiver fills the view over the shoulder, exactly as a cuirass does.
   */
  visible?: boolean;
}) {
  const gltf = useGLTF(assetUrl(asset));
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
  }, [gltf]);

  useLayoutEffect(() => {
    const socket = actor.getObjectByName(socketName);
    if (!socket) return undefined;
    actor.updateWorldMatrix(true, true);
    const worldScale = socket.getWorldScale(new THREE.Vector3()).x || 1;
    mount.scale.setScalar(1 / worldScale);
    mount.quaternion.fromArray(RIG_SOCKET_ROTATION as unknown as number[]).normalize();
    socket.add(mount);
    return () => { socket.remove(mount); };
  }, [actor, mount, socketName]);

  useLayoutEffect(() => {
    mount.visible = visible;
  }, [mount, visible]);

  return null;
}
