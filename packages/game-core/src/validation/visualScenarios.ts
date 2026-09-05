import type { AimView, AnimationState } from "../core/types";
import type { EnemyIntent } from "../ai/enemyAi";
import type { InputAction, InputController } from "../io/input";
import { CHARACTER_BODY_CENTER_HEIGHT } from "../physics/characterPhysics";
import { COMBAT_TUNING } from "../combat/weapon";

export const VISUAL_SCENARIO_IDS = [
  "locomotion-free",
  "locomotion-lock-on",
  "equip-cycle",
  "light-chain",
  "heavy-chain",
  "guard-defense",
  "parry",
  "heal",
  "hit-reactions",
  "death",
  "backstab",
  "riposte",
  "riposte-stab",
  "riposte-lethal",
  "backstab-lethal",
  "guard-break",
  "offense-outcomes",
  "enemy-block",
  "enemy-parry",
  "enemy-light-combo",
  "enemy-heavy-attack",
  "enemy-approach",
  "enemy-evasion",
  "enemy-utility",
  "dodge-followups",
  "roll",
  "backstep",
  "stationary-landing",
  "moving-landing",
  "bow-shot",
  "bow-partial-draw",
  "bow-aim-tracking",
  "bow-aim-turn",
  "bow-drawn-hold",
  "bow-drawn-hold-shoulder",
  "bow-drawn-locomotion",
  "archer-shot",
  "riposte-queued",
  "crouch-locomotion",
  "shield-guard",
  "shield-parry",
  "greatsword-locomotion",
  "greatsword-chain",
  "greatsword-guard",
  "greataxe-parry",
  "greatsword-riposte",
  "greataxe-riposte",
  "greataxe-backstab",
  "greataxe-chain",
  "poise-break",
] as const;

export type VisualScenarioId = typeof VISUAL_SCENARIO_IDS[number];
export type VisualScenarioEnemyState = "watching" | "attack" | "parried" | "guard";
export type VisualScenarioAttack = "light1" | "heavy" | "heavy2";

/** A deterministic choice fed through the same enemy-intent dispatcher as AI. */
export type VisualScenarioEnemyCue = {
  intent: EnemyIntent;
  /** Removes random attack-variant selection without starting an animation directly. */
  attack?: VisualScenarioAttack;
  /** Remaining light-chain successors: 0 is standalone, 2 exercises all three hits. */
  comboRemaining?: 0 | 1 | 2;
  /** Deterministic side for strafe/dodge choices that production normally randomises. */
  side?: -1 | 1;
};

type InputCue = {
  from: number;
  to: number;
  actions?: readonly InputAction[];
  move?: readonly [number, number];
  /**
   * Camera stick, in the same units the touch/mouse path accumulates.
   *
   * Applied per second rather than per frame, so a cue means the same thing at
   * any capture rate. Needed to exercise anything that answers the *look*
   * input rather than the movement one — an aimed bow leaning to where the
   * player is looking, for instance, which nothing else in the driver can
   * reach.
   */
  camera?: readonly [number, number];
};

type EnemyCue = VisualScenarioEnemyCue & {
  at: number;
};

export type VisualScenario = {
  id: VisualScenarioId;
  label: string;
  warmup: number;
  duration: number;
  player: {
    position: readonly [number, number, number];
    yaw: number;
    health?: number;
    equipped?: boolean;
    /**
     * Item to hold, when the scene is about a weapon the player does not start
     * with. Equipped through the ordinary inventory, so the scene exercises the
     * same path a player does rather than a validation-only shortcut.
     */
    weaponId?: string;
    /** Ammunition to nock, for the same reason. */
    ammoId?: string;
    /** How a raised bow is viewed in this scene (default: first person). */
    aimView?: AimView;
    /** Off-hand item, for the scenes about guarding behind a shield. */
    offHandId?: string;
    /**
     * Start with nothing in the off hand.
     *
     * The sandbox character starts wearing a shield, and a shield now decides
     * how a guard is held. The scenes that are about the *weapon's* block have
     * to say so explicitly, or they quietly become second shield scenes.
     */
    emptyOffHand?: boolean;
    /**
     * Run this scene with poise disabled, so every hit interrupts.
     *
     * For the scenes that review a *reaction clip*: under poise an armoured
     * actor shrugs off single light hits (module 76 §121.3), which is correct,
     * and is what `poise-break` exists to show — but it means a scene staged to
     * render HIT no longer does. Bending those setups until a reaction falls
     * out would make them worse evidence of the thing they are for. Saying
     * which rule a scene isolates is the honest alternative.
     */
    poise?: boolean;
  };
  enemy: {
    enabled: boolean;
    position: readonly [number, number, number];
    yaw: number;
    state: VisualScenarioEnemyState;
    animation: AnimationState;
    attack?: VisualScenarioAttack;
    health?: number;
    stamina?: number;
    holdInitialState?: boolean;
    /** Enemy archetype for the scene (default: the reference warden). */
    archetypeId?: string;
  };
  cues: readonly InputCue[];
  enemyCues?: readonly EnemyCue[];
};

const Y = CHARACTER_BODY_CENTER_HEIGHT;
const SOLO_ENEMY = {
  enabled: false,
  position: [8, Y, -8] as const,
  yaw: 0,
  state: "watching" as const,
  animation: "SWORD_IDLE" as const,
};
const FACING_ENEMY = {
  enabled: true,
  position: [0, Y, 0] as const,
  yaw: 0,
  state: "watching" as const,
  animation: "SWORD_IDLE" as const,
};
// A shallow diagonal preserves normal melee distance/facing while preventing
// the rear production camera from hiding one actor directly behind the other.
const REVIEW_PLAYER = { position: [0, Y, 1.2] as const, yaw: Math.atan2(0.65, -1.2) };
const REVIEW_ENEMY = {
  ...FACING_ENEMY,
  position: [0.65, Y, 0] as const,
  yaw: Math.atan2(-0.65, 1.2),
};
// Focused two-actor reviews start outside the old 1.365 m showcase spacing.
// A normal attack's production lunge can consume roughly 0.6 m before the
// authored contact; this arrangement keeps both torsos readable instead of
// letting the navigation capsules become the visible staging constraint.
// The riposte review opens wider than the other two-actor scenes. The enemy
// spends about 0.6 m of it lunging into the parry, and the execution then
// anchors the attacker at its measured 0.9 m reach; from the normal spacing
// that anchor would shove the attacker backwards as the execution begins.
const RIPOSTE_REVIEW_PLAYER = {
  position: [0, Y, 1.55] as const,
  yaw: Math.atan2(0.65, -1.55),
};
const RIPOSTE_REVIEW_ENEMY = {
  ...FACING_ENEMY,
  position: [0.65, Y, 0] as const,
  yaw: Math.atan2(-0.65, 1.55),
};
const FOCUSED_CONTACT_PLAYER = {
  position: [0, Y, 1.58] as const,
  yaw: Math.atan2(0.72, -1.58),
};
const FOCUSED_CONTACT_ENEMY = {
  ...FACING_ENEMY,
  position: [0.72, Y, 0] as const,
  yaw: Math.atan2(-0.72, 1.58),
};
// The three scenes in which the PLAYER's light attack has to reach a guarding
// or parrying enemy. Round 6 recentred the guard clips' planar origin
// (decision 0040 section 26); against the honestly placed guard the sword's
// light attack registers at 1.2 m and not at the 1.54 or 1.74 m spacings
// (both measured), so these scenes start at 1.2 m.
const GUARD_CONTACT_PLAYER = {
  position: [0, Y, 1.05] as const,
  yaw: Math.atan2(0.58, -1.05),
};
const GUARD_CONTACT_ENEMY = {
  ...FACING_ENEMY,
  position: [0.58, Y, 0] as const,
  yaw: Math.atan2(-0.58, 1.05),
};
const FOCUSED_REVIEW_PLAYER = {
  position: [0, Y, 2.45] as const,
  yaw: Math.atan2(0.85, -2.45),
};
const FOCUSED_REVIEW_ENEMY = {
  ...FACING_ENEMY,
  position: [0.85, Y, 0] as const,
  yaw: Math.atan2(-0.85, 2.45),
};
// The focused parry starts farther apart than REVIEW_PLAYER/REVIEW_ENEMY.
// Its cue centres the 0.10–0.29 s production parry window on the blade
// approach. This is the measured LIGHT_1 contact on the corrected-grip rig
// (source 0.508–0.542 s, taken at its centre); the previous 0.75 s was an
// estimate made while the weapon was still mounted 90° out of true.
export const FOCUSED_LIGHT_1_CONTACT_TIME = 0.53;

/**
 * Data-only arrangements for browser visual tests. Cues provide the same
 * virtual inputs as the HUD; they do not invoke combat outcomes or animations.
 * Battle setup may seed a prerequisite state, while enemy cues replace only
 * the utility-AI choice. The production combat FSM, Rapier bodies, hitboxes,
 * damage resolution, and actor renderer still execute every resulting action.
 */
export const VISUAL_SCENARIOS: Record<VisualScenarioId, VisualScenario> = {
  "locomotion-free": {
    id: "locomotion-free",
    label: "Free movement → walk, run, and sword sprint",
    warmup: 0.5,
    duration: 5.4,
    player: { position: [0, Y, 3], yaw: Math.PI },
    enemy: SOLO_ENEMY,
    cues: [
      { from: 0.15, to: 1.55, move: [0, 0.45] },
      { from: 1.7, to: 3.0, move: [0, 1] },
      { from: 3.15, to: 4.2, actions: ["dodge"], move: [0, 1] },
      { from: 4.2, to: 4.65, move: [0, 1] },
    ],
  },
  "locomotion-lock-on": {
    id: "locomotion-lock-on",
    label: "Lock-on movement → advance, retreat, and both strafes",
    warmup: 0.5,
    duration: 5.15,
    player: { position: [0, Y, 4], yaw: Math.PI },
    enemy: FACING_ENEMY,
    cues: [
      { from: 0.1, to: 0.19, actions: ["lockOn"] },
      { from: 0.38, to: 1.35, move: [0, 0.42] },
      { from: 1.5, to: 2.48, move: [0, -0.42] },
      { from: 2.65, to: 3.63, move: [-0.42, 0] },
      { from: 3.8, to: 4.78, move: [0.42, 0] },
    ],
  },
  "equip-cycle": {
    id: "equip-cycle",
    label: "Sheathe → unarmed idle → draw sword",
    warmup: 0.5,
    duration: 4.45,
    player: { position: [0, Y, 0], yaw: Math.PI },
    enemy: SOLO_ENEMY,
    cues: [
      { from: 0.15, to: 0.24, actions: ["equip"] },
      { from: 2.45, to: 2.54, actions: ["equip"] },
    ],
  },
  "light-chain": {
    id: "light-chain",
    label: "Three-input light combo → complete three-hit chain",
    warmup: 0.5,
    duration: 4.2,
    player: { position: [0, Y, 0], yaw: Math.PI },
    enemy: SOLO_ENEMY,
    // Every press moved 0.15 s later, together, so the chain's own windows are
    // untouched and only the opening idle is longer. It was 0.15 s — shorter
    // than the capture's sampling interval — so whether the scene recorded an
    // idle run at all came down to where a frame happened to land, and the
    // scene failed roughly every other run. Nothing about the chain changed.
    cues: [
      { from: 0.3, to: 0.39, actions: ["light"] },
      { from: 0.77, to: 0.86, actions: ["light"] },
      { from: 1.87, to: 1.96, actions: ["light"] },
    ],
  },
  "heavy-chain": {
    id: "heavy-chain",
    label: "Two-input heavy combo → complete two-hit chain",
    warmup: 0.5,
    duration: 3.6,
    player: { position: [0, Y, 0], yaw: Math.PI },
    enemy: SOLO_ENEMY,
    // Both presses moved 0.15 s later together, for the same sampling reason
    // as the light chain.
    cues: [
      { from: 0.3, to: 0.39, actions: ["heavy"] },
      // Queue input opens when the swing commits, which is now the measured
      // blade sweep rather than a flat fraction of the clip.
      { from: 0.97, to: 1.06, actions: ["heavy"] },
    ],
  },
  "guard-defense": {
    id: "guard-defense",
    label: "Guard → two blocks, release during block-stun, and complete recovery",
    warmup: 0.5,
    duration: 5.95,
    player: { ...REVIEW_PLAYER, emptyOffHand: true },
    enemy: REVIEW_ENEMY,
    // Hold through the first complete hit and return to GUARD. Release shortly
    // after the second impact; production must still finish GUARD_HIT_B before
    // returning to idle instead of cancelling the reaction on button-up.
    // The guard goes up at 0.2 s rather than 0.05 s. The scene reviews idle →
    // guard → two blocks → recovery, and its opening idle was three frames
    // long, which is inside the capture's own sampling interval: whether that
    // run appeared at all came down to where a frame happened to land. A
    // fifth of a second is still an immediate guard and is reliably sampled.
    cues: [{ from: 0.2, to: 4.4, actions: ["guard"] }],
    enemyCues: [
      { at: 1.05, intent: "lightCombo", attack: "light1", comboRemaining: 0 },
      { at: 3.25, intent: "lightCombo", attack: "light1", comboRemaining: 0 },
    ],
  },
  parry: {
    id: "parry",
    label: "Parry input → catch and follow-through",
    warmup: 0.5,
    duration: 2.05,
    player: { position: [0, Y, 0], yaw: Math.PI, emptyOffHand: true },
    enemy: SOLO_ENEMY,
    cues: [{ from: 0.2, to: 0.29, actions: ["parry"] }],
  },
  heal: {
    id: "heal",
    label: "Damaged player uses Estus → heal animation and health recovery",
    warmup: 0.5,
    duration: 2.8,
    player: { position: [0, Y, 0], yaw: Math.PI, health: 24 },
    enemy: SOLO_ENEMY,
    cues: [{ from: 0.2, to: 0.29, actions: ["heal"] }],
  },
  "hit-reactions": {
    id: "hit-reactions",
    label: "Enemy light and heavy strikes → both player hit reactions",
    warmup: 0.5,
    duration: 5.7,
    player: { ...REVIEW_PLAYER, poise: false },
    enemy: REVIEW_ENEMY,
    // The opening light closes the initial gap. Walk backward through the
    // normal player controller after recovery so the later heavy's wider arc
    // reaches cleanly instead of passing around a target only 0.68 m away.
    cues: [{ from: 2.05, to: 2.42, move: [0, -0.4] }],
    enemyCues: [
      { at: 0.25, intent: "lightCombo", attack: "light1", comboRemaining: 0 },
      { at: 2.7, intent: "heavy", attack: "heavy" },
    ],
  },
  death: {
    id: "death",
    label: "Enemy setup strike → lethal repeat strike → player death",
    warmup: 0.5,
    // Reuse the production strike that demonstrably contacts from this setup:
    // the first hit establishes overlap/facing and the second is lethal. Leave
    // the 1.9s fall plus at least one full second of its clamped prone pose.
    duration: 7,
    player: { ...REVIEW_PLAYER, health: 34, poise: false },
    enemy: REVIEW_ENEMY,
    cues: [],
    enemyCues: [
      { at: 0.25, intent: "lightCombo", attack: "light1", comboRemaining: 0 },
      { at: 2.7, intent: "lightCombo", attack: "light1", comboRemaining: 0 },
    ],
  },
  backstab: {
    id: "backstab",
    label: "Rear light input → complete paired backstab and authored victim recovery",
    warmup: 0.5,
    duration: 7.9,
    player: { position: [0, Y, -1.15], yaw: 0 },
    enemy: FACING_ENEMY,
    cues: [{ from: 0.55, to: 0.64, actions: ["light"] }],
  },
  riposte: {
    id: "riposte",
    label: "Enemy attack → real parry → riposte hit reaction and full recovery",
    warmup: 0.5,
    duration: 8.8,
    player: { ...RIPOSTE_REVIEW_PLAYER, emptyOffHand: true },
    enemy: RIPOSTE_REVIEW_ENEMY,
    cues: [
      // LIGHT_1's contact window is the measured blade sweep, which opens
      // about 0.42s into the enemy's lunge and closes 0.25s later. Centre the
      // 0.10–0.29s parry window on it, then wait for the complete intro +
      // follow-through before requesting the riposte.
      { from: 0.6, to: 0.69, actions: ["parry"] },
      // Let the deflection settle before asking for the execution. Requested
      // any earlier, the parry's own follow-through blade is still sweeping
      // back across the victim while the RIPOSTE command is already live,
      // which reads as a contact beat that never resolves into damage.
      { from: 2.3, to: 2.39, actions: ["light"] },
    ],
    enemyCues: [{ at: 0.25, intent: "lightCombo", attack: "light1", comboRemaining: 0 }],
  },
  "riposte-stab": {
    id: "riposte-stab",
    label: "Dagger riposte — the stabbing clip (RIPOSTE_STAB) at its own separation",
    warmup: 0.5,
    duration: 8.8,
    player: { ...RIPOSTE_REVIEW_PLAYER, emptyOffHand: true, weaponId: "iron-dagger" },
    enemy: RIPOSTE_REVIEW_ENEMY,
    cues: [
      { from: 0.6, to: 0.69, actions: ["parry"] },
      { from: 2.3, to: 2.39, actions: ["light"] },
    ],
    enemyCues: [{ at: 0.25, intent: "lightCombo", attack: "light1", comboRemaining: 0 }],
  },
  "riposte-lethal": {
    id: "riposte-lethal",
    label: "Lethal riposte → immediate hit reaction and held prone outcome",
    warmup: 0.5,
    duration: 6.4,
    player: { position: [0, Y, 1.45], yaw: Math.PI, emptyOffHand: true },
    enemy: {
      ...FACING_ENEMY,
      state: "parried",
      animation: "GUARD_BREAK",
      health: 26,
      holdInitialState: true,
    },
    cues: [{ from: 0.55, to: 0.64, actions: ["light"] }],
  },
  "backstab-lethal": {
    id: "backstab-lethal",
    label: "Lethal rear input → paired backstab and held prone outcome",
    warmup: 0.5,
    duration: 6.5,
    player: { position: [0, Y, -1.15], yaw: 0 },
    enemy: { ...FACING_ENEMY, health: 26 },
    cues: [{ from: 0.55, to: 0.64, actions: ["light"] }],
  },
  "riposte-queued": {
    id: "riposte-queued",
    label: "Riposte requested *during* the parry → still lands when the window opens",
    warmup: 0.5,
    duration: 8.8,
    player: { ...RIPOSTE_REVIEW_PLAYER, emptyOffHand: true },
    enemy: RIPOSTE_REVIEW_ENEMY,
    cues: [
      { from: 0.6, to: 0.69, actions: ["parry"] },
      // Pressed while the parry clip is still running, which is when a player
      // reading the deflection actually presses it. The queue has to carry it
      // to the reward window rather than dropping it on the floor.
      { from: 0.95, to: 1.04, actions: ["light"] },
    ],
    enemyCues: [{ at: 0.25, intent: "lightCombo", attack: "light1", comboRemaining: 0 }],
  },
  "guard-break": {
    id: "guard-break",
    label: "Light input against depleted guard → posture break",
    warmup: 0.5,
    duration: 4.1,
    player: { ...GUARD_CONTACT_PLAYER, emptyOffHand: true },
    enemy: { ...GUARD_CONTACT_ENEMY, state: "guard", animation: "GUARD", stamina: 1, holdInitialState: true },
    cues: [{ from: 0.12, to: 0.21, actions: ["light"] }],
  },
  "offense-outcomes": {
    id: "offense-outcomes",
    label: "Real player hits → enemy heavy/light reactions and ordinary death",
    warmup: 0.5,
    // The final hit lands around 4.4 s; retain the full 1.9 s authored fall
    // plus at least one second of the clamped prone outcome.
    duration: 8.4,
    // Staged for honest feet. The one-handed HEAVY pivots round its planted
    // foot and carries the body 1.2 m to its RIGHT and 0.35 m back by the
    // time the blade lands (measured from the clip's own sole track,
    // `footAnchoredMotion`), and the blade itself sweeps 1.1-2.1 m to the
    // right of where the swing started, at head height. An attack does not
    // track its target (owner ruling 2026-09-04): the player commits from a
    // position the moveset will carry them through. So the heavy is thrown
    // first, UNLOCKED, at an enemy standing off the player's right shoulder —
    // a locked-on heavy faces its target and can never land this swing — and
    // the two lights follow locked on, from where the pivot leaves the body.
    player: { position: [0, Y, 1.2] as const, yaw: Math.PI, poise: false },
    enemy: {
      ...FACING_ENEMY,
      position: [1.6, Y, 1.1] as const,
      yaw: Math.atan2(-1.6, 0.1),
      health: 62,
    },
    cues: [
      { from: 0.25, to: 0.34, actions: ["heavy"] },
      { from: 1.9, to: 1.99, actions: ["lockOn"] },
      { from: 2.2, to: 2.29, actions: ["light"] },
      { from: 3.9, to: 3.99, actions: ["light"] },
    ],
  },
  "enemy-block": {
    id: "enemy-block",
    label: "Enemy guard → one real blade block and player recoil",
    warmup: 0.5,
    duration: 3.35,
    player: { ...GUARD_CONTACT_PLAYER, emptyOffHand: true },
    enemy: GUARD_CONTACT_ENEMY,
    cues: [
      // Swing late enough that the blade arrives after GUARD is established
      // and before the tactical hold expires. The light attack's contact was
      // re-measured on the corrected grip and now lands 0.22 s earlier in the
      // clip, so the cue moved with it.
      { from: 0.62, to: 0.71, actions: ["light"] },
    ],
    enemyCues: [{ at: 0.12, intent: "guard" }],
  },
  "enemy-parry": {
    id: "enemy-parry",
    label: "Enemy parry → one real blade intercept and player guard break",
    warmup: 0.5,
    // The guard-break stagger now plays at its authored 2.47s rather than a
    // compressed 1.75s, so the recording has to stay open long enough to show
    // the player recover from it.
    duration: 4.5,
    // A parry catches by timing (owner 2026-09-05): the blade reaching the
    // body during the active catch is enough, so the scene no longer depends
    // on the raised blade lying exactly in the swing's path.
    player: { ...GUARD_CONTACT_PLAYER, emptyOffHand: true },
    enemy: GUARD_CONTACT_ENEMY,
    cues: [{ from: 0.35, to: 0.44, actions: ["light"] }],
    enemyCues: [
      {
        at: 0.35 + FOCUSED_LIGHT_1_CONTACT_TIME
          - (COMBAT_TUNING.parryActiveStart + COMBAT_TUNING.parryActiveEnd) / 2,
        intent: "parry",
      },
    ],
  },
  "enemy-light-combo": {
    id: "enemy-light-combo",
    label: "Enemy light intent → complete three-hit production combo",
    warmup: 0.5,
    // The production three-hit chain reaches recover around 3.8 s and returns
    // to watching around 4.6 s; keep that final readable idle in-frame.
    duration: 4.9,
    player: { ...FOCUSED_CONTACT_PLAYER, health: 150, poise: false },
    enemy: FOCUSED_CONTACT_ENEMY,
    cues: [],
    enemyCues: [{ at: 0.2, intent: "lightCombo", attack: "light1", comboRemaining: 2 }],
  },
  "enemy-heavy-attack": {
    id: "enemy-heavy-attack",
    label: "Enemy heavy intent → HEAVY_2 contact and recovery",
    warmup: 0.5,
    duration: 3.2,
    // Starts beyond the lunge threshold, so the swing keeps its authored
    // lunge for the whole wind-up (an attack decides feet-or-lunge once, when
    // it starts); an enemy that starts in range would step back 0.58 m on
    // HEAVY_2's own feet first.
    player: { ...FOCUSED_CONTACT_PLAYER, health: 150, poise: false },
    enemy: FOCUSED_CONTACT_ENEMY,
    cues: [],
    enemyCues: [{ at: 0.2, intent: "heavy", attack: "heavy2" }],
  },
  "enemy-approach": {
    id: "enemy-approach",
    label: "Enemy approach intent → turn, walk, and accelerate to run",
    warmup: 0.5,
    // Show the whole gait arc: turn, walk, accelerate to a run as the player
    // retreats through the run threshold, then drop back to a walk when the
    // enemy closes through the hysteresis band. Ending before that last
    // transition hid the half of the behaviour most likely to be wrong.
    duration: 3.6,
    player: {
      position: [0, Y, 3.7],
      yaw: Math.atan2(1.8, -5),
    },
    enemy: {
      ...FACING_ENEMY,
      // 7.1 m out: beyond the six-metre run threshold from the start, because
      // a locked-on retreat now moves at the reverse stride's own 0.7 m/s and
      // could not open the gap itself (round 7). The enemy runs, then drops
      // to a walk through the hysteresis band as it closes.
      position: [2.4, Y, -3.0],
      // Begin about 60 degrees off-target so the review includes a real turn,
      // not merely a straight treadmill pass.
      yaw: -1.4,
    },
    cues: [
      { from: 0.05, to: 0.14, actions: ["lockOn"] },
      { from: 0.45, to: 2, move: [0, -0.75] },
      { from: 2, to: 3.15, move: [0.35, -0.75] },
    ],
    enemyCues: [{ at: 0.2, intent: "approach" }],
  },
  "enemy-evasion": {
    id: "enemy-evasion",
    label: "Enemy movement intents → both strafes, dodge, and backstep",
    warmup: 0.5,
    duration: 5.55,
    player: FOCUSED_REVIEW_PLAYER,
    enemy: FOCUSED_REVIEW_ENEMY,
    cues: [{ from: 0.05, to: 0.14, actions: ["lockOn"] }],
    enemyCues: [
      { at: 0.2, intent: "strafe", side: -1 },
      { at: 1.2, intent: "strafe", side: 1 },
      { at: 2.2, intent: "dodge", side: -1 },
      { at: 3.9, intent: "backstep" },
    ],
  },
  "enemy-utility": {
    id: "enemy-utility",
    label: "Enemy utility intents → heal, guard, and parry",
    warmup: 0.5,
    duration: 6.8,
    player: FOCUSED_REVIEW_PLAYER,
    enemy: { ...FOCUSED_REVIEW_ENEMY, health: 40 },
    cues: [{ from: 0.05, to: 0.14, actions: ["lockOn"] }],
    enemyCues: [
      { at: 0.2, intent: "heal" },
      { at: 2.7, intent: "guard" },
      { at: 4.65, intent: "parry" },
    ],
  },
  "dodge-followups": {
    id: "dodge-followups",
    label: "Roll follow-ups and interrupted backstep visual tail",
    warmup: 0.5,
    duration: 8.8,
    player: { position: [0, Y, 2], yaw: Math.PI },
    enemy: SOLO_ENEMY,
    cues: [
      { from: 0.1, to: 1.1, move: [0, 1] },
      { from: 0.35, to: 0.51, actions: ["dodge"], move: [0, 1] },
      { from: 0.65, to: 0.74, actions: ["light"], move: [0, 1] },
      { from: 3.2, to: 4.45, move: [0, 1] },
      { from: 3.45, to: 3.61, actions: ["dodge"], move: [0, 1] },
      { from: 3.75, to: 3.84, actions: ["heavy"], move: [0, 1] },
      { from: 6.4, to: 6.56, actions: ["dodge"] },
      // Leave a reviewable production-idle bridge after the backstep release;
      // two render samples were too short to judge that boundary honestly.
      { from: 7.3, to: 8.1, move: [0, 1] },
    ],
  },
  roll: {
    id: "roll",
    label: "Forward movement + dodge release → roll",
    warmup: 0.5,
    duration: 2.35,
    player: { position: [0, Y, 2], yaw: Math.PI },
    enemy: SOLO_ENEMY,
    // Both cues moved 0.15 s later together, so the run-up before the dodge is
    // exactly what it was. The scene opened with 0.1 s of idle, which is about
    // three frames of the capture — too few to reliably record the idle run the
    // check expects, so it failed intermittently under load.
    cues: [
      { from: 0.25, to: 1.75, move: [0, 1] },
      { from: 0.5, to: 0.66, actions: ["dodge"], move: [0, 1] },
    ],
  },
  backstep: {
    id: "backstep",
    label: "Stationary dodge release → backstep",
    warmup: 0.5,
    duration: 2.1,
    player: { position: [0, Y, 0], yaw: Math.PI },
    enemy: SOLO_ENEMY,
    cues: [{ from: 0.35, to: 0.51, actions: ["dodge"] }],
  },
  "stationary-landing": {
    id: "stationary-landing",
    label: "Stationary jump → launch, airborne loop, and grounded landing",
    warmup: 0.5,
    duration: 3.8,
    player: { position: [0, Y, 0], yaw: Math.PI },
    enemy: SOLO_ENEMY,
    cues: [{ from: 0.45, to: 0.58, actions: ["jump"] }],
  },
  "moving-landing": {
    id: "moving-landing",
    label: "Run and sprint jumps → physical touchdown → moving landings",
    warmup: 0.5,
    duration: 5.4,
    // The long run+sprint sequence travels about 20m. Start on the far half of
    // the 30m arena so the second recovery remains on the real collider instead
    // of silently turning into an off-platform fall after its valid landing.
    // Keep the real pillar ring present, but offset the production run line so
    // the north pillar does not sit directly between the third-person camera
    // and actor for the entire first jump.
    player: { position: [2, Y, 9], yaw: Math.PI },
    enemy: SOLO_ENEMY,
    cues: [
      { from: 0.1, to: 4.8, move: [0, 1] },
      { from: 0.45, to: 0.58, actions: ["jump"], move: [0, 1] },
      { from: 2.25, to: 4.2, actions: ["dodge"], move: [0, 1] },
      { from: 2.75, to: 2.88, actions: ["dodge", "jump"], move: [0, 1] },
    ],
  },
  "bow-shot": {
    id: "bow-shot",
    label: "Bow → raise to first person, draw to full, and loose",
    warmup: 0.5,
    // A longbow is 1.7 s to nock and 2.4 s to full draw, and the scene has to
    // show the follow-through as well.
    duration: 8.2,
    player: {
      position: [0, Y, 6],
      yaw: Math.PI,
      weaponId: "steel-longbow",
      ammoId: "steel-war-arrow",
    },
    enemy: { ...FACING_ENEMY, holdInitialState: true },
    cues: [
      // Tap to raise, release, then hold all the way to full draw and let go.
      { from: 0.15, to: 0.24, actions: ["light"] },
      { from: 0.6, to: 5.2, actions: ["light"] },
    ],
  },
  "bow-aim-tracking": {
    id: "bow-aim-tracking",
    label: "Bow → draw, then look up and down while holding at full draw",
    warmup: 0.5,
    duration: 8.6,
    player: {
      position: [0, Y, 6],
      yaw: Math.PI,
      weaponId: "steel-longbow",
      ammoId: "steel-war-arrow",
    },
    enemy: { ...FACING_ENEMY, holdInitialState: true },
    cues: [
      { from: 0.15, to: 0.24, actions: ["light"] },
      { from: 0.6, to: 7.4, actions: ["light"] },
      // Look up, then back down, while the string is held.
      { from: 4.6, to: 5.8, camera: [0, -22] },
      { from: 5.9, to: 7.1, camera: [0, 26] },
    ],
  },
  "bow-partial-draw": {
    id: "bow-partial-draw",
    label: "Bow → half draw, weak shot, then lower the bow",
    warmup: 0.5,
    duration: 6.4,
    player: {
      position: [0, Y, 6],
      yaw: Math.PI,
      weaponId: "steel-longbow",
      ammoId: "steel-war-arrow",
    },
    enemy: { ...FACING_ENEMY, holdInitialState: true },
    cues: [
      { from: 0.15, to: 0.24, actions: ["light"] },
      // Let go halfway through the pull: the shot leaves, and it is weaker.
      { from: 0.6, to: 3.4, actions: ["light"] },
      // Guard doubles as "lower the bow".
      { from: 5.2, to: 5.3, actions: ["guard"] },
    ],
  },

  // --- crouch ---------------------------------------------------------------
  "bow-aim-turn": {
    id: "bow-aim-turn",
    label: "Bow → hold at full draw and turn the camera: the body turns with it",
    warmup: 0.5,
    duration: 7.2,
    player: {
      position: [0, Y, 6],
      yaw: Math.PI,
      weaponId: "steel-longbow",
      ammoId: "steel-war-arrow",
    },
    enemy: { ...FACING_ENEMY, holdInitialState: true },
    cues: [
      { from: 0.15, to: 0.24, actions: ["light"] },
      { from: 0.6, to: 5.4, actions: ["light"] },
      // A quarter turn to the left while the string is held.
      { from: 2.0, to: 3.6, camera: [-18, 0] },
    ],
  },
  "bow-drawn-hold": {
    id: "bow-drawn-hold",
    label: "Bow → draw and hold: the still the first-person rig is judged on",
    warmup: 0.5,
    duration: 6.2,
    player: {
      position: [0, Y, 6],
      yaw: Math.PI,
      weaponId: "steel-longbow",
      ammoId: "steel-war-arrow",
    },
    enemy: { ...FACING_ENEMY, holdInitialState: true },
    cues: [
      { from: 0.15, to: 0.24, actions: ["light"] },
      // Held past the end: the longbow's full draw arrives at about 4.6 s.
      { from: 0.6, to: 6.4, actions: ["light"] },
    ],
  },
  "bow-drawn-hold-shoulder": {
    id: "bow-drawn-hold-shoulder",
    label: "Bow → draw and hold, over-the-shoulder third-person view: rigged bow, string and arrow in shot",
    warmup: 0.5,
    duration: 6.2,
    player: {
      position: [0, Y, 6],
      yaw: Math.PI,
      weaponId: "steel-longbow",
      ammoId: "steel-war-arrow",
      aimView: "shoulder",
    },
    enemy: { ...FACING_ENEMY, holdInitialState: true },
    cues: [
      { from: 0.15, to: 0.24, actions: ["light"] },
      { from: 0.6, to: 6.4, actions: ["light"] },
    ],
  },
  "bow-drawn-locomotion": {
    id: "bow-drawn-locomotion",
    label: "Bow \u2192 hold at full draw and walk, retreat and strafe: the drawn strides",
    warmup: 0.5,
    duration: 9.6,
    player: {
      position: [0, Y, 6],
      yaw: Math.PI,
      weaponId: "steel-longbow",
      ammoId: "steel-war-arrow",
      aimView: "shoulder",
    },
    enemy: { ...FACING_ENEMY, holdInitialState: true },
    cues: [
      { from: 0.15, to: 0.24, actions: ["light"] },
      // Held all the way through: every stride below happens at full draw.
      // Held throughout, and ending before the arm gives out: a draw that
      // collapses for stamina drops back to the nock, which is a different
      // scene from this one.
      { from: 0.6, to: 9.2, actions: ["light"] },
      { from: 4.8, to: 5.7, actions: ["light"], move: [0, 0.6] },
      { from: 5.9, to: 6.8, actions: ["light"], move: [0, -0.6] },
      { from: 7.0, to: 7.9, actions: ["light"], move: [-0.6, 0] },
      { from: 8.1, to: 9.0, actions: ["light"], move: [0.6, 0] },
    ],
  },
  "archer-shot": {
    id: "archer-shot",
    label: "Warden archer 8 m out, facing away → turns onto the player, draws, looses, hits",
    warmup: 0.5,
    duration: 13.4,
    player: { position: [0, Y, 8], yaw: Math.PI, poise: false },
    enemy: {
      ...FACING_ENEMY,
      archetypeId: "archer-warden",
      animation: "BOW_IDLE",
      // Facing a right angle away, so the loose has to wait for the turn.
      yaw: Math.PI / 2,
      holdInitialState: true,
    },
    cues: [],
    enemyCues: [{ at: 0.3, intent: "shoot" }, { at: 4.2, intent: "shoot" }, { at: 8.1, intent: "shoot" }],
  },
  "crouch-locomotion": {
    id: "crouch-locomotion",
    label: "Crouch \u2192 sneak idle, forward stride, then locked-on reverse and both strafes, then draw",
    warmup: 0.5,
    duration: 9.4,
    // Starts with the sword stowed so both the weapon-neutral crouch hold and
    // the drawn one are reached through the ordinary equip path. Unlocked, a
    // crouch faces the way it goes and plays the forward stride; the reverse
    // and the strafes are the locked-on crouch's (round 7).
    player: { position: [0, Y, 3], yaw: Math.PI, equipped: false },
    enemy: { ...FACING_ENEMY, position: [0, Y, -3] as const, holdInitialState: true },
    cues: [
      { from: 0.15, to: 0.24, actions: ["crouch"] },
      { from: 0.75, to: 2.0, move: [0, 0.6] },
      { from: 2.05, to: 2.14, actions: ["lockOn"] },
      { from: 2.2, to: 3.35, move: [0, -0.6] },
      { from: 3.55, to: 4.7, move: [-0.6, 0] },
      { from: 4.9, to: 6.05, move: [0.6, 0] },
      { from: 6.6, to: 6.69, actions: ["equip"] },
    ],
  },

  // --- shield ---------------------------------------------------------------
  "shield-guard": {
    id: "shield-guard",
    label: "Shield raised \u2192 two blocks behind the shield face",
    warmup: 0.5,
    duration: 6.25,
    player: { ...REVIEW_PLAYER, weaponId: "steel-sword", offHandId: "steel-shield" },
    enemy: REVIEW_ENEMY,
    // Not at 0.05: the opening idle has to render as its own run to be
    // evidence that the guard was entered from a normal stance.
    cues: [{ from: 0.3, to: 4.65, actions: ["guard"] }],
    enemyCues: [
      { at: 1.3, intent: "lightCombo", attack: "light1", comboRemaining: 0 },
      { at: 3.5, intent: "lightCombo", attack: "light1", comboRemaining: 0 },
    ],
  },
  "shield-parry": {
    id: "shield-parry",
    label: "Shield bash \u2192 the parry a shield makes instead of a blade catch",
    warmup: 0.5,
    duration: 2.05,
    player: {
      position: [0, Y, 0], yaw: Math.PI,
      weaponId: "steel-sword", offHandId: "steel-shield",
    },
    enemy: SOLO_ENEMY,
    cues: [{ from: 0.2, to: 0.29, actions: ["parry"] }],
  },

  // --- two-handed -----------------------------------------------------------
  "greatsword-locomotion": {
    id: "greatsword-locomotion",
    label: "Greatsword carriage \u2192 walk, run, sprint, locked-on retreat and strafes, draw and stow",
    warmup: 0.5,
    duration: 14.6,
    // One scene rather than three: the point of review is that a greatsword is
    // carried differently in *every* direction, which only reads if the whole
    // set is seen back to back.
    player: { position: [0, Y, 5], yaw: Math.PI, weaponId: "steel-greatsword" },
    // Off the running line, not dead ahead: a sprint straight into the other
    // actor's capsule bounces the player airborne and puts a jump in the middle
    // of a locomotion review. Still close enough to lock onto.
    enemy: { ...FACING_ENEMY, position: [3.4, Y, -1] as const },
    cues: [
      { from: 0.15, to: 1.55, move: [0, 0.45] },
      { from: 1.7, to: 2.6, move: [0, 1] },
      { from: 2.75, to: 3.8, actions: ["dodge"], move: [0, 1] },
      { from: 3.8, to: 4.25, move: [0, 1] },
      // Lock on: strafes and a real reverse stride are only reachable here.
      { from: 4.6, to: 4.69, actions: ["lockOn"] },
      { from: 4.9, to: 5.95, move: [0, -0.42] },
      { from: 6.15, to: 7.2, move: [-0.42, 0] },
      { from: 7.4, to: 8.45, move: [0.42, 0] },
      { from: 8.7, to: 8.79, actions: ["lockOn"] },
      // Stow and draw, which is its own two-handed pair off the back.
      { from: 9.1, to: 9.19, actions: ["equip"] },
      { from: 11.6, to: 11.69, actions: ["equip"] },
    ],
  },
  "greatsword-chain": {
    id: "greatsword-chain",
    label: "Greatsword \u2192 the three-hit light chain and both heavies",
    warmup: 0.5,
    duration: 16.4,
    player: { position: [0, Y, 0], yaw: Math.PI, weaponId: "steel-greatsword" },
    enemy: SOLO_ENEMY,
    cues: [
      { from: 0.15, to: 0.24, actions: ["light"] },
      { from: 1.1, to: 1.19, actions: ["light"] },
      { from: 2.9, to: 2.99, actions: ["light"] },
      // Long gap on purpose: a full light chain plus a heavy costs more than a
      // 100-point bar holds, and the follow-up heavy is another 67. Waiting for
      // the bar is what a player has to do, so the scene does it too.
      { from: 9.6, to: 9.69, actions: ["heavy"] },
      { from: 11.1, to: 11.19, actions: ["heavy"] },
    ],
  },
  "greatsword-guard": {
    id: "greatsword-guard",
    label: "Greatsword guard \u2192 two blocks, both block-hits, and the two-handed parry",
    warmup: 0.5,
    duration: 7.9,
    player: { ...REVIEW_PLAYER, weaponId: "steel-greatsword" },
    enemy: REVIEW_ENEMY,
    cues: [
      { from: 0.3, to: 4.65, actions: ["guard"] },
      { from: 5.75, to: 5.84, actions: ["parry"] },
    ],
    enemyCues: [
      { at: 1.3, intent: "lightCombo", attack: "light1", comboRemaining: 0 },
      { at: 3.5, intent: "lightCombo", attack: "light1", comboRemaining: 0 },
    ],
  },
  // --- poise ----------------------------------------------------------------
  "poise-break": {
    id: "poise-break",
    label: "Poise \u2192 two light hits absorbed without flinching, the third breaks through",
    warmup: 0.5,
    // Every hit inside one refill window (the pool snaps back to full after a
    // quiet interval, so spacing them out would prove nothing).
    duration: 6.4,
    player: { ...REVIEW_PLAYER, health: 150 },
    enemy: REVIEW_ENEMY,
    cues: [],
    enemyCues: [
      { at: 0.25, intent: "lightCombo", attack: "light1", comboRemaining: 2 },
    ],
  },
  "greataxe-chain": {
    id: "greataxe-chain",
    label: "Battleaxe \u2192 the haft chain and sprint that differ from the blade set",
    warmup: 0.5,
    duration: 18.4,
    player: { position: [0, Y, 4], yaw: Math.PI, weaponId: "steel-battleaxe" },
    enemy: SOLO_ENEMY,
    cues: [
      { from: 0.15, to: 0.24, actions: ["light"] },
      { from: 1.1, to: 1.19, actions: ["light"] },
      { from: 2.9, to: 2.99, actions: ["light"] },
      { from: 9.6, to: 9.69, actions: ["heavy"] },
      { from: 11.1, to: 11.19, actions: ["heavy"] },
      // The haft carriage differs at a sprint too; everything between is the
      // greatsword pack's footwork and is reviewed there.
      { from: 14.6, to: 16.6, actions: ["dodge"], move: [0, 1] },
    ],
  },
  "greatsword-riposte": {
    id: "greatsword-riposte",
    label: "Greatsword execution \u2014 its own clip, at its own measured distance",
    warmup: 0.5,
    duration: 9.4,
    // Its own scene because it is its own choreography: a greatsword drives a
    // longer lunge from further out (1.10 m against a sword's 0.90 m), and it
    // used to borrow the sword's execution, which is the wrong motion at the
    // wrong distance.
    player: { ...RIPOSTE_REVIEW_PLAYER, emptyOffHand: true, weaponId: "steel-greatsword" },
    enemy: RIPOSTE_REVIEW_ENEMY,
    cues: [
      // Pressed early, because a greatsword parry catches late: the catch is
      // the whole of `GREATSWORD_PARRY_FOLLOW_THROUGH`, which does not begin
      // until the 0.233 s raise has played. Pressed here, the catch is open
      // from 0.583 s and the enemy's blade arrives at about 0.85 s.
      { from: 0.35, to: 0.44, actions: ["parry"] },
      { from: 2.3, to: 2.39, actions: ["light"] },
    ],
    enemyCues: [{ at: 0.25, intent: "lightCombo", attack: "light1", comboRemaining: 0 }],
  },
  "greataxe-riposte": {
    id: "greataxe-riposte",
    label: "Battleaxe execution \u2014 the haft set's own, from further out again",
    warmup: 0.5,
    duration: 9.4,
    player: { ...RIPOSTE_REVIEW_PLAYER, emptyOffHand: true, weaponId: "steel-battleaxe" },
    enemy: RIPOSTE_REVIEW_ENEMY,
    cues: [
      // Same shape as the greatsword scene: the catch is the whole haft bash
      // clip and opens once the 0.2 s raise has played, so the press comes in
      // well before the enemy's blade does.
      { from: 0.35, to: 0.44, actions: ["parry"] },
      { from: 2.3, to: 2.39, actions: ["light"] },
    ],
    enemyCues: [{ at: 0.25, intent: "lightCombo", attack: "light1", comboRemaining: 0 }],
  },
  "greataxe-backstab": {
    id: "greataxe-backstab",
    label: "Battleaxe backstab — its own swing from behind, and the victim's reaction",
    warmup: 0.5,
    duration: 7.9,
    // Same rear staging as the sword's `backstab` scene; only the weapon
    // differs, because a swinging class backstabs with its own opening light.
    player: { position: [0, Y, -1.15], yaw: 0, weaponId: "steel-battleaxe" },
    enemy: FACING_ENEMY,
    cues: [{ from: 0.55, to: 0.64, actions: ["light"] }],
  },
  "greataxe-parry": {
    id: "greataxe-parry",
    label: "Battleaxe parry \u2192 the haft block-bash, which is not the blade's",
    warmup: 0.5,
    duration: 5.4,
    // Its own scene because the haft parry is its own clip. It used to borrow
    // the greatsword's, which is the wrong hands on the wrong weapon; Skyrim
    // and the parry mod both author 2hw separately from 2hm.
    player: { ...REVIEW_PLAYER, weaponId: "steel-battleaxe" },
    enemy: SOLO_ENEMY,
    // The clip is the deliverable here, not the interaction: whether a parry
    // *lands* is already reviewed by `parry`, `shield-parry` and
    // `greatsword-guard`, and what has never been looked at is the haft
    // block-bash itself. Two clean plays, nothing else in frame.
    cues: [
      { from: 1.15, to: 1.24, actions: ["parry"] },
      { from: 3.65, to: 3.74, actions: ["parry"] },
    ],
  },
};

const SCRIPTABLE_ACTIONS: readonly InputAction[] = [
  "light", "heavy", "guard", "parry", "dodge", "lockOn", "heal", "equip",
  "jump", "crouch", "targetLeft", "targetRight",
];

export class VisualScenarioDriver {
  elapsed = 0;
  private totalElapsed = 0;
  private nextEnemyCueIndex = 0;
  private readyLatched = false;

  get ready() {
    return this.readyLatched;
  }

  constructor(readonly scenario: VisualScenario) {}

  reset() {
    this.elapsed = 0;
    this.totalElapsed = 0;
    this.nextEnemyCueIndex = 0;
    this.readyLatched = false;
  }

  apply(delta: number, input: InputController) {
    const step = Math.max(0, delta);
    this.totalElapsed += step;
    if (!this.readyLatched && this.totalElapsed + 1e-9 >= this.scenario.warmup) {
      this.readyLatched = true;
      // A 30 Hz capture must expose a real scenario frame zero. Floating-point
      // accumulation can otherwise cross a 0.5 s warm-up at 0.033 s, making
      // the first pixel/telemetry code frame 1. Preserve deliberate large-step
      // unit/driver calls, but snap the fixed render clock at its boundary.
      if (step <= 1 / 30 + 1e-9) this.totalElapsed = this.scenario.warmup;
    }
    this.elapsed = Math.max(0, this.totalElapsed - this.scenario.warmup);
    const active = new Set<InputAction>();
    let moveX = 0;
    let moveY = 0;
    let cameraX = 0;
    let cameraY = 0;
    for (const cue of this.scenario.cues) {
      if (!this.ready || this.elapsed < cue.from || this.elapsed >= cue.to) continue;
      for (const action of cue.actions ?? []) active.add(action);
      if (cue.move) [moveX, moveY] = cue.move;
      if (cue.camera) [cameraX, cameraY] = cue.camera;
    }
    for (const action of SCRIPTABLE_ACTIONS) input.setVirtual(action, active.has(action));
    input.setTouchMovement({ x: moveX, y: moveY });
    if (cameraX || cameraY) input.addTouchCamera({ x: cameraX * step, y: cameraY * step });
  }

  /** Returns a due opponent choice once; combat code still starts/resolves it. */
  takeEnemyCue(): VisualScenarioEnemyCue | null {
    const cue = this.scenario.enemyCues?.[this.nextEnemyCueIndex];
    if (!cue || this.elapsed < cue.at) return null;
    this.nextEnemyCueIndex += 1;
    return {
      intent: cue.intent,
      attack: cue.attack,
      comboRemaining: cue.comboRemaining,
      side: cue.side,
    };
  }
}

export function visualScenarioFromSearch(search: string): VisualScenario | null {
  const id = new URLSearchParams(search).get("scenario");
  return id && VISUAL_SCENARIO_IDS.includes(id as VisualScenarioId)
    ? VISUAL_SCENARIOS[id as VisualScenarioId]
    : null;
}
