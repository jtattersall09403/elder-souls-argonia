import { describe, expect, it } from "vitest";
import {
  candidateSets,
  SoundEventBus,
  type DrawClass,
  type GuardClass,
  type ImpactTarget,
  type ImpactWeapon,
  type SoundEvent,
  type SwingClass,
} from "./events";
import { FOOTSTEP_SURFACES, type Footwear, type Gait } from "./surfaces";
import { shippedManifest } from "./testManifest";

const m = shippedManifest();
const resolves = (e: SoundEvent) => candidateSets(e).find((id) => m.sets[id]);

const SWINGS: SwingClass[] = ["blade", "blade-axe", "blunt-1h", "2h", "unarmed"];
const WEAPONS: ImpactWeapon[] = ["blade", "axe", "axe-large", "blunt", "blade-2h", "blunt-2h", "unarmed", "arrow"];
const TARGETS: ImpactTarget[] = ["flesh", "armor", "metal", "wood", "dirt", "other", "shield-light", "shield-heavy", "stick", "bounce"];
const GUARDS: GuardClass[] = ["blade-1h", "blade-2h", "axe", "blunt-1h", "blunt-2h", "bow", "shield-light", "shield-heavy"];
const DRAWS: DrawClass[] = ["blade-1h", "blade-small", "blade-2h", "axe-1h", "axe-2h", "mace-1h", "blunt-2h", "bow", "left-hand"];
const FOOTWEAR: Footwear[] = ["barefoot", "light", "heavy"];
const GAITS: Gait[] = ["walk", "run", "sprint", "sneak"];

describe("every event in the vocabulary resolves to a shipped set", () => {
  it("combat", () => {
    for (const weapon of SWINGS) expect(resolves({ type: "combat.swing", weapon })).toBeDefined();
    const missing: string[] = [];
    for (const weapon of WEAPONS) {
      for (const target of TARGETS) {
        // Arrows are the only family with shield/stick/bounce sets; others fall back to wood/metal/other.
        if (!resolves({ type: "combat.hit", weapon, target })) missing.push(`${weapon}/${target}`);
      }
    }
    expect(missing).toEqual([]);
    for (const guard of GUARDS) {
      for (const type of ["combat.block", "combat.parry", "combat.bash"] as const) expect(resolves({ type, guard })).toBeDefined();
    }
    for (const weapon of DRAWS) {
      expect(resolves({ type: "combat.draw", weapon })).toBeDefined();
      expect(resolves({ type: "combat.sheathe", weapon })).toBeDefined();
    }
    for (const type of ["bow.nock", "bow.pull", "bow.release"] as const) expect(resolves({ type })).toBeDefined();
  });

  it("movement: every footwear x gait x surface, jumps, swimming", () => {
    for (const footwear of FOOTWEAR) {
      for (const surface of FOOTSTEP_SURFACES) {
        for (const gait of GAITS) {
          expect(resolves({ type: "movement.footstep", footwear, gait, surface }), `${footwear}.${gait}.${surface}`).toBe(
            `footstep.${footwear}.${gait}.${surface}`,
          );
        }
        expect(resolves({ type: "movement.jump", footwear, surface })).toBeDefined();
        expect(resolves({ type: "movement.land", footwear, surface })).toBeDefined();
      }
    }
    expect(resolves({ type: "movement.swim", stroke: "stroke" })).toBe("footstep.swim.stroke");
    expect(resolves({ type: "movement.splash" })).toBe("footstep.water.splash");
  });

  it("an impact family without a target set falls back, never to silence", () => {
    expect(resolves({ type: "combat.hit", weapon: "blade-2h", target: "wood" })).toBe("combat.impact.blade.wood");
    expect(resolves({ type: "combat.hit", weapon: "blade", target: "shield-heavy" })).toBe("combat.impact.blade.metal");
    expect(resolves({ type: "combat.parry", guard: "shield-light" })).toBe("combat.bash.shield-light");
  });
});

describe("SoundEventBus", () => {
  it("a throwing listener neither stops the others nor throws into the emitter", () => {
    const errors: unknown[] = [];
    const bus = new SoundEventBus((err) => errors.push(err));
    const heard: string[] = [];
    bus.subscribe(() => {
      throw new Error("speaker");
    });
    bus.subscribe((e) => heard.push(e.type));
    expect(() => bus.emit({ type: "bow.nock" })).not.toThrow();
    expect(heard).toEqual(["bow.nock"]);
    expect(errors).toHaveLength(1);
  });

  it("delivers to every subscriber until it unsubscribes", () => {
    const bus = new SoundEventBus();
    const a: SoundEvent[] = [];
    const b: SoundEvent[] = [];
    const offA = bus.subscribe((e) => a.push(e));
    bus.subscribe((e) => b.push(e));
    bus.emit({ type: "bow.nock" });
    offA();
    bus.emit({ type: "bow.release" });
    expect(a.map((e) => e.type)).toEqual(["bow.nock"]);
    expect(b.map((e) => e.type)).toEqual(["bow.nock", "bow.release"]);
  });
});
