import { assetUrl } from "./assetBase";
import { useCharacterGLTF } from "./characterGltf";
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, type MutableRefObject } from "react";
import * as THREE from "three";

import { RIG_SOCKET_ROTATION } from "@elder-souls/game-core/anim/animationManifest";
import { createGlowMaterial, type GlowMaterial } from "./glowMaterial";
import { createRiggedBow } from "./riggedBow";
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
 * Whatever is in the off hand: a shield, a bow, a torch or a second weapon.
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
  glowIntensity,
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
  /**
   * 0-1 brightness of the item's additive glow (a torch's flame mesh): the
   * carried light's own intensity, so the flame and the light flicker together
   * and a spent torch goes dark. Absent means 1.
   */
  glowIntensity?: MutableRefObject<number>;
}) {
  const rig = profile.rig;
  const gltf = useCharacterGLTF(assetUrl(rig?.asset ?? profile.asset));
  const built = useMemo(() => {
    const group = new THREE.Group();
    if (rig) {
      const rigged = createRiggedBow(gltf, rig);
      group.add(rigged.object);
      return { group, rigged, glows: [] as GlowMaterial[] };
    }
    const instance = gltf.scene.clone(true);
    const glows: GlowMaterial[] = [];
    instance.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (object.userData.additive) {
        // An effect mesh the pipeline flagged additive (a torch's GlowAddMesh):
        // it adds light and casts nothing.
        const glow = createGlowMaterial((object.material as THREE.MeshStandardMaterial).map ?? null);
        object.material = glow.material;
        object.castShadow = false;
        object.receiveShadow = false;
        glows.push(glow);
        return;
      }
      object.castShadow = true;
      object.receiveShadow = true;
      if (profile.alphaTest !== undefined) {
        // Cloned, so the cached scene's shared material is left as exported.
        const material = (object.material as THREE.Material).clone();
        material.alphaTest = profile.alphaTest;
        material.transparent = false;
        object.material = material;
      }
    });
    group.add(instance);
    return { group, rigged: null, glows };
  }, [gltf, rig, profile.alphaTest]);
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

  useFrame((_, delta) => {
    // A glow burns as bright as the carried light it belongs to.
    for (const glow of built.glows) glow.intensity.value = glowIntensity?.current ?? 1;
    if (!built.rigged) return;
    const fraction = sheathed ? 0 : (bowDraw?.fraction.current ?? 0);
    built.rigged.update(fraction, bowDraw?.release.current ?? 0, delta);
  });

  return null;
}
