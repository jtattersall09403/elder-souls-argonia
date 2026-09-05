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
  visibleRef,
  aimDirection,
  nockWorld,
}: {
  /** The drawing hand's attach node; the nock sits here. */
  socket: THREE.Object3D | null;
  /** Where the shaft lives in the scene graph. Not the hand: it does not spin. */
  parent: THREE.Object3D | null;
  /** Arrow GLB, relative to the deployment base URL. */
  asset: string;
  visible: boolean;
  /**
   * Frame-rate visibility for actors driven from the simulation loop rather
   * than from React state (an enemy archer's draw). Read every frame when
   * given; `visible` still gates the whole thing.
   */
  visibleRef?: MutableRefObject<boolean>;
  /** Unit world-space direction of the shot. */
  aimDirection: MutableRefObject<THREE.Vector3>;
  /**
   * Written every frame with the nock's world position — where the shaft
   * actually is, so the loosed arrow can leave from the string rather than
   * from a point invented near the eye.
   */
  nockWorld?: MutableRefObject<THREE.Vector3>;
}) {
  const gltf = useGLTF(assetUrl(asset));
  const model = useMemo(() => {
    const instance = gltf.scene.clone(true);
    const group = new THREE.Group();
    group.add(instance);
    // Same layout the projectile relies on: the built shaft lies along Z with
    // the head at the high-Z end and the fletching at the low-Z end (measured
    // on every arrow in the set). Put the nock on the group's origin, which is
    // what rides the hand, and the point out along +Z.
    const bounds = new THREE.Box3().setFromObject(instance);
    instance.position.z = -bounds.min.z;
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
    if (visibleRef) model.visible = visible && visibleRef.current;
    if (!socket || !model.parent) return;
    socket.updateWorldMatrix(true, false);
    socket.getWorldPosition(tmp.current.worldPosition);
    // Published whether or not the shaft is drawn yet: the string hand is
    // where the shot comes from, and the aim solve needs it from the moment
    // the bow is up — before the arrow is pulled out of the quiver.
    if (nockWorld) nockWorld.current.copy(tmp.current.worldPosition);
    if (!model.visible) return;
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
