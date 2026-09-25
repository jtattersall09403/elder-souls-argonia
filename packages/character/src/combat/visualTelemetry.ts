import type { ActorVisualSample } from "@elder-souls/game-core/validation/actorVisualMetrics";

/**
 * What a scripted validation scene publishes on `window` for the capture
 * harness (`apps/combat-sandbox/scripts/capture-visual-scenarios.mjs`) to read.
 * Written only when the runtime is given a `visualScenario`.
 */
export type VisualScenarioTelemetry = {
  scenario: string;
  label: string;
  elapsed: number;
  ready: boolean;
  done: boolean;
  playerAction: string;
  playerAnimation: string;
  enemyAction: string;
  enemyAnimation: string;
  playerHealth: number;
  /** Facings, radians, for scenes that check who is looking where. */
  playerYaw?: number;
  cameraYaw?: number;
  enemyYaw?: number;
  enemyBodyYaw?: number;
  lastArrow?: { origin: number[]; velocity: number[]; shooter: string } | null;
  enemyNock?: number[];
  enemyHandR?: number[];
  enemyPosition?: number[];
  playerPosition?: number[];
  enemyBearingToPlayer?: number;
  enemyHealth: number;
  actorDistance: number | null;
  observedPlayerActions: string[];
  observedPlayerAnimations: string[];
  observedEnemyActions: string[];
  observedEnemyAnimations: string[];
  events: Array<{
    time: number;
    playerAction: string;
    playerAnimation: string;
    enemyAction: string;
    enemyAnimation: string;
    enemyHealth: number;
    actorDistance: number | null;
  }>;
  /** The enemy's awareness of the player now (decision 0092). */
  enemyAwareness?: "unaware" | "suspicious" | "engaged";
  /** Every change of the enemy's awareness, in order, with its suspicion then. */
  awarenessEvents?: Array<{ time: number; awareness: "unaware" | "suspicious" | "engaged"; suspicion: number }>;
  /**
   * Swimming, every frame of a scene run beside water (decision 0093): the
   * mode, the chest's height against the surface, whether the weapon is
   * drawn and whether ecctrl reports ground.
   */
  swimSamples?: Array<{
    time: number;
    swimming: boolean;
    /** Swimming with no ground under the feet: the float spring holds the chest at the surface. */
    floating: boolean;
    chestY: number;
    surfaceY: number;
    inWater: boolean;
    equipped: boolean;
    grounded: boolean;
  }>;
  /**
   * Every sound event the scene emitted, counted by type (decision 0095): what
   * the headless check holds each attacks and stealth scene to.
   */
  soundEvents?: Partial<Record<string, number>>;
  /**
   * Every blow the player landed on an enemy, per hand: what proves each blade
   * of a dual-wield attack resolves its own contact (decision 0091).
   */
  playerHits?: Array<{ time: number; attack: string; hand: "main" | "off"; damage: number; enemyHealthAfter: number }>;
  visualFrames: Array<{
    time: number;
    /** Integer fixed-step index encoded into the pixels of this rendered frame. */
    simulationFrame: number;
    /** Diagnostic wall time only; the encoded pixel marker is capture authority. */
    captureWallTimeMs: number;
    /** Horizontal rigid-body centre distance sampled with this rendered pose. */
    actorDistance: number | null;
    lockedOn: boolean;
    aiming: boolean;
    /** Angular distance from screen centre to the lock target's aim point. */
    lockTargetAimErrorDegrees: number | null;
    player: ActorVisualSample | null;
    enemy: ActorVisualSample | null;
  }>;
};

declare global {
  interface Window {
    __COMBAT_VISUAL_SCENARIO__?: VisualScenarioTelemetry;
  }
}
