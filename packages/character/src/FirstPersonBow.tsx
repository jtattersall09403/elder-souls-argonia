import { assetUrl } from "./assetBase";
import { NockedArrow } from "./NockedArrow";
import { OffHandItem, type BowDrawRefs } from "./OffHandItem";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Suspense, useLayoutEffect, useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";

import { CHARACTER_SCALE, sanitizeBoneName } from "@elder-souls/game-core/anim/animationManifest";
import { FIRST_PERSON_BOW_MANIFEST, firstPersonBowAsset, type FirstPersonBowClip } from "@elder-souls/game-core/anim/firstPersonBowManifest";
import { DEFAULT_RACE, raceById, type RaceId } from "@elder-souls/game-core/actors/races";
import type { WeaponVisualProfile } from "@elder-souls/game-core/core/types";

/**
 * Skyrim's first-person bow rig (round 7, decision 0040).
 *
 * The player's own arms, from the game's separate first-person skeleton and
 * arm meshes, playing the first-person bow clips — the rig Skyrim itself
 * draws when you look down a bow. It lives on the camera rather than on the
 * body: the third-person body is hidden while this is up, the rig's root is
 * put where that body's feet are, turned to the view yaw and pitched about
 * its own camera bone, and the scene puts the camera *on that bone*
 * (`cameraOut`), so hands, bow, string and arrow are framed exactly as the
 * clips were authored to frame them.
 *
 * Bows only (owner 2026-09-05). Everything here is behind the sandbox's
 * "First-person bow rig" switch; off, the third-person body's aim view is
 * used unchanged.
 */

export type FirstPersonBowState = {
  /** World position of the actor's feet. */
  rootPosition: THREE.Vector3;
  /** Facing (the way the arrow goes), radians. */
  yaw: number;
  /** Aim pitch, radians, positive up. */
  pitch: number;
  /** 0-1 while pulling; 1 held at full draw. */
  drawFraction: number;
  /** True from the first pull until the loose. */
  drawing: boolean;
  /** Stick/keys, for the carry strides. */
  move: { x: number; y: number };
  moveMagnitude: number;
};

const MANIFEST = FIRST_PERSON_BOW_MANIFEST;

const CROSS_FADE_SECONDS = 0.16;

function carryClip(drawn: boolean, move: { x: number; y: number }, magnitude: number): FirstPersonBowClip {
  if (magnitude <= 0.08) return drawn ? "FP_BOW_DRAWN" : "FP_BOW_IDLE";
  const lateral = Math.abs(move.x);
  const longitudinal = Math.abs(move.y);
  if (lateral > longitudinal * 0.8) {
    if (move.x < 0) return drawn ? "FP_BOWDRAWN_STRAFE_LEFT" : "FP_BOW_STRAFE_LEFT";
    return drawn ? "FP_BOWDRAWN_STRAFE_RIGHT" : "FP_BOW_STRAFE_RIGHT";
  }
  if (move.y < 0) return drawn ? "FP_BOWDRAWN_WALK_BACK" : "FP_BOW_WALK_BACK";
  return drawn ? "FP_BOWDRAWN_WALK" : "FP_BOW_WALK";
}

export function FirstPersonBow({
  bow,
  raceId = DEFAULT_RACE,
  state,
  bowDraw,
  nockedArrow,
  cameraOut,
  visible,
}: {
  /** The held bow's visual profile (its rigged build mounts on the arms). */
  bow: WeaponVisualProfile;
  /** Picks the arms for the race's body and tints their skin as the body is. */
  raceId?: RaceId;
  state: MutableRefObject<FirstPersonBowState>;
  bowDraw: BowDrawRefs;
  nockedArrow: {
    asset: string;
    visibleRef: MutableRefObject<boolean>;
    aimDirection: MutableRefObject<THREE.Vector3>;
    nockWorld?: MutableRefObject<THREE.Vector3>;
  } | null;
  /** Written every frame with the camera bone's world position. */
  cameraOut: MutableRefObject<THREE.Vector3>;
  visible: boolean;
}) {
  const race = raceById(raceId);
  const gltf = useGLTF(assetUrl(firstPersonBowAsset(race.body)));
  const model = useMemo(() => {
    const instance = clone(gltf.scene);
    const tint = new THREE.Color(race.appearance.skinTint[0], race.appearance.skinTint[1], race.appearance.skinTint[2]);
    instance.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = false;
        object.receiveShadow = false;
        object.frustumCulled = false;
        // Every mesh on this rig is skin, so the race's tint applies to all of
        // it — multiplied over the diffuse, as `applyAppearance` does for the
        // body. Materials are cloned so the tint does not leak between races.
        const tinted = (material: THREE.Material) => {
          const own = material.clone();
          if (own instanceof THREE.MeshStandardMaterial) own.color.multiply(tint);
          return own;
        };
        object.material = Array.isArray(object.material) ? object.material.map(tinted) : tinted(object.material);
      }
    });
    return instance;
  }, [gltf.scene, race]);
  const mixer = useMemo(() => new THREE.AnimationMixer(model), [model]);
  const actions = useMemo(() => {
    const map = new Map<string, THREE.AnimationAction>();
    for (const clip of gltf.animations) {
      const action = mixer.clipAction(clip);
      map.set(clip.name, action);
    }
    return map;
  }, [gltf.animations, mixer]);
  const cameraBone = useMemo(
    () => model.getObjectByName(sanitizeBoneName(MANIFEST.bones.camera)) ?? null,
    [model],
  );
  const drawHandSocket = useMemo(
    () => model.getObjectByName(sanitizeBoneName(MANIFEST.bones.weapon)) ?? null,
    [model],
  );

  const outer = useRef<THREE.Group>(null);
  const pivot = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  /** The camera bone's rest height above the root, metres. */
  const cameraHeight = useMemo(() => {
    if (!cameraBone) return 1.7;
    model.updateWorldMatrix(true, true);
    const local = new THREE.Vector3();
    cameraBone.getWorldPosition(local);
    model.worldToLocal(local);
    return local.y * CHARACTER_SCALE;
  }, [cameraBone, model]);

  useLayoutEffect(() => {
    if (pivot.current) pivot.current.position.set(0, cameraHeight, 0);
    if (inner.current) {
      inner.current.position.set(0, -cameraHeight, 0);
      inner.current.scale.setScalar(CHARACTER_SCALE);
    }
  }, [cameraHeight]);

  const current = useRef<FirstPersonBowClip | null>(null);
  const seenRelease = useRef(bowDraw.release.current);
  const releasing = useRef(false);
  const tmp = useRef({ position: new THREE.Vector3() });

  const play = (name: FirstPersonBowClip, scrub: number | null) => {
    const next = actions.get(name);
    if (!next) return;
    if (current.current !== name) {
      const previous = current.current ? actions.get(current.current) : null;
      next.reset();
      next.enabled = true;
      next.setEffectiveWeight(1);
      next.setLoop(name === "FP_BOW_RELEASE" || name === "FP_BOW_DRAW" ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = true;
      next.play();
      if (previous && previous !== next) previous.crossFadeTo(next, CROSS_FADE_SECONDS, false);
      current.current = name;
    }
    if (scrub !== null) {
      next.paused = true;
      next.time = scrub;
    } else {
      next.paused = false;
    }
  };

  useFrame((_, delta) => {
    if (!visible) return;
    const view = state.current;
    const o = outer.current;
    const p = pivot.current;
    if (!o || !p) return;
    o.position.copy(view.rootPosition);
    o.rotation.set(0, view.yaw, 0);
    p.rotation.set(-view.pitch, 0, 0);

    // Clip choice. A loose plays its release once; a pull scrubs the draw
    // clip by the draw fraction so it stays in step with the bow's own string;
    // otherwise the carry stride for the stick, drawn or not.
    const releaseCount = bowDraw.release.current;
    if (releaseCount !== seenRelease.current) {
      seenRelease.current = releaseCount;
      releasing.current = true;
      current.current = null;
      play("FP_BOW_RELEASE", null);
    }
    const releaseDuration = MANIFEST.clips.FP_BOW_RELEASE?.durationSeconds ?? 0.8;
    if (releasing.current) {
      const action = actions.get("FP_BOW_RELEASE");
      if (!action || action.time >= releaseDuration - 1e-3 || !action.isRunning()) releasing.current = false;
    }
    if (!releasing.current) {
      if (view.drawing && view.drawFraction < 1) {
        const duration = MANIFEST.clips.FP_BOW_DRAW?.durationSeconds ?? 1.6;
        play("FP_BOW_DRAW", THREE.MathUtils.clamp(view.drawFraction, 0, 1) * duration);
      } else {
        play(carryClip(view.drawing, view.move, view.moveMagnitude), null);
      }
    }
    mixer.update(delta);

    if (cameraBone) {
      cameraBone.updateWorldMatrix(true, false);
      cameraBone.getWorldPosition(tmp.current.position);
      cameraOut.current.copy(tmp.current.position);
    } else {
      p.getWorldPosition(cameraOut.current);
    }
  });

  return (
    <group ref={outer} visible={visible}>
      <group ref={pivot}>
        <group ref={inner}>
          <primitive object={model} />
          <Suspense fallback={null}>
            <OffHandItem model={model} profile={bow} sheathed={false} bowDraw={bowDraw} />
          </Suspense>
          {nockedArrow && (
            <Suspense fallback={null}>
              <NockedArrow
                socket={drawHandSocket}
                parent={model}
                asset={nockedArrow.asset}
                visible
                visibleRef={nockedArrow.visibleRef}
                aimDirection={nockedArrow.aimDirection}
                nockWorld={nockedArrow.nockWorld}
              />
            </Suspense>
          )}
        </group>
      </group>
    </group>
  );
}
