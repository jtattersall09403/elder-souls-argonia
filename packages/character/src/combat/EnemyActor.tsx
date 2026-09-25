import { buildId } from "@elder-souls/game-core/actors/races";
import { Ecctrl } from "ecctrl";
import { Suspense, useCallback, useMemo } from "react";
import { wornArmourFor } from "@elder-souls/game-core/inventory/store";
import { ActorHealthBar } from "./ActorHealthBar";
import { loadoutAnimationPacks } from "@elder-souls/game-core/equipment/animationPacks";
import { CHARACTER_CAPSULE_HALF_HEIGHT, CHARACTER_CAPSULE_RADIUS, CHARACTER_DAMPING_C, CHARACTER_FLOAT_HEIGHT, CHARACTER_MODEL_OFFSET, CHARACTER_RAY_HIT_FORGIVENESS, CHARACTER_RAY_RADIUS, CHARACTER_SPRING_K } from "@elder-souls/game-core/physics/characterPhysics";
import { DEFAULT_ARROW } from "@elder-souls/game-core/equipment/arrows";
import { PARRY_VOLUME_MARGIN_METERS } from "@elder-souls/game-core/combat/hitVolume";
import { SkeletalHurtbox, hasSkeletalHurtbox } from "../SkeletalHurtbox";
import { SkyrimFighter } from "../SkyrimFighter";
import { EnemyRuntime } from "./enemyRuntime";
import { LockOnReticle } from "./LockOnReticle";
import { CapsuleHurtbox, HeldObjectHitbox } from "./HeldObjectHitbox";

export function EnemyActor({ runtime, reticleVisible, validation, showWeaponHitboxes }: {
  runtime: EnemyRuntime;
  reticleVisible: boolean;
  validation: boolean;
  /** Draw the weapon and parry volumes (debug). */
  showWeaponHitboxes: boolean;
}) {
  const enemyArmour = useMemo(
    () => wornArmourFor(runtime.archetype.armour),
    [runtime.archetype.armour],
  );
  const enemyAnimationPacks = useMemo(
    () => loadoutAnimationPacks(runtime.archetype.loadout),
    [runtime.archetype.loadout],
  );
  // Read from the live fighter each frame rather than through props: health
  // changes inside the combat update, and routing it through React would cost a
  // render per hit for a number that is already sitting in a ref.
  const readEnemyHealth = useCallback(() => ({
    current: runtime.fighter.health,
    max: runtime.fighter.maxHealth,
    // Up while the thing is alive and hostile, down the moment it is not. A
    // corpse does not need a health bar, and neither does an encounter that has
    // not started.
    visible: runtime.fighter.health > 0 && runtime.fighter.state !== "dead",
  }), [runtime]);
  return (
    <>
      <Ecctrl
        ref={runtime.handle}
        position={runtime.start}
        rotation={[0, runtime.startYaw, 0]}
        maxWalkVel={runtime.archetype.locomotion.walkSpeed}
        maxRunVel={runtime.archetype.locomotion.runSpeed}
        accDeltaTime={runtime.archetype.locomotion.accelerationSeconds}
        decDeltaTime={runtime.archetype.locomotion.decelerationSeconds}
        rejectVelFactor={0.92}
        airDragFactor={0.06}
        useCustomForward
        lockForward
        autoBalance={false}
        enabledRotations={[false, true, false]}
        enableToggleRun={false}
        capsuleHalfHeight={CHARACTER_CAPSULE_HALF_HEIGHT}
        capsuleRadius={CHARACTER_CAPSULE_RADIUS}
        floatHeight={CHARACTER_FLOAT_HEIGHT}
        rayRadius={CHARACTER_RAY_RADIUS}
        rayHitForgiveness={CHARACTER_RAY_HIT_FORGIVENESS}
        springK={CHARACTER_SPRING_K}
        dampingC={CHARACTER_DAMPING_C}
        colliders={false}
        name={runtime.bodyName}
      >
        <Suspense fallback={null}>
        <SkyrimFighter
          animationCommandRef={runtime.animCommand}
          animationTimeRef={runtime.actionTimeRef}
          weaponProfile={runtime.archetype.loadout.mainHand.visual}
          offHandProfile={runtime.archetype.loadout.offHand?.visual ?? null}
          animationPacks={enemyAnimationPacks}
          armour={enemyArmour}
          buildId={buildId(runtime.archetype.race, runtime.archetype.sex)}
          speedMultiplierRef={runtime.animationSpeed}
          modelOffsetY={CHARACTER_MODEL_OFFSET}
          equipped
          weaponRef={runtime.weapon}
          offHandRef={runtime.offHand}
          targetAnchorRef={runtime.targetAnchor}
          hurtboxRef={runtime.hurtbox}
          soleBoneRefs={runtime.soleBones}
          aimPitchRef={runtime.archetype.loadout.mainHand.stats.ranged ? runtime.aimPitch : undefined}
          bowDraw={{ fraction: runtime.bowDrawFraction, release: runtime.bowRelease }}
          quiver={runtime.archetype.loadout.mainHand.stats.ranged && DEFAULT_ARROW.quiver
            ? { asset: DEFAULT_ARROW.quiver.asset, socket: DEFAULT_ARROW.quiver.socket }
            : null}
          nockedArrow={runtime.archetype.loadout.mainHand.stats.ranged
            ? {
              asset: DEFAULT_ARROW.asset,
              visible: true,
              visibleRef: runtime.nockVisible,
              aimDirection: runtime.aimDirection,
              nockWorld: runtime.nockWorld,
            }
            : null}
          visualProbe={validation ? runtime.visualProbe : undefined}
          visualSupportY={0}
        />
        </Suspense>
        <LockOnReticle visible={reticleVisible} anchor={runtime.targetAnchor} />
        <ActorHealthBar anchor={runtime.targetAnchor} read={readEnemyHealth} />
      </Ecctrl>
      {hasSkeletalHurtbox(runtime.archetype.sex)
        ? <SkeletalHurtbox rig={runtime.hurtbox} name={runtime.hurtboxName} sex={runtime.archetype.sex} probe={validation} />
        : <CapsuleHurtbox controller={runtime.handle} name={runtime.hurtboxName} />}
      <HeldObjectHitbox
        object={runtime.weapon}
        margin={0}
        overlaps={runtime.overlaps}
        name={runtime.weaponName}
        active={runtime.hitboxActive}
        outline={showWeaponHitboxes}
        outlineColor="#ff9d4d"
      />
      <HeldObjectHitbox
        object={runtime.parryObject}
        margin={PARRY_VOLUME_MARGIN_METERS}
        overlaps={runtime.parryOverlaps}
        name={`enemy-parry-shield-${runtime.id}`}
        active={runtime.parryActive}
        outline={showWeaponHitboxes}
        outlineColor="#4dd2ff"
      />
    </>
  );
}
