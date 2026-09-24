import type { Vec3 } from "./backend";
import type { SoundSetId } from "./manifest";
import type { Footwear, FootstepSurface, Gait } from "./surfaces";

/**
 * The sound-event vocabulary (decision 0095): what gameplay says happened,
 * never which file to play. Runtimes (combat, movement, world) emit these on
 * a `SoundEventBus`; the AudioManager resolves each to a sound set, and any
 * other listener (the stealth detection service's noise feed, 0092) hears
 * the same event whether or not audio is on. Classes are the vanilla sound
 * families the manifest ships (0094): Skyrim's own swing, impact, block,
 * bash and draw sets. Continuous sounds (a carried torch, a river) are not
 * events: they are emitters (`AudioManager.addEmitter`).
 */

/** Swing families (Skyrim `WPNSwing*`). */
export type SwingClass = "blade" | "blade-axe" | "blunt-1h" | "2h" | "unarmed";
/** Impact families (Skyrim `WPNImpact<weapon>Vs<target>`). */
export type ImpactWeapon = "blade" | "axe" | "axe-large" | "blunt" | "blade-2h" | "blunt-2h" | "unarmed" | "arrow";
/** What was struck. `other` is Skyrim's catch-all hard surface. */
export type ImpactTarget =
  | "flesh"
  | "armor"
  | "metal"
  | "wood"
  | "dirt"
  | "other"
  | "shield-light"
  | "shield-heavy"
  | "stick"
  | "bounce";
/** What took a blocked blow (Skyrim `WPNBlock*`). */
export type GuardClass = "blade-1h" | "blade-2h" | "axe" | "blunt-1h" | "blunt-2h" | "bow" | "shield-light" | "shield-heavy";
/** Draw/sheathe families (Skyrim `WPN*Draw` / `*Sheathe`). */
export type DrawClass =
  | "blade-1h"
  | "blade-small"
  | "blade-2h"
  | "axe-1h"
  | "axe-2h"
  | "mace-1h"
  | "blunt-2h"
  | "bow"
  | "left-hand";

interface Located {
  /** World position; absent plays at the listener (the player's own sounds). */
  at?: Vec3;
  /** Stable id of the entity that made the sound (the stealth feed attributes by it). */
  source?: string;
}

export type SoundEvent =
  | ({ type: "combat.swing"; weapon: SwingClass } & Located)
  | ({ type: "combat.hit"; weapon: ImpactWeapon; target: ImpactTarget } & Located)
  | ({ type: "combat.block"; guard: GuardClass } & Located)
  | ({ type: "combat.parry"; guard: GuardClass } & Located)
  | ({ type: "combat.bash"; guard: GuardClass } & Located)
  | ({ type: "combat.draw" | "combat.sheathe"; weapon: DrawClass } & Located)
  | ({ type: "bow.nock" | "bow.pull" | "bow.release" } & Located)
  | ({ type: "movement.footstep"; footwear: Footwear; gait: Gait; surface: FootstepSurface } & Located)
  | ({ type: "movement.jump" | "movement.land"; footwear: Footwear; surface: FootstepSurface } & Located)
  | ({ type: "movement.swim"; stroke: "stroke" | "tread" } & Located)
  | ({ type: "movement.splash" } & Located);

export type SoundEventType = SoundEvent["type"];

/** Impact targets a weapon family has no vanilla set for fall back along this list. */
const IMPACT_FALLBACK: Readonly<Record<ImpactTarget, ImpactTarget[]>> = {
  flesh: ["other"],
  armor: ["metal", "other"],
  metal: ["armor", "other"],
  wood: ["other"],
  dirt: ["other", "stick"],
  other: ["bounce"],
  "shield-light": ["wood", "other"],
  "shield-heavy": ["metal", "armor", "other"],
  stick: ["wood", "other"],
  bounce: ["other"],
};
/** Weapon families with sparse vanilla impact sets borrow from their base family. */
const WEAPON_FALLBACK: Readonly<Record<ImpactWeapon, ImpactWeapon[]>> = {
  blade: [],
  axe: ["blade"],
  "axe-large": ["axe", "blade"],
  blunt: [],
  "blade-2h": ["blade"],
  "blunt-2h": ["blunt"],
  unarmed: [],
  arrow: [],
};
/** Parry has no vanilla sound: it plays the guard's bash (an active strike), shields their own. */
const PARRY_BASH: Readonly<Record<GuardClass, string>> = {
  "blade-1h": "blade",
  "blade-2h": "blade",
  axe: "axe",
  "blunt-1h": "blunt",
  "blunt-2h": "blunt",
  bow: "bow",
  "shield-light": "shield-light",
  "shield-heavy": "shield-heavy",
};

/** Candidate set ids for an event, best first; the manager plays the first that exists. */
export function candidateSets(e: SoundEvent): SoundSetId[] {
  switch (e.type) {
    case "combat.swing":
      return [`combat.swing.${e.weapon}`];
    case "combat.hit": {
      const out: string[] = [];
      for (const w of [e.weapon, ...WEAPON_FALLBACK[e.weapon]]) {
        for (const t of [e.target, ...IMPACT_FALLBACK[e.target]]) out.push(`combat.impact.${w}.${t}`);
      }
      return out;
    }
    case "combat.block":
      return [`combat.block.${e.guard}`];
    case "combat.parry":
    case "combat.bash":
      return [`combat.bash.${PARRY_BASH[e.guard]}`, `combat.block.${e.guard}`];
    case "combat.draw":
      return [`combat.draw.${e.weapon}`];
    case "combat.sheathe":
      return [`combat.sheathe.${e.weapon}`, `combat.draw.${e.weapon}`];
    case "bow.nock":
      return ["combat.bow.nock"];
    case "bow.pull":
      return ["combat.bow.pull"];
    case "bow.release":
      return ["combat.bow.fire"];
    case "movement.footstep":
      return [`footstep.${e.footwear}.${e.gait}.${e.surface}`, `footstep.${e.footwear}.${e.gait}.dirt`];
    case "movement.jump":
      return [`footstep.${e.footwear}.jump-up.${e.surface}`, `footstep.${e.footwear}.jump-up.dirt`];
    case "movement.land":
      return [`footstep.${e.footwear}.jump-down.${e.surface}`, `footstep.${e.footwear}.jump-down.dirt`];
    case "movement.swim":
      return [`footstep.swim.${e.stroke}`];
    case "movement.splash":
      return ["footstep.water.splash"];
  }
}

type Listener = (e: SoundEvent) => void;

/**
 * The injected event channel (no singleton): the runtime that owns the scene
 * creates one and hands it to both the emitters and the listeners. A
 * listener that throws never stops the others (the stealth feed must hear
 * an event the speakers choked on) and never throws into gameplay code:
 * the error goes to `onError` (default `console.error`).
 */
export class SoundEventBus {
  private listeners = new Set<Listener>();

  constructor(private readonly onError: (err: unknown, e: SoundEvent) => void = (err) => console.error(err)) {}

  emit(e: SoundEvent): void {
    for (const l of this.listeners) {
      try {
        l(e);
      } catch (err) {
        this.onError(err, e);
      }
    }
  }

  /** Returns the unsubscribe function. */
  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}
