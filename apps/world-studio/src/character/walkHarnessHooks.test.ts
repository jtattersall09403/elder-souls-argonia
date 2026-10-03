import { describe, expect, it } from "vitest";
import { InteractionArbiter, type InteractionCandidate } from "@elder-souls/game-core/interaction/arbiter";
import { tapArbiterOffers } from "./walkHarnessHooks";

const door: InteractionCandidate = {
  id: "door.a", kind: "door", positionM: [10, 0], reachM: 1.5, promptTextId: "text.door.prompt-enter",
};

describe("tapArbiterOffers", () => {
  it("records the offers of the last resolve, installs once, and restores the arbiter", () => {
    const arb = new InteractionArbiter();
    const ownOffer = arb.offer, ownResolve = arb.resolve;
    const tap = tapArbiterOffers(arb);
    const wrapped = arb.offer;
    expect(tapArbiterOffers(arb)).toBe(tap);   // a re-run never wraps the wrapper
    expect(arb.offer).toBe(wrapped);
    arb.offer(door);
    arb.resolve({ x: 10, z: 0 }, false);
    expect(tap.offered()).toEqual([{ id: "door.a", kind: "door", xz: [10, 0], reachM: 1.5 }]);
    expect(arb.focused?.id).toBe("door.a");
    tap.restore();
    expect(arb.offer).toBe(ownOffer);
    expect(arb.resolve).toBe(ownResolve);
    expect(Object.prototype.hasOwnProperty.call(arb, "offer")).toBe(false);
    expect(tapArbiterOffers(arb)).not.toBe(tap);   // a fresh tap after restore
  });
});
