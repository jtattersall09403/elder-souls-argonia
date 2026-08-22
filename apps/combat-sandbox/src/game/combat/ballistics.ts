/**
 * Archery physics.
 *
 * Every number a bow produces is derived from what the bow and the arrow
 * physically are, not from a damage table: a draw stores energy, the bow gives
 * some of it to the arrow, the arrow carries it downrange losing speed to drag,
 * and what is left on impact is what hurts. There is deliberately **no** range
 * falloff curve anywhere — an arrow does less damage at 200 m because it is
 * slower at 200 m.
 *
 * Pure functions over plain numbers: no three.js, no Rapier, no React. The
 * physics is the portable part, and it is the part worth testing.
 *
 * Calibration and sources: `docs/research/archery-ballistics.md`.
 */

import { damageAfterArmour } from "./armourMitigation";

/** m/s². */
export const GRAVITY = 9.81;
/** kg/m³, dry air at sea level and 15 °C. */
export const AIR_DENSITY = 1.225;

/**
 * Shape of a bow's draw-force curve, as a fraction of peak force at a fraction
 * of the power stroke.
 *
 * A straight-limb selfbow (a warbow, a hunting bow) is close to linear, which
 * is where the familiar `0.5 × peak force × draw length` comes from — it is the
 * area of a triangle. A recurve's limbs are already under tension at brace, so
 * its curve rises faster and it stores more energy at the same peak weight.
 */
export type DrawCurveId = "linear" | "recurve";

type DrawCurve = {
  id: DrawCurveId;
  label: string;
  /** Fraction of peak force at draw fraction `x`, 0-1. */
  forceAt: (x: number) => number;
  /** ∫₀¹ forceAt — the fraction of `peak × stroke` a full draw stores. */
  fullStrokeArea: number;
  /** ∫₀ˣ forceAt, so a partial draw is exact rather than sampled. */
  areaTo: (x: number) => number;
};

const DRAW_CURVES: Record<DrawCurveId, DrawCurve> = {
  linear: {
    id: "linear",
    label: "Straight limb",
    forceAt: (x) => x,
    fullStrokeArea: 0.5,
    areaTo: (x) => (x * x) / 2,
  },
  recurve: {
    // x^0.75: the same peak weight, reached earlier in the stroke.
    id: "recurve",
    label: "Recurve",
    forceAt: (x) => Math.pow(x, 0.75),
    fullStrokeArea: 1 / 1.75,
    areaTo: (x) => Math.pow(x, 1.75) / 1.75,
  },
};

export function drawCurve(id: DrawCurveId) {
  return DRAW_CURVES[id];
}

/**
 * What a bow *is*, physically.
 *
 * Nothing here is a game number. A bowyer would recognise every field, which is
 * the point: a new bow is measured, not balanced.
 */
export type BowPhysics = {
  /** Force at full draw, in newtons. 150 lbf ≈ 667 N. */
  peakDrawForceN: number;
  /**
   * The **power stroke**: draw length minus brace height, in metres. This is
   * the distance over which the limbs actually do work, and using the full
   * draw length instead overstates stored energy by about a quarter.
   */
  powerStrokeMeters: number;
  drawCurve: DrawCurveId;
  /**
   * Best efficiency the bow can reach with an arrow heavy enough to hide its
   * own losses (limb hysteresis, string stretch, air). 0-1.
   */
  peakEfficiency: number;
  /**
   * Effective mass of the limbs and string that has to be accelerated along
   * with the arrow, in kilograms.
   *
   * This one field is why arrow choice matters. A light arrow leaves faster but
   * takes a *smaller share* of the stored energy, because the same limb mass is
   * being thrown either way — which is exactly what chronographs show, and why
   * no archer shoots the lightest arrow they can find.
   */
  virtualMassKg: number;
};

/** What an arrow *is*, physically. */
export type ArrowPhysics = {
  massKg: number;
  /** Shaft diameter in metres; a 7/16" war shaft is 0.0111 m. */
  shaftDiameterMeters: number;
  dragCoefficient: number;
  /**
   * How far forward of centre the mass sits, as a fraction of shaft length
   * (archery's "FOC"). Not used by the point-mass trajectory; it is what makes
   * the flight model stable when the arrow is simulated as a rigid body, and
   * what a fletching/head change would move.
   */
  forwardOfCentre: number;
  head: ArrowheadId;
  /**
   * How well the point holds its shape against armour. 1 is plain iron.
   *
   * A real historical distinction rather than a tier multiplier: soft iron
   * bodkins were recorded bending against good mail where hardened steel ones
   * went through, which is why the material an arrowhead is made of belongs in
   * the physics and not in a damage table.
   */
  headHardness: number;
};

/**
 * What the point does when it arrives.
 *
 * Medieval heads were specialised and the specialisation mattered: a bodkin is
 * a narrow spike for defeating mail, a broadhead is a wide blade that wastes
 * itself on armour and is devastating without it.
 */
export type ArrowheadId = "bodkin" | "broadhead" | "blunt";

export type ArrowheadProfile = {
  id: ArrowheadId;
  label: string;
  /** Multiplies energy when working against armour. */
  armourPiercing: number;
  /** Multiplies damage once the point is through. */
  woundSeverity: number;
  description: string;
};

export const ARROWHEADS: Readonly<Record<ArrowheadId, ArrowheadProfile>> = {
  bodkin: {
    id: "bodkin", label: "Bodkin",
    armourPiercing: 1.35, woundSeverity: 0.85,
    description: "A narrow square spike. Made for mail, and poor at anything else.",
  },
  broadhead: {
    id: "broadhead", label: "Broadhead",
    armourPiercing: 0.6, woundSeverity: 1.45,
    description: "A wide blade. Terrible against plate, appalling against flesh.",
  },
  blunt: {
    id: "blunt", label: "Blunt",
    armourPiercing: 0.15, woundSeverity: 0.5,
    description: "A stunning head for small game, and for taking someone alive.",
  },
};

/** Cross-sectional area presented to the air, m². */
export function frontalAreaM2(arrow: ArrowPhysics) {
  const radius = arrow.shaftDiameterMeters / 2;
  return Math.PI * radius * radius;
}

/**
 * Energy stored in the limbs at a given fraction of full draw, in joules.
 *
 * At full draw on a linear curve this is the textbook `0.5 × peak × stroke`.
 * Partial draws fall off with the *square* of the fraction, which is why
 * snatching a shot off at half draw gives away three quarters of the energy —
 * the game needs no separate rule to punish it.
 */
export function storedEnergyJoules(bow: BowPhysics, drawFraction: number) {
  const fraction = clamp01(drawFraction);
  return bow.peakDrawForceN * bow.powerStrokeMeters * drawCurve(bow.drawCurve).areaTo(fraction);
}

/**
 * Share of stored energy this bow gives to this arrow, 0-1.
 *
 * The limbs and string have to be accelerated too, so the arrow gets
 * `m / (m + virtual mass)` of what was stored, times whatever the bow loses to
 * hysteresis regardless.
 */
export function bowEfficiency(bow: BowPhysics, arrow: ArrowPhysics) {
  return bow.peakEfficiency * (arrow.massKg / (arrow.massKg + bow.virtualMassKg));
}

/** Kinetic energy handed to the arrow at release, in joules. */
export function launchEnergyJoules(bow: BowPhysics, arrow: ArrowPhysics, drawFraction: number) {
  return storedEnergyJoules(bow, drawFraction) * bowEfficiency(bow, arrow);
}

/** Speed the arrow leaves the string at, m/s. */
export function launchSpeed(bow: BowPhysics, arrow: ArrowPhysics, drawFraction: number) {
  const energy = launchEnergyJoules(bow, arrow, drawFraction);
  return Math.sqrt((2 * energy) / arrow.massKg);
}

export function kineticEnergyJoules(massKg: number, speed: number) {
  return 0.5 * massKg * speed * speed;
}

/**
 * Drag deceleration at a given speed, m/s².
 *
 * Quadratic: an arrow at 53 m/s sheds energy roughly four times as fast as one
 * at 26 m/s, which is what turns a 285 m vacuum parabola into a 250 m shot.
 */
export function dragDeceleration(speed: number, arrow: ArrowPhysics, airDensity = AIR_DENSITY) {
  const force = 0.5 * airDensity * arrow.dragCoefficient * frontalAreaM2(arrow) * speed * speed;
  return force / arrow.massKg;
}

export type TrajectorySample = {
  time: number;
  x: number;
  y: number;
  speed: number;
};

export type TrajectoryResult = {
  /** Horizontal distance at which the arrow returns to launch height, m. */
  rangeMeters: number;
  /** Speed at that point, m/s. */
  impactSpeed: number;
  flightSeconds: number;
  apexMeters: number;
  samples: TrajectorySample[];
};

/**
 * Integrate a shot, for tests, range readouts and design work.
 *
 * The live arrow is a Rapier body with the same drag applied per tick; this is
 * the same physics solved offline, and the two agreeing is a thing worth
 * checking.
 */
export function integrateTrajectory(
  speed: number,
  launchAngleRad: number,
  arrow: ArrowPhysics,
  options: {
    stepSeconds?: number;
    airDensity?: number;
    maxSeconds?: number;
    sampleEvery?: number;
    /** Height the arrow leaves the bow at. Flight ends when it returns to 0. */
    launchHeightMeters?: number;
  } = {},
): TrajectoryResult {
  const step = options.stepSeconds ?? 0.001;
  const airDensity = options.airDensity ?? AIR_DENSITY;
  const maxSeconds = options.maxSeconds ?? 30;
  const sampleEvery = options.sampleEvery ?? 0.05;

  let vx = speed * Math.cos(launchAngleRad);
  let vy = speed * Math.sin(launchAngleRad);
  const launchHeight = options.launchHeightMeters ?? 0;
  let x = 0;
  let y = launchHeight;
  let time = 0;
  let apex = y;
  const samples: TrajectorySample[] = [{ time: 0, x: 0, y, speed }];
  let nextSample = sampleEvery;

  while (time < maxSeconds) {
    const currentSpeed = Math.hypot(vx, vy);
    const decel = currentSpeed > 0 ? dragDeceleration(currentSpeed, arrow, airDensity) / currentSpeed : 0;
    const previousY = y;
    // Semi-implicit Euler at 1 kHz: stable, and the error over a 7-second
    // flight is centimetres.
    vx -= decel * vx * step;
    vy -= (decel * vy + GRAVITY) * step;
    x += vx * step;
    y += vy * step;
    time += step;
    apex = Math.max(apex, y);

    if (time >= nextSample) {
      samples.push({ time, x, y, speed: Math.hypot(vx, vy) });
      nextSample += sampleEvery;
    }
    if (y <= 0 && previousY > 0) break;
    if (y < 0) break;
  }

  return {
    rangeMeters: x,
    impactSpeed: Math.hypot(vx, vy),
    flightSeconds: time,
    apexMeters: apex,
    samples,
  };
}

/** Angle that carries an arrow furthest, accounting for drag. Radians. */
export function optimalLaunchAngle(speed: number, arrow: ArrowPhysics) {
  let best = Math.PI / 4;
  let bestRange = -1;
  // Drag pulls the optimum a few degrees below 45°; a coarse sweep plus a fine
  // one is plenty for a number nothing depends on to the arc-minute.
  for (let degrees = 30; degrees <= 45; degrees += 0.5) {
    const angle = (degrees * Math.PI) / 180;
    const { rangeMeters } = integrateTrajectory(speed, angle, arrow, { stepSeconds: 0.002, sampleEvery: 999 });
    if (rangeMeters > bestRange) {
      bestRange = rangeMeters;
      best = angle;
    }
  }
  return best;
}

/**
 * What a target is wearing, from the point's perspective.
 *
 * Deliberately one number rather than a link to the armour system: whatever an
 * actor is wearing is resolved to a total rating before it gets here, so a shot
 * at a creature, a door or a training dummy is the same call — and so an arrow
 * meets exactly the armour a sword does.
 */
export type ImpactTarget = {
  /** The target's total worn armour rating. */
  armourRating: number;
  /** Angle between the arrow's path and the target, radians. Zero is square. */
  obliquityRad?: number;
};

export type ImpactResult = {
  /** Energy arriving, before anything is taken off it. */
  impactEnergyJoules: number;
  /** Energy left after the angle it arrived at. */
  effectiveEnergyJoules: number;
  /**
   * Whether the point actually got through, which is a different question from
   * how much it hurt. Drives the reaction — a shaft through the mail staggers,
   * one turned by it does not — and never the damage, so nothing is counted
   * against the armour twice.
   */
  penetrated: boolean;
  damage: number;
};

/**
 * Health points per joule that gets through.
 *
 * The one arbitrary constant in the file, and it is a *unit conversion*, not a
 * balance knob: it maps physics onto the 100-point health scale the melee
 * sandbox was tuned in. A full-draw warbow shaft arriving square on an
 * unarmoured target lands around 58 — a little over two sword strokes, which is
 * about right for being shot.
 */
export const DAMAGE_PER_JOULE = 0.5;

/**
 * Joules a point of armour rating is worth when deciding *penetration*.
 *
 * Only the penetration question uses this. Damage goes through the same
 * mitigation curve a sword meets, which is what stops an arrow being uniquely
 * helpless against a target in plate.
 */
export const JOULES_PER_ARMOUR_POINT = 3;

/**
 * Resolve an arrow arriving somewhere.
 *
 * Obliquity first — a glancing hit skates and sheds `cos θ` of its energy —
 * then energy becomes damage, and the armour takes its share on the same curve
 * every other kind of damage meets. The arrowhead's business is *how well the
 * armour works*, not whether the arrow counts at all: a bodkin makes plate
 * behave like far less of it, a broadhead like far more.
 */
export function resolveArrowImpact(
  arrow: ArrowPhysics,
  impactSpeed: number,
  target: ImpactTarget,
): ImpactResult {
  const head = ARROWHEADS[arrow.head];
  const impactEnergyJoules = kineticEnergyJoules(arrow.massKg, impactSpeed);
  const obliquity = clamp(target.obliquityRad ?? 0, 0, Math.PI / 2);
  const effectiveEnergyJoules = impactEnergyJoules * Math.cos(obliquity);

  const piercing = Math.max(1e-6, head.armourPiercing * Math.max(0, arrow.headHardness));
  const armourRating = Math.max(0, target.armourRating);
  // A point that shrugs off armour meets less of it. Same curve, different
  // amount, so a head choice is a real decision rather than a damage bonus.
  const effectiveRating = armourRating / piercing;
  const damage = damageAfterArmour(
    effectiveEnergyJoules * DAMAGE_PER_JOULE * head.woundSeverity,
    effectiveRating,
  );

  return {
    impactEnergyJoules,
    effectiveEnergyJoules,
    penetrated: effectiveEnergyJoules * piercing > armourRating * JOULES_PER_ARMOUR_POINT,
    damage,
  };
}


/**
 * Player-stat hooks.
 *
 * The stat system does not exist yet. Every ranged number that a character
 * should eventually influence passes through this object, so building that
 * system later means filling these in rather than hunting for the places a
 * multiplier should have gone.
 */
export type RangedModifiers = {
  /** Multiplies draw rate: a stronger archer reaches full draw sooner. */
  drawSpeed: number;
  /**
   * Fraction of the bow's peak draw the archer can actually pull, 0-1+. Below 1
   * caps the shot short of full draw no matter how long the button is held.
   */
  drawStrength: number;
  /** Multiplies aim sway. Below 1 is steadier. */
  sway: number;
  /** Multiplies stamina drain while drawing and holding. */
  drawStaminaCost: number;
  /** Final multiplier on delivered damage. */
  damage: number;
};

export const NEUTRAL_RANGED_MODIFIERS: RangedModifiers = {
  drawSpeed: 1,
  drawStrength: 1,
  sway: 1,
  drawStaminaCost: 1,
  damage: 1,
};

function clamp(value: number, low: number, high: number) {
  return Math.min(high, Math.max(low, value));
}

function clamp01(value: number) {
  return clamp(value, 0, 1);
}
