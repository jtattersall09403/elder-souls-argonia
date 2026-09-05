import { assetUrl } from "./assetBase";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";

import { RIG_SOCKET_ROTATION } from "@elder-souls/game-core/anim/animationManifest";
import type { WeaponSocketTransform, WeaponVisualProfile } from "@elder-souls/game-core/core/types";

/**
 * How far an archer has pulled, and when it let go, for a rigged bow.
 *
 * Refs rather than props because they change every frame the string is held:
 * `fraction` is 0 at rest and 1 at full draw; `release` is a counter that goes
 * up once per loose, which is what lets the bow play its snap-forward clip
 * exactly once per shot without the scene tracking the clip's state.
 */
export type BowDrawRefs = {
  fraction: MutableRefObject<number>;
  release: MutableRefObject<number>;
};

/**
 * Whatever is in the off hand: a shield, or a bow.
 *
 * Its own component, and its own Suspense boundary, for the same reason the
 * nocked arrow has one — swapping a shield should not blink the fighter holding
 * it. Mounted exactly as the main-hand weapon is, through the rig's socket
 * convention, so a shield needs no hand-tuned rotation of its own.
 *
 * A bow with a `rig` profile is mounted as the vanilla skinned bow with its
 * own draw/release clips (round 7, decision 0040): the draw clip is scrubbed
 * by the archer's draw fraction, so the limbs bend and the string comes back
 * with the hand, and the release clip plays once on the loose.
 */
export function OffHandItem({
  model: actor,
  profile,
  sheathed,
  objectRef,
  bowDraw,
}: {
  /** The actor's body, whose socket bones this mounts onto. */
  model: THREE.Object3D;
  profile: WeaponVisualProfile;
  /** True while the actor's weapon is stowed. */
  sheathed: boolean;
  /**
   * Published so combat can hang a sensor on the mounted shield — a parry is
   * caught by the shield's own volume, riding the shield's own bone. Mirrors
   * `weaponRef` on the fighter; null while nothing is in the off hand.
   */
  objectRef?: MutableRefObject<THREE.Object3D | null>;
  /** The archer's draw, for a rigged bow. Ignored for anything else. */
  bowDraw?: BowDrawRefs;
}) {
  const rig = profile.rig;
  const gltf = useGLTF(assetUrl(rig?.asset ?? profile.asset));
  const built = useMemo(() => {
    const group = new THREE.Group();
    const instance = rig ? clone(gltf.scene) : gltf.scene.clone(true);
    instance.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
        // A skinned bow's bones carry it well outside its rest bounds when
        // drawn; culling on the rest box blinks it out at the edge of view.
        if ((object as THREE.SkinnedMesh).isSkinnedMesh) object.frustumCulled = false;
      }
    });
    group.add(instance);
    if (!rig) return { group, mixer: null, draw: null, release: null };
    const mixer = new THREE.AnimationMixer(instance);
    const clipNamed = (name: string) => gltf.animations.find((clip) => clip.name === name) ?? null;
    const drawClip = clipNamed(rig.drawClip);
    const releaseClip = clipNamed("BOW_RIG_RELEASE");
    const draw = drawClip ? mixer.clipAction(drawClip) : null;
    const release = releaseClip ? mixer.clipAction(releaseClip) : null;
    if (draw) {
      draw.setLoop(THREE.LoopOnce, 1);
      draw.clampWhenFinished = true;
      draw.play();
      draw.paused = true;
    }
    if (release) {
      release.setLoop(THREE.LoopOnce, 1);
      release.clampWhenFinished = true;
    }
    return { group, mixer, draw, release };
  }, [gltf.animations, gltf.scene, rig]);
  const mount = built.group;

  const transform: WeaponSocketTransform = sheathed ? profile.sheathed : profile.held;

  useLayoutEffect(() => {
    const socket = actor.getObjectByName(transform.socket);
    if (!socket) return undefined;
    actor.updateWorldMatrix(true, true);
    const worldScale = socket.getWorldScale(new THREE.Vector3()).x || 1;
    mount.scale.setScalar((rig?.scale ?? 1) * transform.localScale / worldScale);
    mount.position.fromArray(transform.localPosition);
    mount.quaternion
      .fromArray(RIG_SOCKET_ROTATION as unknown as number[])
      .normalize()
      .multiply(new THREE.Quaternion().fromArray(transform.localRotation).normalize())
      .normalize();
    socket.add(mount);
    if (objectRef) objectRef.current = mount;
    return () => {
      socket.remove(mount);
      if (objectRef?.current === mount) objectRef.current = null;
    };
  }, [actor, mount, objectRef, rig, transform]);

  const seenRelease = useRef(bowDraw?.release.current ?? 0);
  const releasing = useRef(false);
  useFrame((_, delta) => {
    const { mixer, draw, release } = built;
    if (!mixer || !rig) return;
    const fraction = sheathed ? 0 : THREE.MathUtils.clamp(bowDraw?.fraction.current ?? 0, 0, 1);
    const releaseCount = bowDraw?.release.current ?? 0;
    if (releaseCount !== seenRelease.current) {
      seenRelease.current = releaseCount;
      if (release) {
        if (draw) draw.stop();
        release.reset().play();
        releasing.current = true;
      }
    }
    if (releasing.current && release) {
      mixer.update(delta);
      if (release.time >= rig.releaseDurationSeconds - 1e-3 || !release.isRunning()) {
        releasing.current = false;
        release.stop();
        if (draw) {
          draw.play();
          draw.paused = true;
        }
      }
      return;
    }
    if (!draw) return;
    // The pull scrubbed by the draw: the clip holds its rest pose until the
    // onset, so the archer's 0-1 maps onto onset..end.
    const span = Math.max(1e-3, rig.drawDurationSeconds - rig.drawOnsetSeconds);
    draw.time = rig.drawOnsetSeconds + fraction * span;
    mixer.update(0);
  });

  return null;
}
