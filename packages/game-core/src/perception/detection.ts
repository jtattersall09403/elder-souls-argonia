/**
 * Detection: whether an observer sees a target, and how its awareness moves.
 *
 * Module 76 §118 (Sneak row) and §121.5, from Morrowind: a sneaking target's
 * Elusiveness = (Sneak + Agility/5 − boot weight) × (0.5 + distance/500
 * units) is compared with the observer's spot score × the direction multiplier
 * (×1.5 in front, ×0.5 behind). Compared, never rolled: the same situation
 * always gives the same answer, so the player can learn it.
 *
 * Pure and injected. The caller supplies what the world knows: positions, a
 * line-of-sight result from its own raycast, the light on the target, and the
 * noise the observer heard this frame. Later systems feed these without
 * touching the rule: a lantern or a light spell raises `lightLevel`, a
 * footstep or a dropped shield raises `noise`, a faction's standing decides
 * whether an engaged observer attacks (that is the caller's, not detection's).
 */

export const DETECTION_SCHEMA_VERSION = 1;

export type Vec3 = { x: number; y: number; z: number };

export type Observer = {
  position: Vec3;
  /** Radians; 0 looks down +Z, as `Fighter.yaw`. */
  facingYaw: number;
  /** Half the view cone's angle, radians. Outside it the observer only half-notices (×0.5). */
  viewHalfAngle: number;
  /** Metres beyond which nothing is seen, lit or not. */
  viewRange: number;
  /** The observer's own score (Morrowind: its Sneak + Agility/5); the D-ladder supplies it. */
  spotScore: number;
};

export type DetectionTarget = {
  position: Vec3;
  sneakSkill: number;
  agility: number;
  /** Worn boots' weight, kilograms; it counts against the sneak term point for point. */
  bootWeightKg: number;
  /** Crouched in a sneak. A target that is not sneaking has no elusiveness at all. */
  sneaking: boolean;
  /** 0 (dark) to 1 (fully lit, the default). Carried lights and daylight raise it. */
  lightLevel?: number;
};

export type DetectionEnvironment = {
  /** The caller's raycast from the observer's eyes to the target. */
  lineOfSight: boolean;
};

/** 500 Morrowind units in metres (1 unit = 1.428 cm): the distance term's scale. */
export const SNEAK_DISTANCE_SCALE_METRES = 500 * 0.01428;
/** Morrowind's fSneakViewMult and fSneakNoViewMult. */
export const DIRECTION_FRONT = 1.5;
export const DIRECTION_BEHIND = 0.5;

function planarDistance(a: Vec3, b: Vec3) {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

/** The target's Elusiveness at this distance (0 when not sneaking). */
export function elusiveness(target: DetectionTarget, distanceMetres: number): number {
  if (!target.sneaking) return 0;
  const sneakTerm = target.sneakSkill + target.agility / 5 - target.bootWeightKg;
  return Math.max(0, sneakTerm) * (0.5 + distanceMetres / SNEAK_DISTANCE_SCALE_METRES);
}

/** ×1.5 when the target is inside the observer's view cone, ×0.5 otherwise. */
export function directionMultiplier(observer: Observer, target: Vec3): number {
  const dx = target.x - observer.position.x;
  const dz = target.z - observer.position.z;
  const length = Math.hypot(dx, dz);
  if (length < 1e-6) return DIRECTION_FRONT;
  const cos = (Math.sin(observer.facingYaw) * dx + Math.cos(observer.facingYaw) * dz) / length;
  return cos >= Math.cos(observer.viewHalfAngle) ? DIRECTION_FRONT : DIRECTION_BEHIND;
}

/** Light on the target scales the spot score: ×1 fully lit, ×0.5 in darkness. */
export function lightFactor(lightLevel = 1): number {
  return 0.5 + 0.5 * Math.min(1, Math.max(0, lightLevel));
}

export type Perception = {
  seen: boolean;
  inCone: boolean;
  /** Spot minus elusiveness; negative when unseen. For a HUD meter and for tuning. */
  margin: number;
};

/** One observer's look at one target this frame. */
export function perceive(observer: Observer, target: DetectionTarget, environment: DetectionEnvironment): Perception {
  const distance = planarDistance(observer.position, target.position);
  const direction = directionMultiplier(observer, target.position);
  const inCone = direction === DIRECTION_FRONT;
  if (!environment.lineOfSight || distance > observer.viewRange) {
    return { seen: false, inCone, margin: -Infinity };
  }
  const spot = observer.spotScore * direction * lightFactor(target.lightLevel);
  const margin = spot - elusiveness(target, distance);
  return { seen: margin >= 0, inCone, margin };
}

export type Awareness = "unaware" | "suspicious" | "engaged";

/** Versioned, serialisable (standard 17): an observer's awareness of one target. */
export type AwarenessState = {
  schemaVersion: typeof DETECTION_SCHEMA_VERSION;
  awareness: Awareness;
  /** 0-1: how close the observer is to engaging. */
  suspicion: number;
  /** Seconds since the target was last seen (Infinity before the first sighting). */
  secondsSinceSeen: number;
};

export const AWARENESS_TUNING = {
  /** Continuous sighting that turns a glimpse into a fight. */
  engageSeconds: 0.8,
  /** Out of sight this long, an engaged observer starts searching. */
  loseTargetSeconds: 6,
  /** How much suspicion a noise of loudness 1 raises at once. */
  noiseSuspicion: 0.5,
  /** Suspicion at or above which the observer is suspicious. */
  suspiciousAt: 0.2,
  /** Suspicion lost per second with nothing seen or heard. */
  decayPerSecond: 0.1,
} as const;

export function initialAwareness(): AwarenessState {
  return { schemaVersion: DETECTION_SCHEMA_VERSION, awareness: "unaware", suspicion: 0, secondsSinceSeen: Infinity };
}

export type AwarenessInput = {
  seen: boolean;
  /** Loudest thing heard this frame, 0-1 (footfall, a blow, a shout). */
  noise: number;
  /** The observer was struck by the target this frame. */
  struck?: boolean;
};

/** Advance one observer's awareness by `dt` seconds. Pure. */
export function stepAwareness(state: AwarenessState, input: AwarenessInput, dt: number): AwarenessState {
  const t = AWARENESS_TUNING;
  if (input.struck) {
    return { ...state, awareness: "engaged", suspicion: 1, secondsSinceSeen: 0 };
  }
  if (state.awareness === "engaged") {
    const secondsSinceSeen = input.seen ? 0 : state.secondsSinceSeen === Infinity ? dt : state.secondsSinceSeen + dt;
    if (secondsSinceSeen >= t.loseTargetSeconds) {
      return { ...state, awareness: "suspicious", suspicion: Math.min(0.99, state.suspicion), secondsSinceSeen };
    }
    return { ...state, secondsSinceSeen };
  }
  let suspicion = state.suspicion;
  if (input.seen) suspicion += dt / t.engageSeconds;
  if (input.noise > 0) suspicion = Math.max(suspicion, Math.min(0.99, input.noise * t.noiseSuspicion));
  if (!input.seen && !(input.noise > 0)) suspicion -= t.decayPerSecond * dt;
  suspicion = Math.min(1, Math.max(0, suspicion));
  const secondsSinceSeen = input.seen ? 0 : state.secondsSinceSeen + dt;
  const awareness: Awareness = suspicion >= 1
    ? "engaged"
    : suspicion >= t.suspiciousAt || (input.seen && suspicion > 0)
      ? "suspicious"
      : "unaware";
  return { ...state, awareness, suspicion, secondsSinceSeen };
}
