import * as THREE from "three";
import type { PlayerMovementController } from "../physics/PlayerMovementController";
import type { PlayerIntent } from "../combat/intent";
import type { AnimationState } from "../core/types";
import {
  createAnimationCommand,
  updateAnimationCommand,
  type AnimationCommand,
} from "../anim/animationCommand";
import { landingAnimationSpeed, selectLandingAnimation } from "../anim/landing";
import { locomotionSpeedMultiplier } from "../anim/locomotionCadence";
import { clipPlaybackSourceSpan } from "../anim/animationManifest";
import { JUMP_LAUNCH_ANIMATION_DURATION } from "../physics/characterPhysics";
import { analogueMoveSpeed, cameraRelativeDirection } from "../io/input";
import { CROUCH_SPEED, crouchLocomotionAnimation, nextStance, type Stance } from "./stance";

/**
 * Grounded exploration locomotion behind the `PlayerMovementController`
 * boundary: movement/sprint/jump intent in, controller steering plus semantic
 * locomotion animation out.
 *
 * The behaviour replicates the combat sandbox's free-roam locomotion branch
 * (`CombatScene.tsx`: sprint gating on a held dodge, landing selection from
 * peak descent speed, cadence-matched playback rates, analogue speed clamp,
 * released-input velocity settle) minus everything combat: no stamina, no
 * actions, no lock-on. The sandbox keeps its inline combat-entangled copy;
 * this module is the shared non-combat core the world studio runs on, and the
 * sandbox migrates onto it when its scene orchestration is next reworked
 * (master plan §53).
 */
export class ExplorerLocomotion {
  readonly animationCommand: AnimationCommand = createAnimationCommand("IDLE");
  /** Playback-rate multiplier for the active clip; feed to the actor. */
  animationSpeed = 1;
  sprinting = false;
  moveMagnitude = 0;
  /** Standing or crouching. Read by stealth and by anything sizing the actor. */
  stance: Stance = "standing";

  private dodgeHold = 0;
  private jumpStartTimer = 0;
  private airborneTime = 0;
  private landingArmed = false;
  private maximumDownwardSpeed = 0;
  private landingTimer = 0;
  private landingDuration = 0.42;
  private landingAnimation: Extract<
    AnimationState,
    "JUMP_LAND" | "JUMP_LAND_LEFT" | "JUMP_LAND_RIGHT"
  > = "JUMP_LAND";
  private readonly steerDirection = new THREE.Vector3();
  private readonly velocity = new THREE.Vector3();

  reset(): void {
    updateAnimationCommand(this.animationCommand, "IDLE", 0, true, null);
    this.animationSpeed = 1;
    this.sprinting = false;
    this.moveMagnitude = 0;
    this.stance = "standing";
    this.dodgeHold = 0;
    this.jumpStartTimer = 0;
    this.airborneTime = 0;
    this.landingArmed = false;
    this.maximumDownwardSpeed = 0;
    this.landingTimer = 0;
  }

  update(
    controller: PlayerMovementController,
    intent: PlayerIntent,
    cameraYaw: number,
    delta: number,
  ): void {
    if (!controller.ready) return;
    const grounded = controller.isGrounded();
    this.landingTimer = Math.max(0, this.landingTimer - delta);
    this.jumpStartTimer = Math.max(0, this.jumpStartTimer - delta);

    // Coyote window: on real terrain the suspension loses its ray for a few
    // frames whenever the ground falls away underfoot (downhill running, chunk
    // seams, small bumps). Treating every flicker as flight played the falling
    // pose downhill and a landing stumble after each bump — only sustained
    // loss of ground counts as airborne. (The sandbox's flat arena never
    // exercised this; keep in mind if its inline FSM meets terrain later.)
    this.airborneTime = grounded ? 0 : this.airborneTime + delta;
    const airborne = this.airborneTime > 0.15;

    const moveMagnitude = Math.min(1, Math.hypot(intent.move.x, intent.move.y));
    this.moveMagnitude = moveMagnitude;

    // Landing: arm while airborne, remember the fastest descent, and pick the
    // touchdown reaction from it — same rule as the sandbox.
    if (airborne) this.landingArmed = true;
    if (this.landingArmed || airborne) {
      this.maximumDownwardSpeed = Math.max(
        this.maximumDownwardSpeed,
        -controller.verticalVelocity(),
      );
    }
    if (this.landingArmed && grounded) {
      const landing = selectLandingAnimation({
        velocity: controller.linearVelocity(this.velocity),
        impactSpeed: this.maximumDownwardSpeed,
      });
      this.landingAnimation = landing.animation;
      this.landingDuration = landing.duration;
      this.landingTimer = landing.duration;
      this.maximumDownwardSpeed = 0;
      this.landingArmed = false;
    }

    // Sprint is a held dodge over a moving stick, exactly as in combat.
    if (intent.dodgePressed) this.dodgeHold = 0;
    if (intent.dodgeHeld) this.dodgeHold += delta;
    this.sprinting = intent.dodgeHeld && this.dodgeHold > 0.22 && moveMagnitude > 0.15;
    // Crouch resolves after sprint, because breaking into a run stands you up.
    this.stance = nextStance(this.stance, {
      toggled: intent.crouchPressed,
      grounded,
      acting: false,
      sprinting: this.sprinting,
    });
    const crouching = this.stance === "crouching" && grounded;

    if (intent.jumpPressed && grounded && !crouching) {
      this.jumpStartTimer = JUMP_LAUNCH_ANIMATION_DURATION;
      this.landingTimer = 0;
      this.maximumDownwardSpeed = 0;
    }

    // Face where the camera looks; ecctrl turns smoothly toward it.
    const forward = cameraRelativeDirection({ x: 0, y: 1 }, cameraYaw);
    this.steerDirection.set(forward.x, 0, forward.z).normalize();
    controller.steer(this.steerDirection);
    controller.setMovement({
      joystick: { x: intent.move.x, y: intent.move.y },
      run: this.sprinting,
      // A crouched actor stands up to jump rather than hopping in a crouch;
      // the stance clears itself above the moment it leaves the ground.
      jump: intent.jumpHeld && !crouching,
    });

    // Ecctrl normalises joystick input; restore analogue magnitude to planar
    // speed, and snap the residual slide to zero once input fully releases.
    const planar = controller.linearVelocity(this.velocity);
    const planarSpeed = Math.hypot(planar.x, planar.z);
    if (moveMagnitude > 0.01) {
      const maximum = analogueMoveSpeed(moveMagnitude, this.sprinting, crouching ? CROUCH_SPEED : undefined);
      if (planarSpeed > maximum && planarSpeed > 0.001) {
        const scale = maximum / planarSpeed;
        controller.setLinearVelocity({ x: planar.x * scale, y: planar.y, z: planar.z * scale });
      }
    } else if (grounded && (planar.x !== 0 || planar.z !== 0)) {
      controller.setLinearVelocity({ x: 0, y: planar.y, z: 0 });
    }

    const moveSpeed = Math.min(
      controller.moveSpeed(),
      analogueMoveSpeed(moveMagnitude, this.sprinting, crouching ? CROUCH_SPEED : undefined),
    );
    const locomotion: AnimationState = this.jumpStartTimer > 0
      ? "JUMP_START"
      : this.landingTimer > 0
        ? this.landingAnimation
        : airborne
          ? "JUMP_IDLE"
          : crouching
            ? crouchLocomotionAnimation(intent.move, moveMagnitude)
          : this.sprinting
            ? "SPRINT"
            : moveMagnitude > 0.72
              ? "RUN"
              : moveMagnitude > 0.08
                ? "WALK"
                : "IDLE";
    this.animationSpeed = this.jumpStartTimer > 0
      ? (clipPlaybackSourceSpan("JUMP_START") ?? JUMP_LAUNCH_ANIMATION_DURATION)
        / JUMP_LAUNCH_ANIMATION_DURATION
      : this.landingTimer > 0
        ? landingAnimationSpeed(this.landingDuration, this.landingAnimation)
        : locomotionSpeedMultiplier(locomotion, moveSpeed);
    updateAnimationCommand(this.animationCommand, locomotion, 0, false, null);
  }
}
