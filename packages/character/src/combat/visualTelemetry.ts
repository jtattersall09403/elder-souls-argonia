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
