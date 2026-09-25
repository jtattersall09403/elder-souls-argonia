import type { FootContact, SoundEventBus } from "@elder-souls/audio";
import type { AimView, CombatAction } from "@elder-souls/game-core/core/types";
import type { BowPhase } from "@elder-souls/game-core/combat/bowShot";
import type { LightEnvironment } from "@elder-souls/game-core/fx/carriedLight";
import type { Awareness } from "@elder-souls/game-core/perception/detection";
import type { WaterSampler } from "@elder-souls/game-core/physics/waterSampler";
import type { FlightSample } from "../Arrows";
import type { SoundEmitters } from "./soundStep";

/**
 * What a host hands the combat runtime, and what the runtime hands back.
 *
 * The runtime owns no store: every tuning switch comes in as a prop and every
 * HUD number goes out through `publish`. The sandbox wires both to its own
 * debug store; the world studio (Phase 10b) and the game wire them to theirs.
 */

/**
 * The switches a host sets. Read on every render, and through a ref inside the
 * frame loop, so a changed value takes effect on the next frame.
 */
export type CombatRuntimeSettings = {
  /** False until the player has pressed start; nothing simulates before it. */
  started: boolean;
  /** Bumped by the host to restart the encounter. */
  resetToken: number;
  enemyEnabled: boolean;
  enemyAiEnabled: boolean;
  /** How many of the spawn points are occupied. */
  enemyCount: number;
  /** The archetype every spawned enemy uses (`actors/enemyArchetypes`). */
  enemyArchetypeId: string;
  /**
   * Weapon and parry volumes only, drawn by combat itself (not Rapier's debug
   * renderer, which draws every collider in the world).
   */
  showWeaponHitboxes: boolean;
  /** Each enemy's backstab sector drawn on the ground. */
  showBackstabZones: boolean;
  /**
   * Take a committed action's movement from its own feet rather than from the
   * attack's authored `lunge` speed (`locomotion/footAnchoredMotion`). Off
   * restores the constant-velocity lunge exactly.
   */
  footDrivenMotion: boolean;
  /**
   * Locked-on strafing and back-walking move at the speed their clips were
   * authored for (owner, 2026-09-04). Off restores the fixed locked-on walk.
   */
  lockedSpeedFollowsClip: boolean;
  /** Top playback rate of a locked strafe or back-walk (`LOCKED_STRIDE_RATE`). */
  lockedStrideRate: number;
  /** Gravity multiplier on arrows in flight; 1 is real gravity. */
  arrowGravityScale: number;
  /**
   * The skill curves are a switch. Off, every modifier is neutral (the feel
   * the visual scenarios were tuned against); on, the skills below drive the
   * stats model's curves (`stats/modifiers`).
   */
  skillsEnabled: boolean;
  marksmanSkill: number;
  meleeSkill: number;
  /** The weapon-class effects slot (`combat/classEffects`). */
  classEffectsEnabled: boolean;
  aimView: AimView;
  playerMaxHealth: number;
  playerMaxStamina: number;
  poiseEnabled: boolean;
  /**
   * Stealth (decision 0092). Off, every enemy starts engaged (the behaviour
   * the calibrated scenes were tuned against); on, every enemy starts unaware
   * and has to see or hear the player first.
   */
  stealthStart: boolean;
  /** The player's Sneak skill, 0-100: elusiveness and the sneak-attack table. */
  sneakSkill: number;
  /** Light on the player, 0 (dark) to 1 (lit), when no carried light is lit. */
  ambientLight: number;
};

/** The numbers the runtime publishes for a HUD, every 50 ms and on events. */
export type CombatHudState = {
  playerHealth: number;
  playerStamina: number;
  enemyHealth: number;
  estus: number;
  equipped: boolean;
  lockedOn: boolean;
  /** Enemy id of the lock target, -1 when not locked. */
  lockedTarget: number;
  playerAction: CombatAction;
  enemyAction: string;
  message: string;
  gamepad: string;
  /** Bumped on every hit the player takes, for a damage vignette. */
  damagePulse: number;
  aiming: boolean;
  bowPhase: BowPhase;
  drawFraction: number;
  arrowsLeft: number;
  aimZoom: number;
  /**
   * Angle between the crosshair ray and the line the shot actually leaves on,
   * degrees. Debug panel only.
   */
  aimErrorDegrees: number;
  playerPoise: number;
  playerMaxPoise: number;
  /**
   * The most alert living enemy (engaged over suspicious over unaware) and its
   * suspicion, 0-1: the HUD's detection meter.
   */
  detection: { level: number; awareness: Awareness };
  /** The player is swimming (decision 0093). */
  swimming: boolean;
  /**
   * Seconds the player's head has been under the surface without a break,
   * 0 while it is above: what Phase 9a's breath bar will count down from.
   */
  submergedSeconds: number;
};

export type CombatRuntimeHost = {
  settings: CombatRuntimeSettings;
  publish: (hud: Partial<CombatHudState>) => void;
  /** Every simulated step of every arrow in flight; probes only. */
  onArrowSample?: (sample: FlightSample) => void;
  /**
   * What the world does to a carried light at a world position, metres
   * (decision 0091): today only whether it is under water, which puts a torch
   * out without using it up. Absent means dry everywhere (the sandbox arena).
   * When absent and `water` is given, the runtime asks the water sampler.
   */
  lightEnvironment?: (worldPosition: { x: number; y: number; z: number }) => LightEnvironment;
  /**
   * The world's water (decision 0093): where the player swims, and where a
   * carried light is under water. The sandbox passes its pool
   * (`flatPoolSampler`); the world studio passes its `WaterWorld` (10b).
   * Absent means dry everywhere: no swimming.
   */
  water?: WaterSampler;
  /**
   * The session's sound-event bus (decision 0095): every swing, hit, block,
   * draw, bow cycle, footstep, jump and stroke the encounter makes is emitted
   * on it, and the stealth feed hears the player's own events off it. The host
   * attaches its AudioManager to the same bus. Absent: the runtime keeps a
   * private bus, so stealth still hears with no speakers.
   */
  sounds?: SoundEventBus;
  /** Continuous sources (a lit carried torch) play through the host's AudioManager. Absent: silent. */
  soundEmitters?: SoundEmitters;
  /**
   * What the ground under a foot is made of (module 75 §54): the collider's
   * physical material or the terrain's ground-material id at a world position.
   * The runtime adds the water depth from `water`. Absent: dirt.
   */
  groundContact?: (worldPosition: { x: number; y: number; z: number }) => Omit<FootContact, "waterDepthM">;
};
