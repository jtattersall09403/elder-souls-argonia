import { describe, expect, it } from "vitest";
import { MANIFEST_STATES } from "../anim/animationManifest";
import expectations from "./visualScenarioExpectations.json";
import { VISUAL_SCENARIOS } from "./visualScenarios";
import { CHARACTER_CAPSULE_RADIUS } from "../physics/characterPhysics";

type RunRequirement = string | { state: string };
type ScenarioContract = {
  playerActions: string[];
  enemyActions: string[];
  playerAnimations: string[];
  enemyAnimations: string[];
  requiredActionRuns?: {
    player?: string[];
    enemy?: string[];
  };
  requiredAnimationRuns?: {
    player?: RunRequirement[];
    enemy?: RunRequirement[];
  };
  motionChecks?: Array<{
    actor: "player" | "enemy";
    animations: string[];
    bones: string[];
    sampleMinClipTimeSeconds?: number;
    sampleMaxClipTimeSeconds?: number;
    maxRootAngularStepDegrees?: number;
    maxRootAngularJerkDegreesPerSecondSquared?: number;
  }>;
  transitionMotionChecks?: Array<{
    actor: "player" | "enemy";
    fromAnimation: string;
    fromOccurrence: number;
    toAnimation: string;
    toOccurrence: number;
    transitionWindowSeconds: number;
    bones: string[];
    maxPelvisRelativeBoneStepMeters: number;
    maxBoneAngularStepDegrees: number;
    maxWeaponTipStepMeters: number;
    weaponTipSpace?: "world" | "pelvis-relative";
  }>;
  actorSeparation?: {
    minDistanceMeters: number;
  };
};

function stateOf(requirement: RunRequirement) {
  return typeof requirement === "string" ? requirement : requirement.state;
}

describe("production visual scenario animation-run contracts", () => {
  it("keeps scenario implementations and expectation contracts one-to-one", () => {
    expect(Object.keys(expectations).sort()).toEqual(Object.keys(VISUAL_SCENARIOS).sort());
  });

  it("declares the exact ordered rendered path for every actor under review", () => {
    const manifestStates = new Set<string>(MANIFEST_STATES);
    for (const [scenario, rawContract] of Object.entries(expectations)) {
      const contract = rawContract as ScenarioContract;
      for (const actor of ["player", "enemy"] as const) {
        const declared = contract[`${actor}Animations`];
        const path = contract.requiredAnimationRuns?.[actor] ?? [];
        const pathStates = path.map(stateOf);
        if (declared.length === 0) {
          expect(path, `${scenario} ${actor} should not have a path without rendered animations`).toEqual([]);
          continue;
        }
        expect(path.length, `${scenario} ${actor} needs an exact rendered run path`).toBeGreaterThan(0);
        expect(
          [...new Set(pathStates)].sort(),
          `${scenario} ${actor} unordered semantic coverage must equal its ordered path states`,
        ).toEqual([...new Set(declared)].sort());
        for (const state of pathStates) {
          expect(manifestStates.has(state), `${scenario} ${actor} path contains unknown ${state}`).toBe(true);
        }
      }
    }
  });

  it("declares an exact compressed FSM path for every actor with required actions", () => {
    for (const [scenario, rawContract] of Object.entries(expectations)) {
      const contract = rawContract as ScenarioContract;
      for (const actor of ["player", "enemy"] as const) {
        const declared = contract[`${actor}Actions`];
        const path = contract.requiredActionRuns?.[actor] ?? [];
        if (declared.length === 0) {
          expect(path, `${scenario} ${actor} should not have an FSM path without required actions`).toEqual([]);
          continue;
        }

        expect(path.length, `${scenario} ${actor} needs an exact FSM action-run path`).toBeGreaterThan(0);
        expect(path.every((state) => typeof state === "string" && state.length > 0)).toBe(true);
        expect(
          path.some((state, index) => index > 0 && state === path[index - 1]),
          `${scenario} ${actor} action runs must already be compressed`,
        ).toBe(false);
        for (const action of declared) {
          expect(path, `${scenario} ${actor} FSM path must cover required action ${action}`).toContain(action);
        }
      }
    }
  });

  it("anchors every transition-motion gate to one adjacent declared occurrence edge", () => {
    for (const [scenario, rawContract] of Object.entries(expectations)) {
      const contract = rawContract as ScenarioContract;
      for (const check of contract.transitionMotionChecks ?? []) {
        const occurrences = new Map<string, number>();
        const runs = (contract.requiredAnimationRuns?.[check.actor] ?? []).map((requirement) => {
          const state = stateOf(requirement);
          const occurrence = (occurrences.get(state) ?? 0) + 1;
          occurrences.set(state, occurrence);
          return { state, occurrence };
        });
        const fromIndex = runs.findIndex(({ state, occurrence }) => (
          state === check.fromAnimation && occurrence === check.fromOccurrence
        ));
        expect(runs[fromIndex + 1], `${scenario} transition-motion edge`).toEqual({
          state: check.toAnimation,
          occurrence: check.toOccurrence,
        });
        expect(check.bones.length, `${scenario} transition-motion bones`).toBeGreaterThan(0);
        for (const limit of [
          check.transitionWindowSeconds,
          check.maxPelvisRelativeBoneStepMeters,
          check.maxBoneAngularStepDegrees,
          check.maxWeaponTipStepMeters,
        ]) {
          expect(limit, `${scenario} transition-motion limit`).toBeGreaterThan(0);
        }
        expect(["world", "pelvis-relative"]).toContain(check.weaponTipSpace ?? "world");
      }
    }
  });

  it("keeps source-clip motion windows finite, ordered, and inside declared animations", () => {
    for (const [scenario, rawContract] of Object.entries(expectations)) {
      const contract = rawContract as ScenarioContract;
      for (const check of contract.motionChecks ?? []) {
        const declared = contract[`${check.actor}Animations`];
        expect(check.animations.length, `${scenario} motion-check animations`).toBeGreaterThan(0);
        expect(check.bones, `${scenario} motion-check bones`).toBeDefined();
        for (const animation of check.animations) {
          expect(declared, `${scenario} ${check.actor} motion check ${animation}`).toContain(animation);
        }
        if (check.sampleMinClipTimeSeconds !== undefined) {
          expect(Number.isFinite(check.sampleMinClipTimeSeconds), `${scenario} sample minimum`).toBe(true);
          expect(check.sampleMinClipTimeSeconds, `${scenario} sample minimum`).toBeGreaterThanOrEqual(0);
        }
        if (check.sampleMaxClipTimeSeconds !== undefined) {
          expect(Number.isFinite(check.sampleMaxClipTimeSeconds), `${scenario} sample maximum`).toBe(true);
          expect(check.sampleMaxClipTimeSeconds, `${scenario} sample maximum`).toBeGreaterThan(0);
          expect(
            check.sampleMaxClipTimeSeconds,
            `${scenario} sample window must have positive width`,
          ).toBeGreaterThan(check.sampleMinClipTimeSeconds ?? 0);
        }
        for (const optionalLimit of [
          check.maxRootAngularStepDegrees,
          check.maxRootAngularJerkDegreesPerSecondSquared,
        ]) {
          if (optionalLimit !== undefined) {
            expect(Number.isFinite(optionalLimit), `${scenario} root-turn limit`).toBe(true);
            expect(optionalLimit, `${scenario} root-turn limit`).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it("keeps actor-separation rejection thresholds finite and physically meaningful", () => {
    for (const [scenario, rawContract] of Object.entries(expectations)) {
      const contract = rawContract as ScenarioContract;
      if (!contract.actorSeparation) continue;
      expect(Number.isFinite(contract.actorSeparation.minDistanceMeters), scenario).toBe(true);
      // The navigation capsules' own contact distance is the floor: a threshold
      // below it could never reject anything the simulation can produce.
      expect(contract.actorSeparation.minDistanceMeters, scenario)
        .toBeGreaterThanOrEqual(CHARACTER_CAPSULE_RADIUS * 2);
    }
  });
});
