import type { AnimationState } from "../core/types";
import type { SupportMode } from "../anim/animationManifest";

/**
 * Render-pose evidence sampled from the real Skyrim actor after its mixer and
 * grounding pass. The validation suite consumes this; gameplay never branches
 * on it. Keeping the probe data-only lets future actors expose the same small
 * contract without coupling validation to a particular renderer.
 */
export type ActorVisualPoint = {
  position: [number, number, number];
  /** Local bone rotation, used to measure authored articulation. */
  quaternion: [number, number, number, number];
  /** Final world rotation. Published for the pelvis frame anchor only. */
  worldQuaternion?: [number, number, number, number];
};

export type ActorVisualSample = {
  animation: AnimationState;
  /** Monotonic command generation; distinguishes same-semantic restarts from loops. */
  commandSerial: number;
  clip: string | null;
  clipTime: number;
  actionWeight: number;
  outgoingClip: string | null;
  outgoingActionWeight: number;
  rootOffsetY: number;
  /** Final actor-render-root world height after support correction. */
  rootWorldY: number;
  rootWorldQuaternion: [number, number, number, number];
  groundCorrectionY: number;
  /** Baked visible-surface estimate before support correction. */
  uncorrectedSurfaceY: number | null;
  /** Target selected by the semantic support solver for this pose. */
  requiredGroundCorrectionY: number | null;
  /** Resolved support policy at this exact source-clip sample. */
  supportMode: SupportMode;
  /**
   * True while support is solved from blended sole-marker geometry rather than
   * either clip's own baked envelope. A blended pose can put a heel below both
   * endpoint clips, so the correction this frame legitimately exceeds what any
   * authored pose demands; validation reads this instead of reconstructing the
   * runtime's blend rules.
   */
  blendedSupportProxy: boolean;
  actorBaseY: number;
  groundY: number;
  soleGap: number | null;
  meshGap: number | null;
  meshTop: number | null;
  /** Per-skinned-mesh world-space bounds, retained to diagnose a bad aggregate without guessing which surface moved. */
  meshBounds: Record<string, { min: [number, number, number]; max: [number, number, number] }>;
  bones: Record<string, ActorVisualPoint>;
  weaponGrip: [number, number, number] | null;
  weaponTip: [number, number, number] | null;
};

export type ActorVisualProbe = {
  current: ActorVisualSample | null;
  missingBones: string[];
};

export function createActorVisualProbe(): ActorVisualProbe {
  return { current: null, missingBones: [] };
}

/** Stable, deliberately small set used for grounding, jitter, and pose-role checks. */
export const VISUAL_PROBE_BONES = {
  pelvis: "NPC_Pelvis_Pelv",
  spine2: "NPC_Spine2_Spn2",
  head: "NPC_Head_Head",
  upperArmL: "NPC_UpperArm_UarL",
  forearmL: "NPC_Forearm_LarL",
  handL: "NPC_Hand_HndL",
  upperArmR: "NPC_UpperArm_UarR",
  forearmR: "NPC_Forearm_LarR",
  handR: "NPC_Hand_HndR",
  thighL: "NPC_Thigh_ThgL",
  calfL: "NPC_Calf_ClfL",
  footL: "NPC_Foot_ft_L",
  toeL: "NPC_Toe0_ToeL",
  thighR: "NPC_Thigh_ThgR",
  calfR: "NPC_Calf_ClfR",
  footR: "NPC_Foot_ft_R",
  toeR: "NPC_Toe0_ToeR",
} as const;
