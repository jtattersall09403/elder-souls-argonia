/// <reference types="vite/client" />

declare module "*.css";

type VisualScenarioTelemetry = {
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
    player: import("@elder-souls/game-core/validation/actorVisualMetrics").ActorVisualSample | null;
    enemy: import("@elder-souls/game-core/validation/actorVisualMetrics").ActorVisualSample | null;
  }>;
};

interface Window {
  __COMBAT_VISUAL_SCENARIO__?: VisualScenarioTelemetry;
}
