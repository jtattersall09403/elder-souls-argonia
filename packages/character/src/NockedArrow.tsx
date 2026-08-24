import { assetUrl } from "./assetBase";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";

/**
 * The arrow on the string.
 *
 * A bow with nothing nocked reads as broken, and in first person it is the
 * thing the player is looking straight down.
 *
 * Its nock rides the drawing hand — the authored clip already brings that hand
 * from the quiver to the anchor, so the shaft goes along for free — but it
 * *points where the shot goes* rather than wherever the hand happens to face.
 * That is not a cheat: an arrow on a string does lie along the shot, and
 * deriving the direction from the aim is exact where a hand-tuned socket
 * rotation would only be close, and only for one pose.
 *
 * Its own component so the arrow's GLB suspends on its own. An actor should not
 * blink because the player switched to a different arrowhead.
 */
export function NockedArrow({
  socket,
  parent,
  asset,
  visible,
  aimDirection,
}: {
  /** The drawing hand's attach node; the nock sits here. */
  socket: THREE.Object3D | null;
  /** Where the shaft lives in the scene graph. Not the hand: it does not spin. */
  parent: THREE.Object3D | null;
  /** Arrow GLB, relative to the deployment base URL. */
  asset: string;
  visible: boolean;
  /** Unit world-space direction of the shot. */
  aimDirection: MutableRefObject<THREE.Vector3>;
}) {
  const gltf = useGLTF(assetUrl(asset));
  const model = useMemo(() => {
    const instance = gltf.scene.clone(true);
    const group = new THREE.Group();
    group.add(instance);
    // Same normalisation the projectile uses: the built shaft lies along one
    // axis with an arbitrary end at the origin, and this puts its point on +Z
    // with the nock at the group's origin, which is what rides the hand.
    const bounds = new THREE.Box3().setFromObject(instance);
    group.rotation.y = Math.PI;
    instance.position.z = -bounds.max.z;
    return group;
  }, [gltf.scene]);

  const tmp = useRef({
    worldPosition: new THREE.Vector3(),
    parentQuaternion: new THREE.Quaternion(),
    desired: new THREE.Quaternion(),
  });

  useLayoutEffect(() => {
    if (!parent) return undefined;
    parent.add(model);
    return () => { parent.remove(model); };
  }, [model, parent]);

  useLayoutEffect(() => {
    model.visible = visible;
  }, [model, visible]);

  useFrame(() => {
    if (!visible || !socket || !model.parent) return;
    socket.updateWorldMatrix(true, false);
    socket.getWorldPosition(tmp.current.worldPosition);
    model.parent.worldToLocal(model.position.copy(tmp.current.worldPosition));
    model.parent.getWorldQuaternion(tmp.current.parentQuaternion);
    tmp.current.desired.setFromUnitVectors(FORWARD, aimDirection.current);
    model.quaternion
      .copy(tmp.current.parentQuaternion.invert())
      .multiply(tmp.current.desired);
    // The actor root carries the character scale; the shaft must not.
    const scale = model.parent.getWorldScale(tmp.current.worldPosition).x || 1;
    model.scale.setScalar(1 / scale);
  });

  return null;
}

const FORWARD = new THREE.Vector3(0, 0, 1);
