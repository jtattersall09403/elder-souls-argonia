import * as THREE from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";

import type { BowRigProfile } from "@elder-souls/game-core/equipment/types";

/**
 * A rigged bow's draw, driven from the archer's draw fraction.
 *
 * Shared by the main-hand mount (an archer holds its bow in the weapon slot),
 * the off-hand mount and the first-person arms, so all three animate the
 * string the same way: the draw clip is scrubbed from its measured pull onset
 * by the fraction, the release clip plays once per loose, and everything else
 * is the bow's rest pose.
 */
export type RiggedBow = {
  object: THREE.Object3D;
  /** Advance with the archer's state. `release` is a per-loose counter. */
  update: (fraction: number, release: number, delta: number) => void;
};

export function createRiggedBow(
  gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] },
  rig: BowRigProfile,
): RiggedBow {
  const object = clone(gltf.scene);
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      // Drawn limbs and string leave the rest bounds; culling on them blinks
      // the bow out at the edge of view.
      if ((child as THREE.SkinnedMesh).isSkinnedMesh) child.frustumCulled = false;
    }
  });
  const mixer = new THREE.AnimationMixer(object);
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
  let seenRelease: number | null = null;
  let releasing = false;
  const span = Math.max(1e-3, rig.drawDurationSeconds - rig.drawOnsetSeconds);

  const update = (fraction: number, releaseCount: number, delta: number) => {
    if (seenRelease === null) seenRelease = releaseCount;
    if (releaseCount !== seenRelease) {
      seenRelease = releaseCount;
      if (release) {
        draw?.stop();
        release.reset().play();
        releasing = true;
      }
    }
    if (releasing && release) {
      mixer.update(delta);
      if (release.time >= rig.releaseDurationSeconds - 1e-3 || !release.isRunning()) {
        releasing = false;
        release.stop();
        if (draw) {
          draw.play();
          draw.paused = true;
        }
      }
      return;
    }
    if (!draw) return;
    draw.time = rig.drawOnsetSeconds + THREE.MathUtils.clamp(fraction, 0, 1) * span;
    mixer.update(0);
  };
  return { object, update };
}
